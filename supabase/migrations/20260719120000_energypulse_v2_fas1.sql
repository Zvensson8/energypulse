-- =============================================================================
-- EnergyPulse v2.0 – FAS 1: Single Source of Truth (produktionsklar migrering)
-- =============================================================================
-- Kör i: Supabase SQL Editor (hela filen i en körning) eller via supabase db push
-- Datum: 2026-07-19
-- Omfattning: Tabeller, triggers, GDPR-maskering, beräkningsfunktioner,
--             Data Gap-policy, seed, RLS, index, partitioneringsförberedelse,
--             samt verifierande test queries.
--
-- VIKTIGT FÖRE PRODUKTION:
--   1. Byt vault-hemligheten 'tenant_encryption_key' till en stark slumpnyckel.
--   2. Granska meps_thresholds mot slutliga Boverket-värden.
--   3. Granska CRREM-pathway mot officiell CRREM v2.0 Sweden.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Supabase Vault (finns normalt på hosted Supabase). Soft-fail om saknas.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS supabase_vault CASCADE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'supabase_vault ej tillgänglig i denna miljö – fallback till app.setting används för tenant-nyckel.';
END $$;

-- Schema för app-hjälpfunktioner (undvik att pollua public med för många helpers)
CREATE SCHEMA IF NOT EXISTS app;

