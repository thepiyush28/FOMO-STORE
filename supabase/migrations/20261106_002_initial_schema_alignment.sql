-- ============================================================================
-- MIGRATION 002 (MAIN ATOMIC MIGRATION): SCHEMA ALIGNMENT, FUNCTIONS, RLS & GRANTS
-- ============================================================================
-- Prerequisite:
--   Runs after 20261106_001_preflight_archive.sql (which has already committed
--   the _fomo_archive schema, store_settings backup, and preflight conflict rows).
--   Wrapped in a single atomic transaction (BEGIN ... COMMIT). If any data
--   integrity check fails, this entire migration rolls back cleanly with zero
--   partial schema modifications and zero data loss, while the committed
--   records in _fomo_archive from Migration 001 remain intact for inspection.
-- ============================================================================
BEGIN;

-- ============================================================================
-- 1. ENSURE ARCHIVE HELPER EXISTS (SAFE IF 002 IS TESTED STANDALONE)
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS _fomo_archive;
REVOKE ALL ON SCHEMA _fomo_archive FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA _fomo_archive TO CURRENT_USER;

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

-- ============================================================================
-- 2. BASE DOMAIN TABLES (IDEMPOTENT CREATION FOR FRESH DATABASES)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 0,
  slug text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  unit text,
  price numeric CHECK (price IS NULL OR price >= 0),
  mrp numeric CHECK (mrp IS NULL OR mrp >= 0),
  discount_percent text,
  image_url text,
  is_active boolean DEFAULT true,
  is_popular boolean DEFAULT false,
  is_new_arrival boolean DEFAULT false,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  stock_quantity integer NOT NULL DEFAULT 0,
  low_stock_threshold integer DEFAULT 5,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.store_settings (
  config_id text PRIMARY KEY DEFAULT 'primary',
  is_open boolean NOT NULL DEFAULT false,
  status_notice text DEFAULT 'Store is temporarily closed while configuration is being finalized',
  store_address text DEFAULT '[Store address in Rajauli, Nawada, Bihar to be finalized]',
  opening_hours text DEFAULT '[Opening hours to be configured]',
  support_phone text DEFAULT '[Store customer care phone to be provided]',
  delivery_fee numeric CHECK (delivery_fee IS NULL OR delivery_fee >= 0),
  free_delivery_threshold numeric CHECK (free_delivery_threshold IS NULL OR free_delivery_threshold >= 0),
  min_order_amount numeric CHECK (min_order_amount IS NULL OR min_order_amount >= 0),
  delivery_radius_km numeric CHECK (delivery_radius_km IS NULL OR delivery_radius_km >= 0),
  serviceable_pincodes text[] DEFAULT NULL,
  fssai_license_number text DEFAULT '[FSSAI Registration/License number pending]',
  banner_message text,
  updated_at timestamptz DEFAULT now()
);

-- ============================================================================
-- 3. EXHAUSTIVE EXISTING TABLE ALIGNMENT & INTEGRITY AUDITS
-- ============================================================================

-- 3.1 CATEGORIES
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 3.2 PRODUCTS
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_id uuid,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_popular boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_new_arrival boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS mrp numeric,
  ADD COLUMN IF NOT EXISTS discount_percent text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE public.products
  ALTER COLUMN category_id DROP NOT NULL,
  ALTER COLUMN unit DROP NOT NULL,
  ALTER COLUMN price DROP NOT NULL,
  ALTER COLUMN mrp DROP NOT NULL,
  ALTER COLUMN discount_percent DROP NOT NULL,
  ALTER COLUMN image_url DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_category_id_fkey') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_price_check') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_price_check CHECK (price IS NULL OR price >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_mrp_check') THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_mrp_check CHECK (mrp IS NULL OR mrp >= 0);
  END IF;
END $$;

-- 3.3 INVENTORY ALIGNMENT, NULL/DUPLICATE DETECTION & ORPHAN AUDIT
-- Supports product_id-only, item_id-only, and dual-column legacy tables.
DO $$
DECLARE
  v_has_product_id boolean;
  v_has_item_id boolean;
  v_null_count integer;
  v_dup_count integer;
  v_orphan_count integer;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'product_id'
  ) INTO v_has_product_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'inventory' AND column_name = 'item_id'
  ) INTO v_has_item_id;

  IF NOT v_has_product_id THEN
    ALTER TABLE public.inventory ADD COLUMN product_id uuid;
  END IF;

  IF v_has_item_id THEN
    EXECUTE 'UPDATE public.inventory SET product_id = _fomo_archive.try_cast_uuid(item_id::text) WHERE product_id IS NULL AND item_id IS NOT NULL';
  END IF;

  -- 1. Detect NULL product_id rows in inventory (including unmapped/invalid item_id)
  SELECT count(*) INTO v_null_count
  FROM public.inventory
  WHERE product_id IS NULL;

  IF v_null_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION HALTED: % inventory rows have NULL or invalid product_id/item_id. Original rows remain untouched in public.inventory and preflight snapshots are saved in _fomo_archive.inventory_conflicts. Manual resolution required.', v_null_count;
  END IF;

  -- 2. Detect duplicate product_id rows in inventory
  SELECT count(*) INTO v_dup_count
  FROM (
    SELECT product_id 
    FROM public.inventory 
    WHERE product_id IS NOT NULL 
    GROUP BY product_id 
    HAVING count(*) > 1
  ) dups;

  IF v_dup_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION HALTED: % products have duplicate inventory rows. Original rows remain untouched in public.inventory and preflight conflict snapshots are saved in _fomo_archive.inventory_conflicts. Manual deduplication required.', v_dup_count;
  END IF;

  -- 3. Detect orphaned inventory records pointing to nonexistent products
  SELECT count(*) INTO v_orphan_count
  FROM public.inventory i
  WHERE i.product_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.products p WHERE p.id = i.product_id
  );

  IF v_orphan_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION HALTED: % orphaned inventory records point to non-existent products. Original rows remain untouched in public.inventory and preflight conflict snapshots are saved in _fomo_archive.inventory_conflicts.', v_orphan_count;
  END IF;
