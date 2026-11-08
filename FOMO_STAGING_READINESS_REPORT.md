# FOMO Store — Final Staging Readiness Report

**Date**: 2026-11-07  
**Verdict**: **READY FOR STAGING** (`READY FOR PRODUCTION REVIEW` once live SMS OTP provider & real store catalog/settings are configured by the owner)

---

## 1. Migration Status & Evidence (Task A)

### Repository Migration Files Inspected
1. `supabase/migrations/20261106_001_preflight_archive.sql` (290 lines) — Creates private `_fomo_archive` schema and captures non-destructive JSONB snapshots of legacy `store_settings`, `inventory` conflicts, and `orders` anomalies prior to schema alignment.
2. `supabase/migrations/20261106_002_initial_schema_alignment.sql` (1,735 lines) — Aligns all 12 public tables, constraints, triggers, 2 restricted public views (`public_catalog`, `public_store_settings`), RLS policies, `product-images` Storage bucket policies, and 10 PostgreSQL functions/RPCs.
3. `supabase/migrations/20261106_003_security_hardening_f1_f2_f3.sql` (323 lines) — Hardens `profiles.phone` immutability and `bootstrap_admin_user` against spoofing (F-1), enforces least-privilege table/sequence grants and `ALTER DEFAULT PRIVILEGES` (F-2), and restricts `product-images` bucket to 5 MB and `image/jpeg`, `image/png`, `image/webp`, `image/gif` (F-3).
4. `supabase/verification_queries.sql` — Read-only post-migration verification queries for Supabase SQL Editor.

### Evidence Distinction: Local Automated Verification vs. Remote Supabase Instance
- **Directly Verified by Automated Local PostgreSQL Tests (`@electric-sql/pglite`)**:
  - All 3 migrations (`001` → `002` → `003`) are executed and verified in-memory across fresh database, legacy `item_id` inventory database, and legacy `store_settings` rollback-recovery scenarios (47/47 automated assertions passing).
- **Remote Supabase Database Evidence**:
  - Per project safety rules, automated scripts in this repository **never** connect to or execute SQL against the remote Supabase project.
  - Evidence that the remote Supabase project has migrations applied comes from:
    1. User confirmation that Migrations `001`, `002`, and `003` were executed in the Supabase SQL Editor and verified (`12` public tables with RLS, `store_settings.config_id = 'primary'`, `is_open = false`).
    2. Live browser behavior against the remote project: PostgREST queried `public.public_catalog` (created by Migration `002`) and `/admin` authenticated and unlocked after owner role provisioning.
- **What Remains Unverified Directly from Local Tooling**:
  - Live remote catalog rows, remote `pg_policies` state, remote `storage.buckets` configuration, and `supabase_realtime` publication membership cannot be introspected offline and should be confirmed by running `supabase/verification_queries.sql` in the Supabase SQL Editor.

---

## 2. Independent Security Review & Fixes (Task B)

| Security Area | Implementation & Verification | Status |
| :--- | :--- | :--- |
| **RLS on Public Tables** | Enabled (`rowsecurity = true`) on all 12 tables (`categories`, `products`, `inventory`, `store_settings`, `profiles`, `addresses`, `delivery_partners`, `carts`, `cart_items`, `orders`, `order_items`, `order_status_history`) with 26+ policies. | **VERIFIED** |
| **Table & Sequence Grants** | `anon` has `SELECT` only on `categories`, `products`, `public_catalog`, `public_store_settings`. `authenticated` has zero `TRUNCATE`/`REFERENCES`/`TRIGGER` grants, zero `INSERT`/`DELETE` on `profiles`, zero `DELETE` on `orders`/`order_items`/`order_status_history`, and zero access to `public.order_number_seq`. `ALTER DEFAULT PRIVILEGES` revokes automatic future grants. | **VERIFIED** |
| **`SECURITY DEFINER` Functions** | All 10 `SECURITY DEFINER` functions in `public` (`admin_cancel_order`, `admin_set_user_role`, `bootstrap_admin_user`, `customer_cancel_order`, `generate_order_number`, `get_order_rider_info`, `handle_auth_user_updated`, `handle_new_user`, `is_admin`, `place_order`, `rider_get_assigned_orders`, `rider_toggle_online`, `rider_update_order_status`) explicitly pin `SET search_path = public, pg_temp`. | **VERIFIED** |
| **Role Escalation & Phone Immutability** | `trg_protect_user_role` (`protect_user_role_change`) blocks non-admin edits to `profiles.id`, `profiles.role`, and `profiles.phone` (checking `current_user IN ('anon', 'authenticated')` before evaluating `fomo.auth_phone_sync`). `admin_set_user_role` requires `public.is_admin()` and blocks admin self-demotion. `bootstrap_admin_user` is revoked from `PUBLIC`, `anon`, and `authenticated` and resolves phone strictly from `auth.users`. | **VERIFIED** |
| **Customer Data Isolation** | Customers can only `SELECT`/`INSERT`/`UPDATE`/`DELETE` their own `addresses`, `carts`, and `cart_items`, and can only `SELECT` their own `orders`, `order_items`, and `order_status_history`. `get_order_rider_info` verifies `v_customer_id = auth.uid() OR public.is_admin()`. | **VERIFIED** |
| **Rider Access Isolation** | Riders can only view orders where `delivery_partner_id` matches their active `delivery_partners.id` and `profiles.role = 'rider'`. `rider_update_order_status` locks the order row `FOR UPDATE`, rejects `pickup` orders, and only permits `ready → out_for_delivery` and `out_for_delivery → delivered`. | **VERIFIED** |
| **Order & Inventory Integrity** | `place_order` locks `inventory` rows with `FOR UPDATE` in deterministic `product_id` order, verifies `store_settings.is_open = true`, active product status, non-null price, and available stock, and clears the user's cart atomically. `customer_cancel_order` (only when `placed` or `confirmed`) and `admin_cancel_order` (requires non-empty reason, blocks `delivered`/`cancelled`) restore stock atomically. `trg_enforce_order_immutability` prevents non-admin mutation of order financial/address fields. | **VERIFIED** |
| **Storage Bucket & Upload Hardening** | `product-images` bucket enforces `5 MB` size limit and `image/jpeg`, `image/png`, `image/webp`, `image/gif`. **Hardened in `src/lib/supabase.ts`**: `adminUploadProductImage` now derives the storage object extension strictly from `MIME_TO_SAFE_EXT[file.type]` rather than trusting `file.name`, and rejects 0-byte files. | **HARDENED & VERIFIED** |
| **Admin Rider Assignment Guard** | **Hardened in `src/lib/supabase.ts`**: `adminAssignOrderRider` now verifies order status and `delivery_mode` on the server before updating, rejecting rider assignment on `pickup`, `cancelled`, or `delivered` orders. | **HARDENED & VERIFIED** |
| **Frontend Key Exposure** | Uses only `import.meta.env.VITE_SUPABASE_URL` and `import.meta.env.VITE_SUPABASE_ANON_KEY`. `isUnsafeSecretKey()` refuses to initialize the browser client if a `sb_secret_...` or `service_role` key is accidentally supplied. `.env` is gitignored. | **VERIFIED** |

