# FOMO Store — Staging Database Migration Package & Security Review (`fomo-store-staging`)

**Target Environment:** `fomo-store-staging` (Fresh Supabase-Hosted PostgreSQL Project)  
**Review Date:** 2026-11-07  
**Safety Verdict:** **SAFE TO APPLY TO FRESH STAGING PROJECT (`fomo-store-staging`)**

---

## 1. Exact Migration Filenames & Mandatory Execution Order

Apply **only** the three canonical migration files located in [`supabase/migrations/`](file:///d:/fomo-app-about-all/FOMO-STORE/supabase/migrations) in the strict numerical sequence below, followed by the read-only verification script:

| Execution Step | Exact File Path | Size / Lines | Transaction Mode | Role in Migration Package |
| :--- | :--- | :--- | :--- | :--- |
| **Step 1 (First)** | [`supabase/migrations/20261106_001_preflight_archive.sql`](file:///d:/fomo-app-about-all/FOMO-STORE/supabase/migrations/20261106_001_preflight_archive.sql) | `13,243` bytes (`290` lines) | `BEGIN; ... COMMIT;` | Creates private `_fomo_archive` schema, snapshot tables, and UUID cast helper; performs read-only preflight checks. |
| **Step 2 (Second)** | [`supabase/migrations/20261106_002_initial_schema_alignment.sql`](file:///d:/fomo-app-about-all/FOMO-STORE/supabase/migrations/20261106_002_initial_schema_alignment.sql) | `64,071` bytes (`1,735` lines) | `BEGIN; ... COMMIT;` | Creates all 12 `public` tables, 2 public views, 1 sequence, 13 functions/RPCs, 3 triggers, 26 table RLS policies, and initial storage bucket policies. |
| **Step 3 (Third)** | [`supabase/migrations/20261106_003_security_hardening_f1_f2_f3.sql`](file:///d:/fomo-app-about-all/FOMO-STORE/supabase/migrations/20261106_003_security_hardening_f1_f2_f3.sql) | `13,590` bytes (`323` lines) | `BEGIN; ... COMMIT;` | Applies security hardenings F-1 (phone integrity & `on_auth_user_updated`), F-2 (least-privilege table/sequence grants & `ALTER DEFAULT PRIVILEGES`), and F-3 (`product-images` 5 MB & MIME-type limits). |
| **Step 4 (Verify)** | [`supabase/verification_queries.sql`](file:///d:/fomo-app-about-all/FOMO-STORE/supabase/verification_queries.sql) | `4,650` bytes (`144` lines) | Read-only (`SELECT` only) | Confirms all 12 tables have RLS, sequence privileges are revoked, both `auth.users` triggers are enabled, and `product-images` bucket constraints are active. |

> **IMPORTANT — Do NOT Run Archived Files:**  
> Do **not** run [`supabase/migrations_archive/20261031_001_initial_schema_alignment.sql`](file:///d:/fomo-app-about-all/FOMO-STORE/supabase/migrations_archive/20261031_001_initial_schema_alignment.sql). That file is an archived historical single-file predecessor retained strictly for audit history.

---

## 2. Detailed Breakdown of What Each Migration Does

### Migration 001 — [`20261106_001_preflight_archive.sql`](file:///d:/fomo-app-about-all/FOMO-STORE/supabase/migrations/20261106_001_preflight_archive.sql)
1. **Creates Private Audit Schema (`_fomo_archive`)**:
   - Executes `CREATE SCHEMA IF NOT EXISTS _fomo_archive` and revokes all access from `PUBLIC` (`REVOKE ALL ON SCHEMA _fomo_archive FROM PUBLIC`).
2. **Creates Idempotent Archive Tables**:
   - `_fomo_archive.store_settings_snapshots`
   - `_fomo_archive.inventory_conflicts`
   - `_fomo_archive.order_legacy_audit`
3. **Creates Safe UUID Parser**:
   - `_fomo_archive.try_cast_uuid(p_val text)` (`IMMUTABLE`, `SET search_path = public, pg_temp`).
4. **Guarded Preflight Inspection**:
   - Checks `information_schema.tables` for `public.store_settings`, `public.inventory`, and `public.orders`.
   - **Behavior on a fresh `fomo-store-staging` database:** Because none of the `public` tables exist yet on a fresh project, all `IF EXISTS` blocks cleanly evaluate to `false` (`0` rows archived) and the transaction commits `_fomo_archive` and its helper function cleanly.

---

### Migration 002 — [`20261106_002_initial_schema_alignment.sql`](file:///d:/fomo-app-about-all/FOMO-STORE/supabase/migrations/20261106_002_initial_schema_alignment.sql)
1. **Creates All 12 Canonical `public` Domain Tables**:
   - `public.categories` (`id`, `name`, `is_active`, `display_order`, `slug`, `created_at`)
   - `public.products` (`id`, `category_id`, `name`, `unit`, `price`, `mrp`, `discount_percent`, `image_url`, `is_active`, `is_popular`, `is_new_arrival`, `display_order`, `created_at`) with `CHECK (price IS NULL OR price >= 0)` and `CHECK (mrp IS NULL OR mrp >= 0)`
   - `public.inventory` (`product_id` PK/FK → `products(id) ON DELETE CASCADE`, `stock_quantity` with `CHECK (stock_quantity >= 0)`, `low_stock_threshold`, `updated_at`)
   - `public.store_settings` (`config_id` PK with `CHECK (config_id = 'primary')`, `is_open` default `false`, nullable `delivery_fee`, `free_delivery_threshold`, `min_order_amount`, `delivery_radius_km`, and placeholder strings for undecided business fields)
   - `public.profiles` (`id` PK/FK → `auth.users(id) ON DELETE CASCADE`, `phone` UNIQUE, `full_name`, `role` default `'customer'` with `CHECK (role IN ('customer', 'admin', 'rider'))`, `created_at`, `updated_at`)
   - `public.addresses` (`id`, `user_id` FK → `profiles(id) ON DELETE CASCADE`, `address_line`, `landmark`, `pincode`, `is_default`, `created_at`)
   - `public.delivery_partners` (`id`, `user_id` UNIQUE FK → `profiles(id) ON DELETE CASCADE`, `is_online`, `vehicle_details`, `created_at`)
   - `public.carts` (`id`, `user_id` UNIQUE FK → `profiles(id) ON DELETE CASCADE`, `created_at`, `updated_at`)
   - `public.cart_items` (`id`, `cart_id` FK → `carts(id) ON DELETE CASCADE`, `product_id` FK → `products(id) ON DELETE CASCADE`, `quantity` with `CHECK (quantity > 0)`, `UNIQUE (cart_id, product_id)`)
   - `public.orders` (`id`, `order_number` UNIQUE, `customer_id` FK → `profiles(id)`, `delivery_partner_id` FK → `delivery_partners(id)`, `delivery_mode`, `status`, `subtotal`, `delivery_fee`, `discount_amount`, `total_amount`, `delivery_address` JSONB, `payment_method`, `cancel_reason`, `created_at`, `updated_at`)
   - `public.order_items` (`id`, `order_id` FK → `orders(id) ON DELETE CASCADE`, `product_id` FK → `products(id) ON DELETE SET NULL`, `product_name`, `unit_price`, `unit`, `quantity`, `total_price`, `created_at`)
   - `public.order_status_history` (`id`, `order_id` FK → `orders(id) ON DELETE CASCADE`, `status`, `note`, `created_at`)
2. **Seeds Only the Single Closed-Store Configuration Row**:
   - Inserts `config_id = 'primary'`, `is_open = false`, `delivery_fee = NULL`, `free_delivery_threshold = NULL`, `min_order_amount = NULL`, `delivery_radius_km = NULL`, and explicit placeholder notices into `public.store_settings` (`ON CONFLICT (config_id) DO NOTHING`).
   - Inserts **zero** fake products, categories, or orders.
3. **Creates Internal Order Number Sequence & Generator**:
   - `public.order_number_seq` (`START WITH 1001`) and `public.generate_order_number()` (`FOMO-YYYYMMDD-<seq>-<8hex>`).
4. **Creates Restricted Public Storefront Views**:
   - `public.public_catalog`: Exposes active products (`p.is_active = true`) with boolean `in_stock` (`coalesce(i.stock_quantity > 0, false)`) without leaking exact `stock_quantity` or `low_stock_threshold`.
   - `public.public_store_settings`: Exposes safe storefront configuration fields from `public.store_settings WHERE config_id = 'primary'`.
5. **Creates Security & Trigger Functions + Triggers**:
   - `public.is_admin()` (`SECURITY DEFINER`, `SET search_path = public, pg_temp`)
   - `public.protect_user_role_change()` + trigger `trg_protect_user_role` (`BEFORE UPDATE ON public.profiles`)
   - `public.handle_new_user()` + trigger `on_auth_user_created` (`AFTER INSERT ON auth.users`) — always initializes new users with `role = 'customer'`
   - `public.enforce_order_immutability()` + trigger `trg_enforce_order_immutability` (`BEFORE UPDATE ON public.orders`)
   - `public.bootstrap_admin_user(p_phone text)` — blocked from web/PostgREST callers (`anon`, `authenticated`, `authenticator`)
6. **Creates All 8 Atomic Business RPCs (`SECURITY DEFINER`, `SET search_path = public, pg_temp`)**:
   - `public.place_order(p_items, p_delivery_mode, p_address_id, p_payment_method)`
   - `public.customer_cancel_order(p_order_id, p_reason)`
   - `public.admin_cancel_order(p_order_id, p_reason)`
   - `public.admin_set_user_role(p_user_id, p_new_role)`
   - `public.rider_toggle_online(p_is_online)`
   - `public.rider_update_order_status(p_order_id, p_new_status, p_note)`
   - `public.get_order_rider_info(p_order_id)`
   - `public.rider_get_assigned_orders()`
7. **Enables Row-Level Security on All 12 Tables & Attaches 26 Policies**:
   - Enforces strict customer, rider, and admin isolation across all tables.

---

### Migration 003 — [`20261106_003_security_hardening_f1_f2_f3.sql`](file:///d:/fomo-app-about-all/FOMO-STORE/supabase/migrations/20261106_003_security_hardening_f1_f2_f3.sql)
1. **Finding F-1 (Profile Phone Protection & Auth Sync)**:
   - Reconciles any existing `public.profiles.phone` with `auth.users.phone`.
   - Upgrades `public.protect_user_role_change()` to forbid direct PostgREST modification of `profiles.id`, `profiles.role`, and `profiles.phone` by non-admins.
   - Creates `public.handle_auth_user_updated()` (`SECURITY DEFINER`, `SET search_path = public, pg_temp`) and attaches trigger `on_auth_user_updated` (`AFTER UPDATE OF phone ON auth.users`) so verified phone updates in Supabase Auth automatically sync to `public.profiles`.
   - Upgrades `public.bootstrap_admin_user(p_phone)` to verify phone ownership directly against `auth.users.phone`.
2. **Finding F-2 (Least-Privilege Table & Sequence Grants)**:
   - Runs `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL` on tables, sequences, and functions from `PUBLIC, anon, authenticated`.
   - Revokes all broad default privileges on `public` tables and sequences, including `REVOKE ALL ON SEQUENCE public.order_number_seq FROM PUBLIC, anon, authenticated`.
   - Re-grants only the minimum required table/view privileges:
     - `anon`: `SELECT` only on `categories`, `products`, `public_catalog`, `public_store_settings` (`0` privileges on private tables).
     - `authenticated`: No `INSERT` or `DELETE` on `profiles`; no `DELETE` on `orders`, `order_items`, or `order_status_history`.
3. **Finding F-3 (Storage Bucket MIME-Type & Size Hardening)**:
   - Configures `storage.buckets` (`id = 'product-images'`) with `public = true`, `file_size_limit = 5242880` (`5 MB`), and `allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']`.
   - Re-verifies the two `storage.objects` RLS policies (`Public view product images` and `Admins manage product images`).

---

## 3. Compatibility Check with Fresh Supabase-Hosted PostgreSQL

| Supabase Subsystem | How the Migrations Interact with It | Fresh Supabase Compatibility |
| :--- | :--- | :--- |
| **`auth.users` & `auth.uid()`** | Lines 336–374 of Migration 002 check `IF NOT EXISTS` before touching `auth`, `auth.users`, or `auth.uid()`. In a real Supabase database where `auth` is pre-installed by `supabase_admin`, those blocks are skipped so native Supabase Auth objects are **never overwritten or altered**. | **100% Compatible** |
| **Triggers on `auth.users`** | Attaches `on_auth_user_created` (`AFTER INSERT ON auth.users`) and `on_auth_user_updated` (`AFTER UPDATE OF phone ON auth.users`). When run in the Supabase SQL Editor (which executes as role `postgres`), creating triggers on `auth.users` succeeds natively. | **100% Compatible** |
| **`storage.buckets` & `storage.objects`** | Checks `information_schema.tables` and `information_schema.columns` (`file_size_limit`, `allowed_mime_types`) before upserting the `product-images` bucket and creating policies on `storage.objects`. | **100% Compatible** |
| **PostgreSQL Extensions & Built-ins** | Uses native PostgreSQL 13+ built-ins (`gen_random_uuid()`, `to_jsonb()`, `jsonb_build_object()`, `jsonb_to_recordset()`, `jsonb_agg()`). Does not require any non-default third-party extensions. | **100% Compatible** |
| **Roles (`anon`, `authenticated`, `postgres`)** | Grants and revokes target standard Supabase roles (`PUBLIC`, `anon`, `authenticated`, `CURRENT_USER`). | **100% Compatible** |
| **`SECURITY DEFINER` Search Path** | All 12 `SECURITY DEFINER` functions in `public` and `_fomo_archive` explicitly pin `SET search_path = public, pg_temp`, satisfying the Supabase Security Advisor lint rule (`function_search_path_mutable`). | **100% Compatible** |

---

## 4. Production Isolation & Destructive Operation Audit

### 4.1 Confirmation of Zero Impact on Production
- **Zero Cross-Project References**: None of the migration files contain project URLs, hardcoded project IDs, `dblink`, or `postgres_fdw` connections.
- **Complete Database Isolation**: Executing these files inside the SQL Editor of `fomo-store-staging` modifies **only** the `fomo-store-staging` PostgreSQL instance. The separate Production Supabase project is completely untouched.
- **Local Environment Guard Active**: Production credentials are isolated in `.env.production.local` (which is ignored by `npm run dev` and `npm run dev:staging`), and `resolveSupabaseEnvironment()` in [`src/lib/supabase.ts`](file:///d:/fomo-app-about-all/FOMO-STORE/src/lib/supabase.ts#L138-L512) fails closed if staging is ever pointed at the Production project reference.

### 4.2 Audit of Potentially Destructive or Irreversible Statements
Every statement across all three migration files was audited for `DROP`, `TRUNCATE`, `DELETE`, `ALTER`, and `REVOKE`:
1. **`DROP TRIGGER IF EXISTS` / `DROP POLICY IF EXISTS`**:
   - Used solely to make trigger and policy creation idempotent immediately before `CREATE TRIGGER` / `CREATE POLICY`. Safe and non-destructive.
2. **`ALTER TABLE ... DROP NOT NULL` / `DROP DEFAULT`**:
   - Used on optional product columns (`category_id`, `unit`, `price`, `mrp`, `discount_percent`, `image_url`) and undecided store settings (`delivery_fee`, `free_delivery_threshold`, `min_order_amount`, `delivery_radius_km`) so undecided values can lawfully remain `NULL`. Does not delete or overwrite data.
3. **`TRUNCATE TABLE temp_order_items`**:
   - Appears only inside the body of `public.place_order()` on a transaction-local temporary table (`CREATE TEMPORARY TABLE ... ON COMMIT DROP`). Never touches persistent tables.
4. **`DELETE FROM public.cart_items WHERE cart_id IN (...)`**:
   - Appears only inside the body of `public.place_order()` to clear the ordering customer's cart after their order is committed. Never runs during migration execution.
5. **`REVOKE ALL ON ALL TABLES / SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated` (Migration 003)**:
   - Intentional least-privilege hardening (Finding F-2), immediately followed by explicit `GRANT` statements for the exact minimum privileges needed by `anon` and `authenticated`.

### 4.3 Risks or Blockers for `fomo-store-staging`
- **Blockers:** **None.**
- **Operational Note (Email vs. Phone Auth in Staging):** Because Twilio/SMS OTP is not configured in staging, staging sign-up and sign-in will use **Email & Password**. When provisioning the first staging Owner (`admin`) account created via Email & Password (where `auth.users.phone` is `NULL`), use the UUID-based SQL snippet displayed on the `/admin` screen (or documented in Step 5 below) rather than `SELECT public.bootstrap_admin_user('+91...')` (which is designed for phone-verified accounts).

---

## 5. Exact Manual Steps to Apply Migrations in `fomo-store-staging`

Perform these steps manually in your browser:

### Step 1 — Confirm You Are in `fomo-store-staging`
1. Open the [Supabase Dashboard](https://supabase.com/dashboard) and select the **`fomo-store-staging`** project.
2. Double-check the project name in the top navigation bar to ensure you are **not** in the Production project.
3. Open **SQL Editor** from the left sidebar and click **+ New query**.

### Step 2 — Run Migration 001 (`20261106_001_preflight_archive.sql`)
1. Open [`supabase/migrations/20261106_001_preflight_archive.sql`](file:///d:/fomo-app-about-all/FOMO-STORE/supabase/migrations/20261106_001_preflight_archive.sql) locally, copy its entire contents (`Lines 1–290`), and paste it into the `fomo-store-staging` SQL Editor.
2. Click **Run** (or press `Ctrl+Enter`).
3. Confirm the output displays: `Success. No rows returned`.

### Step 3 — Run Migration 002 (`20261106_002_initial_schema_alignment.sql`)
1. Clear the SQL Editor (or open a new query tab).
2. Open [`supabase/migrations/20261106_002_initial_schema_alignment.sql`](file:///d:/fomo-app-about-all/FOMO-STORE/supabase/migrations/20261106_002_initial_schema_alignment.sql) locally, copy its entire contents (`Lines 1–1735`), and paste it into the `fomo-store-staging` SQL Editor.
3. Click **Run**.
4. Confirm the output displays: `Success. No rows returned`.

### Step 4 — Run Migration 003 (`20261106_003_security_hardening_f1_f2_f3.sql`)
1. Clear the SQL Editor (or open a new query tab).
2. Open [`supabase/migrations/20261106_003_security_hardening_f1_f2_f3.sql`](file:///d:/fomo-app-about-all/FOMO-STORE/supabase/migrations/20261106_003_security_hardening_f1_f2_f3.sql) locally, copy its entire contents (`Lines 1–323`), and paste it into the `fomo-store-staging` SQL Editor.
3. Click **Run**.
4. Confirm the output displays: `Success. No rows returned`.

### Step 5 — Run Read-Only Post-Migration Verification (`verification_queries.sql`)
1. Clear the SQL Editor (or open a new query tab).
2. Open [`supabase/verification_queries.sql`](file:///d:/fomo-app-about-all/FOMO-STORE/supabase/verification_queries.sql) locally, copy its contents (`Lines 1–144`), and paste it into the `fomo-store-staging` SQL Editor.
3. Click **Run** and verify the 4 result sets:
   - **Query 1 (RLS on 12 tables):** Returns `12` rows, all with `rls_enabled = true` and `policy_count >= 1` (`26` policies total).
   - **Query 2 (`order_number_seq` grants):** All 6 boolean columns (`anon_usage`, `anon_select`, `anon_update`, `auth_usage`, `auth_select`, `auth_update`) are `false`.
   - **Query 3 (`auth.users` triggers):** Returns `on_auth_user_created` and `on_auth_user_updated`, both with `enabled_mode = 'O'` (enabled).
   - **Query 4 (`product-images` bucket):** Returns `id = 'product-images'`, `public = true`, `file_size_limit = 5242880`, and `allowed_mime_types = {image/jpeg,image/png,image/webp,image/gif}`.