END $$;

ALTER TABLE public.inventory
  ALTER COLUMN product_id SET NOT NULL,
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS low_stock_threshold integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_product_id_fkey') THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_product_id_key') THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_product_id_key UNIQUE (product_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventory_stock_non_negative') THEN
    ALTER TABLE public.inventory
      ADD CONSTRAINT inventory_stock_non_negative CHECK (stock_quantity >= 0);
  END IF;
END $$;

-- 3.4 STORE SETTINGS ALIGNMENT
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS config_id text DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS is_open boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_notice text DEFAULT 'Store is temporarily closed while configuration is being finalized',
  ADD COLUMN IF NOT EXISTS store_address text DEFAULT '[Store address in Rajauli, Nawada, Bihar to be finalized]',
  ADD COLUMN IF NOT EXISTS opening_hours text DEFAULT '[Opening hours to be configured]',
  ADD COLUMN IF NOT EXISTS support_phone text DEFAULT '[Store customer care phone to be provided]',
  ADD COLUMN IF NOT EXISTS delivery_fee numeric,
  ADD COLUMN IF NOT EXISTS free_delivery_threshold numeric,
  ADD COLUMN IF NOT EXISTS min_order_amount numeric,
  ADD COLUMN IF NOT EXISTS delivery_radius_km numeric,
  ADD COLUMN IF NOT EXISTS serviceable_pincodes text[],
  ADD COLUMN IF NOT EXISTS fssai_license_number text DEFAULT '[FSSAI Registration/License number pending]',
  ADD COLUMN IF NOT EXISTS banner_message text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Ensure undecided fee/threshold/radius configuration columns and optional text columns
-- are nullable on legacy store_settings tables (ADD COLUMN IF NOT EXISTS does not drop
-- pre-existing NOT NULL constraints or invented defaults). Existing non-null row values
-- are preserved untouched.
ALTER TABLE public.store_settings
  ALTER COLUMN delivery_fee DROP NOT NULL,
  ALTER COLUMN free_delivery_threshold DROP NOT NULL,
  ALTER COLUMN min_order_amount DROP NOT NULL,
  ALTER COLUMN delivery_radius_km DROP NOT NULL,
  ALTER COLUMN delivery_fee DROP DEFAULT,
  ALTER COLUMN free_delivery_threshold DROP DEFAULT,
  ALTER COLUMN min_order_amount DROP DEFAULT,
  ALTER COLUMN delivery_radius_km DROP DEFAULT,
  ALTER COLUMN status_notice DROP NOT NULL,
  ALTER COLUMN store_address DROP NOT NULL,
  ALTER COLUMN opening_hours DROP NOT NULL,
  ALTER COLUMN support_phone DROP NOT NULL,
  ALTER COLUMN fssai_license_number DROP NOT NULL,
  ALTER COLUMN banner_message DROP NOT NULL;

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.store_settings;
  IF v_count > 1 THEN
    RAISE EXCEPTION 'MIGRATION HALTED: Multiple conflicting rows (%) detected in store_settings. Please review rows and remove duplicates before reapplying.', v_count;
  END IF;
END $$;

UPDATE public.store_settings
SET config_id = 'primary'
WHERE config_id IS NULL OR config_id <> 'primary';

ALTER TABLE public.store_settings
  ALTER COLUMN config_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_settings_config_id_key') THEN
    ALTER TABLE public.store_settings
      ADD CONSTRAINT store_settings_config_id_key UNIQUE (config_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_settings_single_row_check') THEN
    ALTER TABLE public.store_settings
      ADD CONSTRAINT store_settings_single_row_check CHECK (config_id = 'primary');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_settings_delivery_fee_check') THEN
    ALTER TABLE public.store_settings
      ADD CONSTRAINT store_settings_delivery_fee_check CHECK (delivery_fee IS NULL OR delivery_fee >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_settings_min_order_check') THEN
    ALTER TABLE public.store_settings
      ADD CONSTRAINT store_settings_min_order_check CHECK (min_order_amount IS NULL OR min_order_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_settings_free_delivery_check') THEN
    ALTER TABLE public.store_settings
      ADD CONSTRAINT store_settings_free_delivery_check CHECK (free_delivery_threshold IS NULL OR free_delivery_threshold >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_settings_delivery_radius_check') THEN
    ALTER TABLE public.store_settings
      ADD CONSTRAINT store_settings_delivery_radius_check CHECK (delivery_radius_km IS NULL OR delivery_radius_km >= 0);
  END IF;
END $$;

INSERT INTO public.store_settings (
  config_id,
  is_open,
  status_notice,
  delivery_fee,
  free_delivery_threshold,
  min_order_amount,
  delivery_radius_km
)
SELECT
  'primary',
  false,
  'Store is temporarily closed while configuration is being finalized',
  NULL,
  NULL,
  NULL,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.store_settings WHERE config_id = 'primary'
)
ON CONFLICT (config_id) DO NOTHING;

-- ============================================================================
-- 4. DOMAIN TABLES & EXHAUSTIVE EXISTING SCHEMA ALIGNMENT
-- ============================================================================
-- Safe environment mock for standalone non-Supabase runners:
-- In real Supabase, auth schema, auth.users table, auth.uid() function,
-- and roles anon/authenticated are pre-installed system objects owned by supabase_admin.
-- We must NEVER overwrite, redefine, drop or alter native Supabase auth objects.
DO $$
BEGIN
  -- 1. Create auth schema only if it does not already exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    CREATE SCHEMA auth;
  END IF;

  -- 2. Create minimal auth.users table only if running in a standalone test DB without Supabase auth
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text,
      phone text,
      raw_user_meta_data jsonb
    );
  ELSE
    ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email text;
  END IF;

  -- 3. Define auth.uid() fallback ONLY if auth.uid() function does not exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE $fn$
      CREATE FUNCTION auth.uid() RETURNS uuid AS $body$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $body$ LANGUAGE sql STABLE;
    $fn$;
  END IF;

  -- 4. Create standard Supabase roles if not present (standalone runners)
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

-- Safe permission grants on schema auth
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

-- 4.1 PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text UNIQUE,
  full_name text,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'rider')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.profiles
  ALTER COLUMN phone DROP NOT NULL,
  ALTER COLUMN full_name DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('customer', 'admin', 'rider'));
  END IF;
END $$;

-- Idempotent backfill of missing public.profiles from pre-existing auth.users:
-- Never overwrites an existing profile's role, phone, or full_name.
INSERT INTO public.profiles (id, phone, full_name, role)
SELECT 
  u.id,
  u.phone,
  u.raw_user_meta_data->>'full_name',
  'customer'
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = u.id
)
ON CONFLICT (id) DO NOTHING;