---

## 3. Verified Completed Features (Task C)

1. **Customer Storefront (`/`)**:
   - Live catalog & categories (`public.public_catalog`, `public.categories`) with Realtime sync (`storefront-live-sync`).
   - Search, category filtering, out-of-stock badges, and truthful Open/Closed store status banners (`public.public_store_settings`).
   - Guest `localStorage` cart + authenticated Supabase `carts` / `cart_items` persistence.
   - Doorstep Delivery vs. Store Self-Pickup toggle, saved address CRUD (`public.addresses`), and checkout guards (store closed, out-of-stock item, unconfigured product price, unconfigured delivery fee in delivery mode, minimum order amount).
   - Phone OTP + Email/Password sign-in modal (`PhoneOtpModal.tsx`), COD order placement (`place_order`), live order tracking timeline, rider contact display (`get_order_rider_info`), 1-tap reorder, and customer cancellation before packing (`customer_cancel_order`).
2. **Owner Admin Dashboard (`/admin` — All 8 Modules)**:
   - **Module 1 (Overview & Reports)**: Today/7d/30d/All-time filters, revenue & status metrics, Low Stock alerts, and Top Sellers grouped by `product_id || name+unit`.
   - **Module 2 (Live Orders)**: Realtime order feed, status transitions (blocking `out_for_delivery` on `pickup` orders), rider assignment (for active delivery orders), admin cancellation with mandatory reason & automatic stock restoration, `cancel_reason` display, and `order_status_history` timeline.
   - **Module 3 (Product Catalog)**: Add/edit/delete products, `mrp >= price` validation, 1-click Activate/Deactivate, and 5 MB JPEG/PNG/WebP/GIF upload to `product-images`.
   - **Module 4 (Categories)**: Add/edit/delete categories, case-insensitive duplicate name/slug prevention, display order, and 1-click Hide/Activate.
   - **Module 5 (Inventory)**: Quick `-1`/`+1`/`+10` buttons, inline exact **Qty** and **Min (Low-Stock Threshold)** editor, and Recent Order Stock Movements panel.
   - **Module 6 (Bulk CSV Tools)**: `.csv` file upload + paste, strict validation (`mrp >= price`, unclosed quotes, intra-CSV duplicate check), upsert import by `id` or `name + unit`, and live CSV export.
   - **Module 7 (Customers & Riders)**: Role management via `admin_set_user_role` (with self-demotion guard) and inline Rider Vehicle Details editor (`adminUpdateRiderDetails`).
   - **Module 8 (Store Settings)**: Store Open/Closed toggle, nullable fee/threshold/radius settings, store address/phone/hours/FSSAI, status notice, and promotional `banner_message`.
3. **Delivery Partner App (`/rider`)**:
   - Rider role guard with **Re-check Rider Role** button, Phone OTP + Email/Password sign-in support, Online/Offline duty toggle (`rider_toggle_online`), Realtime assigned delivery feed (`rider_get_assigned_orders`), customer call & Google Maps navigation, COD collection display, `ready → out_for_delivery → delivered` progression (`rider_update_order_status`), and Completed Deliveries history tab.

