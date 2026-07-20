-- =============================================================================
-- EnergyPulse Fas 6 – Säkerhetsgranskning (kör som postgres / service_role)
-- =============================================================================

\echo '=== 1. RLS enabled on all public tables ==='
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname NOT LIKE 'pg_%'
ORDER BY 1;

\echo '=== 2. Tables WITHOUT RLS (should be empty for app tables) ==='
SELECT c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false
  AND c.relname IN (
    'portfolios','properties','buildings','spaces','areas',
    'energy_sources','crrem_pathways','energy_consumption',
    'performance_indicators','actions','physical_risks',
    'data_quality_logs','meps_thresholds','climate_data',
    'data_gap_config','system_config','user_profiles',
    'user_properties','ingestion_dead_letters'
  );

\echo '=== 3. Policy count per table ==='
SELECT tablename, count(*) AS policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;

\echo '=== 4. GDPR: spaces has encrypted column, not plaintext tenant_name ==='
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'spaces'
  AND column_name ILIKE '%tenant%';

\echo '=== 5. spaces_safe view definition contains mask ==='
SELECT pg_get_viewdef('public.spaces_safe'::regclass, true);

\echo '=== 6. Vault secret for tenant key (if vault present) ==='
SELECT name, description, created_at
FROM vault.secrets
WHERE name = 'tenant_encryption_key';

\echo '=== 7. SECURITY DEFINER decrypt functions ==='
SELECT n.nspname, p.proname, prosecdef
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname ILIKE '%tenant%' OR p.proname ILIKE '%decrypt%'
ORDER BY 1, 2;

\echo '=== 8. Grants on spaces (should not expose decrypt to anon) ==='
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name IN ('spaces', 'spaces_safe')
ORDER BY table_name, grantee;

\echo '=== DONE security audit ==='
