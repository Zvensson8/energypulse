-- =============================================================================
-- EnergyPulse Fas 6 – Monitoring metrics + data retention config hooks
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ops_metrics (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name   text NOT NULL,
  metric_value  numeric NOT NULL,
  dimensions    jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_metrics_name_time
  ON public.ops_metrics (metric_name, recorded_at DESC);

COMMENT ON TABLE public.ops_metrics IS
  'Operational metrics snapshots: freshness, import_failures, overrides, calc_latency.';

ALTER TABLE public.ops_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_metrics_admin_all ON public.ops_metrics;
CREATE POLICY ops_metrics_admin_all ON public.ops_metrics
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.is_active AND up.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.is_active AND up.role = 'admin'
    )
  );

-- Snapshot function (callable from Edge Function / pg_cron)
CREATE OR REPLACE FUNCTION public.snapshot_ops_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_freshness_days numeric;
  v_import_failures int;
  v_overrides_7d int;
  v_incomplete int;
  v_result jsonb;
BEGIN
  -- Data freshness: days since newest energy_consumption.updated_at
  SELECT EXTRACT(EPOCH FROM (now() - max(updated_at))) / 86400.0
    INTO v_freshness_days
    FROM public.energy_consumption;

  SELECT count(*)::int INTO v_import_failures
    FROM public.ingestion_dead_letters
   WHERE status IN ('pending', 'failed', 'retrying')
     AND created_at > now() - interval '7 days';

  SELECT count(*)::int INTO v_overrides_7d
    FROM public.data_quality_logs
   WHERE operation = 'OVERRIDE'
     AND changed_at > now() - interval '7 days';

  SELECT count(*)::int INTO v_incomplete
    FROM public.performance_indicators
   WHERE data_gap_status = 'INCOMPLETE_DATA';

  INSERT INTO public.ops_metrics (metric_name, metric_value, dimensions) VALUES
    ('data_freshness_days', COALESCE(v_freshness_days, -1), jsonb_build_object('source', 'energy_consumption')),
    ('import_dead_letters_7d', v_import_failures, jsonb_build_object('window', '7d')),
    ('override_count_7d', v_overrides_7d, jsonb_build_object('window', '7d')),
    ('incomplete_pi_count', v_incomplete, jsonb_build_object('status', 'INCOMPLETE_DATA'));

  v_result := jsonb_build_object(
    'data_freshness_days', v_freshness_days,
    'import_dead_letters_7d', v_import_failures,
    'override_count_7d', v_overrides_7d,
    'incomplete_pi_count', v_incomplete,
    'recorded_at', now()
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.snapshot_ops_metrics() TO service_role;

-- Stale buildings: no consumption newer than N days
CREATE OR REPLACE FUNCTION public.list_stale_buildings(p_max_age_days int DEFAULT 45)
RETURNS TABLE (
  building_id uuid,
  building_name text,
  property_id uuid,
  last_consumption_at timestamptz,
  age_days numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    b.id,
    b.name,
    b.property_id,
    max(ec.updated_at) AS last_consumption_at,
    EXTRACT(EPOCH FROM (now() - max(ec.updated_at))) / 86400.0 AS age_days
  FROM public.buildings b
  LEFT JOIN public.energy_consumption ec ON ec.building_id = b.id
  GROUP BY b.id, b.name, b.property_id
  HAVING max(ec.updated_at) IS NULL
      OR max(ec.updated_at) < now() - make_interval(days => p_max_age_days)
  ORDER BY age_days DESC NULLS FIRST;
$$;

GRANT EXECUTE ON FUNCTION public.list_stale_buildings(int) TO service_role, authenticated;

-- Data retention helper (dry-run counts)
CREATE OR REPLACE FUNCTION public.retention_preview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cons_years int := 7;
  v_pi_years int := 10;
BEGIN
  -- Read from system_config if present
  BEGIN
    SELECT COALESCE((value->>'energy_consumption')::int, 7),
           COALESCE((value->>'performance_indicators')::int, 10)
      INTO v_cons_years, v_pi_years
      FROM public.system_config
     WHERE key = 'data_retention_years';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'energy_consumption_older_than_years', v_cons_years,
    'energy_consumption_rows_deletable', (
      SELECT count(*) FROM public.energy_consumption
       WHERE make_date(year, month, 1) < (current_date - make_interval(years => v_cons_years))
    ),
    'performance_indicators_older_than_years', v_pi_years,
    'performance_indicators_rows_deletable', (
      SELECT count(*) FROM public.performance_indicators
       WHERE make_date(year, 1, 1) < (current_date - make_interval(years => v_pi_years))
    ),
    'policy', jsonb_build_object(
      'energy_consumption', v_cons_years,
      'performance_indicators', v_pi_years,
      'tenant_pii_minimal', true
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.retention_preview() TO service_role, authenticated;

COMMENT ON FUNCTION public.snapshot_ops_metrics() IS
  'Fas 6: snapshot freshness, dead-letters, overrides, incomplete PI into ops_metrics.';
COMMENT ON FUNCTION public.list_stale_buildings(int) IS
  'Fas 6: buildings with no consumption newer than p_max_age_days (data freshness alert).';
COMMENT ON FUNCTION public.retention_preview() IS
  'Fas 6: preview rows eligible for retention delete (GDPR/data lifecycle 13.2).';

-- Optional pg_cron schedule (enable extension in dashboard first)
-- SELECT cron.schedule(
--   'energypulse-ops-metrics',
--   '0 * * * *',
--   $$SELECT public.snapshot_ops_metrics();$$
-- );