-- 4.2 ADDRESSES
CREATE TABLE IF NOT EXISTS public.addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  address_line text NOT NULL,
  landmark text,
  pincode text NOT NULL,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.addresses
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS address_line text,
  ADD COLUMN IF NOT EXISTS landmark text,
  ADD COLUMN IF NOT EXISTS pincode text,
  ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'addresses_user_id_fkey') THEN
    ALTER TABLE public.addresses
      ADD CONSTRAINT addresses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 4.3 DELIVERY PARTNERS
CREATE TABLE IF NOT EXISTS public.delivery_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  is_online boolean DEFAULT false,
  vehicle_details text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.delivery_partners
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS is_online boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vehicle_details text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_partners_user_id_fkey') THEN
    ALTER TABLE public.delivery_partners
      ADD CONSTRAINT delivery_partners_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'delivery_partners_user_id_key') THEN
    ALTER TABLE public.delivery_partners
      ADD CONSTRAINT delivery_partners_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- 4.4 PERSISTENT CUSTOMER CARTS (SCHEMA & INTEGRITY)
CREATE TABLE IF NOT EXISTS public.carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.carts
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'carts_user_id_fkey') THEN
    ALTER TABLE public.carts ADD CONSTRAINT carts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'carts_user_id_key') THEN
    ALTER TABLE public.carts ADD CONSTRAINT carts_user_id_key UNIQUE (user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT cart_items_unique_product UNIQUE (cart_id, product_id)
);

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS cart_id uuid,
  ADD COLUMN IF NOT EXISTS product_id uuid,
  ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_cart_id_fkey') THEN
    ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.carts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_product_id_fkey') THEN
    ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_quantity_check') THEN
    ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_quantity_check CHECK (quantity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cart_items_unique_product') THEN
    ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_unique_product UNIQUE (cart_id, product_id);
  END IF;
END $$;

-- 4.5 ORDERS & LEGACY INTEGRITY VERIFICATION
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.profiles(id),
  delivery_partner_id uuid REFERENCES public.delivery_partners(id),
  delivery_mode text NOT NULL CHECK (delivery_mode IN ('delivery', 'pickup')),
  status text NOT NULL DEFAULT 'placed' CHECK (status IN ('placed', 'confirmed', 'packing', 'ready', 'out_for_delivery', 'delivered', 'cancelled')),
  subtotal numeric NOT NULL CHECK (subtotal >= 0),
  delivery_fee numeric NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
  discount_amount numeric NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount numeric NOT NULL CHECK (total_amount >= 0),
  delivery_address jsonb NOT NULL,
  payment_method text NOT NULL DEFAULT 'cod' CHECK (payment_method IN ('cod', 'upi')),
  cancel_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number text,
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_partner_id uuid,
  ADD COLUMN IF NOT EXISTS delivery_mode text DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'placed',
  ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_address jsonb,
  ADD COLUMN IF NOT EXISTS payment_method text DEFAULT 'cod',
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
DECLARE
  v_bad_order_count integer;
  v_orphan_order_count integer;
BEGIN
  SELECT count(*) INTO v_bad_order_count
  FROM public.orders
  WHERE order_number IS NULL OR customer_id IS NULL OR delivery_address IS NULL;

  IF v_bad_order_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION HALTED: % pre-existing orders lack required data (order_number, customer_id, delivery_address). Original rows remain untouched in public.orders and preflight snapshots are saved in _fomo_archive.order_legacy_audit. Manual review required.', v_bad_order_count;
  END IF;

  SELECT count(*) INTO v_orphan_order_count
  FROM public.orders o
  WHERE NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = o.customer_id
  );

  IF v_orphan_order_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION HALTED: % pre-existing orders reference a customer_id that does not exist in public.profiles or auth.users. Original rows remain untouched in public.orders and preflight snapshots are saved in _fomo_archive.order_legacy_audit. Manual review required.', v_orphan_order_count;
  END IF;
END $$;

