-- ============================================================================
-- MIGRATION 003: PRODUCTION SECURITY HARDENING (AUDIT FINDINGS F-1, F-2, F-3)
-- ============================================================================
-- Prerequisite:
--   Runs after:
--     1. 20261106_001_preflight_archive.sql
--     2. 20261106_002_initial_schema_alignment.sql
--
-- Scope:
--   1. F-1 (Profile Phone Integrity & Admin Bootstrap Hardening):
--      - Prevents authenticated non-admin users from modifying their own
--        public.profiles.phone (or id/role) directly via PostgREST.
--      - Preserves legitimate phone updates through verified Supabase Auth
--        (auth.users) via a SECURITY DEFINER trigger (on_auth_user_updated).
--      - Reconciles any existing public.profiles.phone with auth.users.phone.
--      - Hardens public.bootstrap_admin_user(p_phone) to resolve target users
--        strictly from verified auth.users.phone rather than public.profiles.phone.
--   2. F-2 (Least-Privilege Table & Sequence Grants):
--      - Explicitly revokes all default table and sequence privileges in schema
--        public from PUBLIC, anon, and authenticated before re-granting the
--        exact minimum required privileges.
--   3. F-3 (Storage Bucket MIME-Type & Size Hardening):
--      - Restricts the 'product-images' bucket in storage.buckets to
--        JPEG, PNG, WebP, and GIF (image/jpeg, image/png, image/webp, image/gif)
--        with a strict 5 MB (5,242,880 bytes) file_size_limit while preserving
--        admin-only upload/manage policies and public image viewing.
-- ============================================================================
BEGIN;

-- ============================================================================
-- 1. FINDING F-1: PROTECT profiles.phone, SYNC VERIFIED AUTH UPDATES &
--                 HARDEN bootstrap_admin_user()
-- ============================================================================

-- 1.1 Reconcile any existing profile phone numbers with authoritative auth.users.phone
UPDATE public.profiles p
SET phone = u.phone,
    updated_at = now()
FROM auth.users u
WHERE p.id = u.id
  AND u.phone IS NOT NULL
  AND p.phone IS DISTINCT FROM u.phone;

-- 1.2 Harden BEFORE UPDATE trigger function on public.profiles
CREATE OR REPLACE FUNCTION public.protect_user_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Prevent primary key mutation
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Forbidden: Profile ID cannot be modified.';
  END IF;

  -- Prevent unauthorized role escalation or modification
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF current_user IN ('anon', 'authenticated') OR auth.uid() IS NOT NULL THEN
      IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Forbidden: Only administrators can modify user roles.';
      END IF;
    END IF;
  END IF;

  -- F-1: Prevent authenticated non-admin users from modifying profiles.phone via PostgREST.
  -- Legitimate phone changes must occur through verified Supabase Auth (auth.users),
  -- which triggers public.handle_auth_user_updated() (SECURITY DEFINER).
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    IF current_user IN ('anon', 'authenticated') THEN
      IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Forbidden: Direct modification of registered phone number is prohibited. Phone updates must be verified through authentication.';
      END IF;
    ELSIF auth.uid() IS NOT NULL THEN
      IF NOT public.is_admin() AND NOT (
        coalesce(current_setting('fomo.auth_phone_sync', true), '') = 'true'
        AND EXISTS (
          SELECT 1 FROM auth.users u
          WHERE u.id = NEW.id AND u.phone IS NOT DISTINCT FROM NEW.phone
        )
      ) THEN
        RAISE EXCEPTION 'Forbidden: Direct modification of registered phone number is prohibited. Phone updates must be verified through authentication.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_role ON public.profiles;
CREATE TRIGGER trg_protect_user_role
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_user_role_change();

