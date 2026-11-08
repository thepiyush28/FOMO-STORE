# FOMO Store — Comprehensive Application & Database Security Audit Report

**Date**: 2026-11-07  
**Scope**: PostgreSQL Migrations (`001`, `002`, `003`), RLS Policies, Table/Sequence Grants, `SECURITY DEFINER` RPCs, Triggers, Storage Policies, and React Frontend (`src/`).

---

## 1. Executive Summary

- **Database RLS Coverage**: **12 / 12** `public` tables have Row Level Security enabled (`rowsecurity = true`) — verified both in local PGlite automated tests and via read-only inspection on the remote Supabase project.
- **`SECURITY DEFINER` Hardening**: **10 / 10** `SECURITY DEFINER` functions in `public` explicitly pin `SET search_path = public, pg_temp`.
- **Privilege & Sequence Hardening**: `anon` and `authenticated` have zero direct privileges on `public.order_number_seq`, zero `DELETE` privileges on `orders`, `order_items`, `order_status_history`, and `profiles`, and `ALTER DEFAULT PRIVILEGES` blocks automatic grants on future objects.
- **Unresolved Critical / High Vulnerabilities**: **0**.

---

## 2. Detailed Security Audit by Control Domain

### 2.1 Row Level Security (RLS) & Role Isolation (`002` + `003`)
| Table | `anon` Access | `authenticated` (`customer`) | `authenticated` (`rider`) | `authenticated` (`admin` via `is_admin()`) |
| :--- | :--- | :--- | :--- | :--- |
| `categories` | `SELECT` (`is_active = true`) | `SELECT` (`is_active = true`) | `SELECT` (`is_active = true`) | Full `ALL` |
| `products` | `SELECT` (`is_active = true`) | `SELECT` (`is_active = true`) | `SELECT` (`is_active = true`) | Full `ALL` |
| `inventory` | **None** (0 grants) | **None** (blocked by RLS) | **None** (blocked by RLS) | Full `ALL` |
| `store_settings` | **None** (0 grants) | **None** (blocked by RLS) | **None** (blocked by RLS) | Full `ALL` |
| `profiles` | **None** (0 grants) | `SELECT`, `UPDATE` own (`id = auth.uid()`) | `SELECT`, `UPDATE` own (`id = auth.uid()`) | Full `ALL` |
| `addresses` | **None** (0 grants) | Full `ALL` own (`user_id = auth.uid()`) | Full `ALL` own (`user_id = auth.uid()`) | Full `ALL` |
| `delivery_partners` | **None** (0 grants) | **None** | `SELECT` own (`user_id = auth.uid() AND role = 'rider'`) | Full `ALL` |
| `carts` | **None** (0 grants) | Full `ALL` own (`user_id = auth.uid()`) | Full `ALL` own (`user_id = auth.uid()`) | Full `ALL` |
| `cart_items` | **None** (0 grants) | Full `ALL` own (`cart_id` owned by `auth.uid()`) | Full `ALL` own (`cart_id` owned by `auth.uid()`) | Full `ALL` |
| `orders` | **None** (0 grants) | `SELECT` own (`customer_id = auth.uid()`) | `SELECT` assigned (`delivery_partner_id` owned by rider) | Full `ALL` (no `DELETE` grant) |
| `order_items` | **None** (0 grants) | `SELECT` own (`order_id` owned by `auth.uid()`) | `SELECT` assigned (`order_id` assigned to rider) | Full `ALL` (no `DELETE` grant) |
| `order_status_history` | **None** (0 grants) | `SELECT` own (`order_id` owned by `auth.uid()`) | `SELECT` assigned (`order_id` assigned to rider) | Full `ALL` (no `DELETE` grant) |

### 2.2 Anti-Escalation & Profile Integrity
- **Role & Phone Protection (`public.protect_user_role_change`)**:
  - `BEFORE UPDATE ON public.profiles` trigger blocks any non-admin from changing `NEW.id`, `NEW.role`, or `NEW.phone`.
  - Evaluates `IF current_user IN ('anon', 'authenticated')` **before** checking the internal `fomo.auth_phone_sync` GUC, making it impossible for an authenticated PostgREST session to spoof `set_config('fomo.auth_phone_sync', 'true', true)`.
