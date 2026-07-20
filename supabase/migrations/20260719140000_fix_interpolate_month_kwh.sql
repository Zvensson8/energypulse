-- Fix app.interpolate_month_kwh: outer avg referenced table alias "ec"
-- which only exists inside the subquery (breaks EXTRAPOLATED path e.g. year 2025).

CREATE OR REPLACE FUNCTION app.interpolate_month_kwh(
  p_building_id uuid,
  p_energy_source_id uuid,
  p_year int,
  p_month int,
  p_municipality text
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg_prev numeric;
  v_hdd_target numeric;
  v_hdd_prev_avg numeric;
  v_result numeric;
BEGIN
  -- Medel av upp till 3 föregående månader
  SELECT avg(prev.consumption_kwh)
    INTO v_avg_prev
    FROM (
      SELECT ec.consumption_kwh
        FROM public.energy_consumption ec
       WHERE ec.building_id = p_building_id
         AND ec.energy_source_id = p_energy_source_id
         AND ec.space_id IS NULL
         AND (ec.year * 12 + ec.month) < (p_year * 12 + p_month)
         AND ec.is_estimated = false
       ORDER BY (ec.year * 12 + ec.month) DESC
       LIMIT 3
    ) prev;

  IF v_avg_prev IS NULL THEN
    SELECT ec.consumption_kwh
      INTO v_avg_prev
      FROM public.energy_consumption ec
     WHERE ec.building_id = p_building_id
       AND ec.energy_source_id = p_energy_source_id
       AND ec.space_id IS NULL
       AND ec.year = p_year - 1
       AND ec.month = p_month
     LIMIT 1;
  END IF;

  IF v_avg_prev IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_municipality IS NOT NULL THEN
    SELECT cd.heating_degree_days
      INTO v_hdd_target
      FROM public.climate_data cd
     WHERE cd.municipality = p_municipality
       AND cd.year = p_year
       AND cd.month = p_month
     LIMIT 1;
  END IF;

  SELECT avg(x.heating_degree_days)
    INTO v_hdd_prev_avg
    FROM (
      SELECT cd.heating_degree_days
        FROM public.climate_data cd
       WHERE p_municipality IS NOT NULL
         AND cd.municipality = p_municipality
         AND cd.month IS NOT NULL
         AND (cd.year * 12 + cd.month) < (p_year * 12 + p_month)
         AND cd.heating_degree_days > 0
       ORDER BY (cd.year * 12 + cd.month) DESC
       LIMIT 3
    ) x;

  IF v_hdd_target IS NOT NULL AND v_hdd_prev_avg IS NOT NULL AND v_hdd_prev_avg > 0 THEN
    v_result := v_avg_prev * (v_hdd_target / v_hdd_prev_avg);
  ELSE
    v_result := v_avg_prev;
  END IF;

  RETURN round(v_result, 3);
END;
$$;

COMMENT ON FUNCTION app.interpolate_month_kwh(uuid, uuid, int, int, text) IS
  'DATA GAP-interpolation: linear_previous_3m_seasonal_graddagar (fixed outer avg alias).';

-- Ensure tenant vault secret uses extensions.gen_random_bytes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'tenant_encryption_key') THEN
      PERFORM vault.create_secret(
        encode(extensions.gen_random_bytes(32), 'hex'),
        'tenant_encryption_key',
        'EnergyPulse GDPR: pgcrypto key for spaces.tenant_name_encrypted'
      );
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'vault secret setup skipped: %', SQLERRM;
END $$;
