-- =============================================================================
-- EnergyPulse v2.0 – Pilot-seed (3 realistiska fastigheter)
-- Kör EFTER Fas 1 (+ gärna Fas 2). Idempotent: rensar tidigare pilot-seed.
--
-- Innehåll:
--   1 portfolio, 3 properties (Stockholm/Göteborg/Malmö), 6 buildings,
--   area-versioner, 36 mån energy_consumption med medvetna data-gap,
--   climate_data, actions, physical_risks, user_profiles-stubs
--
-- Efter SQL: kör scripts/seed-pilot.mjs för calculate_yearly_performance + rapport
--   eller se sektion "BERÄKNA" längst ner.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Rensa tidigare pilot (via externa ID-prefix)
-- ---------------------------------------------------------------------------
DELETE FROM public.energy_consumption
 WHERE building_id IN (
   SELECT b.id FROM public.buildings b
   JOIN public.properties p ON p.id = b.property_id
   WHERE p.external_id LIKE 'PILOT-%'
 );

DELETE FROM public.performance_indicators
 WHERE building_id IN (
   SELECT b.id FROM public.buildings b
   JOIN public.properties p ON p.id = b.property_id
   WHERE p.external_id LIKE 'PILOT-%'
 );

DELETE FROM public.actions
 WHERE building_id IN (
   SELECT b.id FROM public.buildings b
   JOIN public.properties p ON p.id = b.property_id
   WHERE p.external_id LIKE 'PILOT-%'
 );

DELETE FROM public.spaces
 WHERE building_id IN (
   SELECT b.id FROM public.buildings b
   JOIN public.properties p ON p.id = b.property_id
   WHERE p.external_id LIKE 'PILOT-%'
 );

DELETE FROM public.areas
 WHERE building_id IN (
   SELECT b.id FROM public.buildings b
   JOIN public.properties p ON p.id = b.property_id
   WHERE p.external_id LIKE 'PILOT-%'
 );

DELETE FROM public.physical_risks
 WHERE property_id IN (SELECT id FROM public.properties WHERE external_id LIKE 'PILOT-%');

DELETE FROM public.user_properties
 WHERE property_id IN (SELECT id FROM public.properties WHERE external_id LIKE 'PILOT-%');

DELETE FROM public.buildings
 WHERE property_id IN (SELECT id FROM public.properties WHERE external_id LIKE 'PILOT-%');

DELETE FROM public.properties WHERE external_id LIKE 'PILOT-%';

DELETE FROM public.portfolios WHERE name = 'Pilotphi Pilotportfölj EnergyPulse';

-- ---------------------------------------------------------------------------
-- Fasta UUID:er (reproducerbart)
-- ---------------------------------------------------------------------------
-- Portfolio
-- a1111111-1111-4111-8111-111111111111

-- Properties
-- b1000001-0001-4001-8001-000000000001 Stockholm
-- b1000002-0002-4002-8002-000000000002 Göteborg
-- b1000003-0003-4003-8003-000000000003 Malmö

-- Buildings
-- c1000001 ... c1000006

-- ---------------------------------------------------------------------------
-- energy_sources (säkerställ svenska schablonvärden)
-- ---------------------------------------------------------------------------
INSERT INTO public.energy_sources (
  name, source_type, is_renewable, scope,
  primary_energy_factor, emission_factor_kg_co2e_per_kwh, valid_from
)
SELECT * FROM (VALUES
  ('El (nordisk residualmix)', 'electricity'::public.energy_source_type, false, 'scope2'::public.emission_scope, 1.8000, 0.090000, DATE '2020-01-01'),
  ('El (förnybar/ursprungsgaranterad)', 'electricity'::public.energy_source_type, true, 'scope2'::public.emission_scope, 1.8000, 0.010000, DATE '2020-01-01'),
  ('Fjärrvärme (svensk medel)', 'district_heating'::public.energy_source_type, false, 'scope2'::public.emission_scope, 0.7000, 0.045000, DATE '2020-01-01'),
  ('Fjärrkyla', 'district_cooling'::public.energy_source_type, false, 'scope2'::public.emission_scope, 0.6000, 0.030000, DATE '2020-01-01'),
  ('Naturgas', 'natural_gas'::public.energy_source_type, false, 'scope1'::public.emission_scope, 1.1000, 0.205000, DATE '2020-01-01')
) AS v(name, source_type, is_renewable, scope, primary_energy_factor, emission_factor_kg_co2e_per_kwh, valid_from)
WHERE NOT EXISTS (SELECT 1 FROM public.energy_sources es WHERE es.name = v.name);

