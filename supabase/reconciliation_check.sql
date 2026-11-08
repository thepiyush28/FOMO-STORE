-- ============================================================================
-- FOMO STORE: READ-ONLY STAGING RECONCILIATION VERIFICATION
-- ============================================================================
-- Strictly READ-ONLY (SELECT queries only).
-- Run this in the Supabase SQL Editor to inspect your exact database state.
-- ============================================================================

-- 1. VERIFY APPLICATION TABLES & RLS STATUS (Expected: 12 public tables)
SELECT 
  tablename,
  rowsecurity AS rls_enabled,
  (SELECT count(*) FROM pg_policies p WHERE p.schemaname = t.schemaname AND p.tablename = t.tablename) AS policy_count
FROM pg_tables t
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. VERIFY WHICH RPC FUNCTIONS EXIST (Highlights 20261031 vs 20261106)
SELECT 
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  p.prosecdef AS is_security_definer,
  (p.proconfig)::text AS config_search_path,
  CASE 
    WHEN p.proname IN ('admin_cancel_order', 'customer_cancel_order', 'get_order_rider_info', 'rider_get_assigned_orders', 'handle_auth_user_updated')
    THEN 'Added in 20261106 (Missing in 20261031)'
    ELSE 'Present in 20261031'
  END AS migration_origin
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'is_admin', 'bootstrap_admin_user', 'admin_set_user_role', 'protect_user_role_change',
    'handle_new_user', 'handle_auth_user_updated', 'place_order', 'customer_cancel_order',
    'admin_cancel_order', 'rider_toggle_online', 'rider_update_order_status',
    'get_order_rider_info', 'rider_get_assigned_orders', 'generate_order_number',
    'enforce_order_immutability'
  )
ORDER BY p.proname;

-- 3. VERIFY TRIGGERS ON auth.users & public TABLES
SELECT 
  event_object_schema AS schema_name,
  event_object_table AS table_name,
  trigger_name,
  action_timing,
  event_manipulation AS event,
  CASE 
    WHEN trigger_name = 'on_auth_user_updated' THEN 'Added in 20261106_003 (Missing in 20261031)'
    ELSE 'Present in 20261031'
  END AS status
FROM information_schema.triggers
WHERE event_object_schema IN ('public', 'auth')
  AND trigger_name IN ('on_auth_user_created', 'on_auth_user_updated', 'trg_protect_user_role', 'trg_enforce_order_immutability')
ORDER BY event_object_schema, event_object_table, trigger_name;

-- 4. VERIFY STORAGE BUCKET CONFIGURATION
SELECT 
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
FROM storage.buckets
WHERE id = 'product-images';

-- 5. VERIFY SEQUENCE PRIVILEGES ON order_number_seq
SELECT 
  has_sequence_privilege('anon', 'public.order_number_seq', 'USAGE') AS anon_usage,
  has_sequence_privilege('anon', 'public.order_number_seq', 'SELECT') AS anon_select,
  has_sequence_privilege('authenticated', 'public.order_number_seq', 'USAGE') AS auth_usage,
  has_sequence_privilege('authenticated', 'public.order_number_seq', 'SELECT') AS auth_select;
