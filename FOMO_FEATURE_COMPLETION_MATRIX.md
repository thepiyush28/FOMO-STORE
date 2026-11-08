# FOMO Store — Feature Completion & Verification Matrix

**Date**: 2026-11-07  
**Legend**:
- **Implemented & Verified**: Code and SQL are complete, verified by automated local PGlite + frontend tests (and/or remote read-only checks).
- **Implemented — Pending Live Staging Run**: Code and SQL are complete and locally tested; requires interactive human execution in Staging with test data.
- **Blocked by External Configuration**: Code is wired, but requires an external third-party provider or future gateway setup.

---

## 1. Customer Storefront (`/`)

| # | Workflow / Feature | Key Files & Functions | Classification | Verification Evidence / Notes |
| :--- | :--- | :--- | :--- | :--- |
| **1.1** | **Customer Registration & Login (Email & Password)** | `PhoneOtpModal.tsx`, `signInWithEmailPassword`, `on_auth_user_created` | **Implemented & Verified** | Email provider is ON in Supabase; `PhoneOtpModal` includes **Email & Password** tab; `on_auth_user_created` auto-creates `profiles` row (`role = 'customer'`). |
| **1.2** | **Customer Registration & Login (Phone OTP)** | `PhoneOtpModal.tsx`, `sendPhoneOtp`, `verifyPhoneOtp` | **Blocked by External Configuration** | Frontend & Supabase Auth calls are fully implemented; Phone provider is currently OFF in Supabase Dashboard pending Twilio / SMS provider credentials. |
| **1.3** | **Customer Profile & Full Name Update** | `CustomerAccountSection.tsx`, `updateUserProfile` | **Implemented & Verified** | Verified in `test-migration-003.mjs` (`[F-1.2]`): customer can update `full_name` while `phone` and `role` are protected by trigger. |
| **1.4** | **Saved Delivery Addresses (CRUD + Default)** | `CustomerAccountSection.tsx`, `CartPreviewModal.tsx`, `saveCustomerAddress` | **Implemented & Verified** | Enforces 6-digit pincode and `>= 5` char address line; isolated per user by RLS (`user_id = auth.uid()`). |
| **1.5** | **Catalog Browsing, Search & Category Filtering** | `HomePage.tsx`, `ProductGrid.tsx`, `fetchStorefrontCatalogAndSettings` | **Implemented & Verified** | Queries `public.categories` and 12-column `public.public_catalog` view + Realtime `storefront-live-sync` channel. |
| **1.6** | **Guest & Persistent Authenticated Cart** | `HomePage.tsx`, `fetchCustomerCartFromDb`, `syncCustomerCartItemToDb` | **Implemented & Verified** | Syncs guest `localStorage` cart with `public.carts` / `public.cart_items` on sign-in and clears DB cart on `place_order()`. |
| **1.7** | **Checkout Guards (Store Closed, Stock, Min Order, Radius)** | `CartPreviewModal.tsx`, `calculateCartTotals`, `validateDeliveryAddress` | **Implemented & Verified** | Verified in `test-app-e2e-and-frontend.mjs`: blocks checkout when store closed, item out of stock, price `NULL`, `delivery_fee IS NULL` (in delivery mode), or subtotal `< min_order_amount`. |
| **1.8** | **COD Order Placement & Snapshot Integrity** | `placeOrderViaRpc` → `public.place_order` | **Implemented & Verified** | Locks `inventory` rows `FOR UPDATE`, deducts stock, snapshots `product_name`, `unit`, `unit_price`, and delivery address JSONB, and logs `order_status_history`. |
| **1.9** | **Live Order Tracking, Rider Info & Reorder** | `CustomerOrdersSection.tsx`, `fetchCustomerOrders`, `get_order_rider_info` | **Implemented & Verified** | Subscribes to `orders` and `order_status_history` changes; displays assigned rider name, phone, and vehicle via `get_order_rider_info`. |
| **1.10** | **Customer Order Cancellation (Before Packing)** | `CustomerOrdersSection.tsx`, `cancelCustomerOrderViaRpc` → `customer_cancel_order` | **Implemented & Verified** | Verified in `test-app-e2e-and-frontend.mjs`: allows cancellation in `placed`/`confirmed`, blocks once `packing`, and restores `inventory.stock_quantity` atomically. |
| **1.11** | **UPI / Online Payment Gateway** | `CartPreviewModal.tsx` | **Blocked by External Configuration** | Intentionally marked as `Later Phase` badge in UI; `place_order` enforces `payment_method = 'cod'`. |

---

## 2. Owner / Admin Dashboard (`/admin`)