-- MEPS om saknas
INSERT INTO public.meps_thresholds (category, target_year, threshold_kwh_m2, regulation_ref, is_preliminary)
SELECT * FROM (VALUES
  ('office'::public.space_type, 2030, 214.00, 'Boverket preliminary', true),
  ('office'::public.space_type, 2033, 174.00, 'Boverket preliminary', true),
  ('retail'::public.space_type, 2030, 230.00, 'Boverket preliminary indikativ', true),
  ('retail'::public.space_type, 2033, 190.00, 'Boverket preliminary indikativ', true),
  ('warehouse'::public.space_type, 2030, 180.00, 'Boverket preliminary indikativ', true),
  ('warehouse'::public.space_type, 2033, 150.00, 'Boverket preliminary indikativ', true)
) AS v(category, target_year, threshold_kwh_m2, regulation_ref, is_preliminary)
WHERE NOT EXISTS (
  SELECT 1 FROM public.meps_thresholds m
  WHERE m.category = v.category AND m.target_year = v.target_year
);

-- CRREM om saknas
INSERT INTO public.crrem_pathways (
  crrem_version, property_type, country_code, target_year,
  intensity_target_ghg, intensity_target_energy
)
SELECT * FROM (VALUES
  ('v2.0-1.5C', 'office', 'SE', 2020, 45.0, 180.0),
  ('v2.0-1.5C', 'office', 'SE', 2025, 32.0, 150.0),
  ('v2.0-1.5C', 'office', 'SE', 2030, 20.0, 120.0),
  ('v2.0-1.5C', 'office', 'SE', 2035, 12.0, 95.0),
  ('v2.0-1.5C', 'office', 'SE', 2040, 7.0, 75.0),
  ('v2.0-1.5C', 'office', 'SE', 2045, 3.5, 55.0),
  ('v2.0-1.5C', 'office', 'SE', 2050, 1.5, 40.0)
) AS v(crrem_version, property_type, country_code, target_year, intensity_target_ghg, intensity_target_energy)
WHERE NOT EXISTS (
  SELECT 1 FROM public.crrem_pathways c
  WHERE c.crrem_version = v.crrem_version
    AND c.property_type = v.property_type
    AND c.country_code = v.country_code
    AND c.target_year = v.target_year
);

-- data_gap_config default
INSERT INTO public.data_gap_config (
  name, max_missing_months_before_incomplete, interpolation_method,
  warning_threshold_months, is_default, is_active, notes
)
SELECT
  'default_v2', 3, 'linear_previous_3m_seasonal_graddagar', 1, true, true,
  'Pilot-seed: ≤3 saknade → EXTRAPOLATED; >3 → INCOMPLETE'
WHERE NOT EXISTS (SELECT 1 FROM public.data_gap_config WHERE is_default);

-- ---------------------------------------------------------------------------
-- Portfolio
-- ---------------------------------------------------------------------------
INSERT INTO public.portfolios (id, name, description, base_currency)
VALUES (
  'a1111111-1111-4111-8111-111111111111',
  'EnergyPulse Pilotportfölj',
  'Pilot: tre kommersiella fastigheter för MEPS/CRREM-demo (Stockholm, Göteborg, Malmö).',
  'SEK'
);

-- ---------------------------------------------------------------------------
-- 3 Properties (olika kommuner / klimatzoner)
-- Klimatzon Boverket: III Stockholm, II Göteborg, I Malmö (förenklad)
-- ---------------------------------------------------------------------------
INSERT INTO public.properties (
  id, portfolio_id, external_id, name, address, municipality, climate_zone,
  latitude, longitude, ownership_type, status
) VALUES
(
  'b1000001-0001-4001-8001-000000000001',
  'a1111111-1111-4111-8111-111111111111',
  'PILOT-STOCKHOLM 1:12',
  'Klaraberg Kontor',
  'Klarabergsgatan 12, 111 21 Stockholm',
  'Stockholm',
  'III',
  59.332600, 18.064900,
  'owned',
  'active'
),
(
  'b1000002-0002-4002-8002-000000000002',
  'a1111111-1111-4111-8111-111111111111',
  'PILOT-GÖTEBORG 4:8',
  'Lindholmen Logistik',
  'Lindholmspiren 5, 417 56 Göteborg',
  'Göteborg',
  'II',
  57.706700, 11.938300,
  'owned',
  'active'
),
(
  'b1000003-0003-4003-8003-000000000003',
  'a1111111-1111-4111-8111-111111111111',
  'PILOT-MALMÖ 2:5',
  'Västra Hamnen Retail',
  'Universitetsgatan 8, 211 18 Malmö',
  'Malmö',
  'I',
  55.609800, 12.995200,
  'leased',
  'active'
);

