-- ============================================================================
-- MIGRATION 001 (PREFLIGHT ARCHIVE): _fomo_archive SCHEMA, SNAPSHOTS & AUDITS
-- ============================================================================
-- Purpose:
--   1. Creates the private _fomo_archive schema and audit tables.
--   2. Captures an idempotent pre-migration snapshot of public.store_settings.
--   3. Captures idempotent, read-only diagnostic snapshots of any pre-existing
--      inventory conflicts (including product_id-only, item_id-only, or dual
--      column legacy tables: NULLs, invalid UUIDs, duplicates, and orphans)
--      and legacy order anomalies (NULL required fields or orphaned customer_id).
--   4. Commits independently BEFORE Migration 002 runs, guaranteeing that
--      archive records remain durably committed on disk even if Migration 002
--      halts and rolls back!
--   5. Zero rows or columns in public tables are modified by this migration.
-- ============================================================================
BEGIN;

CREATE SCHEMA IF NOT EXISTS _fomo_archive;
REVOKE ALL ON SCHEMA _fomo_archive FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA _fomo_archive TO CURRENT_USER;

CREATE TABLE IF NOT EXISTS _fomo_archive.store_settings_snapshots (
  snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archived_at timestamptz DEFAULT now(),
  original_data jsonb NOT NULL,
  reason text NOT NULL
);
REVOKE ALL ON TABLE _fomo_archive.store_settings_snapshots FROM PUBLIC;
GRANT ALL ON TABLE _fomo_archive.store_settings_snapshots TO CURRENT_USER;

CREATE TABLE IF NOT EXISTS _fomo_archive.inventory_conflicts (
  conflict_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archived_at timestamptz DEFAULT now(),
  product_id uuid,
  original_data jsonb NOT NULL,
  reason text NOT NULL
);
REVOKE ALL ON TABLE _fomo_archive.inventory_conflicts FROM PUBLIC;
GRANT ALL ON TABLE _fomo_archive.inventory_conflicts TO CURRENT_USER;

CREATE TABLE IF NOT EXISTS _fomo_archive.order_legacy_audit (
  audit_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  archived_at timestamptz DEFAULT now(),
  original_data jsonb NOT NULL,
  issue_description text NOT NULL
);
REVOKE ALL ON TABLE _fomo_archive.order_legacy_audit FROM PUBLIC;
GRANT ALL ON TABLE _fomo_archive.order_legacy_audit TO CURRENT_USER;

