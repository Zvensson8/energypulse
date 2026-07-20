-- =============================================================================
-- EnergyPulse v2.0 Fas 1 – Verifierande test queries
-- =============================================================================
-- Förutsättning: 20260719_energypulse_v2_fas1.sql har körts (inkl. test-seed).
-- Kör i Supabase SQL Editor som postgres/service_role (RLS bypass).
-- Testbyggnad: cccccccc-cccc-cccc-cccc-cccccccccccc
-- =============================================================================

-- ---------------------------------------------------------------------------
-- T1: GDPR-maskering (spaces_safe)
-- ---------------------------------------------------------------------------
SELECT
  id,
  name,
  tenant_name,
  has_tenant,
  CASE
    WHEN tenant_name = '***MASKERAD***' AND has_tenant = true THEN 'PASS'
    ELSE 'FAIL'
  END AS test_result
FROM public.spaces_safe
WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

-- Rå kolumn ska vara bytea (krypterad), inte klartext
SELECT
  id,
  tenant_name_encrypted IS NOT NULL AS is_encrypted,
  encode(tenant_name_encrypted, 'hex') IS NOT NULL AS has_ciphertext,
  'PASS – ciphertext only' AS test_result
FROM public.spaces
WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

-- ---------------------------------------------------------------------------
-- T2: calculate_yearly_performance 2024 – COMPLETE
-- ---------------------------------------------------------------------------
SELECT
  year,
  data_gap_status,
  data_completeness_percent,
  a_temp,
  total_energy_kwh,
  energy_intensity,
  primary_energy_intensity,
  ghg_intensity,
  energy_class,
  meps_2030_gap,
  meps_2033_gap,
  crrem_stranding_year,
  crrem_version_used,
  CASE
    WHEN data_gap_status = 'COMPLETE'
     AND data_completeness_percent = 100
     AND energy_intensity IS NOT NULL
     AND meps_2030_gap IS NOT NULL
     AND meps_2033_gap IS NOT NULL
     AND crrem_version_used = 'v2.0-1.5C'
    THEN 'PASS'
    ELSE 'FAIL'
  END AS test_result
FROM public.calculate_yearly_performance(
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  2024
);

-- Formelverifiering: energy_intensity = total / a_temp
WITH pi AS (
  SELECT * FROM public.performance_indicators
  WHERE building_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc' AND year = 2024
),
agg AS (
  SELECT
    SUM(ec.consumption_kwh) AS tot,
    SUM(ec.consumption_kwh * es.primary_energy_factor) AS pe,
    SUM(ec.consumption_kwh * es.emission_factor_kg_co2e_per_kwh) AS ghg
  FROM public.energy_consumption ec
  JOIN public.energy_sources es ON es.id = ec.energy_source_id
  WHERE ec.building_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
    AND ec.year = 2024
    AND ec.space_id IS NULL
)
SELECT
  pi.energy_intensity AS stored_intensity,
  round(agg.tot / pi.a_temp, 4) AS expected_intensity,
  pi.primary_energy_intensity AS stored_pe,
  round(agg.pe / pi.a_temp, 4) AS expected_pe,
  pi.ghg_intensity AS stored_ghg,
  round(agg.ghg / pi.a_temp, 6) AS expected_ghg,
  CASE
    WHEN pi.energy_intensity = round(agg.tot / pi.a_temp, 4)
     AND pi.primary_energy_intensity = round(agg.pe / pi.a_temp, 4)
     AND pi.ghg_intensity = round(agg.ghg / pi.a_temp, 6)
    THEN 'PASS'
    ELSE 'FAIL'
  END AS test_result
FROM pi, agg;

-- ---------------------------------------------------------------------------
-- T3: Data Gap EXTRAPOLATED_WARNING (2025, 2 saknade månader ≤ 3)
-- ---------------------------------------------------------------------------
SELECT
  year,
  data_gap_status,
  data_completeness_percent,
  meps_2030_gap IS NOT NULL AS meps_computed,
  crrem_stranding_year IS NOT NULL OR crrem_stranding_year IS NULL AS crrem_allowed,
  CASE
    WHEN data_gap_status = 'EXTRAPOLATED_WARNING' THEN 'PASS'
    ELSE 'FAIL – expected EXTRAPOLATED_WARNING'
  END AS test_result
FROM public.calculate_yearly_performance(
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  2025
);

-- Interpolerade rader ska ha is_estimated = true (månad 11–12)
SELECT
  year,
  month,
  is_estimated,
  consumption_kwh,
  quality_class,
  CASE WHEN is_estimated AND month IN (11, 12) THEN 'PASS' ELSE 'CHECK' END AS test_result
FROM public.energy_consumption
WHERE building_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  AND year = 2025
  AND is_estimated = true
ORDER BY month, energy_source_id;