-- ---------------------------------------------------------------------------
-- 6 Buildings
-- ---------------------------------------------------------------------------
INSERT INTO public.buildings (
  id, property_id, name, construction_year, major_renovation_year,
  construction_type, facade_share, roof_share, window_share,
  protected_status, primary_use
) VALUES
-- Stockholm: 2 kontorsbyggnader
(
  'c1000001-0001-4001-8001-000000000001',
  'b1000001-0001-4001-8001-000000000001',
  'Hus A – Kontor',
  1987, 2015, 'betong/puts', 0.55, 0.20, 0.25, false, 'office'
),
(
  'c1000002-0002-4002-8002-000000000002',
  'b1000001-0001-4001-8001-000000000001',
  'Hus B – Kontor (K-märkt)',
  1965, 2008, 'tegel', 0.60, 0.15, 0.18, true, 'office'
),
-- Göteborg: lager + kontor
(
  'c1000003-0003-4003-8003-000000000003',
  'b1000002-0002-4002-8002-000000000002',
  'Lager 1',
  2001, NULL, 'stål/sandwich', 0.40, 0.45, 0.08, false, 'warehouse'
),
(
  'c1000004-0004-4004-8004-000000000004',
  'b1000002-0002-4002-8002-000000000002',
  'Kontorsflygel',
  2003, 2019, 'lättbetong', 0.50, 0.20, 0.28, false, 'office'
),
-- Malmö: retail + kontor
(
  'c1000005-0005-4005-8005-000000000005',
  'b1000003-0003-4003-8003-000000000003',
  'Butikshus',
  2010, NULL, 'glas/stål', 0.30, 0.25, 0.40, false, 'retail'
),
(
  'c1000006-0006-4006-8006-000000000006',
  'b1000003-0003-4003-8003-000000000003',
  'Kontor våning 3–5',
  2010, 2022, 'glas/stål', 0.35, 0.20, 0.38, false, 'office'
);

-- ---------------------------------------------------------------------------
-- Areas (Atemp) – versioner
-- ---------------------------------------------------------------------------
INSERT INTO public.areas (
  id, building_id, valid_from, valid_to, bta, a_temp, loa_total, source, quality_class
) VALUES
-- Hus A: två versioner (ombyggnad 2015)
(
  'd1000001-0001-4001-8001-000000000001',
  'c1000001-0001-4001-8001-000000000001',
  '2010-01-01', '2014-12-31', 9200, 8500, 8000, 'ritning 2010', 'B'
),
(
  'd1000002-0002-4002-8002-000000000002',
  'c1000001-0001-4001-8001-000000000001',
  '2015-01-01', NULL, 9800, 9100, 8600, 'uppmätt efter renovering 2015', 'A'
),
-- Hus B
(
  'd1000003-0003-4003-8003-000000000003',
  'c1000002-0002-4002-8002-000000000002',
  '2008-01-01', NULL, 6400, 5800, 5500, 'EPC 2008', 'C'
),
-- Lager 1
(
  'd1000004-0004-4004-8004-000000000004',
  'c1000003-0003-4003-8003-000000000003',
  '2001-01-01', NULL, 15000, 12000, 14500, 'ritning', 'B'
),
-- Kontorsflygel
(
  'd1000005-0005-4005-8005-000000000005',
  'c1000004-0004-4004-8004-000000000004',
  '2003-01-01', '2018-12-31', 3200, 2900, 2700, 'ritning', 'C'
),
(
  'd1000006-0006-4006-8006-000000000006',
  'c1000004-0004-4004-8004-000000000004',
  '2019-01-01', NULL, 3400, 3100, 2900, 'uppmätt 2019', 'A'
),
-- Butikshus
(
  'd1000007-0007-4007-8007-000000000007',
  'c1000005-0005-4005-8005-000000000005',
  '2010-01-01', NULL, 4800, 4200, 4500, 'ritning', 'B'
),
-- Kontor Malmö
(
  'd1000008-0008-4008-8008-000000000008',
  'c1000006-0006-4006-8006-000000000006',
  '2010-01-01', NULL, 3600, 3300, 3100, 'ritning', 'B'
);