-- 1.3 Synchronize verified phone number updates from auth.users -> public.profiles
CREATE OR REPLACE FUNCTION public.handle_auth_user_updated()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    PERFORM set_config('fomo.auth_phone_sync', 'true', true);
    UPDATE public.profiles
    SET phone = NEW.phone,
        updated_at = now()
    WHERE id = NEW.id;
    PERFORM set_config('fomo.auth_phone_sync', 'false', true);
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_auth_user_updated() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_auth_user_updated() TO CURRENT_USER;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
AFTER UPDATE OF phone ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_auth_user_updated();

-- 1.4 Harden bootstrap_admin_account(p_identifier) to bind strictly to verified auth.users (email, phone, or UUID)
CREATE OR REPLACE FUNCTION public.bootstrap_admin_account(p_identifier text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_identifier text;
  v_user_id uuid;
  v_user_email text;
  v_user_phone text;
  v_jwt_role text;
BEGIN
  v_jwt_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );

  IF session_user IN ('anon', 'authenticated', 'authenticator')
     OR v_jwt_role IN ('anon', 'authenticated')
     OR auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'Forbidden: bootstrap_admin_account cannot be called via web API.';
  END IF;

  v_clean_identifier := nullif(btrim(p_identifier), '');
  IF v_clean_identifier IS NULL THEN
    RAISE EXCEPTION 'Identifier cannot be empty.';
  END IF;

  -- Resolve target user strictly from verified auth.users record by email, phone, or UUID id
  SELECT u.id, u.email, u.phone
  INTO v_user_id, v_user_email, v_user_phone
  FROM auth.users u
  WHERE lower(coalesce(u.email, '')) = lower(v_clean_identifier)
     OR coalesce(u.phone, '') = v_clean_identifier
     OR u.id::text = v_clean_identifier
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Account "%" not found in verified auth.users. Please sign up or create the account first.', v_clean_identifier;
  END IF;

  UPDATE public.profiles
  SET role = 'admin',
      updated_at = now()
  WHERE id = v_user_id
  RETURNING id INTO v_user_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Profile row for user "%" not found in public.profiles.', v_clean_identifier;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'user_id', v_user_id,
    'role', 'admin',
    'email', v_user_email,
    'phone', v_user_phone
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_admin_account(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_admin_account(text) TO CURRENT_USER;

-- Backward-compatible alias for existing callers
CREATE OR REPLACE FUNCTION public.bootstrap_admin_user(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.bootstrap_admin_account(p_phone);
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_admin_user(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_admin_user(text) TO CURRENT_USER;

-- ============================================================================
-- 2. FINDING F-2: EXPLICIT REVOKE OF DEFAULT TABLE/SEQUENCE GRANTS,
--                 ALTER DEFAULT PRIVILEGES & MINIMUM REQUIRED GRANTS
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Prevent future tables, sequences, and functions in schema public from
-- automatically inheriting excessive Supabase default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM PUBLIC, anon;

-- Explicitly strip any broad default table/view/sequence privileges in schema public
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Keep internal order number sequence strictly private to SECURITY DEFINER owner (generate_order_number / place_order)
REVOKE ALL ON SEQUENCE public.order_number_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.order_number_seq TO CURRENT_USER;

-- Legacy sequence safeguard: All 12 canonical FOMO-STORE tables use UUID/text primary keys
-- (DEFAULT gen_random_uuid()), which do not use sequences. However, if a pre-existing legacy
-- table in production retains an owned SERIAL / BIGSERIAL / IDENTITY column sequence, grant
-- minimum USAGE, SELECT (never UPDATE/setval) to authenticated so direct PostgREST INSERTs
-- continue to work without exposing standalone sequences like order_number_seq.
DO $$
DECLARE
  v_seq record;
BEGIN
  FOR v_seq IN
    SELECT n.nspname AS seq_schema, s.relname AS seq_name
    FROM pg_class s
    JOIN pg_namespace n ON n.oid = s.relnamespace
    JOIN pg_depend d ON d.objid = s.oid AND d.classid = 'pg_class'::regclass
    JOIN pg_class t ON t.oid = d.refobjid AND d.refclassid = 'pg_class'::regclass
    WHERE s.relkind = 'S'
      AND n.nspname = 'public'
      AND d.deptype IN ('a', 'i')
      AND s.relname <> 'order_number_seq'
      AND t.relname IN (
        'categories', 'products', 'inventory', 'store_settings',
        'addresses', 'delivery_partners', 'carts', 'cart_items',
        'orders', 'order_items', 'order_status_history'
      )
  LOOP
    EXECUTE format(
      'GRANT USAGE, SELECT ON SEQUENCE %I.%I TO authenticated',
      v_seq.seq_schema,
      v_seq.seq_name
    );
  END LOOP;
END $$;

-- Re-grant exact minimum required table & view privileges:

-- 2.1 Categories & Products: anon can SELECT; authenticated has CRUD (restricted to admins by RLS)
GRANT SELECT ON public.categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;

GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;

-- 2.2 Inventory & Store Settings: 0 anon privileges; authenticated has CRUD (restricted to admins by RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_settings TO authenticated;

-- 2.3 Profiles & Addresses: Profiles only allow SELECT and UPDATE (created via auth trigger, deleted via CASCADE)
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;

-- 2.4 Delivery Partners: 0 anon privileges; authenticated has CRUD (restricted by RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_partners TO authenticated;

-- 2.5 Persistent Customer Carts & Cart Items: 0 anon privileges; authenticated has CRUD (isolated by RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;

-- 2.6 Orders, Order Items & Status History: 0 anon privileges; no DELETE privileges
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT SELECT, INSERT ON public.order_items TO authenticated;
GRANT SELECT, INSERT ON public.order_status_history TO authenticated;

-- 2.7 Public Storefront Views: SELECT only for anon and authenticated
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS serviceable_pincodes text[];

DROP VIEW IF EXISTS public.public_store_settings;
CREATE OR REPLACE VIEW public.public_store_settings AS
SELECT 
  is_open,
  status_notice,
  store_address,
  opening_hours,
  support_phone,
  delivery_fee,
  free_delivery_threshold,
  min_order_amount,
  delivery_radius_km,
  fssai_license_number,
  banner_message,
  serviceable_pincodes
FROM public.store_settings
WHERE config_id = 'primary';

GRANT SELECT ON public.public_catalog TO anon, authenticated;
GRANT SELECT ON public.public_store_settings TO anon, authenticated;

-- ============================================================================
-- 3. FINDING F-3: RESTRICT product-images STORAGE BUCKET TO 5 MB &
--                 SAFE IMAGE MIME TYPES (JPEG, PNG, WEBP, GIF)
-- ============================================================================
DO $$
DECLARE
  v_has_size_col boolean;
  v_has_mime_col boolean;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'file_size_limit'
    ) INTO v_has_size_col;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'allowed_mime_types'
    ) INTO v_has_mime_col;

    IF v_has_size_col AND v_has_mime_col THEN
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES (
        'product-images',
        'product-images',
        true,
        5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
      )
      ON CONFLICT (id) DO UPDATE
      SET public = true,
          file_size_limit = 5242880,
          allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    ELSE
      INSERT INTO storage.buckets (id, name, public)
      VALUES ('product-images', 'product-images', true)
      ON CONFLICT (id) DO UPDATE
      SET public = true;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'storage' AND table_name = 'objects'
    ) THEN
      EXECUTE 'DROP POLICY IF EXISTS "Public view product images" ON storage.objects';
      EXECUTE 'CREATE POLICY "Public view product images" ON storage.objects FOR SELECT USING (bucket_id = ''product-images'')';

      EXECUTE 'DROP POLICY IF EXISTS "Admins manage product images" ON storage.objects';
      EXECUTE 'CREATE POLICY "Admins manage product images" ON storage.objects FOR ALL USING (bucket_id = ''product-images'' AND public.is_admin()) WITH CHECK (bucket_id = ''product-images'' AND public.is_admin())';
    END IF;
  END IF;
END $$;

COMMIT;