ALTER TABLE public.orders
  ALTER COLUMN order_number SET NOT NULL,
  ALTER COLUMN customer_id SET NOT NULL,
  ALTER COLUMN delivery_address SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_number_key') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_customer_id_fkey') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.profiles(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_delivery_partner_id_fkey') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_delivery_partner_id_fkey FOREIGN KEY (delivery_partner_id) REFERENCES public.delivery_partners(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_delivery_mode_check') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_delivery_mode_check CHECK (delivery_mode IN ('delivery', 'pickup'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_status_check CHECK (status IN ('placed', 'confirmed', 'packing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_payment_method_check') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('cod', 'upi'));
  END IF;
END $$;

-- 4.6 ORDER ITEMS
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  unit text,
  quantity integer NOT NULL CHECK (quantity > 0),
  total_price numeric NOT NULL CHECK (total_price >= 0),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS order_id uuid,
  ADD COLUMN IF NOT EXISTS product_id uuid,
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS unit_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS quantity integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_price numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_order_id_fkey') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_product_id_fkey') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_quantity_check') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_quantity_check CHECK (quantity > 0);
  END IF;
END $$;

-- 4.7 ORDER STATUS HISTORY
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.order_status_history
  ADD COLUMN IF NOT EXISTS order_id uuid,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_status_history_order_id_fkey') THEN
    ALTER TABLE public.order_status_history ADD CONSTRAINT order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ============================================================================
-- 5. ORDER NUMBER SEQUENCE (PROTECTED INTERNAL GENERATION)
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1001;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seq bigint;
  v_rand text;
BEGIN
  v_seq := nextval('public.order_number_seq');
  v_rand := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  RETURN 'FOMO-' || to_char(now(), 'YYYYMMDD') || '-' || v_seq::text || '-' || v_rand;
END;
$$;

-- ============================================================================
-- 6. SECURITY FUNCTIONS & TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_uid uuid;
  v_role text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = v_uid;

  RETURN (v_role = 'admin');
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_user_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF current_user IN ('anon', 'authenticated') OR auth.uid() IS NOT NULL THEN
      IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Forbidden: Only administrators can modify user roles.';
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

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, phone, full_name, role)
  VALUES (NEW.id, NEW.phone, NEW.raw_user_meta_data->>'full_name', 'customer')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.enforce_order_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (current_user NOT IN ('anon', 'authenticated') AND auth.uid() IS NULL) OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id OR
     NEW.delivery_partner_id IS DISTINCT FROM OLD.delivery_partner_id OR
     NEW.delivery_mode IS DISTINCT FROM OLD.delivery_mode OR
     NEW.subtotal IS DISTINCT FROM OLD.subtotal OR
     NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee OR
     NEW.discount_amount IS DISTINCT FROM OLD.discount_amount OR
     NEW.total_amount IS DISTINCT FROM OLD.total_amount OR
     NEW.delivery_address IS DISTINCT FROM OLD.delivery_address OR
     NEW.payment_method IS DISTINCT FROM OLD.payment_method OR
     NEW.order_number IS DISTINCT FROM OLD.order_number THEN
    RAISE EXCEPTION 'Forbidden: Direct modification of sensitive order fields is prohibited.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_immutability ON public.orders;
CREATE TRIGGER trg_enforce_order_immutability
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_order_immutability();

-- ============================================================================
-- 7. RESTRICTED PUBLIC VIEWS
-- ============================================================================
CREATE OR REPLACE VIEW public.public_catalog AS
SELECT 
  p.id,
  p.category_id,
  p.name,
  p.unit,
  p.price,
  p.mrp,
  p.discount_percent,
  p.image_url,
  p.is_popular,
  p.is_new_arrival,
  p.display_order,
  coalesce(i.stock_quantity > 0, false) AS in_stock
FROM public.products p
LEFT JOIN public.inventory i ON i.product_id = p.id
WHERE p.is_active = true;

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