-- ---------------------------------------------------------------------------
-- climate_data för Stockholm, Göteborg, Malmö (2023–2025, månad + årssumma)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  munis text[] := ARRAY['Stockholm', 'Göteborg', 'Malmö'];
  bases numeric[] := ARRAY[380, 340, 300]; -- HDD-bas per kommun
  season numeric[] := ARRAY[1.40, 1.25, 1.10, 0.80, 0.40, 0.10, 0.05, 0.05, 0.30, 0.70, 1.10, 1.35];
  m text;
  bi int;
  y int;
  mon int;
  hdd numeric;
BEGIN
  FOR bi IN 1..3 LOOP
    m := munis[bi];
    FOR y IN 2023..2025 LOOP
      FOR mon IN 1..12 LOOP
        hdd := round(bases[bi] * season[mon] * (1.0 - (y - 2023) * 0.01), 2);
        INSERT INTO public.climate_data (
          municipality, year, month, heating_degree_days, cooling_degree_days, source
        ) VALUES (
          m, y, mon, hdd,
          CASE WHEN mon IN (6, 7, 8) THEN round(18 + bi * 2.0, 2) ELSE 0 END,
          'SMHI-referens pilot-seed EnergyPulse'
        )
        ON CONFLICT DO NOTHING;
      END LOOP;

      INSERT INTO public.climate_data (
        municipality, year, month, heating_degree_days, cooling_degree_days, source
      )
      SELECT m, y, NULL, SUM(heating_degree_days), SUM(cooling_degree_days),
             'SMHI-referens pilot-seed EnergyPulse'
        FROM public.climate_data
       WHERE municipality = m AND year = y AND month IS NOT NULL
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- energy_consumption 2023–2025 (36 mån) med medvetna gap
-- Gap-policy: ≤3 → EXTRAPOLATED, >3 → INCOMPLETE
--
-- c1000001 Hus A: 2023 full, 2024 saknar 2 mån (11–12), 2025 full
-- c1000002 Hus B: 2023 full, 2024 full, 2025 saknar 4 mån (9–12) → INCOMPLETE
-- c1000003 Lager: 2023–2025 full (högre värme vinter)
-- c1000004 Kontorsflygel: 2023 saknar 1 mån, 2024–2025 full
-- c1000005 Butik: 2023–2024 full, 2025 saknar 3 mån (10–12) → EXTRAPOLATED
-- c1000006 Kontor Malmö: 2023–2025 full
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_el uuid;
  v_fv uuid;
  v_fk uuid;
  b record;
  y int;
  m int;
  max_m int;
  el_kwh numeric;
  fv_kwh numeric;
  skip boolean;