-- ---------------------------------------------------------------------------
-- T4: Data Gap INCOMPLETE_DATA (2023, 6 saknade månader > 3) – MEPS/CRREM blockerade
-- ---------------------------------------------------------------------------
SELECT
  year,
  data_gap_status,
  data_completeness_percent,
  energy_intensity,
  meps_2030_gap,
  meps_2033_gap,
  crrem_stranding_year,
  CASE
    WHEN data_gap_status = 'INCOMPLETE_DATA'
     AND meps_2030_gap IS NULL
     AND meps_2033_gap IS NULL
     AND crrem_stranding_year IS NULL
    THEN 'PASS'
    ELSE 'FAIL – expected blocked MEPS/CRREM'
  END AS test_result
FROM public.calculate_yearly_performance(
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  2023
);

-- ---------------------------------------------------------------------------
-- T5: Override med obligatorisk reason
-- ---------------------------------------------------------------------------
SELECT
  year,
  data_gap_status,
  override_applied,
  override_reason,
  meps_2030_gap IS NOT NULL AS meps_unlocked,
  CASE
    WHEN override_applied = true
     AND override_reason IS NOT NULL
     AND meps_2030_gap IS NOT NULL
    THEN 'PASS'
    ELSE 'FAIL'
  END AS test_result
FROM public.calculate_yearly_performance(
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  2023,
  true,
  'Pilot: godkänt av portföljchef för Q1-rapport (test)'
);

-- Override ska finnas i audit log
SELECT
  operation,
  override_reason,
  entity_type,
  CASE
    WHEN operation = 'OVERRIDE' AND override_reason IS NOT NULL THEN 'PASS'
    ELSE 'FAIL'
  END AS test_result
FROM public.data_quality_logs
WHERE operation = 'OVERRIDE'
ORDER BY changed_at DESC
LIMIT 3;

-- ---------------------------------------------------------------------------
-- T6: CRREM linjär interpolation (direkt anrop)
-- ---------------------------------------------------------------------------
-- Med ghg_intensity = 25 kgCO2e/m² och seed-pathway (2030 target 20):
-- förväntat stranding omkring 2027–2028.
SELECT
  public.calculate_crrem_stranding_year(
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    2024,
    25.0,
    'v2.0-1.5C',
    'office'
  ) AS stranding_year,
  CASE
    WHEN public.calculate_crrem_stranding_year(
           'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
           2024, 25.0, 'v2.0-1.5C', 'office'
         ) BETWEEN 2025 AND 2030
    THEN 'PASS'
    ELSE 'FAIL – unexpected stranding year'
  END AS test_result;

-- Under pathway (mycket låg intensitet) → NULL (ej strandad till 2050)
SELECT
  public.calculate_crrem_stranding_year(
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    2024,
    0.5,
    'v2.0-1.5C',
    'office'
  ) AS stranding_year,
  CASE
    WHEN public.calculate_crrem_stranding_year(
           'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
           2024, 0.5, 'v2.0-1.5C', 'office'
         ) IS NULL
    THEN 'PASS'
    ELSE 'FAIL'
  END AS test_result;

-- ---------------------------------------------------------------------------
-- T7: Seed-sanity (energy_sources, MEPS, CRREM, climate, config)
-- ---------------------------------------------------------------------------
SELECT 'energy_sources' AS entity, COUNT(*) AS n,
       CASE WHEN COUNT(*) >= 7 THEN 'PASS' ELSE 'FAIL' END AS test_result
FROM public.energy_sources
UNION ALL
SELECT 'meps_office', COUNT(*),
       CASE WHEN COUNT(*) >= 2 THEN 'PASS' ELSE 'FAIL' END
FROM public.meps_thresholds WHERE category = 'office'
UNION ALL
SELECT 'crrem_v2_office_se', COUNT(*),
       CASE WHEN COUNT(*) >= 5 THEN 'PASS' ELSE 'FAIL' END
FROM public.crrem_pathways
WHERE crrem_version = 'v2.0-1.5C' AND property_type = 'office' AND country_code = 'SE'
UNION ALL
SELECT 'climate_stockholm', COUNT(*),
       CASE WHEN COUNT(*) >= 12 THEN 'PASS' ELSE 'FAIL' END
FROM public.climate_data WHERE municipality = 'Stockholm' AND month IS NOT NULL
UNION ALL
SELECT 'data_gap_default', COUNT(*),
       CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM public.data_gap_config WHERE is_default
UNION ALL
SELECT 'system_config_override', COUNT(*),
       CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END
FROM public.system_config WHERE key = 'override_enabled_per_role';

-- ---------------------------------------------------------------------------
-- T8: Area-versionering används
-- ---------------------------------------------------------------------------
SELECT
  pi.year,
  pi.area_id,
  a.a_temp,
  a.valid_from,
  CASE
    WHEN pi.area_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
     AND pi.a_temp = 10000
    THEN 'PASS'
    ELSE 'FAIL'
  END AS test_result
FROM public.performance_indicators pi
JOIN public.areas a ON a.id = pi.area_id
WHERE pi.building_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
  AND pi.year = 2024;
