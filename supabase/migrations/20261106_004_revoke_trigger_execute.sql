-- ============================================================================
-- MIGRATION 004: LEAST-PRIVILEGE HARDENING (REVOKE TRIGGER EXECUTE PRIVILEGES)
-- ============================================================================
-- Prerequisite:
--   Runs after:
--     1. 20261106_001_preflight_archive.sql
--     2. 20261106_002_initial_schema_alignment.sql
--     3. 20261106_003_security_hardening_f1_f2_f3.sql
--
-- Objective:
--   1. Revoke unnecessary direct EXECUTE privileges on the internal table trigger
--      function public.protect_user_role_change() from PUBLIC, anon, and authenticated.
--   2. In PostgreSQL, table DML triggers (e.g. BEFORE UPDATE ON public.profiles)
--      fire within the table update operation without requiring direct EXECUTE
--      privilege for the client role (anon or authenticated).
--   3. Direct EXECUTE from API clients is unnecessary, exposes trigger routines
--      as PostgREST RPC endpoints, and violates the Principle of Least Privilege.
--   4. Preserves all trigger enforcement: role protection, ID immutability,
--      profile phone protection, and phone synchronization from auth.users.
--   5. Retains execution privilege for CURRENT_USER (database owner / postgres).
--   6. Fully idempotent and safe for repeated execution.
-- ============================================================================
BEGIN;

-- Explicitly revoke direct EXECUTE privileges on the trigger function
REVOKE ALL ON FUNCTION public.protect_user_role_change() FROM PUBLIC, anon, authenticated;

-- Grant EXECUTE exclusively to CURRENT_USER (database administrator / owner)
GRANT EXECUTE ON FUNCTION public.protect_user_role_change() TO CURRENT_USER;

COMMIT;