- **Admin Bootstrap Hardening (`public.bootstrap_admin_user`)**:
  - Execution is revoked from `PUBLIC`, `anon`, and `authenticated`, and the function body explicitly rejects calls where `session_user IN ('anon', 'authenticated', 'authenticator')` or `auth.uid() IS NOT NULL`.
  - Resolves the target user strictly from `auth.users.phone` rather than `public.profiles.phone`.
- **Admin Role Management (`public.admin_set_user_role`)**:
  - Enforces `IF NOT public.is_admin() THEN RAISE EXCEPTION` and prevents an admin from demoting their own account (`p_user_id = auth.uid() AND p_new_role <> 'admin'`).

### 2.3 Order Placement, Cancellation & Concurrency Safety
- **`public.place_order(p_items, p_delivery_mode, p_address_id, p_payment_method)`**:
  - Requires `auth.uid() IS NOT NULL`.
  - Validates `store_settings.is_open = true`, `p_payment_method = 'cod'`, and `p_delivery_mode IN ('delivery', 'pickup')`.
  - Aggregates duplicate `product_id` entries (`GROUP BY product_id ORDER BY product_id NULLS FIRST`) and acquires row-level `FOR UPDATE` locks on `public.inventory` in deterministic `product_id` UUID order—preventing deadlocks, race conditions, and negative stock under concurrent checkouts.
  - Computes all prices and totals server-side from `public.products` and `public.store_settings` (never trusting client prices).
- **`public.customer_cancel_order(p_order_id, p_reason)`**:
  - Locks `public.orders` row `FOR UPDATE WHERE id = p_order_id AND customer_id = auth.uid()`.
  - Strictly restricts customer cancellation to `status IN ('placed', 'confirmed')` and restores `inventory.stock_quantity` in deterministic `product_id` order.
- **`public.admin_cancel_order(p_order_id, p_reason)`**:
  - Requires `public.is_admin()` and a non-empty `p_reason`, blocks cancellation if `status IN ('delivered', 'cancelled')`, and restores `inventory.stock_quantity` atomically.
- **`public.rider_update_order_status(p_order_id, p_new_status, p_note)`**:
  - Verifies caller is an active rider (`profiles.role = 'rider'`) and owns `orders.delivery_partner_id` (`FOR UPDATE`), rejects `delivery_mode <> 'delivery'`, and enforces strict `ready → out_for_delivery` and `out_for_delivery → delivered` transitions.

---

## 3. Ranked Findings Register (Resolved vs. Operational Observations)

| ID | Severity | Category | Description | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **Critical** *(Resolved)* | Auth / Privilege Escalation | Prior to Migration 003, `profiles.phone` was editable by the row owner and `bootstrap_admin_user` looked up `profiles.phone`. | **RESOLVED in Migration 003 (F-1)** — Verified in local PGlite suite (`test-migration-003.mjs`) and remote trigger check. |
| **SEC-02** | **Medium** *(Resolved)* | Least Privilege | Default Supabase privileges on `public` tables/sequences and `order_number_seq`. | **RESOLVED in Migration 003 (F-2)** — Verified `anon_has_order_seq = false` and `auth_has_order_seq = false` on remote DB. |
| **SEC-03** | **Medium** *(Resolved)* | Storage Upload Safety | `product-images` bucket needed 5 MB cap, safe MIME whitelist (`jpeg`, `png`, `webp`, `gif`), and MIME-derived file extension in `adminUploadProductImage()`. | **RESOLVED in Migration 003 (F-3) & `src/lib/supabase.ts`** — Verified on remote `storage.buckets` and in `test-staging-readiness.mjs`. |
| **SEC-04** | **Medium** *(Operational)* | Environment Isolation | Root `.env` on developer machine points to Production Supabase; Vite loads `.env` in all modes unless moved to `.env.production.local` and replaced with `.env.staging`. | **DOCUMENTED in `FOMO_STAGING_SETUP_GUIDE.md`** — Optional client-side guard in `src/lib/supabase.ts` proposed for owner approval. |
| **SEC-05** | **Low** *(Resolved)* | Business Logic Guard | `adminAssignOrderRider()` in `src/lib/supabase.ts` previously relied on UI disabling to block rider assignment on `pickup` or `cancelled`/`delivered` orders. | **RESOLVED in `src/lib/supabase.ts`** — Server pre-check added and verified in `test-staging-readiness.mjs`. |