-- ============================================================================
-- 8. BUSINESS RPCS (ATOMIC SERVER-SIDE LOGIC)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rider_toggle_online(p_is_online boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partner_id uuid;
BEGIN
  SELECT dp.id INTO v_partner_id
  FROM public.delivery_partners dp
  JOIN public.profiles pr ON pr.id = dp.user_id
  WHERE dp.user_id = auth.uid() AND pr.role = 'rider';

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an active delivery rider.';
  END IF;

  UPDATE public.delivery_partners
  SET is_online = p_is_online
  WHERE id = v_partner_id;

  RETURN jsonb_build_object('success', true, 'is_online', p_is_online);
END;
$$;

CREATE OR REPLACE FUNCTION public.rider_update_order_status(
  p_order_id uuid,
  p_new_status text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_partner_id uuid;
  v_current_status text;
  v_delivery_mode text;
  v_order_number text;
BEGIN
  SELECT dp.id INTO v_partner_id
  FROM public.delivery_partners dp
  JOIN public.profiles pr ON pr.id = dp.user_id
  WHERE dp.user_id = auth.uid() AND pr.role = 'rider';

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an active delivery rider.';
  END IF;

  SELECT status, delivery_mode, order_number
  INTO v_current_status, v_delivery_mode, v_order_number
  FROM public.orders
  WHERE id = p_order_id AND delivery_partner_id = v_partner_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Order not found or not assigned to your account.';
  END IF;

  IF v_delivery_mode <> 'delivery' THEN
    RAISE EXCEPTION 'Invalid operation: Store pickup orders cannot be updated by delivery riders.';
  END IF;

  IF v_current_status = 'ready' AND p_new_status = 'out_for_delivery' THEN
    NULL;
  ELSIF v_current_status = 'out_for_delivery' AND p_new_status = 'delivered' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Invalid status transition from "%" to "%".', v_current_status, p_new_status;
  END IF;

  UPDATE public.orders
  SET status = p_new_status, updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, status, note, created_at)
  VALUES (p_order_id, p_new_status, coalesce(p_note, 'Updated by delivery rider'), now());

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_number', v_order_number,
    'status', p_new_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_user_id uuid,
  p_new_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_exists boolean;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Only administrators can assign roles.';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user_id cannot be null.';
  END IF;

  IF p_new_role NOT IN ('customer', 'admin', 'rider') THEN
    RAISE EXCEPTION 'Invalid role: %', p_new_role;
  END IF;

  IF p_user_id = auth.uid() AND p_new_role <> 'admin' THEN
    RAISE EXCEPTION 'Forbidden: Administrators cannot demote their own account.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE
  ) INTO v_target_exists;

  IF NOT v_target_exists THEN
    RAISE EXCEPTION 'Profile with user_id "%" not found.', p_user_id;
  END IF;

  UPDATE public.profiles
  SET role = p_new_role, updated_at = now()
  WHERE id = p_user_id;

  IF p_new_role = 'rider' THEN
    INSERT INTO public.delivery_partners (user_id, is_online)
    VALUES (p_user_id, false)
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    UPDATE public.delivery_partners
    SET is_online = false
    WHERE user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'new_role', p_new_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.place_order(
  p_items jsonb,
  p_delivery_mode text,
  p_address_id uuid DEFAULT NULL,
  p_payment_method text DEFAULT 'cod'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_is_open boolean;
  v_delivery_fee numeric;
  v_free_threshold numeric;
  v_min_order numeric;
  v_serviceable_pincodes text[];
  v_subtotal numeric := 0;
  v_discount_amount numeric := 0;
  v_total_amount numeric := 0;
  v_order_id uuid;
  v_order_number text;
  v_address_json jsonb := '{}'::jsonb;
  v_cust_name text;
  v_cust_phone text;
  v_cust_address_line text;
  v_cust_landmark text;
  v_cust_pincode text;
  v_item record;
  v_prod record;
  v_stock integer;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to place an order.';
  END IF;

  SELECT full_name, phone INTO v_cust_name, v_cust_phone
  FROM public.profiles
  WHERE id = v_user_id;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order items list cannot be empty.';
  END IF;

  IF p_payment_method <> 'cod' THEN
    RAISE EXCEPTION 'Invalid payment method. Only Cash on Delivery is supported at this time.';
  END IF;

  IF p_delivery_mode NOT IN ('delivery', 'pickup') THEN
    RAISE EXCEPTION 'Invalid delivery mode: %', p_delivery_mode;
  END IF;

  SELECT is_open, delivery_fee, free_delivery_threshold, min_order_amount, serviceable_pincodes
  INTO v_is_open, v_delivery_fee, v_free_threshold, v_min_order, v_serviceable_pincodes
  FROM public.store_settings
  WHERE config_id = 'primary';

  IF v_is_open IS NOT TRUE THEN
    RAISE EXCEPTION 'Store is currently unavailable for new orders.';
  END IF;

  IF p_delivery_mode = 'delivery' AND v_delivery_fee IS NULL THEN
    RAISE EXCEPTION 'Delivery fee is not configured yet. Doorstep delivery is temporarily disabled.';
  END IF;

  IF p_delivery_mode = 'delivery' THEN
    -- M-1: Fail-closed delivery service area check
    IF v_serviceable_pincodes IS NULL OR array_length(v_serviceable_pincodes, 1) IS NULL OR array_length(v_serviceable_pincodes, 1) = 0 THEN
      RAISE EXCEPTION 'Delivery service area is not configured yet. Doorstep delivery is temporarily disabled. Please choose Store Pickup.';
    END IF;

    IF p_address_id IS NULL THEN
      RAISE EXCEPTION 'Delivery address is required for doorstep delivery.';
    END IF;

    SELECT address_line, landmark, pincode
    INTO v_cust_address_line, v_cust_landmark, v_cust_pincode
    FROM public.addresses
    WHERE id = p_address_id AND user_id = v_user_id;

    IF v_cust_address_line IS NULL THEN
      RAISE EXCEPTION 'Selected delivery address not found.';
    END IF;

    IF v_cust_pincode IS NULL OR btrim(v_cust_pincode) = '' THEN
      RAISE EXCEPTION 'Selected delivery address must have a valid PIN code.';
    END IF;

    IF NOT (btrim(v_cust_pincode) = ANY(v_serviceable_pincodes)) THEN
      RAISE EXCEPTION 'Delivery is not available to PIN code %. Delivery is currently limited to: %.', btrim(v_cust_pincode), array_to_string(v_serviceable_pincodes, ', ');
    END IF;

    v_address_json := jsonb_build_object(
      'address_line', v_cust_address_line,
      'landmark', v_cust_landmark,
      'pincode', v_cust_pincode,
      'customer_name', v_cust_name,
      'customer_phone', v_cust_phone
    );
  ELSE
    v_address_json := jsonb_build_object(
      'type', 'store_pickup',
      'customer_name', v_cust_name,
      'customer_phone', v_cust_phone
    );
  END IF;

  CREATE TEMPORARY TABLE IF NOT EXISTS temp_order_items (
    product_id uuid,
    product_name text,
    unit text,
    unit_price numeric,
    quantity integer,
    total_price numeric
  ) ON COMMIT DROP;
  TRUNCATE TABLE temp_order_items;

  FOR v_item IN 
    SELECT product_id, sum(quantity)::integer AS quantity
    FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
    GROUP BY product_id
    ORDER BY product_id NULLS FIRST
  LOOP
    IF v_item.product_id IS NULL THEN
      RAISE EXCEPTION 'Product ID cannot be null in order items.';
    END IF;

    IF v_item.quantity IS NULL OR v_item.quantity <= 0 THEN
      RAISE EXCEPTION 'Invalid item quantity for product %.', v_item.product_id;
    END IF;

    SELECT stock_quantity INTO v_stock
    FROM public.inventory
    WHERE product_id = v_item.product_id
    FOR UPDATE;

    SELECT id, name, unit, price INTO v_prod
    FROM public.products
    WHERE id = v_item.product_id AND is_active = true;

    IF v_prod.id IS NULL THEN
      RAISE EXCEPTION 'Product % is inactive or does not exist.', v_item.product_id;
    END IF;

    IF v_prod.price IS NULL OR v_prod.price < 0 THEN
      RAISE EXCEPTION 'Invalid price configuration for product "%".', v_prod.name;
    END IF;

    IF v_stock IS NULL OR v_stock < v_item.quantity THEN
      RAISE EXCEPTION 'Item "%" is out of stock. (Available: %, Requested: %)', v_prod.name, coalesce(v_stock, 0), v_item.quantity;
    END IF;

    INSERT INTO temp_order_items (product_id, product_name, unit, unit_price, quantity, total_price)
    VALUES (v_prod.id, v_prod.name, v_prod.unit, v_prod.price, v_item.quantity, (v_prod.price * v_item.quantity));

    v_subtotal := v_subtotal + (v_prod.price * v_item.quantity);
  END LOOP;

  IF v_min_order IS NOT NULL AND v_min_order > 0 AND v_subtotal < v_min_order THEN
    RAISE EXCEPTION 'Minimum order amount is Rs %.', v_min_order;
  END IF;

  IF p_delivery_mode = 'pickup' THEN
    v_delivery_fee := 0;
  ELSIF v_free_threshold IS NOT NULL AND v_free_threshold > 0 AND v_subtotal >= v_free_threshold THEN
    v_delivery_fee := 0;
  END IF;

  v_total_amount := v_subtotal + coalesce(v_delivery_fee, 0) - v_discount_amount;

  FOR v_item IN SELECT product_id, quantity FROM temp_order_items
  LOOP
    UPDATE public.inventory
    SET stock_quantity = stock_quantity - v_item.quantity, updated_at = now()
    WHERE product_id = v_item.product_id;
  END LOOP;

  v_order_number := public.generate_order_number();

  INSERT INTO public.orders (
    order_number, customer_id, delivery_mode, status,
    subtotal, delivery_fee, discount_amount, total_amount, delivery_address, payment_method
  )
  VALUES (
    v_order_number, v_user_id, p_delivery_mode, 'placed',
    v_subtotal, coalesce(v_delivery_fee, 0), v_discount_amount, v_total_amount, v_address_json, p_payment_method
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, product_id, product_name, unit_price, unit, quantity, total_price)
  SELECT v_order_id, product_id, product_name, unit_price, unit, quantity, total_price
  FROM temp_order_items;

  INSERT INTO public.order_status_history (order_id, status, note, created_at)
  VALUES (v_order_id, 'placed', 'Order placed successfully by customer', now());

  -- Clear customer persistent cart items after successful order placement
  DELETE FROM public.cart_items
  WHERE cart_id IN (SELECT id FROM public.carts WHERE user_id = v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'subtotal', v_subtotal,
    'delivery_fee', coalesce(v_delivery_fee, 0),
    'discount_amount', v_discount_amount,
    'total_amount', v_total_amount,
    'status', 'placed'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_cancel_order(
  p_order_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_current_status text;
  v_order_number text;
  v_cancel_note text;
  v_item record;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to cancel an order.';
  END IF;

  SELECT status, order_number
  INTO v_current_status, v_order_number
  FROM public.orders
  WHERE id = p_order_id AND customer_id = v_user_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Order not found or does not belong to your account.';
  END IF;

  IF v_current_status NOT IN ('placed', 'confirmed') THEN
    RAISE EXCEPTION 'Order cannot be cancelled because packing has already started or order is finalized (current status: %).', v_current_status;
  END IF;

  -- Restore inventory stock in deterministic product_id order
  FOR v_item IN
    SELECT product_id, sum(quantity)::integer AS quantity
    FROM public.order_items
    WHERE order_id = p_order_id AND product_id IS NOT NULL
    GROUP BY product_id
    ORDER BY product_id
  LOOP
    UPDATE public.inventory
    SET stock_quantity = stock_quantity + v_item.quantity, updated_at = now()
    WHERE product_id = v_item.product_id;
  END LOOP;

  v_cancel_note := coalesce(nullif(btrim(p_reason), ''), 'Cancelled by customer before packing');

  UPDATE public.orders
  SET status = 'cancelled',
      cancel_reason = v_cancel_note,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, status, note, created_at)
  VALUES (p_order_id, 'cancelled', v_cancel_note, now());

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_number', v_order_number,
    'status', 'cancelled',
    'cancel_reason', v_cancel_note
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_order(
  p_order_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_status text;
  v_order_number text;
  v_clean_reason text;
  v_item record;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: Only administrators can perform admin order cancellation.';
  END IF;

  v_clean_reason := nullif(btrim(p_reason), '');
  IF v_clean_reason IS NULL THEN
    RAISE EXCEPTION 'Cancellation reason is required when cancelling an order.';
  END IF;

  SELECT status, order_number
  INTO v_current_status, v_order_number
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_current_status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot cancel an order that is already %. ', v_current_status;
  END IF;

  -- Restore inventory stock in deterministic product_id order
  FOR v_item IN
    SELECT product_id, sum(quantity)::integer AS quantity
    FROM public.order_items
    WHERE order_id = p_order_id AND product_id IS NOT NULL
    GROUP BY product_id
    ORDER BY product_id
  LOOP
    UPDATE public.inventory
    SET stock_quantity = stock_quantity + v_item.quantity, updated_at = now()
    WHERE product_id = v_item.product_id;
  END LOOP;

  UPDATE public.orders
  SET status = 'cancelled',
      cancel_reason = v_clean_reason,
      updated_at = now()
  WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, status, note, created_at)
  VALUES (p_order_id, 'cancelled', 'Cancelled by store owner: ' || v_clean_reason, now());

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_number', v_order_number,
    'status', 'cancelled',
    'cancel_reason', v_clean_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_order_rider_info(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_uid uuid;
  v_partner_id uuid;
  v_customer_id uuid;
  v_rider_name text;
  v_rider_phone text;
  v_vehicle text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT customer_id, delivery_partner_id
  INTO v_customer_id, v_partner_id
  FROM public.orders
  WHERE id = p_order_id;

  IF v_customer_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_customer_id <> v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: You do not have permission to view rider details for this order.';
  END IF;

  IF v_partner_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT pr.full_name, pr.phone, dp.vehicle_details
  INTO v_rider_name, v_rider_phone, v_vehicle
  FROM public.delivery_partners dp
  JOIN public.profiles pr ON pr.id = dp.user_id
  WHERE dp.id = v_partner_id;

  IF v_rider_phone IS NULL AND v_rider_name IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'delivery_partner_id', v_partner_id,
    'rider_name', coalesce(v_rider_name, 'Assigned Delivery Partner'),
    'rider_phone', v_rider_phone,
    'vehicle_details', v_vehicle
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.rider_get_assigned_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
DECLARE
  v_partner_id uuid;
  v_result jsonb;
BEGIN
  SELECT dp.id INTO v_partner_id
  FROM public.delivery_partners dp
  JOIN public.profiles pr ON pr.id = dp.user_id
  WHERE dp.user_id = auth.uid() AND pr.role = 'rider';

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Caller is not an active delivery rider.';
  END IF;

  SELECT coalesce(jsonb_agg(order_row ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      o.id,
      o.order_number,
      o.customer_id,
      o.delivery_partner_id,
      o.delivery_mode,
      o.status,
      o.subtotal,
      o.delivery_fee,
      o.discount_amount,
      o.total_amount,
      o.delivery_address,
      o.payment_method,
      o.cancel_reason,
      o.created_at,
      o.updated_at,
      coalesce(pr.full_name, o.delivery_address->>'customer_name', 'Customer') AS customer_name,
      coalesce(pr.phone, o.delivery_address->>'customer_phone') AS customer_phone,
      coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', oi.id,
          'product_id', oi.product_id,
          'product_name', oi.product_name,
          'unit_price', oi.unit_price,
          'unit', oi.unit,
          'quantity', oi.quantity,
          'total_price', oi.total_price
        ))
        FROM public.order_items oi
        WHERE oi.order_id = o.id
      ), '[]'::jsonb) AS items
    FROM public.orders o
    LEFT JOIN public.profiles pr ON pr.id = o.customer_id
    WHERE o.delivery_partner_id = v_partner_id
  ) order_row;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

