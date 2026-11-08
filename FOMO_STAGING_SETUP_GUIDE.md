# FOMO Store — Staging Environment & Isolation Setup Guide

**Date**: 2026-11-07  
**Target Platform**: Windows 10/11 (PowerShell) + Vite 6 + Supabase

---

## 1. Why Strict Staging Isolation Is Required

Currently, the root `.env` file on the local machine contains `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` pointing to the main Supabase project (which is marked **PRODUCTION**).

### How Vite Loads `.env*` Files (Critical Production Fallback Risk)
By default in Vite:
1. `.env` is loaded in **all** modes (`development`, `staging`, `production`) as the base fallback.
2. `.env.local` is loaded in **all** modes and overrides `.env`.
3. `.env.[mode]` (e.g., `.env.development`, `.env.staging`, `.env.production`) is loaded only when `--mode <mode>` matches.
4. `.env.[mode].local` overrides `.env.[mode]`.

> **WARNING — Production Fallback Risk**:  
> If `.env` or `.env.local` contains **PRODUCTION** credentials, running `npm run dev` (`vite`) connects local development directly to **PRODUCTION**. Even if you create `.env.staging` and run `npx vite --mode staging`, if a variable is missing or misspelled in `.env.staging`, Vite will silently fall back to `.env` (**PRODUCTION**)!

---

## 2. Recommended Zero-Risk Environment File Architecture (Windows + Vite)

To guarantee that local development and staging testing **never** accidentally write to the Production database:

| File Name | Git Status | Purpose & What Should Be Inside |
| :--- | :--- | :--- |
| `.env.example` | **Tracked** | Template placeholders only (`https://your-project-id.supabase.co` and `your-anon-public-key-here`). |
| `.env` | **Gitignored** | Keep **absent** (deleted) or containing **only template placeholders** (Demo Mode fallback). **Never** store Production credentials in `.env`. |
| `.env.local` | **Gitignored** | Keep **absent** so it cannot override mode-specific files. |
| `.env.staging` | **Gitignored** | Contains **STAGING** Supabase project `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. |
| `.env.development` | **Gitignored** | Either omitted (runs in local Demo Mode) or copies `.env.staging` so `npm run dev` connects only to **STAGING**. |
| `.env.production.local` | **Gitignored** | Used **only** if building a production bundle locally (`npx vite build --mode production`). Ideally, store Production credentials exclusively in your hosting provider (Vercel / Netlify Production Environment). |

---

## 3. Step-by-Step Staging Project Provisioning in Supabase

1. **Create a Separate Supabase Project for Staging**:
   - Open the [Supabase Dashboard](https://supabase.com/dashboard) and click **New project**.
   - Name the project `fomo-store-staging` (Region: `ap-south-1` Mumbai).
   - **Rule**: Never copy production data, production users, or production credentials into `fomo-store-staging`.

2. **Apply All Three Repository Migrations in Order (`001` → `002` → `003`)**:
   - Open `fomo-store-staging` → **SQL Editor** → **New query**.
   - **Step 2a**: Paste and run `supabase/migrations/20261106_001_preflight_archive.sql` in its own query tab. Wait for `Success`.
   - **Step 2b**: Paste and run `supabase/migrations/20261106_002_initial_schema_alignment.sql` in a new query tab. Wait for `Success`.
   - **Step 2c**: Paste and run `supabase/migrations/20261106_003_security_hardening_f1_f2_f3.sql` in a new query tab. Wait for `Success`.

3. **Run Read-Only Post-Migration Verification on Staging**:
   - In the `fomo-store-staging` SQL Editor, run:
     ```sql
     SELECT
       (SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true) AS rls_enabled_tables_count,
       config_id,
       is_open,
       delivery_fee
     FROM public.store_settings
     WHERE config_id = 'primary';
     ```
   - Confirm `rls_enabled_tables_count = 12`, `config_id = 'primary'`, and `is_open = false`.

4. **Enable Realtime on Staging Tables**:
   - In `fomo-store-staging` → **Database → Publications → `supabase_realtime`**, ensure `orders`, `order_status_history`, `store_settings`, `products`, `categories`, and `inventory` are toggled ON.

---

## 4. Configuring Local Staging Environment Files on Windows (PowerShell)

1. **Move Production Credentials Out of `.env`**:
   - If your current `.env` holds Production credentials, move it to `.env.production.local` (or remove it if Production is deployed via Vercel/Netlify):
     ```powershell
     Move-Item -Path ".env" -Destination ".env.production.local" -Force
     ```
2. **Create `.env.staging` (and `.env.development`) with Staging Credentials Only**:
   - Copy `.env.example` to `.env.staging`:
     ```powershell
     Copy-Item -Path ".env.example" -Destination ".env.staging"
     ```
   - Open `.env.staging` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the values from **`fomo-store-staging` → Project Settings → API** (use only the public `anon` / `sb_publishable_...` key; **never** use `service_role` or `sb_secret_...`).
   - Optionally copy `.env.staging` to `.env.development` so `npm run dev` uses Staging by default:
     ```powershell
     Copy-Item -Path ".env.staging" -Destination ".env.development"
     ```
3. **Run Vite in Staging Mode**:
   ```powershell
   npx vite --mode staging
   ```

---

## 5. Creating Staging Test Accounts (Email & Password Only — No Twilio Required)

1. In **`fomo-store-staging` → Authentication → Users**, click **Add user → Create new user** (with **Auto Confirm User** checked) to create three staging-only accounts:
   - **Staging Admin**: `admin.staging@fomostore.in`
   - **Staging Rider**: `rider.staging@fomostore.in`
   - **Staging Customer**: `customer.staging@fomostore.in`
2. **Provision the Staging Admin Role**:
   - Sign in at `http://localhost:5173/admin` with `admin.staging@fomostore.in`.
   - Copy the SQL snippet displayed on the `/admin` screen and run it in the **`fomo-store-staging` SQL Editor**, then click **Re-check Admin Role**.
3. **Promote the Staging Rider**:
   - Inside `/admin` → **Customers & Riders**, locate `rider.staging@fomostore.in` and click **Make rider**.
4. **Test Customer & Rider Sign-In**:
   - On `/` and `/rider`, click the sign-in button, switch to the **`Email & Password`** tab inside the modal, and sign in with the staging customer or rider credentials.