BEGIN
  SELECT id INTO v_el FROM public.energy_sources WHERE name = 'El (nordisk residualmix)' LIMIT 1;
  SELECT id INTO v_fv FROM public.energy_sources WHERE name = 'Fjärrvärme (svensk medel)' LIMIT 1;
  SELECT id INTO v_fk FROM public.energy_sources WHERE name = 'Fjärrkyla' LIMIT 1;

  IF v_el IS NULL OR v_fv IS NULL THEN
    RAISE EXCEPTION 'energy_sources saknas – kör Fas 1-seed först';
  END IF;

  FOR b IN
    SELECT id, name, primary_use FROM public.buildings
    WHERE id IN (
      'c1000001-0001-4001-8001-000000000001',
      'c1000002-0002-4002-8002-000000000002',
      'c1000003-0003-4003-8003-000000000003',
      'c1000004-0004-4004-8004-000000000004',
      'c1000005-0005-4005-8005-000000000005',
      'c1000006-0006-4006-8006-000000000006'
    )
  LOOP
    FOR y IN 2023..2025 LOOP
      FOR m IN 1..12 LOOP
        -- Bestäm om månad ska hoppas över (data-gap)
        skip := false;
        IF b.id = 'c1000001-0001-4001-8001-000000000001' AND y = 2024 AND m IN (11, 12) THEN
          skip := true; -- 2 saknade
        ELSIF b.id = 'c1000002-0002-4002-8002-000000000002' AND y = 2025 AND m >= 9 THEN
          skip := true; -- 4 saknade
        ELSIF b.id = 'c1000004-0004-4004-8004-000000000004' AND y = 2023 AND m = 7 THEN
          skip := true; -- 1 saknad
        ELSIF b.id = 'c1000005-0005-4005-8005-000000000005' AND y = 2025 AND m >= 10 THEN
          skip := true; -- 3 saknade
        END IF;

        IF skip THEN
          CONTINUE;
        END IF;

        -- Basförbrukning per typ
        IF b.primary_use = 'warehouse' THEN
          el_kwh := 55000 + m * 200;
          fv_kwh := 90000 + CASE WHEN m IN (1,2,12) THEN 40000 WHEN m IN (6,7,8) THEN -35000 ELSE 0 END;
        ELSIF b.primary_use = 'retail' THEN
          el_kwh := 70000 + m * 300;
          fv_kwh := 50000 + CASE WHEN m IN (1,2,12) THEN 25000 WHEN m IN (6,7,8) THEN -15000 ELSE 0 END;
        ELSE -- office
          el_kwh := 45000 + m * 250
            + CASE b.id
                WHEN 'c1000001-0001-4001-8001-000000000001' THEN 8000
                WHEN 'c1000002-0002-4002-8002-000000000002' THEN 15000 -- äldre, sämre
                ELSE 0
              END;
          fv_kwh := 65000 + CASE WHEN m IN (1,2,12) THEN 30000 WHEN m IN (6,7,8) THEN -25000 ELSE 0 END
            + CASE b.id
                WHEN 'c1000002-0002-4002-8002-000000000002' THEN 20000
                ELSE 0
              END;
        END IF;

        -- Årlig effektivisering ~1 %
        el_kwh := el_kwh * (1.0 - (y - 2023) * 0.01);
        fv_kwh := fv_kwh * (1.0 - (y - 2023) * 0.008);

        INSERT INTO public.energy_consumption (
          building_id, space_id, energy_source_id, year, month,
          consumption_kwh, is_weather_corrected, is_estimated, quality_class
        ) VALUES
          (b.id, NULL, v_el, y, m, round(el_kwh, 3), false, false, 'B'),
          (b.id, NULL, v_fv, y, m, round(greatest(fv_kwh, 5000), 3), false, false, 'B');

        -- Fjärrkyla utelämnad i pilot: säsongskällor (endast 3 mån) triggar
        -- annars falsk INCOMPLETE i calculate_yearly_performance (räknar alla källor × 12).
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Spaces (hyresgäster – krypteras via RPC om möjligt)
-- ---------------------------------------------------------------------------
INSERT INTO public.spaces (
  id, building_id, name, space_type, loa, boa, is_heated, contract_start, contract_end
) VALUES
(
  'e1000001-0001-4001-8001-000000000001',
  'c1000001-0001-4001-8001-000000000001',
  'Plan 4–6 kontor',
  'office', 2400, 2300, true, '2020-01-01', '2027-12-31'
),
(
  'e1000002-0002-4002-8002-000000000002',
  'c1000005-0005-4005-8005-000000000005',
  'Butiksyta entré',
  'retail', 1800, 1750, true, '2021-03-01', '2026-02-28'
);

