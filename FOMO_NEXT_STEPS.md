# FOMO Store — Prioritized Next-Step Plan (Staging to Production)

**Date**: 2026-11-07  
**Current Readiness**: Code & Database Schema Verified Locally (`47/47` tests passing, `npm run build` passing in `2.46s`); Remote Production Database Read-Only Verification Complete (`12` RLS tables, sequence grants `false`, triggers active, `product-images` bucket hardened).

---

## Priority 1 — Isolate Staging from Production (Before Creating Any Test Data)

1. **Create a Separate Supabase Staging Project (`fomo-store-staging`)**:
   - Follow `FOMO_STAGING_SETUP_GUIDE.md` to create a dedicated staging project in Supabase and apply Migrations `001`, `002`, and `003` in order.
2. **Prevent Local `.env` Production Fallback**:
   - Move your current production `.env` file to `.env.production.local` (or store production keys exclusively in your deployment host) and create `.env.staging` / `.env.development` with your `fomo-store-staging` URL and anon key.
   - *(Optional)* Approve the proposed 20-line environment badge & production-fallback safety check in `src/lib/supabase.ts` and `package.json` (`dev:staging`, `build:staging`).

---

## Priority 2 — Execute Interactive End-to-End Staging QA (Email & Password Flow)

With `Phone Provider` OFF, run the full 3-role staging test on `fomo-store-staging` using Email & Password accounts:

1. **Create 3 Staging Users in `fomo-store-staging` (`Authentication → Users`)**:
   - `admin.staging@fomostore.in` (Auto-Confirm ON → promote to `admin` via SQL Editor)
   - `rider.staging@fomostore.in` (Auto-Confirm ON → promote to `rider` in `/admin` → **Customers & Riders**)
   - `customer.staging@fomostore.in` (Auto-Confirm ON → remains `customer`)
2. **Seed Staging Catalog & Settings in `/admin`**:
   - Configure staging `delivery_fee`, `free_delivery_threshold`, `min_order_amount`, `delivery_radius_km`, and store contact info.
   - Add 2 categories, 3 products (with 1 product image uploaded to `product-images`), and set stock quantities.
   - Toggle **Store Open** ON (`true`).
3. **Run Customer → Admin → Rider Order Lifecycle**:
   - Sign in as `customer.staging@fomostore.in` on `/` (via the **Email & Password** tab in the login modal), save an address (`805125`), and place a COD delivery order.
   - In `/admin` (**Live Orders**), assign `rider.staging@fomostore.in` and advance status: `placed → confirmed → packing → ready`.
   - Sign in as `rider.staging@fomostore.in` on `/rider` (via the **Email & Password** tab), toggle **Online**, and complete `ready → out_for_delivery → delivered`.
   - Place a second order and test customer cancellation in `placed` status to verify automatic stock restoration.

---

## Priority 3 — Production Configuration & Public Launch Preparation

Once Staging QA signs off:

1. **Enter Real Business Settings & Catalog in Production `/admin`**:
   - While `is_open` remains `false` in Production, sign in to Production `/admin` and configure real Rajauli store address, support phone, FSSAI license, opening hours, delivery fee, thresholds, categories, products, and inventory counts.
2. **Configure Production SMS OTP Provider (When Ready for Phone OTP)**:
   - Configure Twilio / MessageBird / Vonage with DLT-approved templates in **Supabase Production Dashboard → Authentication → Providers → Phone**.
3. **Deploy Frontend & Open Store**:
   - Deploy the production build (`npm run build`) to your hosting provider (e.g., Vercel / Netlify) with Production `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   - Verify production URLs in **Supabase Dashboard → Authentication → URL Configuration**.
   - Toggle **Store Open** to `true` in Production `/admin`.