-- Helper function (internal to _fomo_archive) to safely parse UUID strings
-- without throwing cast exceptions when inspecting legacy text item_id columns.
CREATE OR REPLACE FUNCTION _fomo_archive.try_cast_uuid(p_val text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_val IS NULL OR btrim(p_val) = '' THEN
    RETURN NULL;
  END IF;
  RETURN p_val::uuid;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION _fomo_archive.try_cast_uuid(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION _fomo_archive.try_cast_uuid(text) TO CURRENT_USER;

DO $$
DECLARE
  v_has_inv boolean;
  v_has_prod boolean;
  v_has_prod_id boolean;
  v_has_item_id boolean;
  v_eff_expr text;
BEGIN
  -- --------------------------------------------------------------------------
  -- 1. Idempotent Snapshot of public.store_settings
  -- --------------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'store_settings'
  ) THEN
    INSERT INTO _fomo_archive.store_settings_snapshots (original_data, reason)
    SELECT to_jsonb(s), 'Pre-migration automatic backup before schema alignment'
    FROM public.store_settings s
    WHERE NOT EXISTS (
      SELECT 1 FROM _fomo_archive.store_settings_snapshots existing
      WHERE existing.original_data = to_jsonb(s)
        AND existing.reason = 'Pre-migration automatic backup before schema alignment'
    );
  END IF;

  -- --------------------------------------------------------------------------
  -- 2. Idempotent Preflight Audit of public.inventory
  --    Handles:
  --      a) product_id-only tables
  --      b) item_id-only legacy tables (where product_id does not exist yet)
  --      c) tables having both product_id and item_id
  --      d) tables lacking both product_id and item_id
  -- --------------------------------------------------------------------------
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inventory'
  ) INTO v_has_inv;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products'
  ) INTO v_has_prod;

  IF v_has_inv THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'product_id'
    ) INTO v_has_prod_id;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'item_id'
    ) INTO v_has_item_id;

    IF v_has_prod_id OR v_has_item_id THEN
      -- Determine effective product UUID expression exactly matching Migration 002's alignment logic
      IF v_has_prod_id AND v_has_item_id THEN
        v_eff_expr := 'coalesce(i.product_id, _fomo_archive.try_cast_uuid(i.item_id::text))';
      ELSIF v_has_prod_id THEN
        v_eff_expr := 'i.product_id';
      ELSE
        -- item_id-only legacy table!
        v_eff_expr := '_fomo_archive.try_cast_uuid(i.item_id::text)';
      END IF;

      -- 2a. Log rows where effective product reference is NULL (or invalid UUID in item_id)
      EXECUTE format($sql$
        INSERT INTO _fomo_archive.inventory_conflicts (product_id, original_data, reason)
        SELECT NULL, to_jsonb(i), 'Inventory row has NULL or invalid product_id/item_id reference'
        FROM public.inventory i
        WHERE (%1$s) IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM _fomo_archive.inventory_conflicts c
            WHERE c.original_data = to_jsonb(i)
              AND c.reason = 'Inventory row has NULL or invalid product_id/item_id reference'
          )
      $sql$, v_eff_expr);

      -- 2b. Log duplicate effective product_id/item_id rows
      EXECUTE format($sql$
        INSERT INTO _fomo_archive.inventory_conflicts (product_id, original_data, reason)
        SELECT (%1$s), to_jsonb(i), 'Duplicate inventory record detected during migration'
        FROM public.inventory i
        WHERE (%1$s) IS NOT NULL
          AND (%1$s) IN (
            SELECT (%1$s)
            FROM public.inventory i
            WHERE (%1$s) IS NOT NULL
            GROUP BY (%1$s)
            HAVING count(*) > 1
          )
          AND NOT EXISTS (
            SELECT 1 FROM _fomo_archive.inventory_conflicts c
            WHERE c.original_data = to_jsonb(i)
              AND c.reason = 'Duplicate inventory record detected during migration'
          )
      $sql$, v_eff_expr);

      -- 2c. Log orphaned effective product_id/item_id rows (pointing to non-existent products)
      IF v_has_prod THEN
        EXECUTE format($sql$
          INSERT INTO _fomo_archive.inventory_conflicts (product_id, original_data, reason)
          SELECT (%1$s), to_jsonb(i), 'Orphaned inventory record pointing to non-existent product'
          FROM public.inventory i
          WHERE (%1$s) IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM public.products p WHERE p.id = (%1$s)
            )
            AND NOT EXISTS (
              SELECT 1 FROM _fomo_archive.inventory_conflicts c
              WHERE c.original_data = to_jsonb(i)
                AND c.reason = 'Orphaned inventory record pointing to non-existent product'
            )
        $sql$, v_eff_expr);
      END IF;
    ELSE
      -- 2d. Legacy inventory table has neither product_id nor item_id
      EXECUTE $sql$
        INSERT INTO _fomo_archive.inventory_conflicts (product_id, original_data, reason)
        SELECT NULL, to_jsonb(i), 'Legacy inventory row lacks both product_id and item_id'
        FROM public.inventory i
        WHERE NOT EXISTS (
          SELECT 1 FROM _fomo_archive.inventory_conflicts c
          WHERE c.original_data = to_jsonb(i)
            AND c.reason = 'Legacy inventory row lacks both product_id and item_id'
        )
      $sql$;
    END IF;
  END IF;

  -- --------------------------------------------------------------------------
  -- 3. Idempotent Preflight Audit of public.orders
  -- --------------------------------------------------------------------------
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'order_number'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'customer_id'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'delivery_address'
    ) THEN
      -- 3a. Missing NOT NULL attributes
      EXECUTE $sql$
        INSERT INTO _fomo_archive.order_legacy_audit (original_data, issue_description)
        SELECT to_jsonb(o), 'Legacy order missing critical NOT NULL attributes (order_number, customer_id, or delivery_address)'
        FROM public.orders o
        WHERE (o.order_number IS NULL OR o.customer_id IS NULL OR o.delivery_address IS NULL)
          AND NOT EXISTS (
            SELECT 1 FROM _fomo_archive.order_legacy_audit a
            WHERE a.original_data = to_jsonb(o)
              AND a.issue_description = 'Legacy order missing critical NOT NULL attributes (order_number, customer_id, or delivery_address)'
          )
      $sql$;

      -- 3b. Orphaned customer_id (missing from both public.profiles and auth.users)
      IF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users'
      ) THEN
        EXECUTE $sql$
          INSERT INTO _fomo_archive.order_legacy_audit (original_data, issue_description)
          SELECT to_jsonb(o), 'Legacy order references orphaned customer_id missing from public.profiles and auth.users'
          FROM public.orders o
          WHERE o.customer_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = o.customer_id)
            AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = o.customer_id)
            AND NOT EXISTS (
              SELECT 1 FROM _fomo_archive.order_legacy_audit a
              WHERE a.original_data = to_jsonb(o)
                AND a.issue_description = 'Legacy order references orphaned customer_id missing from public.profiles and auth.users'
            )
        $sql$;
      ELSIF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles'
      ) THEN
        EXECUTE $sql$
          INSERT INTO _fomo_archive.order_legacy_audit (original_data, issue_description)
          SELECT to_jsonb(o), 'Legacy order references orphaned customer_id missing from public.profiles'
          FROM public.orders o
          WHERE o.customer_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = o.customer_id)
            AND NOT EXISTS (
              SELECT 1 FROM _fomo_archive.order_legacy_audit a
              WHERE a.original_data = to_jsonb(o)
                AND a.issue_description = 'Legacy order references orphaned customer_id missing from public.profiles'
            )
        $sql$;
      ELSIF EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users'
      ) THEN
        EXECUTE $sql$
          INSERT INTO _fomo_archive.order_legacy_audit (original_data, issue_description)
          SELECT to_jsonb(o), 'Legacy order references orphaned customer_id missing from auth.users'
          FROM public.orders o
          WHERE o.customer_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = o.customer_id)
            AND NOT EXISTS (
              SELECT 1 FROM _fomo_archive.order_legacy_audit a
              WHERE a.original_data = to_jsonb(o)
                AND a.issue_description = 'Legacy order references orphaned customer_id missing from auth.users'
            )
        $sql$;
      END IF;
    ELSE
      -- Pre-existing orders table is missing one or more required columns entirely
      EXECUTE $sql$
        INSERT INTO _fomo_archive.order_legacy_audit (original_data, issue_description)
        SELECT to_jsonb(o), 'Legacy order table missing required schema columns (order_number, customer_id, or delivery_address)'
        FROM public.orders o
        WHERE NOT EXISTS (
          SELECT 1 FROM _fomo_archive.order_legacy_audit a
          WHERE a.original_data = to_jsonb(o)
            AND a.issue_description = 'Legacy order table missing required schema columns (order_number, customer_id, or delivery_address)'
        )
      $sql$;
    END IF;
  END IF;
END $$;

COMMIT;