-- Categories
DROP POLICY IF EXISTS "Public can view active categories" ON public.categories;
CREATE POLICY "Public can view active categories" ON public.categories
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins full access categories" ON public.categories;
CREATE POLICY "Admins full access categories" ON public.categories
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Products
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
CREATE POLICY "Public can view active products" ON public.products
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Admins full access products" ON public.products;
CREATE POLICY "Admins full access products" ON public.products
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Inventory (Public has 0 direct read access)
DROP POLICY IF EXISTS "Admins full access inventory" ON public.inventory;
CREATE POLICY "Admins full access inventory" ON public.inventory
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Store Settings (Public has 0 direct read access)
DROP POLICY IF EXISTS "Admins full access store settings" ON public.store_settings;
CREATE POLICY "Admins full access store settings" ON public.store_settings
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Users can update own profile fields" ON public.profiles;
CREATE POLICY "Users can update own profile fields" ON public.profiles
  FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Admins full access profiles" ON public.profiles;
CREATE POLICY "Admins full access profiles" ON public.profiles
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Addresses
DROP POLICY IF EXISTS "Customers full access own addresses" ON public.addresses;
CREATE POLICY "Customers full access own addresses" ON public.addresses
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins full access addresses" ON public.addresses;
CREATE POLICY "Admins full access addresses" ON public.addresses
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Delivery Partners
DROP POLICY IF EXISTS "Riders can view own partner profile" ON public.delivery_partners;
CREATE POLICY "Riders can view own partner profile" ON public.delivery_partners
  FOR SELECT USING (
    user_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'rider'
    ) OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admins full access delivery partners" ON public.delivery_partners;