| # | Workflow / Feature | Key Files & Functions | Classification | Verification Evidence / Notes |
| :--- | :--- | :--- | :--- | :--- |
| **2.1** | **Owner Login & Non-Admin Provisioning Helper** | `AdminDashboardPage.tsx`, `isRoleAuthorized`, `bootstrap_admin_user` | **Implemented & Verified** | Confirmed working live at `/admin` by owner; non-admin login shows copy-paste SQL provisioning + **Re-check Admin Role** button. |
| **2.2** | **Module 1: Overview & Reports** | `AdminDashboardPage.tsx` | **Implemented & Verified** | Today/7d/30d/All-time filters, revenue metrics, Low Stock alerts, and Top Sellers grouped by `product_id \|\| name+unit`. |
| **2.3** | **Module 2: Live Order Management & Cancellation** | `AdminDashboardPage.tsx`, `adminUpdateOrderStatus`, `adminCancelOrderViaRpc` | **Implemented & Verified** | Realtime order feed, status transitions, blocks `out_for_delivery` on `pickup` orders, requires reason on cancel & restores stock. |
| **2.4** | **Module 2b: Admin Rider Assignment** | `AdminDashboardPage.tsx`, `adminAssignOrderRider` | **Implemented & Verified** | Assigns/unassigns active riders on `delivery` orders, blocks assignment on `pickup`/`cancelled`/`delivered` orders, logs history. |
| **2.5** | **Module 3: Product Catalog & Image Upload** | `AdminDashboardPage.tsx`, `adminSaveProduct`, `adminUploadProductImage` | **Implemented & Verified** | Enforces `mrp >= price`, 1-click Activate/Deactivate, and 5 MB JPEG/PNG/WebP/GIF upload with `MIME_TO_SAFE_EXT` sanitization. |
| **2.6** | **Module 4: Category Management** | `AdminDashboardPage.tsx`, `adminSaveCategory`, `adminDeleteCategory` | **Implemented & Verified** | Case-insensitive duplicate name/slug prevention, display order, and 1-click Hide/Activate. |
| **2.7** | **Module 5: Inventory Management & Stock Movements** | `AdminDashboardPage.tsx`, `adminUpdateProductStock` | **Implemented & Verified** | Quick `-1`/`+1`/`+10` buttons, inline exact **Qty** and **Min** threshold editor, and Recent Order Stock Movements log. |
| **2.8** | **Module 6: Bulk CSV Import & Export** | `AdminDashboardPage.tsx`, `parseCatalogCsv`, `adminBulkImportCsvRows` | **Implemented & Verified** | `.csv` file upload + paste, quote/duplicate/`mrp >= price` validation, upsert by `id` or `name+unit`, and CSV download. |
| **2.9** | **Module 7: Customers & Riders Role Management** | `AdminDashboardPage.tsx`, `adminSetUserRoleViaRpc`, `adminUpdateRiderDetails` | **Implemented & Verified** | Promotes/demotes users via `admin_set_user_role` (blocks self-demotion) and edits `delivery_partners.vehicle_details`. |
| **2.10** | **Module 8: Store Settings Configuration** | `AdminDashboardPage.tsx`, `adminSaveStoreSettings` | **Implemented & Verified** | Open/Closed toggle, nullable delivery fee/thresholds/radius (`> 0`), store contact details, status notice, and `banner_message`. |

---

## 3. Delivery Partner App (`/rider`)

| # | Workflow / Feature | Key Files & Functions | Classification | Verification Evidence / Notes |
| :--- | :--- | :--- | :--- | :--- |
| **3.1** | **Rider Login (Email & Password / Phone OTP) & Role Guard** | `RiderAppPage.tsx`, `PhoneOtpModal.tsx`, `isRoleAuthorized` | **Implemented & Verified** | Supports **Email & Password** tab inside `PhoneOtpModal` while Phone OTP is OFF; shows **Re-check Rider Role** for non-riders. |
| **3.2** | **Rider Online / Offline Duty Toggle** | `RiderAppPage.tsx`, `riderToggleOnlineViaRpc` → `rider_toggle_online` | **Implemented & Verified** | Verified in `test-admin-dashboard-modules.mjs`: updates `delivery_partners.is_online` strictly for authenticated riders. |
| **3.3** | **Assigned Orders Feed, Customer Call & Google Maps** | `RiderAppPage.tsx`, `fetchRiderData` → `rider_get_assigned_orders` | **Implemented & Verified** | Realtime subscription on `orders` filtered by `delivery_partner_id`; displays COD amount, customer phone link, and Maps query URL. |
| **3.4** | **Rider Pickup & Delivery Status Progression** | `RiderAppPage.tsx`, `riderUpdateOrderStatusViaRpc` → `rider_update_order_status` | **Implemented & Verified** | Enforces `ready → out_for_delivery → delivered` on `delivery` orders only; verified in `test-app-e2e-and-frontend.mjs` and `test-staging-readiness.mjs`. |
| **3.5** | **Completed Deliveries History** | `RiderAppPage.tsx` | **Implemented & Verified** | Displays delivered orders and collected COD totals for the signed-in rider. |