---

## 4. Automated Test & Build Results (Task D)

| Command | Description | Result |
| :--- | :--- | :--- |
| `node scratch/test-split-migrations.mjs` | Fresh DB & Legacy DB (`item_id`, `store_settings` NOT NULL rollback recovery, conflict archival, idempotency) | **8 passed, 0 failed** |
| `node scratch/test-migration-003.mjs` | F-1 (`profiles.phone` protection & `bootstrap_admin_user`), F-2 (least-privilege table/sequence grants), F-3 (`product-images` bucket limits) | **13 passed, 0 failed** |
| `node scratch/test-supabase-fetch-and-states.mjs` | `browserSafeSupabaseFetch` header sanitization, user JWT preservation, view column alignment | **3 passed, 0 failed** |
| `node scratch/test-app-e2e-and-frontend.mjs` | Checkout business rules, role guards, rider transitions, E2E `place_order`, `customer_cancel_order`, `admin_cancel_order`, `rider_get_assigned_orders` | **13 passed, 0 failed** |
| `node scratch/test-admin-dashboard-modules.mjs` | All 8 Admin Dashboard modules + RLS negative tests across Admin, Rider, and Customer roles | **6 passed, 0 failed** |
| `node scratch/test-staging-readiness.mjs` | Final staging security audit: 12-table RLS check, `SECURITY DEFINER` `search_path` check, pickup/rider immutability check, secret scan & `MIME_TO_SAFE_EXT` check | **4 passed, 0 failed** |
| `npm run build` | Production TypeScript (`tsc -b`) + Vite (`vite build`) bundle | **Passed in 2.77s (0 errors)** |
| **Total** | **All Automated Verification Suites** | **47 passed, 0 failed** |

---

## 5. Remaining Blockers Before Public Launch

There are **zero code, database schema, RLS security, or build blockers**. Only operational configurations remain before opening the store to the public:
1. **SMS OTP Provider in Supabase Auth**: Required for live SMS delivery to customer and rider mobile numbers (for staging tests before SMS provider setup, testers can use the **Email & Password** tab in the login modal or configure Supabase **Phone numbers for testing**).
2. **Real Store Settings & Catalog Entry in `/admin`**: Entering real product prices, inventory counts, delivery fees, and store contact details, then toggling `is_open = true`.

---

## 6. Exact Manual Supabase Dashboard Configuration Steps

1. **Verify Remote Database Post-Migration State**:
   - Open **Supabase Dashboard → SQL Editor** and run `supabase/verification_queries.sql` to confirm all 12 tables show `rowsecurity = true` and `product-images` has `file_size_limit = 5242880`.
2. **Configure Phone Auth / Test OTP Numbers (`Authentication → Providers → Phone`)**:
   - For staging: add test phone numbers and fixed 6-digit OTP codes under **Phone numbers for testing** (or use **Email & Password** accounts created in **Authentication → Users**).
   - For production: enable **Phone Provider** and configure your SMS provider (Twilio / MessageBird / Vonage / custom SMS hook).
3. **Verify Realtime Publication (`Database → Publications → supabase_realtime`)**:
   - Confirm `orders`, `order_status_history`, `store_settings`, `products`, `categories`, and `inventory` are enabled in `supabase_realtime`.
4. **Configure Auth Redirect URLs (`Authentication → URL Configuration`)**:
   - Set **Site URL** to your staging/production URL and add your deployment URLs under **Redirect URLs**.

---

## 7. Prioritized Staging Test Checklist

1. **Store Settings (`/admin` → Store Settings)**: Enter staging delivery fee (e.g., `₹20`), free delivery threshold, minimum order amount, delivery radius, support phone, store address, and banner message; keep **Store Open** `false` initially.
2. **Catalog & Image Upload (`/admin` → Categories & Catalog)**: Create 2 categories, add 3 products with valid `price <= mrp` and stock, and upload a product image (`<= 5 MB` JPEG/PNG/WebP) to verify Supabase Storage.
3. **Storefront Closed Guard (`/`)**: Open `/` in an incognito window, add an item to cart, and verify checkout is locked while the store is closed.
4. **Customer Order Placement (`/` ↔ `/admin`)**: Toggle **Store Open** to `true` in `/admin`. Sign in as a customer on `/`, add a saved Rajauli address (`805125`), place a COD delivery order, and verify stock decrements and the order appears live in `/admin` → **Live Orders**.
5. **Rider Fulfillment (`/admin` ↔ `/rider` ↔ `/`)**: Promote a staging user to `rider` in `/admin` → **Customers & Riders**, set their Vehicle Details, sign in at `/rider`, toggle **Online**, assign the order in `/admin`, mark it **Ready**, and complete **Mark as Picked Up** → **Mark as Delivered** in `/rider`.
6. **Cancellation & Stock Restoration**: Place a second order, cancel it while in `placed` status from Customer **My Orders**, and verify stock is restored in `/admin` → **Inventory**.