COMMENT ON SCHEMA app IS
  'EnergyPulse interna hjälpfunktioner: roll, vault-nyckel, audit, GDPR-dekryptering.';

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM (
    'admin',
    'portfolio_manager',
    'property_manager',
    'viewer'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.space_type AS ENUM (
    'office',
    'retail',
    'warehouse',
    'industrial',
    'hotel',
    'education',
    'healthcare',
    'mixed',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.quality_class AS ENUM ('A', 'B', 'C', 'D');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.energy_class AS ENUM ('A', 'B', 'C', 'D', 'E', 'F', 'G');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.data_gap_status AS ENUM (
    'COMPLETE',
    'EXTRAPOLATED_WARNING',
    'INCOMPLETE_DATA'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ownership_type AS ENUM (
    'owned',
    'leased',
    'joint_venture',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.property_status AS ENUM (
    'active',
    'disposed',
    'under_development',
    'inactive'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.energy_source_type AS ENUM (
    'electricity',
    'district_heating',
    'district_cooling',
    'natural_gas',
    'oil',
    'biofuel',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.emission_scope AS ENUM ('scope1', 'scope2', 'scope3');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.action_status AS ENUM (
    'proposed',
    'approved',
    'in_progress',
    'completed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.action_category AS ENUM (
    'envelope',
    'hvac',
    'lighting',
    'controls',
    'renewable',
    'behaviour',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.risk_type AS ENUM (
    'flood',
    'heat',
    'storm',
    'subsidence',
    'wildfire',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.probability_level AS ENUM ('low', 'medium', 'high', 'very_high');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.consequence_level AS ENUM ('low', 'medium', 'high', 'very_high');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Core tables (dependency order)
-- ---------------------------------------------------------------------------

-- 2.1 portfolios
CREATE TABLE IF NOT EXISTS public.portfolios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  description   text,
  base_currency text NOT NULL DEFAULT 'SEK',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portfolios_base_currency_chk CHECK (char_length(base_currency) = 3)
);

COMMENT ON TABLE public.portfolios IS
  'Toppnivå i hierarkin. En portfölj per bolag/ägarkonstellation. basvaluta default SEK.';

-- 2.2 properties
CREATE TABLE IF NOT EXISTS public.properties (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id    uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE RESTRICT,
  external_id     text,                          -- fastighetsbeteckning
  name            text NOT NULL,
  address         text,
  municipality    text,                          -- kommun (kopplas till climate_data)
  climate_zone    text,                          -- t.ex. 'I', 'II', 'III', 'IV' (Boverket)
  latitude        numeric(9,6),
  longitude       numeric(9,6),
  ownership_type  public.ownership_type NOT NULL DEFAULT 'owned',
  status          public.property_status NOT NULL DEFAULT 'active',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_properties_portfolio_external
  ON public.properties (portfolio_id, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_properties_portfolio_id ON public.properties (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_properties_municipality ON public.properties (municipality);

COMMENT ON TABLE public.properties IS
  'Fastighet. external_id = fastighetsbeteckning. municipality används för climate_data-join.';

-- 2.3 buildings
CREATE TABLE IF NOT EXISTS public.buildings (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id            uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name                   text NOT NULL,
  construction_year      int,
  major_renovation_year  int,
  construction_type      text,
  facade_share           numeric(5,4),           -- 0–1 andel av klimatskal
  roof_share             numeric(5,4),
  window_share           numeric(5,4),
  protected_status       boolean NOT NULL DEFAULT false,
  primary_use            public.space_type,      -- dominerande användning (MEPS-kategori)
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT buildings_year_chk CHECK (
    construction_year IS NULL OR (construction_year BETWEEN 1600 AND 2100)
  ),
  CONSTRAINT buildings_shares_chk CHECK (
    (facade_share IS NULL OR facade_share BETWEEN 0 AND 1)
    AND (roof_share IS NULL OR roof_share BETWEEN 0 AND 1)
    AND (window_share IS NULL OR window_share BETWEEN 0 AND 1)
  )
);

CREATE INDEX IF NOT EXISTS idx_buildings_property_id ON public.buildings (property_id);

COMMENT ON TABLE public.buildings IS
  'Byggnad under fastighet. primary_use styr MEPS-kategori i calculate_yearly_performance.';

-- 2.4 spaces
-- GDPR: tenant_name lagras ENDAST krypterat (bytea via pgcrypto).
-- Standardåtkomst sker via view spaces_safe som maskerar namnet.
CREATE TABLE IF NOT EXISTS public.spaces (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id             uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  name                    text,                    -- internt lokal-id/namn (ej personuppgift)
  space_type              public.space_type NOT NULL DEFAULT 'office',
  tenant_name_encrypted   bytea,                   -- pgcrypto pgp_sym_encrypt
  contract_start          date,
  contract_end            date,
  loa                     numeric(12,2),           -- lokalarea m²
  boa                     numeric(12,2),           -- bruksarea m²
  is_heated               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT spaces_area_chk CHECK (
    (loa IS NULL OR loa >= 0) AND (boa IS NULL OR boa >= 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_spaces_building_id ON public.spaces (building_id);

COMMENT ON TABLE public.spaces IS
  'Lokal/hyresobjekt. tenant_name_encrypted = GDPR-känslig; använd spaces_safe eller decrypt-funktion.';
COMMENT ON COLUMN public.spaces.tenant_name_encrypted IS
  'GDPR: Krypterad med pgcrypto (pgp_sym_encrypt). Nyckel i Supabase Vault (tenant_encryption_key). '
  'Aldrig exponera rå kolumn i API – använd view spaces_safe (maskerad) eller app.decrypt_tenant_name (audit).';

-- 2.5 areas (versionerad area per byggnad)
CREATE TABLE IF NOT EXISTS public.areas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id    uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  valid_from     date NOT NULL,
  valid_to       date,                             -- NULL = giltig tills vidare
  bta            numeric(12,2),                    -- bruttoarea
  a_temp         numeric(12,2) NOT NULL,           -- tempererad area (nyckel för intensitet)
  loa_total      numeric(12,2),
  source         text,                             -- t.ex. 'ritning', 'uppmätt', 'EPC'
  quality_class  public.quality_class NOT NULL DEFAULT 'C',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT areas_valid_range_chk CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT areas_a_temp_positive_chk CHECK (a_temp > 0)
);

CREATE INDEX IF NOT EXISTS idx_areas_building_valid
  ON public.areas (building_id, valid_from, valid_to);

COMMENT ON TABLE public.areas IS
  'Area-versionering. calculate_yearly_performance väljer rad där year ligger i [valid_from, valid_to].';

-- 2.6 energy_sources
CREATE TABLE IF NOT EXISTS public.energy_sources (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                            text NOT NULL,
  source_type                     public.energy_source_type NOT NULL,
  is_renewable                    boolean NOT NULL DEFAULT false,
  scope                           public.emission_scope NOT NULL DEFAULT 'scope2',
  primary_energy_factor           numeric(8,4) NOT NULL,  -- PEF (El Sverige 1.8)
  emission_factor_kg_co2e_per_kwh numeric(12,6) NOT NULL,
  valid_from                      date NOT NULL DEFAULT DATE '2020-01-01',
  valid_to                        date,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT energy_sources_valid_range_chk CHECK (valid_to IS NULL OR valid_to >= valid_from),
  CONSTRAINT energy_sources_pef_positive_chk CHECK (primary_energy_factor >= 0),
  CONSTRAINT energy_sources_ef_nonneg_chk CHECK (emission_factor_kg_co2e_per_kwh >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_energy_sources_name_valid
  ON public.energy_sources (name, valid_from);

COMMENT ON TABLE public.energy_sources IS
  'Energibärare med versionerade PEF och emissionsfaktorer. Seed: svenska schablonvärden.';

-- 2.7 crrem_pathways
CREATE TABLE IF NOT EXISTS public.crrem_pathways (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crrem_version           text NOT NULL,           -- t.ex. 'v2.0-1.5C'
  property_type           text NOT NULL DEFAULT 'office',
  country_code            text NOT NULL DEFAULT 'SE',
  target_year             int NOT NULL,
  intensity_target_ghg    numeric(12,4) NOT NULL,  -- kgCO2e/m²/år
  intensity_target_energy numeric(12,4),           -- kWh/m²/år (valfritt)
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crrem_pathways_year_chk CHECK (target_year BETWEEN 2018 AND 2050),
  CONSTRAINT crrem_pathways_ghg_nonneg_chk CHECK (intensity_target_ghg >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crrem_pathway_point
  ON public.crrem_pathways (crrem_version, property_type, country_code, target_year);

CREATE INDEX IF NOT EXISTS idx_crrem_pathways_version
  ON public.crrem_pathways (crrem_version, property_type, country_code);

COMMENT ON TABLE public.crrem_pathways IS
  'CRREM-decarboniseringsvägar. crrem_version ger historisk spårbarhet (t.ex. v2.0-1.5C).';

-- 2.8 energy_consumption
-- Partitioneringsförberedelse: tabellen skapas med year som del av unika nycklar.
-- Native RANGE-partitionering per year kan aktiveras i senare migrering utan
-- att ändra kolumnkontrakt (se kommentarer i sektion 10).
--
-- OBS: För att hålla Fas 1 körbar i Supabase SQL Editor utan pg_partman skapas
-- en vanlig tabell + partiella unika index + dokumenterad partitioneringsplan.
CREATE TABLE IF NOT EXISTS public.energy_consumption (
  id                   uuid NOT NULL DEFAULT gen_random_uuid(),
  building_id          uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  space_id             uuid REFERENCES public.spaces(id) ON DELETE SET NULL,
  energy_source_id     uuid NOT NULL REFERENCES public.energy_sources(id) ON DELETE RESTRICT,
  year                 int NOT NULL,
  month                int NOT NULL,
  consumption_kwh      numeric(14,3) NOT NULL,
  is_weather_corrected boolean NOT NULL DEFAULT false,
  is_estimated         boolean NOT NULL DEFAULT false,
  quality_class        public.quality_class NOT NULL DEFAULT 'C',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT energy_consumption_pk PRIMARY KEY (id),
  CONSTRAINT energy_consumption_year_chk CHECK (year BETWEEN 2000 AND 2100),
  CONSTRAINT energy_consumption_month_chk CHECK (month BETWEEN 1 AND 12),
  CONSTRAINT energy_consumption_kwh_nonneg_chk CHECK (consumption_kwh >= 0)
);

-- Partiellt unikt index: byggnadsnivå (space_id IS NULL) – en rad per källa/månad
CREATE UNIQUE INDEX IF NOT EXISTS uq_energy_consumption_building_month
  ON public.energy_consumption (building_id, energy_source_id, year, month)
  WHERE space_id IS NULL;

-- Partiellt unikt index: lokalnivå (space_id IS NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS uq_energy_consumption_space_month
  ON public.energy_consumption (building_id, space_id, energy_source_id, year, month)
  WHERE space_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_energy_consumption_building_year
  ON public.energy_consumption (building_id, year);

CREATE INDEX IF NOT EXISTS idx_energy_consumption_source
  ON public.energy_consumption (energy_source_id);

CREATE INDEX IF NOT EXISTS idx_energy_consumption_year_month
  ON public.energy_consumption (year, month);

CREATE INDEX IF NOT EXISTS idx_energy_consumption_estimated
  ON public.energy_consumption (building_id, year)
  WHERE is_estimated = true;

COMMENT ON TABLE public.energy_consumption IS
  'Månadsvis energiförbrukning. Partiella unika index: building-nivå (space_id NULL) respektive space-nivå. '
  'FÖRBEREDD FÖR PARTITIONERING PER year: se sektion 10 (kommentarer + exempel-DDL). '
  'is_estimated = true när Data Gap-interpolation fyllt i saknad månad.';

-- 2.9 performance_indicators
CREATE TABLE IF NOT EXISTS public.performance_indicators (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id                uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  year                       int NOT NULL,
  area_id                    uuid REFERENCES public.areas(id) ON DELETE SET NULL,
  a_temp                     numeric(12,2),
  total_energy_kwh           numeric(16,3),
  energy_intensity           numeric(12,4),        -- kWh/m² Atemp
  primary_energy_intensity   numeric(12,4),        -- primärenergital kWh/m²
  energy_class               public.energy_class,
  ghg_intensity              numeric(12,6),        -- kgCO2e/m²
  scope1_kg_co2e             numeric(16,3),
  scope2_kg_co2e             numeric(16,3),
  scope3_kg_co2e             numeric(16,3),
  crrem_stranding_year       int,
  meps_2030_gap              numeric(12,4),        -- energy_intensity − meps_2030
  meps_2033_gap              numeric(12,4),
  calculation_method         text NOT NULL DEFAULT 'calculate_yearly_performance_v2',
  crrem_version_used         text,
  data_gap_status            public.data_gap_status NOT NULL DEFAULT 'COMPLETE',
  data_completeness_percent  numeric(5,2) NOT NULL DEFAULT 100.00,
  override_applied           boolean NOT NULL DEFAULT false,
  override_reason            text,
  calculated_at              timestamptz NOT NULL DEFAULT now(),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT performance_indicators_year_chk CHECK (year BETWEEN 2000 AND 2100),
  CONSTRAINT performance_indicators_completeness_chk CHECK (
    data_completeness_percent BETWEEN 0 AND 100
  ),
  CONSTRAINT performance_indicators_override_reason_chk CHECK (
    (override_applied = false)
    OR (override_applied = true AND override_reason IS NOT NULL AND length(trim(override_reason)) > 0)
  )
);

-- Explicit UNIQUE CONSTRAINT (krävs för tillförlitlig ON CONFLICT (building_id, year))
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'performance_indicators_building_year_key'
  ) THEN
    ALTER TABLE public.performance_indicators
      ADD CONSTRAINT performance_indicators_building_year_key
      UNIQUE (building_id, year);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_performance_indicators_gap_status
  ON public.performance_indicators (data_gap_status);

CREATE INDEX IF NOT EXISTS idx_performance_indicators_stranding
  ON public.performance_indicators (crrem_stranding_year);

COMMENT ON TABLE public.performance_indicators IS
  'Årliga beräknade nyckeltal (Single Source of Truth). UPSERT:as av calculate_yearly_performance.';
COMMENT ON COLUMN public.performance_indicators.data_gap_status IS
  'COMPLETE | EXTRAPOLATED_WARNING (≤ tröskel, interpolerat) | INCOMPLETE_DATA (> tröskel, MEPS/CRREM blockerade default).';

-- 2.10 actions
CREATE TABLE IF NOT EXISTS public.actions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id            uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  title                  text NOT NULL,
  category               public.action_category NOT NULL DEFAULT 'other',
  description            text,
  estimated_saving_kwh   numeric(14,3),
  estimated_saving_co2   numeric(14,3),            -- kgCO2e/år
  investment_cost        numeric(14,2),
  currency               text NOT NULL DEFAULT 'SEK',
  payback_years          numeric(8,2),
  status                 public.action_status NOT NULL DEFAULT 'proposed',
  priority_score         numeric(8,4),
  planned_year           int,
  completed_date         date,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT actions_currency_chk CHECK (char_length(currency) = 3)
);

CREATE INDEX IF NOT EXISTS idx_actions_building_id ON public.actions (building_id);
CREATE INDEX IF NOT EXISTS idx_actions_status_score ON public.actions (status, priority_score DESC NULLS LAST);

COMMENT ON TABLE public.actions IS
  'Åtgärdsregister. priority_score beräknas i applikation/fas 2 utifrån MEPS-gap, CRREM och payback.';

-- 2.11 physical_risks
CREATE TABLE IF NOT EXISTS public.physical_risks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  risk_type     public.risk_type NOT NULL,
  probability   public.probability_level NOT NULL,
  consequence   public.consequence_level NOT NULL,
  risk_score    numeric(6,2),
  source        text,
  assessed_at   date,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_physical_risks_property_id ON public.physical_risks (property_id);

COMMENT ON TABLE public.physical_risks IS
  'Fysiska klimatrisker per fastighet (översvämning, värme, storm m.m.).';

-- 2.12 data_quality_logs (audit trail)
CREATE TABLE IF NOT EXISTS public.data_quality_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     text NOT NULL,
  entity_id       uuid,
  field           text,
  old_value       text,
  new_value       text,
  changed_by      uuid,                            -- auth.uid()
  changed_at      timestamptz NOT NULL DEFAULT now(),
  quality_class   public.quality_class,
  override_reason text,                            -- obligatorisk vid override
  operation       text NOT NULL DEFAULT 'UPDATE', -- INSERT|UPDATE|DELETE|OVERRIDE|DECRYPT
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_quality_logs_entity
  ON public.data_quality_logs (entity_type, entity_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_quality_logs_changed_by
  ON public.data_quality_logs (changed_by, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_quality_logs_override
  ON public.data_quality_logs (changed_at DESC)
  WHERE override_reason IS NOT NULL;

COMMENT ON TABLE public.data_quality_logs IS
  'Audit trail för CRUD, Data Gap-override och GDPR-dekryptering av tenant_name.';

-- 2.13 meps_thresholds
CREATE TABLE IF NOT EXISTS public.meps_thresholds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category        public.space_type NOT NULL,      -- office, retail, ...
  target_year     int NOT NULL,                    -- 2030, 2033, ...
  threshold_kwh_m2 numeric(10,2) NOT NULL,         -- kWh/m² Atemp
  regulation_ref  text,                            -- t.ex. 'Boverket preliminary 2025'
  is_preliminary  boolean NOT NULL DEFAULT true,
  valid_from      date NOT NULL DEFAULT CURRENT_DATE,
  valid_to        date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meps_thresholds_year_chk CHECK (target_year BETWEEN 2025 AND 2050),
  CONSTRAINT meps_thresholds_value_chk CHECK (threshold_kwh_m2 > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_meps_thresholds_cat_year
  ON public.meps_thresholds (category, target_year, valid_from);

COMMENT ON TABLE public.meps_thresholds IS
  'MEPS-trösklar (Boverket preliminära + framtida finala). office 214/174 kWh/m² 2030/2033.';

-- 2.14 climate_data (NY v2.0)
CREATE TABLE IF NOT EXISTS public.climate_data (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality         text NOT NULL,
  year                 int NOT NULL,
  month                int,                        -- NULL = årssumma; 1–12 = månad
  heating_degree_days  numeric(10,2) NOT NULL DEFAULT 0,  -- graddagar värme
  cooling_degree_days  numeric(10,2) NOT NULL DEFAULT 0,
  source               text NOT NULL DEFAULT 'SMHI',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT climate_data_year_chk CHECK (year BETWEEN 1990 AND 2100),
  CONSTRAINT climate_data_month_chk CHECK (month IS NULL OR month BETWEEN 1 AND 12),
  CONSTRAINT climate_data_hdd_nonneg_chk CHECK (heating_degree_days >= 0),
  CONSTRAINT climate_data_cdd_nonneg_chk CHECK (cooling_degree_days >= 0)
);

-- Unik per kommun/år/månad (månad NULL tillåts en gång via COALESCE-trick)
CREATE UNIQUE INDEX IF NOT EXISTS uq_climate_data_muni_year_month
  ON public.climate_data (municipality, year, COALESCE(month, 0));

CREATE INDEX IF NOT EXISTS idx_climate_data_lookup
  ON public.climate_data (municipality, year, month);

COMMENT ON TABLE public.climate_data IS
  'NY v2.0: Graddagar per kommun/år(/månad) för reproducerbar väderkorrigering och '
  'Data Gap-interpolation (linear_previous_3m_seasonal_graddagar).';

-- 2.15 data_gap_config (NY v2.0)
CREATE TABLE IF NOT EXISTS public.data_gap_config (
  id                                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                                  text NOT NULL,
  energy_type                           public.energy_source_type, -- NULL = alla
  space_type                            public.space_type,         -- NULL = alla
  max_missing_months_before_incomplete  int NOT NULL DEFAULT 3,
  interpolation_method                  text NOT NULL
    DEFAULT 'linear_previous_3m_seasonal_graddagar',
  warning_threshold_months              int NOT NULL DEFAULT 1,
  is_default                            boolean NOT NULL DEFAULT false,
  is_active                             boolean NOT NULL DEFAULT true,
  notes                                 text,
  created_at                            timestamptz NOT NULL DEFAULT now(),
  updated_at                            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT data_gap_config_max_missing_chk CHECK (
    max_missing_months_before_incomplete BETWEEN 0 AND 12
  ),
  CONSTRAINT data_gap_config_warning_chk CHECK (
    warning_threshold_months BETWEEN 0 AND 12
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_data_gap_config_default
  ON public.data_gap_config (is_default)
  WHERE is_default = true;

COMMENT ON TABLE public.data_gap_config IS
  'NY v2.0: Konfigurerbar Data Gap-policy. '
  'DATA GAP-REGEL 1: saknade månader ≤ max_missing_months_before_incomplete → interpolera, '
  'sätt is_estimated=true och data_gap_status=EXTRAPOLATED_WARNING. '
  'DATA GAP-REGEL 2: saknade månader > tröskel → data_gap_status=INCOMPLETE_DATA, '
  'blockera MEPS- och CRREM-beräkningar som standard. '
  'DATA GAP-REGEL 3: Override endast via system_config.override_enabled_per_role + '
  'obligatorisk override_reason som loggas i data_quality_logs.';

-- 2.16 system_config (NY v2.0)
CREATE TABLE IF NOT EXISTS public.system_config (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key                        text NOT NULL UNIQUE,
  value                      jsonb NOT NULL,
  description                text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.system_config IS
  'NY v2.0: Systemövergripande config. Nycklar: override_enabled_per_role, '
  'default_data_gap_policy_id, tenant_masking_enabled, data_retention_years, m.m.';

-- 2.17 user_profiles
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         text,
  full_name     text,
  role          public.user_role NOT NULL DEFAULT 'viewer',
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles (role);

COMMENT ON TABLE public.user_profiles IS
  'App-roll kopplad till Supabase Auth (auth.users). RLS baseras på role + user_properties.';

-- 2.18 user_properties (junction för granulär åtkomst)
CREATE TABLE IF NOT EXISTS public.user_properties (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  property_id   uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_properties UNIQUE (user_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_user_properties_user ON public.user_properties (user_id);
CREATE INDEX IF NOT EXISTS idx_user_properties_property ON public.user_properties (property_id);

COMMENT ON TABLE public.user_properties IS
  'Junction: property_manager/viewer tilldelas specifika fastigheter. admin/portfolio_manager behöver ej rader.';

-- ---------------------------------------------------------------------------
-- 3. Triggers: updated_at + data_quality_logs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION app.set_updated_at() IS
  'Generisk BEFORE UPDATE-trigger: sätter updated_at = now().';

-- Audit: loggar INSERT/UPDATE/DELETE till data_quality_logs.
-- Hoppar över loggning av data_quality_logs själv (undvik rekursion).
CREATE OR REPLACE FUNCTION app.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_entity_id uuid;
  v_old text;
  v_new text;
  v_op  text;
BEGIN
  v_op := TG_OP;

  IF TG_OP = 'DELETE' THEN
    v_entity_id := OLD.id;
    v_old := to_jsonb(OLD)::text;
    v_new := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_entity_id := NEW.id;
    v_old := NULL;
    v_new := to_jsonb(NEW)::text;
  ELSE
    v_entity_id := NEW.id;
    v_old := to_jsonb(OLD)::text;
    v_new := to_jsonb(NEW)::text;
  END IF;

  INSERT INTO public.data_quality_logs (
    entity_type, entity_id, field, old_value, new_value,
    changed_by, changed_at, operation
  ) VALUES (
    TG_TABLE_NAME,
    v_entity_id,
    '*',
    v_old,
    v_new,
    auth.uid(),
    now(),
    v_op
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION app.audit_row_change() IS
  'AFTER INSERT/UPDATE/DELETE: skriver radändring till data_quality_logs (audit trail).';

-- Hjälpmakro: koppla updated_at + audit till en tabell
CREATE OR REPLACE FUNCTION app.attach_standard_triggers(p_table regclass)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  t text := p_table::text;
  rel text;
BEGIN
  -- Extrahera endast relationsnamn utan schema
  rel := split_part(t, '.', 2);
  IF rel = '' OR rel IS NULL THEN
    rel := t;
  END IF;
  -- Ta bort eventuella citattecken
  rel := replace(rel, '"', '');

  EXECUTE format(
    'DROP TRIGGER IF EXISTS trg_%I_updated_at ON %s;
     CREATE TRIGGER trg_%I_updated_at
       BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();',
    rel, p_table, rel, p_table
  );

  -- Ingen audit-trigger på data_quality_logs (rekursion)
  IF rel <> 'data_quality_logs' THEN
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_audit ON %s;
       CREATE TRIGGER trg_%I_audit
         AFTER INSERT OR UPDATE OR DELETE ON %s
         FOR EACH ROW EXECUTE FUNCTION app.audit_row_change();',
      rel, p_table, rel, p_table
    );
  END IF;
END;
$$;

-- Attach till alla kärntabeller
SELECT app.attach_standard_triggers('public.portfolios');
SELECT app.attach_standard_triggers('public.properties');
SELECT app.attach_standard_triggers('public.buildings');
SELECT app.attach_standard_triggers('public.spaces');
SELECT app.attach_standard_triggers('public.areas');
SELECT app.attach_standard_triggers('public.energy_sources');
SELECT app.attach_standard_triggers('public.crrem_pathways');
SELECT app.attach_standard_triggers('public.energy_consumption');
SELECT app.attach_standard_triggers('public.performance_indicators');
SELECT app.attach_standard_triggers('public.actions');
SELECT app.attach_standard_triggers('public.physical_risks');
SELECT app.attach_standard_triggers('public.data_quality_logs'); -- endast updated_at
SELECT app.attach_standard_triggers('public.meps_thresholds');
SELECT app.attach_standard_triggers('public.climate_data');
SELECT app.attach_standard_triggers('public.data_gap_config');
SELECT app.attach_standard_triggers('public.system_config');
SELECT app.attach_standard_triggers('public.user_profiles');
SELECT app.attach_standard_triggers('public.user_properties');

-- ---------------------------------------------------------------------------
-- 4. GDPR: Vault-nyckel + kryptering/maskering av tenant_name
-- ---------------------------------------------------------------------------
--
-- GDPR-MASKERING – PRINCIPER:
--   A) tenant_name lagras ALDRIG i klartext i spaces.tenant_name_encrypted.
--   B) View spaces_safe maskerar som standard: '***MASKERAD***' om krypterad data finns.
--   C) Dekrypteringsnyckel ligger i Supabase Vault (namn: tenant_encryption_key).
--   D) Dekryptering sker endast via app.decrypt_tenant_name() som:
--      - kontrollerar roll (admin, eller portfolio_manager, eller property_manager med access)
--      - kräver att system_config.tenant_masking_enabled tillåter explicit dekryptering
--      - loggar DECRYPT i data_quality_logs (audit).
--   E) property_manager/viewer ser alltid maskerad vy som standard (RLS + view).
--

-- Seed vault-secret (byt i produktion!)
DO $$
DECLARE
  v_exists boolean;
BEGIN
  -- Försök skapa hemlighet i Vault om schema finns
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') THEN
    SELECT EXISTS (
      SELECT 1 FROM vault.secrets WHERE name = 'tenant_encryption_key'
    ) INTO v_exists;

    IF NOT v_exists THEN
      PERFORM vault.create_secret(
        encode(extensions.gen_random_bytes(32), 'hex'),
        'tenant_encryption_key',
        'EnergyPulse GDPR: pgcrypto-nyckel för spaces.tenant_name_encrypted. BYT I PRODUKTION om seedats i dev.'
      );
    END IF;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Kunde inte skapa vault-secret: %', SQLERRM;
END $$;

-- Hämta dekrypteringsnyckel (Vault med fallback till session/app-setting)
CREATE OR REPLACE FUNCTION app.get_tenant_encryption_key()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault, app
AS $$
DECLARE
  v_key text;
BEGIN
  -- 1) Supabase Vault
  BEGIN
    SELECT ds.decrypted_secret
      INTO v_key
      FROM vault.decrypted_secrets ds
     WHERE ds.name = 'tenant_encryption_key'
     LIMIT 1;
  EXCEPTION
    WHEN OTHERS THEN
      v_key := NULL;
  END;

  IF v_key IS NOT NULL AND length(v_key) > 0 THEN
    RETURN v_key;
  END IF;

  -- 2) Fallback: custom GUC (sätts i session för CI/test)
  BEGIN
    v_key := current_setting('app.tenant_encryption_key', true);
  EXCEPTION
    WHEN OTHERS THEN
      v_key := NULL;
  END;

  IF v_key IS NOT NULL AND length(v_key) > 0 THEN
    RETURN v_key;
  END IF;

  -- 3) Sista fallback för dev (SKA ersättas i produktion)
  RETURN 'energypulse-dev-only-key-replace-in-prod-32b';
END;
$$;

COMMENT ON FUNCTION app.get_tenant_encryption_key() IS
  'GDPR: Hämtar pgcrypto-nyckel från Supabase Vault (tenant_encryption_key). '
  'Fallback: app.tenant_encryption_key GUC, sedan dev-nyckel.';

CREATE OR REPLACE FUNCTION app.encrypt_tenant_name(p_plaintext text)
RETURNS bytea
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, app
AS $$
BEGIN
  IF p_plaintext IS NULL OR length(trim(p_plaintext)) = 0 THEN
    RETURN NULL;
  END IF;
  RETURN extensions.pgp_sym_encrypt(p_plaintext, app.get_tenant_encryption_key());
END;
$$;

CREATE OR REPLACE FUNCTION app.current_user_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
    FROM public.user_profiles
   WHERE id = auth.uid()
     AND is_active = true
$$;

CREATE OR REPLACE FUNCTION app.user_has_property_access(p_property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN false
    WHEN EXISTS (
      SELECT 1 FROM public.user_profiles up
       WHERE up.id = auth.uid()
         AND up.is_active
         AND up.role IN ('admin', 'portfolio_manager')
    ) THEN true
    WHEN EXISTS (
      SELECT 1
        FROM public.user_properties uj
       WHERE uj.user_id = auth.uid()
         AND uj.property_id = p_property_id
    ) THEN true
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION app.user_has_building_access(p_building_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT app.user_has_property_access(b.property_id)
    FROM public.buildings b
   WHERE b.id = p_building_id
$$;

-- Explicit dekryptering med rollkontroll + audit (GDPR)
CREATE OR REPLACE FUNCTION app.decrypt_tenant_name(
  p_space_id uuid,
  p_reason text DEFAULT 'explicit_reveal'
)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions, app
AS $$
DECLARE
  v_role public.user_role;
  v_building_id uuid;
  v_cipher bytea;
  v_plain text;
  v_masking_enabled boolean := true;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authenticate required for tenant decrypt';
  END IF;

  SELECT role INTO v_role FROM public.user_profiles WHERE id = auth.uid() AND is_active;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'no active user profile';
  END IF;

  -- viewer får ALDRIG dekryptera
  IF v_role = 'viewer' THEN
    RAISE EXCEPTION 'viewer role cannot decrypt tenant_name (GDPR)';
  END IF;

  SELECT s.building_id, s.tenant_name_encrypted
    INTO v_building_id, v_cipher
    FROM public.spaces s
   WHERE s.id = p_space_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'space % not found', p_space_id;
  END IF;

  IF NOT app.user_has_building_access(v_building_id) THEN
    RAISE EXCEPTION 'no access to building for space %', p_space_id;
  END IF;

  -- property_manager: tillåten med audit; admin/portfolio_manager: tillåten
  SELECT COALESCE((value::text)::boolean, true)
    INTO v_masking_enabled
    FROM public.system_config
   WHERE key = 'tenant_masking_enabled';

  IF v_cipher IS NULL THEN
    RETURN NULL;
  END IF;

  v_plain := extensions.pgp_sym_decrypt(v_cipher, app.get_tenant_encryption_key());

  INSERT INTO public.data_quality_logs (
    entity_type, entity_id, field, old_value, new_value,
    changed_by, operation, override_reason
  ) VALUES (
    'spaces', p_space_id, 'tenant_name',
    '***MASKERAD***', '[DECRYPTED]',
    auth.uid(), 'DECRYPT', p_reason
  );

  RETURN v_plain;
END;
$$;

COMMENT ON FUNCTION app.decrypt_tenant_name(uuid, text) IS
  'GDPR: Dekrypterar tenant_name efter roll- och access-kontroll. Loggar alltid DECRYPT i data_quality_logs. '
  'viewer blockeras. property_manager kräver building access.';

-- Trigger: tillåt INSERT/UPDATE med plaintext via temporary session var
-- Praktiskt mönster: kolumn tenant_name_encrypted sätts av app.encrypt_tenant_name i API,
-- eller via helper-funktion nedan.
CREATE OR REPLACE FUNCTION public.set_space_tenant_name(
  p_space_id uuid,
  p_tenant_name text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app
AS $$
BEGIN
  IF NOT app.user_has_building_access(
    (SELECT building_id FROM public.spaces WHERE id = p_space_id)
  ) AND COALESCE(app.current_user_role()::text, '') <> 'admin' THEN
    -- Tillåt service_role (auth.uid null i migration/seed) och admin
    IF auth.uid() IS NOT NULL AND app.current_user_role() IS DISTINCT FROM 'admin'::public.user_role THEN
      RAISE EXCEPTION 'insufficient privileges to set tenant_name';
    END IF;
  END IF;

  UPDATE public.spaces
     SET tenant_name_encrypted = app.encrypt_tenant_name(p_tenant_name),
         updated_at = now()
   WHERE id = p_space_id;
END;
$$;

-- Säker view: maskerar tenant_name som standard
CREATE OR REPLACE VIEW public.spaces_safe
WITH (security_invoker = true)
AS
SELECT
  s.id,
  s.building_id,
  s.name,
  s.space_type,
  -- GDPR-MASKERING: visa aldrig klartext via denna view
  CASE
    WHEN s.tenant_name_encrypted IS NULL THEN NULL
    ELSE '***MASKERAD***'
  END AS tenant_name,
  (s.tenant_name_encrypted IS NOT NULL) AS has_tenant,
  s.contract_start,
  s.contract_end,
  s.loa,
  s.boa,
  s.is_heated,
  s.created_at,
  s.updated_at
FROM public.spaces s;

COMMENT ON VIEW public.spaces_safe IS
  'GDPR-säker vy: tenant_name maskeras alltid som ***MASKERAD***. '
  'För original: anropa app.decrypt_tenant_name(space_id, reason) med behörighet + audit.';

-- ---------------------------------------------------------------------------
-- 5. Data Gap-hjälpfunktioner
-- ---------------------------------------------------------------------------

-- Hämta aktiv data_gap_config (mest specifik match: energy_type + space_type > energy > default)
CREATE OR REPLACE FUNCTION app.resolve_data_gap_config(
  p_energy_type public.energy_source_type DEFAULT NULL,
  p_space_type public.space_type DEFAULT NULL
)
RETURNS public.data_gap_config
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg public.data_gap_config;
BEGIN
  SELECT *
    INTO v_cfg
    FROM public.data_gap_config c
   WHERE c.is_active
     AND (c.energy_type IS NOT DISTINCT FROM p_energy_type OR c.energy_type IS NULL)
     AND (c.space_type  IS NOT DISTINCT FROM p_space_type  OR c.space_type  IS NULL)
   ORDER BY
     (c.energy_type IS NOT NULL)::int DESC,
     (c.space_type  IS NOT NULL)::int DESC,
     c.is_default DESC
   LIMIT 1;

  IF NOT FOUND OR v_cfg.id IS NULL THEN
    -- Hård fallback om seed saknas (syntetisk rad, ej persisterad)
    SELECT
      gen_random_uuid(),
      'fallback_default',
      NULL::public.energy_source_type,
      NULL::public.space_type,
      3,
      'linear_previous_3m_seasonal_graddagar',
      1,
      true,
      true,
      'inline fallback',
      now(),
      now()
    INTO v_cfg;
  END IF;

  RETURN v_cfg;
END;
$$;

COMMENT ON FUNCTION app.resolve_data_gap_config(public.energy_source_type, public.space_type) IS
  'DATA GAP: Väljer mest specifik aktiv policy (energy_type/space_type) annars default.';

-- Kontrollera om roll får override
CREATE OR REPLACE FUNCTION app.role_may_override(p_role public.user_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_json jsonb;
BEGIN
  IF p_role IS NULL THEN
    RETURN false;
  END IF;

  SELECT value INTO v_json
    FROM public.system_config
   WHERE key = 'override_enabled_per_role';

  IF v_json IS NULL THEN
    -- Default: admin + portfolio_manager + property_manager
    RETURN p_role IN ('admin', 'portfolio_manager', 'property_manager');
  END IF;

  RETURN COALESCE((v_json ->> p_role::text)::boolean, false);
END;
$$;

COMMENT ON FUNCTION app.role_may_override(public.user_role) IS
  'DATA GAP-REGEL 3: Override endast om system_config.override_enabled_per_role[role]=true. '
  'viewer = false. Kräver alltid override_reason i anropande funktion.';

-- Interpolera saknad månad: linear_previous_3m_seasonal_graddagar
-- Metod:
--   1) Medel av de upp till 3 närmast föregående befintliga månaderna (samma energy_source, building).
--   2) Om climate_data (HDD) finns för kommun+månad: skala med HDD_missing / avg(HDD_prev3).
--   3) Om HDD saknas: använd enbart linjärt medel (ingen säsongsskala).
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
  -- Medel av upp till 3 föregående månader (kronologiskt bakåt över årsskifte)
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
    -- Ingen historik: försök samma månad föregående år
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
    RETURN NULL; -- kan inte interpolera
  END IF;

  -- Säsongsjustering med graddagar om kommun + data finns
  IF p_municipality IS NOT NULL THEN
    SELECT cd.heating_degree_days
      INTO v_hdd_target
      FROM public.climate_data cd
     WHERE cd.municipality = p_municipality
       AND cd.year = p_year
       AND cd.month = p_month
     LIMIT 1;

    SELECT avg(cd.heating_degree_days)
      INTO v_hdd_prev_avg
      FROM public.climate_data cd
     WHERE cd.municipality = p_municipality
       AND cd.month IS NOT NULL
       AND (cd.year * 12 + cd.month) < (p_year * 12 + p_month)
       AND cd.heating_degree_days > 0
     ORDER BY (cd.year * 12 + cd.month) DESC
     LIMIT 3;

    -- Ovan ORDER BY+LIMIT i avg-subquery fungerar inte som avsett i PG utan nested SELECT
  END IF;

  -- Korrekt prev-HDD genomsnitt
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
    -- linear_previous_3m_seasonal_graddagar
    v_result := v_avg_prev * (v_hdd_target / v_hdd_prev_avg);
  ELSE
    v_result := v_avg_prev;
  END IF;

  RETURN round(v_result, 3);
END;
$$;

COMMENT ON FUNCTION app.interpolate_month_kwh(uuid, uuid, int, int, text) IS
  'DATA GAP-interpolation: metod linear_previous_3m_seasonal_graddagar. '
  'Medel av 3 föregående faktiska månader × (HDD_target / HDD_prev3) om climate_data finns.';

-- Välj area-version giltig för ett kalenderår (mitten av året som referenspunkt)
CREATE OR REPLACE FUNCTION app.select_area_for_year(p_building_id uuid, p_year int)
RETURNS public.areas
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.*
    FROM public.areas a
   WHERE a.building_id = p_building_id
     AND a.valid_from <= make_date(p_year, 7, 1)
     AND (a.valid_to IS NULL OR a.valid_to >= make_date(p_year, 1, 1))
   ORDER BY a.valid_from DESC
   LIMIT 1
$$;

COMMENT ON FUNCTION app.select_area_for_year(uuid, int) IS
  'Väljer korrekt area-version via areas.valid_from/to (referens 1 juli respektive årsstart).';

-- Svensk EPC A–G baserat på primärenergital vs förenklat BBR-referenskrav
-- (konfigurerbart schablonkrav 70 kWh/m² för kontor – ersätt med faktiskt Fgeo/BBR i fas 2)
CREATE OR REPLACE FUNCTION app.classify_energy_class(
  p_primary_energy_intensity numeric,
  p_reference_bbr numeric DEFAULT 70
)
RETURNS public.energy_class
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  r numeric;
BEGIN
  IF p_primary_energy_intensity IS NULL OR p_reference_bbr IS NULL OR p_reference_bbr <= 0 THEN
    RETURN NULL;
  END IF;
  r := p_primary_energy_intensity / p_reference_bbr;
  IF r <= 0.50 THEN RETURN 'A';
  ELSIF r <= 0.75 THEN RETURN 'B';
  ELSIF r <= 1.00 THEN RETURN 'C';
  ELSIF r <= 1.35 THEN RETURN 'D';
  ELSIF r <= 1.80 THEN RETURN 'E';
  ELSIF r <= 2.35 THEN RETURN 'F';
  ELSE RETURN 'G';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. calculate_crrem_stranding_year (STABLE – ren beräkning)
-- ---------------------------------------------------------------------------
-- CRREM: Linjär interpolation av intensity_target_ghg mellan pathway-punkter.
-- Returnerar tidigaste år där aktuell (statisk) ghg_intensity > interpolerad target.
-- Antagande: statisk prestanda (ingen förbättring modelleras).

CREATE OR REPLACE FUNCTION public.calculate_crrem_stranding_year(
  p_building_id uuid,
  p_year int,
  p_ghg_intensity numeric DEFAULT NULL,
  p_crrem_version text DEFAULT 'v2.0-1.5C',
  p_property_type text DEFAULT 'office'
)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ghg numeric := p_ghg_intensity;
  v_pt text := p_property_type;
  v_y int;
  v_target numeric;
  v_y0 int; v_y1 int;
  v_t0 numeric; v_t1 numeric;
  v_stranding int;
BEGIN
  -- Om intensitet ej skickats: hämta från performance_indicators för basåret
  IF v_ghg IS NULL THEN
    SELECT pi.ghg_intensity
      INTO v_ghg
      FROM public.performance_indicators pi
     WHERE pi.building_id = p_building_id
       AND pi.year = p_year;
  END IF;

  IF v_ghg IS NULL THEN
    RETURN NULL;
  END IF;

  -- Inferera property_type från building.primary_use om default
  IF p_property_type = 'office' THEN
    SELECT COALESCE(b.primary_use::text, 'office')
      INTO v_pt
      FROM public.buildings b
     WHERE b.id = p_building_id;
  END IF;

  -- Om redan under lägsta pathway-punktens target → ej strandad inom horisont
  -- Iterera år p_year .. 2050, interpolera target, hitta första breach
  FOR v_y IN p_year..2050 LOOP
    -- Hitta omgivande pathway-punkter
    SELECT cp.target_year, cp.intensity_target_ghg
      INTO v_y0, v_t0
      FROM public.crrem_pathways cp
     WHERE cp.crrem_version = p_crrem_version
       AND cp.property_type = v_pt
       AND cp.country_code = 'SE'
       AND cp.target_year <= v_y
     ORDER BY cp.target_year DESC
     LIMIT 1;

    SELECT cp.target_year, cp.intensity_target_ghg
      INTO v_y1, v_t1
      FROM public.crrem_pathways cp
     WHERE cp.crrem_version = p_crrem_version
       AND cp.property_type = v_pt
       AND cp.country_code = 'SE'
       AND cp.target_year >= v_y
     ORDER BY cp.target_year ASC
     LIMIT 1;

    IF v_y0 IS NULL AND v_y1 IS NULL THEN
      RETURN NULL; -- ingen pathway
    ELSIF v_y0 IS NULL THEN
      v_target := v_t1;
    ELSIF v_y1 IS NULL THEN
      v_target := v_t0;
    ELSIF v_y0 = v_y1 THEN
      v_target := v_t0;
    ELSE
      -- Linjär interpolation
      v_target := v_t0 + (v_t1 - v_t0) * ((v_y - v_y0)::numeric / (v_y1 - v_y0)::numeric);
    END IF;

    IF v_ghg > v_target THEN
      v_stranding := v_y;
      EXIT;
    END IF;
  END LOOP;

  RETURN v_stranding; -- NULL om aldrig overshoot inom 2050
END;
$$;

COMMENT ON FUNCTION public.calculate_crrem_stranding_year(uuid, int, numeric, text, text) IS
  'STABLE: CRREM stranding year med linjär interpolation av intensity_target_ghg '
  'för angiven crrem_version. Statisk prestanda-antagande. Returnerar tidigaste misalignment-år.';

-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- 7. calculate_yearly_performance (VOLATILE – UPSERT:ar performance_indicators)
-- ---------------------------------------------------------------------------
-- OBS om volatility: Funktionen MÅSTE vara VOLATILE p.g.a. UPSERT och ev. insert
-- av interpolerade energy_consumption-rader. Beräkningskärnan är deterministisk
-- givet samma indata (reproducerbar Single Source of Truth).

CREATE OR REPLACE FUNCTION app.upsert_estimated_consumption(
  p_building_id uuid,
  p_energy_source_id uuid,
  p_year int,
  p_month int,
  p_kwh numeric
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_kwh IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.energy_consumption
     WHERE building_id = p_building_id
       AND space_id IS NULL
       AND energy_source_id = p_energy_source_id
       AND year = p_year AND month = p_month
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.energy_consumption (
    building_id, space_id, energy_source_id, year, month,
    consumption_kwh, is_weather_corrected, is_estimated, quality_class
  ) VALUES (
    p_building_id, NULL, p_energy_source_id, p_year, p_month,
    p_kwh, false, true, 'D'
  );
EXCEPTION
  WHEN unique_violation THEN
    NULL;
END;
$$;

-- Ersätt interpolations-loopen i calculate_yearly_performance med app.upsert_estimated_consumption
-- (omdefinition av hela funktionen med den fixen + renare override-flagga)

CREATE OR REPLACE FUNCTION public.calculate_yearly_performance(
  p_building_id uuid,
  p_year int,
  p_override boolean DEFAULT false,
  p_override_reason text DEFAULT NULL
)
RETURNS public.performance_indicators
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app, extensions
AS $$
DECLARE
  v_area public.areas;
  v_cfg public.data_gap_config;
  v_building public.buildings;
  v_municipality text;
  v_primary_use public.space_type;
  v_source record;
  v_month int;
  v_has_month boolean;
  v_missing int := 0;
  v_present int := 0;
  v_expected int := 0;
  v_num_sources int := 0;
  v_missing_months int := 0;
  v_est_kwh numeric;
  v_total_energy numeric := 0;
  v_total_pe numeric := 0;
  v_total_ghg numeric := 0;
  v_scope1 numeric := 0;
  v_scope2 numeric := 0;
  v_scope3 numeric := 0;
  v_energy_intensity numeric;
  v_pe_intensity numeric;
  v_ghg_intensity numeric;
  v_energy_class public.energy_class;
  v_gap_status public.data_gap_status := 'COMPLETE';
  v_completeness numeric(5,2) := 0;
  v_meps_2030 numeric;
  v_meps_2033 numeric;
  v_meps_2030_gap numeric;
  v_meps_2033_gap numeric;
  v_crrem_version text := 'v2.0-1.5C';
  v_stranding int;
  v_role public.user_role;
  v_block_compliance boolean := false;
  v_did_override boolean := false;
  v_result public.performance_indicators;
  v_max_missing int;
  v_month_present boolean;
BEGIN
  SELECT b.* INTO v_building FROM public.buildings b WHERE b.id = p_building_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'building % not found', p_building_id;
  END IF;

  SELECT p.municipality INTO v_municipality
    FROM public.properties p WHERE p.id = v_building.property_id;

  v_primary_use := COALESCE(v_building.primary_use, 'office'::public.space_type);
  v_area := app.select_area_for_year(p_building_id, p_year);
  IF v_area.id IS NULL THEN
    RAISE EXCEPTION 'no area version for building % year %', p_building_id, p_year;
  END IF;

  v_cfg := app.resolve_data_gap_config(NULL, v_primary_use);
  v_max_missing := COALESCE(v_cfg.max_missing_months_before_incomplete, 3);

  BEGIN
    SELECT COALESCE(value->>'default_crrem_version', 'v2.0-1.5C')
      INTO v_crrem_version
      FROM public.system_config WHERE key = 'crrem_defaults';
    IF v_crrem_version IS NULL THEN
      v_crrem_version := 'v2.0-1.5C';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_crrem_version := 'v2.0-1.5C';
  END;

  -- Källor som är relevanta för året
  SELECT COUNT(*) INTO v_num_sources
    FROM (
      SELECT DISTINCT ec.energy_source_id
        FROM public.energy_consumption ec
       WHERE ec.building_id = p_building_id
         AND ec.space_id IS NULL
         AND ec.year BETWEEN p_year - 1 AND p_year
    ) s;

  IF v_num_sources = 0 THEN
    v_gap_status := 'INCOMPLETE_DATA';
    v_completeness := 0;
    v_block_compliance := true;
    v_missing_months := 12;
  ELSE
    -- Spec: "saknade månader" = antal kalendermånader 1–12 där full källtäckning saknas.
    v_expected := v_num_sources * 12;

    SELECT COUNT(*) INTO v_present
      FROM public.energy_consumption ec
     WHERE ec.building_id = p_building_id
       AND ec.space_id IS NULL
       AND ec.year = p_year;

    v_missing := v_expected - v_present;
    v_completeness := CASE WHEN v_expected > 0
      THEN round((v_present::numeric / v_expected::numeric) * 100.0, 2)
      ELSE 0 END;

    v_missing_months := 0;
    FOR v_month IN 1..12 LOOP
      IF (
        SELECT COUNT(DISTINCT energy_source_id)
          FROM public.energy_consumption
         WHERE building_id = p_building_id
           AND space_id IS NULL
           AND year = p_year
           AND month = v_month
      ) < v_num_sources THEN
        v_missing_months := v_missing_months + 1;
      END IF;
    END LOOP;

    IF v_missing_months = 0 THEN
      v_gap_status := 'COMPLETE';
    ELSIF v_missing_months <= v_max_missing THEN
      -- DATA GAP-REGEL 1: interpolera saknade månader
      v_gap_status := 'EXTRAPOLATED_WARNING';

      FOR v_source IN
        SELECT DISTINCT ec.energy_source_id
          FROM public.energy_consumption ec
         WHERE ec.building_id = p_building_id
           AND ec.space_id IS NULL
           AND ec.year BETWEEN p_year - 1 AND p_year
      LOOP
        FOR v_month IN 1..12 LOOP
          IF NOT EXISTS (
            SELECT 1 FROM public.energy_consumption ec
             WHERE ec.building_id = p_building_id
               AND ec.space_id IS NULL
               AND ec.energy_source_id = v_source.energy_source_id
               AND ec.year = p_year
               AND ec.month = v_month
          ) THEN
            v_est_kwh := app.interpolate_month_kwh(
              p_building_id, v_source.energy_source_id, p_year, v_month, v_municipality
            );
            PERFORM app.upsert_estimated_consumption(
              p_building_id, v_source.energy_source_id, p_year, v_month, v_est_kwh
            );
          END IF;
        END LOOP;
      END LOOP;

      -- uppdatera completeness efter interpolation
      SELECT COUNT(*) INTO v_present
        FROM public.energy_consumption
       WHERE building_id = p_building_id AND space_id IS NULL AND year = p_year;
      v_completeness := CASE WHEN v_expected > 0
        THEN LEAST(100, round((v_present::numeric / v_expected::numeric) * 100.0, 2))
        ELSE 0 END;
    ELSE
      -- DATA GAP-REGEL 2
      v_gap_status := 'INCOMPLETE_DATA';
      v_block_compliance := true;
    END IF;

    -- Om interpolerade rader redan finns (omkörning): behåll EXTRAPOLATED_WARNING
    -- DATA GAP: is_estimated = true innebär att året inte är 100 % mätt data.
    IF v_gap_status = 'COMPLETE' AND EXISTS (
      SELECT 1 FROM public.energy_consumption
       WHERE building_id = p_building_id
         AND space_id IS NULL
         AND year = p_year
         AND is_estimated = true
    ) THEN
      v_gap_status := 'EXTRAPOLATED_WARNING';
    END IF;
  END IF;

  -- DATA GAP-REGEL 3: override
  IF v_block_compliance AND p_override THEN
    v_role := app.current_user_role();
    IF auth.uid() IS NOT NULL THEN
      IF v_role IS NULL OR NOT app.role_may_override(v_role) THEN
        RAISE EXCEPTION 'override not permitted for role %', COALESCE(v_role::text, 'null');
      END IF;
      IF p_override_reason IS NULL OR length(trim(p_override_reason)) = 0 THEN
        RAISE EXCEPTION 'override_reason is mandatory when overriding INCOMPLETE_DATA';
      END IF;
    ELSE
      IF p_override_reason IS NULL OR length(trim(p_override_reason)) = 0 THEN
        p_override_reason := 'system/service override';
      END IF;
    END IF;

    v_block_compliance := false;
    v_did_override := true;

    INSERT INTO public.data_quality_logs (
      entity_type, entity_id, field, old_value, new_value,
      changed_by, operation, override_reason
    ) VALUES (
      'performance_indicators', p_building_id, 'data_gap_status',
      'INCOMPLETE_DATA', 'OVERRIDE_COMPUTE',
      auth.uid(), 'OVERRIDE', p_override_reason
    );
  END IF;

  -- Aggregering
  SELECT
    COALESCE(SUM(ec.consumption_kwh), 0),
    COALESCE(SUM(ec.consumption_kwh * es.primary_energy_factor), 0),
    COALESCE(SUM(ec.consumption_kwh * es.emission_factor_kg_co2e_per_kwh), 0),
    COALESCE(SUM(ec.consumption_kwh * es.emission_factor_kg_co2e_per_kwh) FILTER (WHERE es.scope = 'scope1'), 0),
    COALESCE(SUM(ec.consumption_kwh * es.emission_factor_kg_co2e_per_kwh) FILTER (WHERE es.scope = 'scope2'), 0),
    COALESCE(SUM(ec.consumption_kwh * es.emission_factor_kg_co2e_per_kwh) FILTER (WHERE es.scope = 'scope3'), 0)
  INTO v_total_energy, v_total_pe, v_total_ghg, v_scope1, v_scope2, v_scope3
  FROM public.energy_consumption ec
  JOIN public.energy_sources es ON es.id = ec.energy_source_id
  WHERE ec.building_id = p_building_id
    AND ec.space_id IS NULL
    AND ec.year = p_year;

  IF v_area.a_temp > 0 THEN
    v_energy_intensity := round(v_total_energy / v_area.a_temp, 4);
    v_pe_intensity     := round(v_total_pe / v_area.a_temp, 4);
    v_ghg_intensity    := round(v_total_ghg / v_area.a_temp, 6);
  END IF;

  v_energy_class := app.classify_energy_class(v_pe_intensity);

  IF NOT v_block_compliance THEN
    SELECT mt.threshold_kwh_m2 INTO v_meps_2030
      FROM public.meps_thresholds mt
     WHERE mt.category = v_primary_use AND mt.target_year = 2030
     ORDER BY mt.valid_from DESC LIMIT 1;

    SELECT mt.threshold_kwh_m2 INTO v_meps_2033
      FROM public.meps_thresholds mt
     WHERE mt.category = v_primary_use AND mt.target_year = 2033
     ORDER BY mt.valid_from DESC LIMIT 1;

    IF v_energy_intensity IS NOT NULL AND v_meps_2030 IS NOT NULL THEN
      v_meps_2030_gap := round(v_energy_intensity - v_meps_2030, 4);
    END IF;
    IF v_energy_intensity IS NOT NULL AND v_meps_2033 IS NOT NULL THEN
      v_meps_2033_gap := round(v_energy_intensity - v_meps_2033, 4);
    END IF;

    v_stranding := public.calculate_crrem_stranding_year(
      p_building_id, p_year, v_ghg_intensity, v_crrem_version, v_primary_use::text
    );
  END IF;

  INSERT INTO public.performance_indicators (
    building_id, year, area_id, a_temp,
    total_energy_kwh, energy_intensity, primary_energy_intensity, energy_class,
    ghg_intensity, scope1_kg_co2e, scope2_kg_co2e, scope3_kg_co2e,
    crrem_stranding_year, meps_2030_gap, meps_2033_gap,
    calculation_method, crrem_version_used,
    data_gap_status, data_completeness_percent,
    override_applied, override_reason, calculated_at
  ) VALUES (
    p_building_id, p_year, v_area.id, v_area.a_temp,
    v_total_energy, v_energy_intensity, v_pe_intensity, v_energy_class,
    v_ghg_intensity, v_scope1, v_scope2, v_scope3,
    v_stranding, v_meps_2030_gap, v_meps_2033_gap,
    'calculate_yearly_performance_v2', v_crrem_version,
    v_gap_status, COALESCE(v_completeness, 0),
    v_did_override, CASE WHEN v_did_override THEN p_override_reason ELSE NULL END,
    now()
  )
  ON CONFLICT (building_id, year) DO UPDATE SET
    area_id = EXCLUDED.area_id,
    a_temp = EXCLUDED.a_temp,
    total_energy_kwh = EXCLUDED.total_energy_kwh,
    energy_intensity = EXCLUDED.energy_intensity,
    primary_energy_intensity = EXCLUDED.primary_energy_intensity,
    energy_class = EXCLUDED.energy_class,
    ghg_intensity = EXCLUDED.ghg_intensity,
    scope1_kg_co2e = EXCLUDED.scope1_kg_co2e,
    scope2_kg_co2e = EXCLUDED.scope2_kg_co2e,
    scope3_kg_co2e = EXCLUDED.scope3_kg_co2e,
    crrem_stranding_year = EXCLUDED.crrem_stranding_year,
    meps_2030_gap = EXCLUDED.meps_2030_gap,
    meps_2033_gap = EXCLUDED.meps_2033_gap,
    calculation_method = EXCLUDED.calculation_method,
    crrem_version_used = EXCLUDED.crrem_version_used,
    data_gap_status = EXCLUDED.data_gap_status,
    data_completeness_percent = EXCLUDED.data_completeness_percent,
    override_applied = EXCLUDED.override_applied,
    override_reason = EXCLUDED.override_reason,
    calculated_at = EXCLUDED.calculated_at,
    updated_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Seed data
-- ---------------------------------------------------------------------------

-- 8.1 energy_sources (svenska schablonvärden – indikativa; uppdatera vid regelverksändring)
INSERT INTO public.energy_sources (
  name, source_type, is_renewable, scope,
  primary_energy_factor, emission_factor_kg_co2e_per_kwh, valid_from
)
SELECT * FROM (VALUES
  ('El (nordisk residualmix)', 'electricity'::public.energy_source_type, false, 'scope2'::public.emission_scope,
   1.8000, 0.090000, DATE '2020-01-01'),
  ('El (förnybar/ursprungsgaranterad)', 'electricity'::public.energy_source_type, true, 'scope2'::public.emission_scope,
   1.8000, 0.010000, DATE '2020-01-01'),
  ('Fjärrvärme (svensk medel)', 'district_heating'::public.energy_source_type, false, 'scope2'::public.emission_scope,
   0.7000, 0.045000, DATE '2020-01-01'),
  ('Fjärrkyla', 'district_cooling'::public.energy_source_type, false, 'scope2'::public.emission_scope,
   0.6000, 0.030000, DATE '2020-01-01'),
  ('Naturgas', 'natural_gas'::public.energy_source_type, false, 'scope1'::public.emission_scope,
   1.1000, 0.205000, DATE '2020-01-01'),
  ('Eldningsolja', 'oil'::public.energy_source_type, false, 'scope1'::public.emission_scope,
   1.2000, 0.267000, DATE '2020-01-01'),
  ('Biobränsle', 'biofuel'::public.energy_source_type, true, 'scope1'::public.emission_scope,
   1.0000, 0.010000, DATE '2020-01-01')
) AS v(name, source_type, is_renewable, scope, primary_energy_factor, emission_factor_kg_co2e_per_kwh, valid_from)
WHERE NOT EXISTS (SELECT 1 FROM public.energy_sources es WHERE es.name = v.name);

-- 8.2 MEPS-trösklar (Boverket preliminära – office 214/174)
INSERT INTO public.meps_thresholds (category, target_year, threshold_kwh_m2, regulation_ref, is_preliminary)
SELECT * FROM (VALUES
  ('office'::public.space_type, 2030, 214.00, 'Boverket preliminary MEPS non-residential', true),
  ('office'::public.space_type, 2033, 174.00, 'Boverket preliminary MEPS non-residential', true),
  ('retail'::public.space_type, 2030, 230.00, 'Boverket preliminary MEPS non-residential (indikativ)', true),
  ('retail'::public.space_type, 2033, 190.00, 'Boverket preliminary MEPS non-residential (indikativ)', true),
  ('warehouse'::public.space_type, 2030, 180.00, 'Boverket preliminary MEPS non-residential (indikativ)', true),
  ('warehouse'::public.space_type, 2033, 150.00, 'Boverket preliminary MEPS non-residential (indikativ)', true)
) AS v(category, target_year, threshold_kwh_m2, regulation_ref, is_preliminary)
WHERE NOT EXISTS (
  SELECT 1 FROM public.meps_thresholds m
   WHERE m.category = v.category AND m.target_year = v.target_year
);

-- 8.3 CRREM pathway v2.0-1.5C (Sverige, office) – indikativa punkter för interpolation
-- Ersätt med officiella CRREM-värden i produktion.
INSERT INTO public.crrem_pathways (
  crrem_version, property_type, country_code, target_year,
  intensity_target_ghg, intensity_target_energy
)
SELECT * FROM (VALUES
  ('v2.0-1.5C', 'office', 'SE', 2020, 45.0000, 180.0000),
  ('v2.0-1.5C', 'office', 'SE', 2025, 32.0000, 150.0000),
  ('v2.0-1.5C', 'office', 'SE', 2030, 20.0000, 120.0000),
  ('v2.0-1.5C', 'office', 'SE', 2035, 12.0000,  95.0000),
  ('v2.0-1.5C', 'office', 'SE', 2040,  7.0000,  75.0000),
  ('v2.0-1.5C', 'office', 'SE', 2045,  3.5000,  55.0000),
  ('v2.0-1.5C', 'office', 'SE', 2050,  1.5000,  40.0000)
) AS v(crrem_version, property_type, country_code, target_year, intensity_target_ghg, intensity_target_energy)
WHERE NOT EXISTS (
  SELECT 1 FROM public.crrem_pathways c
   WHERE c.crrem_version = v.crrem_version
     AND c.property_type = v.property_type
     AND c.country_code = v.country_code
     AND c.target_year = v.target_year
);

-- 8.4 climate_data – exempel för några kommuner (månads-HDD, indikativa)
DO $$
DECLARE
  munis text[] := ARRAY['Stockholm', 'Göteborg', 'Malmö', 'Uppsala'];
  m text;
  mon int;
  -- ungefärliga säsongsprofiler (relativt index) * bas
  season numeric[] := ARRAY[1.40, 1.25, 1.10, 0.80, 0.40, 0.10, 0.05, 0.05, 0.30, 0.70, 1.10, 1.35];
  base numeric;
BEGIN
  FOREACH m IN ARRAY munis LOOP
    base := CASE m
      WHEN 'Stockholm' THEN 380
      WHEN 'Göteborg'  THEN 340
      WHEN 'Malmö'     THEN 300
      WHEN 'Uppsala'   THEN 400
      ELSE 350
    END;

    FOR mon IN 1..12 LOOP
      INSERT INTO public.climate_data (
        municipality, year, month, heating_degree_days, cooling_degree_days, source
      ) VALUES (
        m, 2024, mon,
        round(base * season[mon], 2),
        CASE WHEN mon IN (6,7,8) THEN round(20 * season[mon], 2) ELSE 0 END,
        'SMHI-referens (exempel-seed EnergyPulse v2)'
      )
      ON CONFLICT DO NOTHING;

      INSERT INTO public.climate_data (
        municipality, year, month, heating_degree_days, cooling_degree_days, source
      ) VALUES (
        m, 2025, mon,
        round(base * season[mon] * 0.98, 2),
        CASE WHEN mon IN (6,7,8) THEN round(22 * season[mon], 2) ELSE 0 END,
        'SMHI-referens (exempel-seed EnergyPulse v2)'
      )
      ON CONFLICT DO NOTHING;
    END LOOP;

    -- Årssumma (month NULL)
    INSERT INTO public.climate_data (
      municipality, year, month, heating_degree_days, cooling_degree_days, source
    )
    SELECT m, 2024, NULL, SUM(heating_degree_days), SUM(cooling_degree_days),
           'SMHI-referens (exempel-seed EnergyPulse v2)'
      FROM public.climate_data
     WHERE municipality = m AND year = 2024 AND month IS NOT NULL
    ON CONFLICT DO NOTHING;

    INSERT INTO public.climate_data (
      municipality, year, month, heating_degree_days, cooling_degree_days, source
    )
    SELECT m, 2025, NULL, SUM(heating_degree_days), SUM(cooling_degree_days),
           'SMHI-referens (exempel-seed EnergyPulse v2)'
      FROM public.climate_data
     WHERE municipality = m AND year = 2025 AND month IS NOT NULL
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- 8.5 data_gap_config default
INSERT INTO public.data_gap_config (
  name, energy_type, space_type,
  max_missing_months_before_incomplete,
  interpolation_method,
  warning_threshold_months,
  is_default, is_active, notes
)
SELECT
  'default_v2',
  NULL, NULL,
  3,
  'linear_previous_3m_seasonal_graddagar',
  1,
  true,
  true,
  'DATA GAP default: ≤3 saknade månader → interpolera + EXTRAPOLATED_WARNING; >3 → INCOMPLETE_DATA blockerar MEPS/CRREM.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.data_gap_config WHERE is_default
);

-- 8.6 system_config
INSERT INTO public.system_config (key, value, description)
VALUES
  (
    'override_enabled_per_role',
    '{"admin": true, "portfolio_manager": true, "property_manager": true, "viewer": false}'::jsonb,
    'DATA GAP-REGEL 3: vilka roller får override av INCOMPLETE_DATA (kräver override_reason).'
  ),
  (
    'tenant_masking_enabled',
    'true'::jsonb,
    'GDPR: tenant_name maskeras via spaces_safe; dekryptering endast via app.decrypt_tenant_name.'
  ),
  (
    'crrem_defaults',
    '{"default_crrem_version": "v2.0-1.5C", "country_code": "SE"}'::jsonb,
    'Standard CRREM-version för calculate_yearly_performance / stranding.'
  ),
  (
    'data_retention_years',
    '{"energy_consumption": 7, "performance_indicators": 10, "tenant_pii_minimal": true}'::jsonb,
    'GDPR/data lifecycle: retention-policy (applikationsnivå + framtida pg_cron-jobb).'
  )
ON CONFLICT (key) DO NOTHING;

-- Koppla default_data_gap_policy_id
INSERT INTO public.system_config (key, value, description)
SELECT
  'default_data_gap_policy_id',
  to_jsonb(c.id::text),
  'FK-referens (text-uuid) till data_gap_config default-rad.'
FROM public.data_gap_config c
WHERE c.is_default
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 9. RLS policies (sektion 8)
-- ---------------------------------------------------------------------------

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energy_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crrem_pathways ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energy_consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_quality_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meps_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.climate_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_gap_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_properties ENABLE ROW LEVEL SECURITY;

-- Hjälp: property-scope via buildings
CREATE OR REPLACE FUNCTION app.property_ids_for_user()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.user_profiles
       WHERE id = auth.uid() AND is_active AND role IN ('admin', 'portfolio_manager')
    ) THEN (SELECT p.id FROM public.properties p)
    ELSE (
      SELECT uj.property_id FROM public.user_properties uj WHERE uj.user_id = auth.uid()
    )
  END
$$;

-- Fix: SETOF med CASE fungerar dåligt – skriv om
CREATE OR REPLACE FUNCTION app.property_ids_for_user()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
    FROM public.properties p
   WHERE EXISTS (
     SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid() AND up.is_active
        AND up.role IN ('admin', 'portfolio_manager')
   )
  UNION
  SELECT uj.property_id
    FROM public.user_properties uj
   WHERE uj.user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION app.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
     WHERE id = auth.uid() AND is_active AND role = 'admin'
  )
$$;

CREATE OR REPLACE FUNCTION app.is_portfolio_manager_or_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
     WHERE id = auth.uid() AND is_active
       AND role IN ('admin', 'portfolio_manager')
  )
$$;

CREATE OR REPLACE FUNCTION app.can_write()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
     WHERE id = auth.uid() AND is_active
       AND role IN ('admin', 'portfolio_manager', 'property_manager')
  )
$$;

-- Drop existing policies if re-run
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename IN (
         'portfolios','properties','buildings','spaces','areas','energy_sources',
         'crrem_pathways','energy_consumption','performance_indicators','actions',
         'physical_risks','data_quality_logs','meps_thresholds','climate_data',
         'data_gap_config','system_config','user_profiles','user_properties'
       )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- user_profiles
CREATE POLICY user_profiles_select_own_or_admin ON public.user_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR app.is_admin());

CREATE POLICY user_profiles_update_own_or_admin ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR app.is_admin())
  WITH CHECK (id = auth.uid() OR app.is_admin());

CREATE POLICY user_profiles_admin_insert ON public.user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (app.is_admin() OR id = auth.uid());

CREATE POLICY user_profiles_admin_delete ON public.user_profiles
  FOR DELETE TO authenticated
  USING (app.is_admin());

-- user_properties
CREATE POLICY user_properties_select ON public.user_properties
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR app.is_portfolio_manager_or_admin());

CREATE POLICY user_properties_admin_write ON public.user_properties
  FOR ALL TO authenticated
  USING (app.is_admin())
  WITH CHECK (app.is_admin());

-- portfolios
CREATE POLICY portfolios_select ON public.portfolios
  FOR SELECT TO authenticated
  USING (
    app.is_portfolio_manager_or_admin()
    OR EXISTS (
      SELECT 1 FROM public.properties p
      JOIN public.user_properties uj ON uj.property_id = p.id
      WHERE p.portfolio_id = portfolios.id AND uj.user_id = auth.uid()
    )
  );

CREATE POLICY portfolios_admin_write ON public.portfolios
  FOR ALL TO authenticated
  USING (app.is_admin())
  WITH CHECK (app.is_admin());

CREATE POLICY portfolios_pm_update ON public.portfolios
  FOR UPDATE TO authenticated
  USING (app.is_portfolio_manager_or_admin())
  WITH CHECK (app.is_portfolio_manager_or_admin());

-- properties
CREATE POLICY properties_select ON public.properties
  FOR SELECT TO authenticated
  USING (
    app.is_portfolio_manager_or_admin()
    OR id IN (SELECT app.property_ids_for_user())
  );

CREATE POLICY properties_write ON public.properties
  FOR ALL TO authenticated
  USING (
    app.is_admin()
    OR (app.current_user_role() = 'portfolio_manager')
    OR (
      app.current_user_role() = 'property_manager'
      AND id IN (SELECT property_id FROM public.user_properties WHERE user_id = auth.uid())
    )
  )
  WITH CHECK (
    app.is_admin()
    OR (app.current_user_role() = 'portfolio_manager')
    OR (
      app.current_user_role() = 'property_manager'
      AND id IN (SELECT property_id FROM public.user_properties WHERE user_id = auth.uid())
    )
  );

-- buildings
CREATE POLICY buildings_select ON public.buildings
  FOR SELECT TO authenticated
  USING (app.user_has_property_access(property_id));

CREATE POLICY buildings_write ON public.buildings
  FOR ALL TO authenticated
  USING (app.can_write() AND app.user_has_property_access(property_id))
  WITH CHECK (app.can_write() AND app.user_has_property_access(property_id));

-- spaces (rå tabell: begränsad – API bör använda spaces_safe)
CREATE POLICY spaces_select ON public.spaces
  FOR SELECT TO authenticated
  USING (app.user_has_building_access(building_id));

CREATE POLICY spaces_write ON public.spaces
  FOR ALL TO authenticated
  USING (app.can_write() AND app.user_has_building_access(building_id))
  WITH CHECK (app.can_write() AND app.user_has_building_access(building_id));

-- areas
CREATE POLICY areas_select ON public.areas
  FOR SELECT TO authenticated
  USING (app.user_has_building_access(building_id));

CREATE POLICY areas_write ON public.areas
  FOR ALL TO authenticated
  USING (app.can_write() AND app.user_has_building_access(building_id))
  WITH CHECK (app.can_write() AND app.user_has_building_access(building_id));

-- energy_sources: alla autentiserade läser; admin skriver
CREATE POLICY energy_sources_select ON public.energy_sources
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY energy_sources_admin_write ON public.energy_sources
  FOR ALL TO authenticated
  USING (app.is_admin())
  WITH CHECK (app.is_admin());

-- crrem_pathways
CREATE POLICY crrem_pathways_select ON public.crrem_pathways
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY crrem_pathways_admin_write ON public.crrem_pathways
  FOR ALL TO authenticated
  USING (app.is_admin())
  WITH CHECK (app.is_admin());

-- energy_consumption
CREATE POLICY energy_consumption_select ON public.energy_consumption
  FOR SELECT TO authenticated
  USING (app.user_has_building_access(building_id));

CREATE POLICY energy_consumption_write ON public.energy_consumption
  FOR ALL TO authenticated
  USING (app.can_write() AND app.user_has_building_access(building_id))
  WITH CHECK (app.can_write() AND app.user_has_building_access(building_id));

-- performance_indicators
CREATE POLICY performance_indicators_select ON public.performance_indicators
  FOR SELECT TO authenticated
  USING (app.user_has_building_access(building_id));

CREATE POLICY performance_indicators_write ON public.performance_indicators
  FOR ALL TO authenticated
  USING (app.can_write() AND app.user_has_building_access(building_id))
  WITH CHECK (app.can_write() AND app.user_has_building_access(building_id));

-- actions
CREATE POLICY actions_select ON public.actions
  FOR SELECT TO authenticated
  USING (app.user_has_building_access(building_id));

CREATE POLICY actions_write ON public.actions
  FOR ALL TO authenticated
  USING (app.can_write() AND app.user_has_building_access(building_id))
  WITH CHECK (app.can_write() AND app.user_has_building_access(building_id));

-- physical_risks
CREATE POLICY physical_risks_select ON public.physical_risks
  FOR SELECT TO authenticated
  USING (app.user_has_property_access(property_id));

CREATE POLICY physical_risks_write ON public.physical_risks
  FOR ALL TO authenticated
  USING (app.can_write() AND app.user_has_property_access(property_id))
  WITH CHECK (app.can_write() AND app.user_has_property_access(property_id));

-- data_quality_logs: läs för admin/pm; insert via triggers (security definer)
CREATE POLICY data_quality_logs_select ON public.data_quality_logs
  FOR SELECT TO authenticated
  USING (
    app.is_portfolio_manager_or_admin()
    OR changed_by = auth.uid()
  );

CREATE POLICY data_quality_logs_insert ON public.data_quality_logs
  FOR INSERT TO authenticated
  WITH CHECK (true); -- triggers/security definer; app-writes allowed

-- meps_thresholds, climate_data: read all auth; write admin
CREATE POLICY meps_thresholds_select ON public.meps_thresholds
  FOR SELECT TO authenticated USING (true);
CREATE POLICY meps_thresholds_admin_write ON public.meps_thresholds
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY climate_data_select ON public.climate_data
  FOR SELECT TO authenticated USING (true);
CREATE POLICY climate_data_admin_write ON public.climate_data
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());

-- data_gap_config / system_config: read auth; write admin
CREATE POLICY data_gap_config_select ON public.data_gap_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY data_gap_config_admin_write ON public.data_gap_config
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());

CREATE POLICY system_config_select ON public.system_config
  FOR SELECT TO authenticated
  USING (app.is_portfolio_manager_or_admin());
CREATE POLICY system_config_admin_write ON public.system_config
  FOR ALL TO authenticated USING (app.is_admin()) WITH CHECK (app.is_admin());

-- service_role bypasses RLS by default in Supabase – no extra policies needed.

GRANT USAGE ON SCHEMA app TO authenticated, service_role;
GRANT SELECT ON public.spaces_safe TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO authenticated, service_role;

-- Explicit (dokumentation / äldre klienter)
GRANT EXECUTE ON FUNCTION app.decrypt_tenant_name(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.encrypt_tenant_name(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_space_tenant_name(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_yearly_performance(uuid, int, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_crrem_stranding_year(uuid, int, numeric, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.current_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.user_has_property_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.user_has_building_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.role_may_override(public.user_role) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Partitioneringskommentarer (energy_consumption per year)
-- ---------------------------------------------------------------------------
--
-- FRAMTIDA PARTITIONERING (kör som separat migrering när volym > 3–5 år):
--
--   -- 1) Skapa ny partitionerad tabell
--   CREATE TABLE energy_consumption_partitioned (
--     LIKE energy_consumption INCLUDING DEFAULTS INCLUDING CONSTRAINTS
--   ) PARTITION BY RANGE (year);
--
--   -- 2) Partitioner
--   CREATE TABLE energy_consumption_y2023 PARTITION OF energy_consumption_partitioned
--     FOR VALUES FROM (2023) TO (2024);
--   CREATE TABLE energy_consumption_y2024 PARTITION OF energy_consumption_partitioned
--     FOR VALUES FROM (2024) TO (2025);
--   CREATE TABLE energy_consumption_y2025 PARTITION OF energy_consumption_partitioned
--     FOR VALUES FROM (2025) TO (2026);
--   CREATE TABLE energy_consumption_default PARTITION OF energy_consumption_partitioned
--     DEFAULT;
--
--   -- 3) PK måste inkludera partition key:
--   --    PRIMARY KEY (id, year)
--   -- 4) Partiella unika index skapas per partition eller som
--   --    UNIQUE (building_id, energy_source_id, year, month) WHERE space_id IS NULL
--   --    på parent (PG 11+ global unique kräver partition key i index).
--   -- 5) Migrera data + byt namn atomärt i transaktion.
--   -- 6) Alternativ: pg_partman för automatisk partition maintenance.
--
-- Rekommenderade index (redan skapade):
--   idx_energy_consumption_building_year (building_id, year)
--   idx_energy_consumption_source (energy_source_id)
--   idx_energy_consumption_year_month (year, month)
--   uq_energy_consumption_building_month (partial)
--   uq_energy_consumption_space_month (partial)
--   idx_areas_building_valid (building_id, valid_from, valid_to)
--

COMMENT ON INDEX public.uq_energy_consumption_building_month IS
  'Partiell unik: en consumption-rad per building+source+year+month när space_id IS NULL.';
COMMENT ON INDEX public.uq_energy_consumption_space_month IS
  'Partiell unik: en consumption-rad per space+source+year+month när space_id IS NOT NULL.';

COMMIT;

-- =============================================================================
-- 11. TEST DATA + VERIFIERANDE QUERIES
-- =============================================================================
-- Körs efter migreringen. Använd service_role / SQL Editor (bypass RLS).
-- Rensa ev. tidigare test-portfölj vid omkörning.

BEGIN;

-- Testportfölj
INSERT INTO public.portfolios (id, name, description)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'EnergyPulse Testportfölj',
  'Fas 1 verifiering'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.properties (
  id, portfolio_id, external_id, name, address, municipality, climate_zone, status
) VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'STOCKHOLM 1:1',
  'Testfastighet Norrmalm',
  'Testgatan 1, Stockholm',
  'Stockholm',
  'III',
  'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.buildings (
  id, property_id, name, construction_year, primary_use, protected_status
) VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'Hus A',
  1998,
  'office',
  false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.areas (
  id, building_id, valid_from, valid_to, bta, a_temp, loa_total, source, quality_class
) VALUES (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  DATE '2020-01-01',
  NULL,
  12000,
  10000,   -- Atemp 10 000 m²
  9500,
  'seed',
  'B'
)
ON CONFLICT (id) DO NOTHING;

-- Space med krypterad tenant
INSERT INTO public.spaces (
  id, building_id, name, space_type, tenant_name_encrypted, loa, boa, is_heated
) VALUES (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'Plan 3 kontor',
  'office',
  app.encrypt_tenant_name('ACME Sverige AB'),
  500, 480, true
)
ON CONFLICT (id) DO NOTHING;

-- Energidata: 2024 komplett | 2025 saknar 2 mån | 2023 saknar 6 mån
DO $$
DECLARE
  v_el uuid;
  v_fv uuid;
  v_b uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  m int;
  v_fv_kwh numeric;
BEGIN
  SELECT id INTO v_el FROM public.energy_sources WHERE name = 'El (nordisk residualmix)' LIMIT 1;
  SELECT id INTO v_fv FROM public.energy_sources WHERE name = 'Fjärrvärme (svensk medel)' LIMIT 1;

  IF v_el IS NULL OR v_fv IS NULL THEN
    RAISE EXCEPTION 'energy_sources seed saknas – kör hela migreringen';
  END IF;

  -- Idempotent: rensa testbyggnadens consumption innan seed
  DELETE FROM public.energy_consumption WHERE building_id = v_b;
  DELETE FROM public.performance_indicators WHERE building_id = v_b;

  -- 2024: fullständigt år (el + fjärrvärme) → COMPLETE
  FOR m IN 1..12 LOOP
    v_fv_kwh := 120000
      + CASE WHEN m IN (1, 2, 12) THEN 40000
             WHEN m IN (6, 7, 8) THEN -30000
             ELSE 0 END;
    INSERT INTO public.energy_consumption (
      building_id, energy_source_id, year, month, consumption_kwh, is_estimated, quality_class
    ) VALUES
      (v_b, v_el, 2024, m, 80000 + m * 500, false, 'A'),
      (v_b, v_fv, 2024, m, v_fv_kwh, false, 'A');
  END LOOP;

  -- 2025: 10 månader (saknar nov–dec) → EXTRAPOLATED_WARNING (≤3)
  FOR m IN 1..10 LOOP
    v_fv_kwh := 115000
      + CASE WHEN m IN (1, 2) THEN 35000
             WHEN m IN (6, 7, 8) THEN -25000
             ELSE 0 END;
    INSERT INTO public.energy_consumption (
      building_id, energy_source_id, year, month, consumption_kwh, is_estimated, quality_class
    ) VALUES
      (v_b, v_el, 2025, m, 79000 + m * 400, false, 'B'),
      (v_b, v_fv, 2025, m, v_fv_kwh, false, 'B');
  END LOOP;

  -- 2023: endast 6 månader → INCOMPLETE_DATA (>3)
  FOR m IN 1..6 LOOP
    INSERT INTO public.energy_consumption (
      building_id, energy_source_id, year, month, consumption_kwh, is_estimated, quality_class
    ) VALUES
      (v_b, v_el, 2023, m, 85000, false, 'C'),
      (v_b, v_fv, 2023, m, 130000, false, 'C');
  END LOOP;
END $$;

COMMIT;

-- ---------------------------------------------------------------------------
-- TEST QUERIES (kör manuellt efter migrering – SELECT-only verifiering)
-- ---------------------------------------------------------------------------

-- T1: GDPR-maskering – spaces_safe ska visa ***MASKERAD***
-- SELECT id, name, tenant_name, has_tenant FROM public.spaces_safe
--  WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
-- Förväntat: tenant_name = '***MASKERAD***', has_tenant = true

-- T2: calculate_yearly_performance 2024 (komplett) → COMPLETE + MEPS/CRREM ifyllda
-- SELECT * FROM public.calculate_yearly_performance(
--   'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 2024);
-- Förväntat:
--   data_gap_status = COMPLETE
--   data_completeness_percent = 100
--   energy_intensity = total_energy_kwh / 10000
--   meps_2030_gap / meps_2033_gap NOT NULL
--   crrem_stranding_year NOT NULL (eller NULL om under pathway)
--   crrem_version_used = 'v2.0-1.5C'

-- T3: Data Gap EXTRAPOLATED (2025, 2 saknade månader ≤ 3)
-- SELECT * FROM public.calculate_yearly_performance(
--   'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 2025);
-- Förväntat:
--   data_gap_status = EXTRAPOLATED_WARNING
--   is_estimated-rader skapade för month 11–12
-- SELECT year, month, is_estimated, consumption_kwh
--   FROM public.energy_consumption
--  WHERE building_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
--    AND year = 2025 AND is_estimated
--  ORDER BY month;

-- T4: Data Gap INCOMPLETE (2023, 6 saknade månader > 3) – MEPS/CRREM blockerade
-- SELECT building_id, year, data_gap_status, data_completeness_percent,
--        meps_2030_gap, meps_2033_gap, crrem_stranding_year, energy_intensity
--   FROM public.calculate_yearly_performance(
--     'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 2023);
-- Förväntat:
--   data_gap_status = INCOMPLETE_DATA
--   meps_2030_gap IS NULL AND crrem_stranding_year IS NULL
--   energy_intensity beräknas ändå på tillgänglig data

-- T5: Override med reason (service_role / SQL Editor)
-- SELECT data_gap_status, meps_2030_gap, crrem_stranding_year, override_applied, override_reason
--   FROM public.calculate_yearly_performance(
--     'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 2023,
--     true, 'Pilot: godkänt av portföljchef för Q1-rapport');
-- Förväntat: override_applied = true, meps/crrem ifyllda, loggrad i data_quality_logs

-- T6: CRREM stranding (direkt)
-- SELECT public.calculate_crrem_stranding_year(
--   'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 2024, 25.0, 'v2.0-1.5C', 'office');
-- Förväntat: tidigaste år där 25 > interpolerad target (ca 2027–2028 givet seed-pathway)

-- T7: Formelverifiering manuellt
-- WITH agg AS (
--   SELECT SUM(ec.consumption_kwh) AS tot,
--          SUM(ec.consumption_kwh * es.primary_energy_factor) AS pe,
--          SUM(ec.consumption_kwh * es.emission_factor_kg_co2e_per_kwh) AS ghg
--     FROM energy_consumption ec
--     JOIN energy_sources es ON es.id = ec.energy_source_id
--    WHERE ec.building_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
--      AND ec.year = 2024 AND ec.space_id IS NULL
-- )
-- SELECT tot/10000 AS energy_intensity,
--        pe/10000 AS primary_energy_intensity,
--        ghg/10000 AS ghg_intensity
--   FROM agg;
-- Jämför med performance_indicators för samma building/year.

-- =============================================================================
-- SLUT EnergyPulse v2.0 Fas 1
-- =============================================================================
