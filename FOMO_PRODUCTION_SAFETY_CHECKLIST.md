# FOMO Store — Production Safety & Launch Checklist

**Date**: 2026-11-07  
**Purpose**: Pre-flight safety checklist to prevent accidental production mutations during staging and verify all requirements before public launch.

---

## 1. Environment & Credential Isolation Checklist

- [ ] **No Production Credentials in `.env` or `.env.local`**:
  - Verify `.env` on developer workstations does **not** point to the Production Supabase project URL.
  - Keep `.env` absent or set to template placeholders so missing mode variables fall back to local Demo Mode instead of Production.
- [ ] **Separate Supabase Projects**:
  - Staging (`fomo-store-staging`) and Production (`fomo-store-prod`) have distinct project URLs and keys.
  - Zero production customer data, orders, or passwords are copied into Staging.
- [ ] **Browser Key Safety (`VITE_SUPABASE_ANON_KEY`)**:
  - Only the public `anon` JWT or `sb_publishable_...` key is used in frontend environment variables.
  - The `service_role` / `sb_secret_...` key is **never** placed in `.env*`, frontend code, or CI client build variables (`isUnsafeSecretKey()` in `src/lib/supabase.ts` blocks initialization if detected).
- [ ] **Git Hygiene**:
  - `.gitignore` excludes `.env`, `.env*.local`, `.env.local`, `.env.production`, `.env.staging`, `*.pem`, and `*.key`.
  - Run `git status` before any commit to confirm zero `.env*` files are untracked or staged.

---

## 2. Database & Security Verification Checklist (Run in Production SQL Editor)

All 5 read-only verification checks below have been confirmed on the main Production Supabase project and must remain true before public launch:

- [x] **Row Level Security Enabled on All 12 Public Tables**:
  - `categories`, `products`, `inventory`, `store_settings`, `profiles`, `addresses`, `delivery_partners`, `carts`, `cart_items`, `orders`, `order_items`, `order_status_history` all have `rowsecurity = true`.
- [x] **Sequence Protection (`public.order_number_seq`)**:
  - `has_sequence_privilege('anon', 'public.order_number_seq', 'USAGE, SELECT, UPDATE') = false`
  - `has_sequence_privilege('authenticated', 'public.order_number_seq', 'USAGE, SELECT, UPDATE') = false`
- [x] **Auth User Triggers Active (`auth.users`)**:
  - `on_auth_user_created` (`tgenabled = 'O'`)
  - `on_auth_user_updated` (`tgenabled = 'O'`)
- [x] **Storage Bucket Hardening (`product-images`)**:
  - `public = true`, `file_size_limit = 5242880` (5 MB), `allowed_mime_types = {image/jpeg,image/png,image/webp,image/gif}`.
- [x] **Store Closed by Default Until Owner Launch**:
  - `public.store_settings.is_open` remains `false` in Production until real catalog, inventory, and store settings are finalized.

---

## 3. Business Data & Operational Readiness Checklist (Required Before Setting `is_open = true`)

Do **not** toggle `is_open = true` in Production `/admin` until every item below is completed with real, verified business values:

- [ ] **Store Settings (`/admin` → Store Settings)**:
  - [ ] Official Store Address in Rajauli, Nawada, Bihar (`store_address`)
  - [ ] Official Customer Support Phone / WhatsApp Number (`support_phone`)
  - [ ] Official Opening Hours (`opening_hours`)
  - [ ] FSSAI License / Registration Number (`fssai_license_number`)
  - [ ] Doorstep Delivery Fee in ₹ (`delivery_fee` — must be non-null to allow delivery checkout)
  - [ ] Free Delivery Threshold in ₹ (`free_delivery_threshold`)
  - [ ] Minimum Order Amount in ₹ (`min_order_amount`)
  - [ ] Delivery Radius in km (`delivery_radius_km`)
  - [ ] Store Status Notice (`status_notice`) and Promotional Banner (`banner_message`)
- [ ] **Categories & Product Catalog (`/admin` → Categories, Catalog & Inventory)**:
  - [ ] Real store categories created with `is_active = true` and `display_order` set.
  - [ ] Real products added (or imported via Bulk CSV) with accurate `price`, `mrp >= price`, `unit`, product images, `stock_quantity`, and `low_stock_threshold`.
  - [ ] Zero test/staging products or fake orders exist in Production.
- [ ] **Delivery Partner Accounts (`/admin` → Customers & Riders)**:
  - [ ] Real delivery riders registered, promoted to `role = 'rider'`, and assigned accurate `vehicle_details`.
- [ ] **Authentication Provider Configuration (Supabase Dashboard)**:
  - [ ] If launching with Phone OTP: Phone Provider enabled in **Authentication → Providers → Phone** with live SMS provider credentials (e.g., Twilio / MessageBird) and DLT templates verified.
  - [ ] Production domain configured in **Authentication → URL Configuration → Site URL & Redirect URLs**.