CREATE POLICY "Admins full access delivery partners" ON public.delivery_partners
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Carts
DROP POLICY IF EXISTS "Customers manage own cart" ON public.carts;
CREATE POLICY "Customers manage own cart" ON public.carts
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins full access carts" ON public.carts;
CREATE POLICY "Admins full access carts" ON public.carts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Cart Items
DROP POLICY IF EXISTS "Customers manage own cart items" ON public.cart_items;
CREATE POLICY "Customers manage own cart items" ON public.cart_items
  FOR ALL USING (
    cart_id IN (SELECT id FROM public.carts WHERE user_id = auth.uid())
  ) WITH CHECK (
    cart_id IN (SELECT id FROM public.carts WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins full access cart items" ON public.cart_items;
CREATE POLICY "Admins full access cart items" ON public.cart_items
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Orders
DROP POLICY IF EXISTS "Customers can view own orders" ON public.orders;
CREATE POLICY "Customers can view own orders" ON public.orders
  FOR SELECT USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Riders can view assigned orders" ON public.orders;
CREATE POLICY "Riders can view assigned orders" ON public.orders
  FOR SELECT USING (
    delivery_partner_id IN (
      SELECT dp.id 
      FROM public.delivery_partners dp
      JOIN public.profiles pr ON pr.id = dp.user_id
      WHERE dp.user_id = auth.uid() AND pr.role = 'rider'
    )
  );

DROP POLICY IF EXISTS "Admins full access orders" ON public.orders;
CREATE POLICY "Admins full access orders" ON public.orders
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Order Items
DROP POLICY IF EXISTS "Customers view own order items" ON public.order_items;
CREATE POLICY "Customers view own order items" ON public.order_items
  FOR SELECT USING (
    order_id IN (SELECT id FROM public.orders WHERE customer_id = auth.uid())
  );

DROP POLICY IF EXISTS "Riders view assigned order items" ON public.order_items;
CREATE POLICY "Riders view assigned order items" ON public.order_items
  FOR SELECT USING (
    order_id IN (
      SELECT o.id FROM public.orders o
      WHERE o.delivery_partner_id IN (
        SELECT dp.id 
        FROM public.delivery_partners dp
        JOIN public.profiles pr ON pr.id = dp.user_id
        WHERE dp.user_id = auth.uid() AND pr.role = 'rider'
      )
    )
  );

DROP POLICY IF EXISTS "Admins full access order items" ON public.order_items;
CREATE POLICY "Admins full access order items" ON public.order_items
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Order Status History
DROP POLICY IF EXISTS "Customers view own order history" ON public.order_status_history;
CREATE POLICY "Customers view own order history" ON public.order_status_history
  FOR SELECT USING (
    order_id IN (SELECT id FROM public.orders WHERE customer_id = auth.uid())
  );

DROP POLICY IF EXISTS "Riders view assigned order history" ON public.order_status_history;
CREATE POLICY "Riders view assigned order history" ON public.order_status_history
  FOR SELECT USING (
    order_id IN (
      SELECT o.id FROM public.orders o
      WHERE o.delivery_partner_id IN (
        SELECT dp.id 
        FROM public.delivery_partners dp
        JOIN public.profiles pr ON pr.id = dp.user_id
        WHERE dp.user_id = auth.uid() AND pr.role = 'rider'
      )
    )
  );

DROP POLICY IF EXISTS "Admins full access order history" ON public.order_status_history;
CREATE POLICY "Admins full access order history" ON public.order_status_history
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ============================================================================
-- 10. FUNCTION EXECUTION GRANTS & TABLE PRIVILEGES
-- ============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Catalog & Products: anon and authenticated can SELECT; authenticated has CRUD under RLS (admins only by RLS)
GRANT SELECT ON public.categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;

GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;

-- Inventory & Store Settings: 0 direct public privileges; authenticated has CRUD under RLS (admins only by RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_settings TO authenticated;

-- Profiles & Addresses (Profiles are created by auth trigger and deleted via auth.users CASCADE)
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;

-- Delivery Partners
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_partners TO authenticated;

-- Carts & Cart Items
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;

-- Orders & Order Items
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT SELECT, INSERT ON public.order_items TO authenticated;
GRANT SELECT, INSERT ON public.order_status_history TO authenticated;

-- Public Views (Safe exposure for storefront)
GRANT SELECT ON public.public_catalog TO anon, authenticated;
GRANT SELECT ON public.public_store_settings TO anon, authenticated;

-- Functions
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

REVOKE ALL ON FUNCTION public.bootstrap_admin_account(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_admin_account(text) TO CURRENT_USER;

REVOKE ALL ON FUNCTION public.bootstrap_admin_user(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_admin_user(text) TO CURRENT_USER;

REVOKE ALL ON FUNCTION public.admin_set_user_role(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.rider_toggle_online(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rider_toggle_online(boolean) TO authenticated;

REVOKE ALL ON FUNCTION public.rider_update_order_status(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rider_update_order_status(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.place_order(jsonb, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, text, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.customer_cancel_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_cancel_order(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_cancel_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_order(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_order_rider_info(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_rider_info(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.rider_get_assigned_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rider_get_assigned_orders() TO authenticated;

-- Sequence generator is private to owner/place_order
REVOKE ALL ON FUNCTION public.generate_order_number() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_order_number() TO CURRENT_USER;

-- ============================================================================
-- 11. SUPABASE STORAGE BUCKET & POLICIES (SAFE CONDITIONAL PROVISIONING)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'storage' AND table_name = 'buckets'
  ) THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('product-images', 'product-images', true)
    ON CONFLICT (id) DO NOTHING;

    EXECUTE 'DROP POLICY IF EXISTS "Public view product images" ON storage.objects';
    EXECUTE 'CREATE POLICY "Public view product images" ON storage.objects FOR SELECT USING (bucket_id = ''product-images'')';

    EXECUTE 'DROP POLICY IF EXISTS "Admins manage product images" ON storage.objects';
    EXECUTE 'CREATE POLICY "Admins manage product images" ON storage.objects FOR ALL USING (bucket_id = ''product-images'' AND public.is_admin()) WITH CHECK (bucket_id = ''product-images'' AND public.is_admin())';
  END IF;
END $$;

COMMIT;