-- Försök kryptera hyresgästnamn (kräver set_space_tenant_name)
DO $$
BEGIN
  PERFORM public.set_space_tenant_name(
    'e1000001-0001-4001-8001-000000000001',
    'Nordic Consulting AB'
  );
  PERFORM public.set_space_tenant_name(
    'e1000002-0002-4002-8002-000000000002',
    'Skandinavisk Modehandel AB'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Kunde inte kryptera tenant_name (kör set_space_tenant_name manuellt): %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- Actions (åtgärder)
-- ---------------------------------------------------------------------------
INSERT INTO public.actions (
  building_id, title, category, description,
  estimated_saving_kwh, estimated_saving_co2, investment_cost, currency,
  payback_years, status, priority_score, planned_year
) VALUES
(
  'c1000002-0002-4002-8002-000000000002',
  'Tilläggsisolering fasad + fönsterbyte',
  'envelope',
  'Minskar transmissionsförluster i K-märkt hus B. Kräver antikvarisk samråd.',
  180000, 12000, 4200000, 'SEK', 12.5, 'proposed', 0.82, 2027
),
(
  'c1000001-0001-4001-8001-000000000001',
  'Uppgradering ventilationsaggregat + VVX',
  'hvac',
  'Byte till roterande VVX, behovsstyrning (CO₂).',
  95000, 6500, 1850000, 'SEK', 7.2, 'approved', 0.71, 2026
),
(
  'c1000003-0003-4003-8003-000000000003',
  'LED-belysning lager + närvarostyrning',
  'lighting',
  'Byte av armaturer i logistikytor.',
  120000, 8000, 980000, 'SEK', 4.1, 'in_progress', 0.65, 2026
),
(
  'c1000005-0005-4005-8005-000000000005',
  'Solceller tak butikshus',
  'renewable',
  'Ca 120 kWp. Minskar köpt el, påverkar scope 2.',
  110000, 9000, 2100000, 'SEK', 9.0, 'proposed', 0.58, 2028
),
(
  'c1000006-0006-4006-8006-000000000006',
  'Beteendekampanj hyresgäster + nattkyla',
  'behaviour',
  'Låg investering, snabb payback.',
  25000, 1800, 120000, 'SEK', 2.5, 'proposed', 0.55, 2026
);

-- ---------------------------------------------------------------------------
-- Physical risks per fastighet
-- ---------------------------------------------------------------------------
INSERT INTO public.physical_risks (
  property_id, risk_type, probability, consequence, risk_score, source, assessed_at, notes
) VALUES
(
  'b1000001-0001-4001-8001-000000000001',
  'heat', 'medium', 'medium', 6.0,
  'SMHI klimatscenarier', '2025-06-01',
  'Ökad kyllast i innerstad, begränsad grönyta.'
),
(
  'b1000001-0001-4001-8001-000000000001',
  'flood', 'low', 'high', 5.0,
  'MSB översvämningskartering', '2025-06-01',
  'Närhet till Mälaren – låg sannolikhet, hög konsekvens.'
),
(
  'b1000002-0002-4002-8002-000000000002',
  'flood', 'medium', 'high', 8.0,
  'MSB / kommun', '2025-05-15',
  'Lindholmen – havsnivå och skyfall.'
),
(
  'b1000002-0002-4002-8002-000000000002',
  'storm', 'medium', 'medium', 6.0,
  'SMHI', '2025-05-15',
  'Exponerad kustnära lagerbyggnad.'
),
(
  'b1000003-0003-4003-8003-000000000003',
  'heat', 'high', 'medium', 7.5,
  'SMHI', '2025-04-20',
  'Malmö: fler värmeböljor, hög glasad andel.'
),
(
  'b1000003-0003-4003-8003-000000000003',
  'flood', 'medium', 'medium', 6.5,
  'VA Syd', '2025-04-20',
  'Skyfall i Västra Hamnen.'
);

COMMIT;

-- =============================================================================
-- BERÄKNA (kör efter COMMIT – kan köras separat)
-- =============================================================================
-- SELECT * FROM calculate_yearly_performance('c1000001-0001-4001-8001-000000000001', 2023);
-- SELECT * FROM calculate_yearly_performance('c1000001-0001-4001-8001-000000000001', 2024);
-- SELECT * FROM calculate_yearly_performance('c1000001-0001-4001-8001-000000000001', 2025);
-- ... för alla byggnader/år
--
-- Override-exempel (Hus B 2025 = INCOMPLETE):
-- SELECT * FROM calculate_yearly_performance(
--   'c1000002-0002-4002-8002-000000000002', 2025,
--   true, 'Pilot: godkänt av portföljchef – saknade höstmånader, värme ej material för Q-rapport'
-- );
--
-- Rapport:
-- SELECT b.name, pi.year, pi.data_gap_status, pi.data_completeness_percent,
--        pi.energy_intensity, pi.meps_2030_gap, pi.crrem_stranding_year
-- FROM performance_indicators pi
-- JOIN buildings b ON b.id = pi.building_id
-- WHERE b.id::text LIKE 'c100000%'
-- ORDER BY b.name, pi.year;
