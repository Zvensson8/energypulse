-- =============================================================================
-- EnergyPulse Fas 8 – EPBD → MEPS → CRREM → CSRD/ESRS E1 + Combined Risk
-- Utökar performance_indicators & actions, risk_scores, renovation_plans
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. performance_indicators – compliance & risk-flaggor
-- ---------------------------------------------------------------------------
ALTER TABLE public.performance_indicators
  ADD COLUMN IF NOT EXISTS meps_status text;

ALTER TABLE public.performance_indicators
  ADD COLUMN IF NOT EXISTS crrem_misalignment_year int;

ALTER TABLE public.performance_indicators
  ADD COLUMN IF NOT EXISTS combined_risk_score numeric(5,2);

ALTER TABLE public.performance_indicators
  ADD COLUMN IF NOT EXISTS financial_risk_flag boolean NOT NULL DEFAULT false;

-- Spegla befintliga gap-kolumner (meps_2030_gap / meps_2033_gap finns redan)
COMMENT ON COLUMN public.performance_indicators.meps_status IS
  'compliant | at_risk | non_compliant (baserat på MEPS 2030/2033-gap)';
COMMENT ON COLUMN public.performance_indicators.crrem_misalignment_year IS
  'Alias/synk av crrem_stranding_year – CSRD/ESRS E1 transition risk';
COMMENT ON COLUMN public.performance_indicators.combined_risk_score IS
  '0–100 kombinerad risk (MEPS+CRREM+fysisk+datakvalitet)';
COMMENT ON COLUMN public.performance_indicators.financial_risk_flag IS
  'true om CRREM misalignment < 2035 (finansiell transition risk)';

DO $$ BEGIN
  ALTER TABLE public.performance_indicators
    ADD CONSTRAINT performance_indicators_meps_status_chk
    CHECK (meps_status IS NULL OR meps_status IN ('compliant','at_risk','non_compliant'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.performance_indicators
    ADD CONSTRAINT performance_indicators_combined_score_chk
    CHECK (combined_risk_score IS NULL OR (combined_risk_score >= 0 AND combined_risk_score <= 100));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_pi_combined_risk
  ON public.performance_indicators (combined_risk_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_pi_financial_risk
  ON public.performance_indicators (financial_risk_flag)
  WHERE financial_risk_flag = true;
CREATE INDEX IF NOT EXISTS idx_pi_meps_status
  ON public.performance_indicators (meps_status);

-- Backfill misalignment från stranding
UPDATE public.performance_indicators
   SET crrem_misalignment_year = crrem_stranding_year
 WHERE crrem_misalignment_year IS NULL
   AND crrem_stranding_year IS NOT NULL;

UPDATE public.performance_indicators
   SET financial_risk_flag = (crrem_stranding_year IS NOT NULL AND crrem_stranding_year < 2035)
 WHERE financial_risk_flag = false
   AND crrem_stranding_year IS NOT NULL
   AND crrem_stranding_year < 2035;

UPDATE public.performance_indicators
   SET meps_status = CASE
     WHEN meps_2030_gap IS NULL THEN NULL
     WHEN meps_2030_gap <= 0 THEN 'compliant'
     WHEN meps_2030_gap <= 30 THEN 'at_risk'
     ELSE 'non_compliant'
   END
 WHERE meps_status IS NULL;

-- ---------------------------------------------------------------------------
-- 2. actions – uppskattad effekt på MEPS/CRREM/PED
-- ---------------------------------------------------------------------------
ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS estimated_meps_gap_reduction numeric(12,4);

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS estimated_misalignment_year_shift integer;

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS estimated_ped_reduction numeric(12,4);

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS affects_physical_risk boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.actions.estimated_meps_gap_reduction IS
  'Förväntad minskning av MEPS-gap (kWh/m²) vid genomförande';
COMMENT ON COLUMN public.actions.estimated_misalignment_year_shift IS
  'Förväntad förskjutning av CRREM misalignment-år (t.ex. +8)';
COMMENT ON COLUMN public.actions.estimated_ped_reduction IS
  'Förväntad sänkning av primärenergital (kWh/m²)';

-- ---------------------------------------------------------------------------
-- 3. risk_scores (årlig snapshot per byggnad)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.risk_scores (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id         uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  year                int NOT NULL,
  meps_score          numeric(5,2),
  crrem_score         numeric(5,2),
  physical_score      numeric(5,2),
  data_quality_score  numeric(5,2),
  combined_score      numeric(5,2) NOT NULL DEFAULT 0,
  calculated_at       timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT risk_scores_year_chk CHECK (year BETWEEN 2000 AND 2100),
  CONSTRAINT risk_scores_combined_chk CHECK (combined_score >= 0 AND combined_score <= 100),
  CONSTRAINT risk_scores_building_year_key UNIQUE (building_id, year)
);

CREATE INDEX IF NOT EXISTS idx_risk_scores_combined
  ON public.risk_scores (combined_score DESC);

SELECT app.attach_standard_triggers('public.risk_scores');

COMMENT ON TABLE public.risk_scores IS
  'Fas 8: EPBD/MEPS + CRREM + fysisk risk + datakvalitet → combined 0–100 (CSRD underlag).';

-- ---------------------------------------------------------------------------
-- 4. renovation_plans + renovation_plan_actions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.renovation_plans (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id                uuid REFERENCES public.buildings(id) ON DELETE CASCADE,
  property_id                uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  title                      text NOT NULL,
  status                     text NOT NULL DEFAULT 'draft',
  target_misalignment_year   integer,
  target_meps_status         text,
  total_estimated_cost       numeric(14,2),
  currency                   text NOT NULL DEFAULT 'SEK',
  baseline_combined_score    numeric(5,2),
  projected_combined_score   numeric(5,2),
  notes                      text,
  created_by                 uuid,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT renovation_plans_status_chk CHECK (
    status IN ('draft', 'approved', 'in_progress', 'completed')
  ),
  CONSTRAINT renovation_plans_currency_chk CHECK (char_length(currency) = 3),
  CONSTRAINT renovation_plans_scope_chk CHECK (
    building_id IS NOT NULL OR property_id IS NOT NULL
  ),
  CONSTRAINT renovation_plans_meps_target_chk CHECK (
    target_meps_status IS NULL
    OR target_meps_status IN ('compliant', 'at_risk', 'non_compliant')
  )
);

CREATE INDEX IF NOT EXISTS idx_renovation_plans_building
  ON public.renovation_plans (building_id, status);
CREATE INDEX IF NOT EXISTS idx_renovation_plans_property
  ON public.renovation_plans (property_id, status);

SELECT app.attach_standard_triggers('public.renovation_plans');

CREATE TABLE IF NOT EXISTS public.renovation_plan_actions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id          uuid NOT NULL REFERENCES public.renovation_plans(id) ON DELETE CASCADE,
  action_id        uuid NOT NULL REFERENCES public.actions(id) ON DELETE CASCADE,
  sort_order       integer NOT NULL DEFAULT 0,
  expected_impact  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, action_id)
);

CREATE INDEX IF NOT EXISTS idx_renovation_plan_actions_plan
  ON public.renovation_plan_actions (plan_id, sort_order);

COMMENT ON COLUMN public.renovation_plan_actions.expected_impact IS
  'JSON: {meps_gap, misalignment_shift, ped}';

-- ---------------------------------------------------------------------------
-- 5. system_config – riskvikter
-- ---------------------------------------------------------------------------
INSERT INTO public.system_config (key, value, description)
VALUES (
  'combined_risk_weights',
  '{"meps": 0.40, "crrem": 0.35, "physical": 0.15, "data_quality": 0.10, "financial_risk_year": 2035}'::jsonb,
  'Fas 8: vikter för calculate_combined_risk_score (MEPS/CRREM/fysisk/datakvalitet)'
)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Hjälp: meps_status från gap
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.meps_status_from_gap(p_gap numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_gap IS NULL THEN NULL
    WHEN p_gap <= 0 THEN 'compliant'
    WHEN p_gap <= 30 THEN 'at_risk'
    ELSE 'non_compliant'
  END;
$$;

-- ---------------------------------------------------------------------------
-- 7. calculate_combined_risk_score(building_id, year)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_combined_risk_score(
  p_building_id uuid,
  p_year int
)
RETURNS numeric
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_pi public.performance_indicators;
  v_w jsonb;
  v_wm numeric := 0.40;
  v_wc numeric := 0.35;
  v_wp numeric := 0.15;
  v_wd numeric := 0.10;
  v_fin_year int := 2035;
  v_meps_score numeric := 0;
  v_crrem_score numeric := 0;
  v_phys_score numeric := 0;
  v_dq_score numeric := 0;
  v_combined numeric := 0;
  v_phys_avg numeric;
  v_property_id uuid;
  v_misalign int;
  v_years_out numeric;
BEGIN
  SELECT * INTO v_pi
    FROM public.performance_indicators
   WHERE building_id = p_building_id AND year = p_year;

  IF NOT FOUND THEN
    -- Senaste år som fallback
    SELECT * INTO v_pi
      FROM public.performance_indicators
     WHERE building_id = p_building_id
     ORDER BY year DESC LIMIT 1;
    IF NOT FOUND THEN
      RETURN 0;
    END IF;
    p_year := v_pi.year;
  END IF;

  BEGIN
    SELECT value INTO v_w FROM public.system_config WHERE key = 'combined_risk_weights';
    IF v_w IS NOT NULL THEN
      v_wm := COALESCE((v_w->>'meps')::numeric, 0.40);
      v_wc := COALESCE((v_w->>'crrem')::numeric, 0.35);
      v_wp := COALESCE((v_w->>'physical')::numeric, 0.15);
      v_wd := COALESCE((v_w->>'data_quality')::numeric, 0.10);
      v_fin_year := COALESCE((v_w->>'financial_risk_year')::int, 2035);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- MEPS-score: 0 om gap<=0, 100 om gap>=150
  IF v_pi.meps_2030_gap IS NULL THEN
    v_meps_score := 50; -- okänd
  ELSIF v_pi.meps_2030_gap <= 0 THEN
    v_meps_score := 0;
  ELSE
    v_meps_score := LEAST(100, (v_pi.meps_2030_gap / 150.0) * 100);
  END IF;

  -- CRREM: tidigare misalignment → högre score
  v_misalign := COALESCE(v_pi.crrem_misalignment_year, v_pi.crrem_stranding_year);
  IF v_misalign IS NULL THEN
    v_crrem_score := 30;
  ELSE
    v_years_out := v_misalign - EXTRACT(YEAR FROM CURRENT_DATE)::numeric;
    IF v_years_out <= 0 THEN
      v_crrem_score := 100;
    ELSIF v_years_out >= 25 THEN
      v_crrem_score := 0;
    ELSE
      v_crrem_score := (1 - v_years_out / 25.0) * 100;
    END IF;
  END IF;

  -- Fysisk risk: snitt risk_score (1–16) → 0–100, endast open/monitoring
  SELECT b.property_id INTO v_property_id
    FROM public.buildings b WHERE b.id = p_building_id;

  SELECT AVG(pr.risk_score) INTO v_phys_avg
    FROM public.physical_risks pr
   WHERE pr.property_id = v_property_id
     AND COALESCE(pr.workflow_status, 'open') IN ('open', 'monitoring');

  IF v_phys_avg IS NULL THEN
    v_phys_score := 0;
  ELSE
    v_phys_score := LEAST(100, (v_phys_avg / 16.0) * 100);
  END IF;

  -- Datakvalitet: inverted completeness (låg completeness → hög risk)
  IF v_pi.data_completeness_percent IS NULL THEN
    v_dq_score := 50;
  ELSE
    v_dq_score := GREATEST(0, 100 - v_pi.data_completeness_percent);
  END IF;
  IF v_pi.data_gap_status = 'INCOMPLETE_DATA' THEN
    v_dq_score := GREATEST(v_dq_score, 80);
  ELSIF v_pi.data_gap_status = 'EXTRAPOLATED_WARNING' THEN
    v_dq_score := GREATEST(v_dq_score, 40);
  END IF;

  v_combined := round(
    v_wm * v_meps_score
    + v_wc * v_crrem_score
    + v_wp * v_phys_score
    + v_wd * v_dq_score
  , 2);
  v_combined := GREATEST(0, LEAST(100, v_combined));

  -- UPSERT risk_scores
  INSERT INTO public.risk_scores (
    building_id, year, meps_score, crrem_score, physical_score,
    data_quality_score, combined_score, calculated_at
  ) VALUES (
    p_building_id, p_year, round(v_meps_score, 2), round(v_crrem_score, 2),
    round(v_phys_score, 2), round(v_dq_score, 2), v_combined, now()
  )
  ON CONFLICT (building_id, year) DO UPDATE SET
    meps_score = EXCLUDED.meps_score,
    crrem_score = EXCLUDED.crrem_score,
    physical_score = EXCLUDED.physical_score,
    data_quality_score = EXCLUDED.data_quality_score,
    combined_score = EXCLUDED.combined_score,
    calculated_at = EXCLUDED.calculated_at,
    updated_at = now();

  -- Uppdatera PI
  UPDATE public.performance_indicators SET
    meps_status = app.meps_status_from_gap(meps_2030_gap),
    crrem_misalignment_year = COALESCE(crrem_stranding_year, crrem_misalignment_year),
    combined_risk_score = v_combined,
    financial_risk_flag = (
      COALESCE(crrem_stranding_year, crrem_misalignment_year) IS NOT NULL
      AND COALESCE(crrem_stranding_year, crrem_misalignment_year) < v_fin_year
    ),
    updated_at = now()
  WHERE building_id = p_building_id AND year = p_year;

  RETURN v_combined;
END;
$$;

COMMENT ON FUNCTION public.calculate_combined_risk_score IS
  'Fas 8: MEPS 0.40 + CRREM 0.35 + fysisk 0.15 + data 0.10 → 0–100, sparar risk_scores + PI.';

-- ---------------------------------------------------------------------------
-- 8. refresh_performance_compliance_fields – synka status efter calc
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_performance_compliance_fields(
  p_building_id uuid,
  p_year int
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app
AS $$
BEGIN
  UPDATE public.performance_indicators SET
    meps_status = app.meps_status_from_gap(meps_2030_gap),
    crrem_misalignment_year = crrem_stranding_year,
    financial_risk_flag = (
      crrem_stranding_year IS NOT NULL AND crrem_stranding_year < 2035
    ),
    updated_at = now()
  WHERE building_id = p_building_id AND year = p_year;

  PERFORM public.calculate_combined_risk_score(p_building_id, p_year);
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. recalculate_after_action (Fas 8 API – wrappar apply + risk)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_after_action(
  p_action_id uuid,
  p_year int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_action public.actions;
  v_year int;
  v_app public.action_applications;
  v_score numeric;
  v_pi public.performance_indicators;
BEGIN
  SELECT * INTO v_action FROM public.actions WHERE id = p_action_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'action % not found', p_action_id;
  END IF;

  v_year := COALESCE(
    p_year,
    EXTRACT(YEAR FROM COALESCE(v_action.completed_date, CURRENT_DATE))::int
  );

  -- Tillämpa modeled saving om completed (idempotent via apply_completed_action)
  IF v_action.status = 'completed' THEN
    BEGIN
      v_app := public.apply_completed_action(
        p_action_id, v_year, 'Fas8 recalculate_after_action'
      );
      v_year := COALESCE(v_app.target_year, v_year);
    EXCEPTION WHEN OTHERS THEN
      -- Om redan applied eller saknar area: räkna om ändå
      PERFORM public.recalculate_performance_with_adjustments(
        v_action.building_id, v_year, false, null
      );
    END;
  ELSE
    PERFORM public.recalculate_performance_with_adjustments(
      v_action.building_id, v_year, false, null
    );
  END IF;

  PERFORM public.refresh_performance_compliance_fields(
    v_action.building_id, v_year
  );

  v_score := public.calculate_combined_risk_score(v_action.building_id, v_year);

  SELECT * INTO v_pi FROM public.performance_indicators
   WHERE building_id = v_action.building_id AND year = v_year;

  INSERT INTO public.data_quality_logs (
    entity_type, entity_id, field, old_value, new_value,
    changed_by, operation, override_reason
  ) VALUES (
    'performance_indicators', v_action.building_id,
    'recalculate_after_action',
    p_action_id::text,
    format('score=%s meps=%s misalign=%s',
      v_score,
      COALESCE(v_pi.meps_2030_gap::text, 'null'),
      COALESCE(v_pi.crrem_misalignment_year::text, 'null')
    ),
    auth.uid(), 'ACTION_APPLY',
    'Fas8: omräkning efter action'
  );

  RETURN jsonb_build_object(
    'building_id', v_action.building_id,
    'year', v_year,
    'combined_risk_score', v_score,
    'meps_2030_gap', v_pi.meps_2030_gap,
    'meps_status', v_pi.meps_status,
    'crrem_misalignment_year', v_pi.crrem_misalignment_year,
    'financial_risk_flag', v_pi.financial_risk_flag
  );
END;
$$;

-- Uppdatera AFTER completed-trigger att även köra risk-score
CREATE OR REPLACE FUNCTION app.trg_action_completed_apply_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    BEGIN
      PERFORM public.apply_completed_action(
        NEW.id,
        EXTRACT(YEAR FROM COALESCE(NEW.completed_date, CURRENT_DATE))::int,
        'Auto: status → completed'
      );
      PERFORM public.refresh_performance_compliance_fields(
        NEW.building_id,
        EXTRACT(YEAR FROM COALESCE(NEW.completed_date, CURRENT_DATE))::int
      );
      PERFORM public.calculate_combined_risk_score(
        NEW.building_id,
        EXTRACT(YEAR FROM COALESCE(NEW.completed_date, CURRENT_DATE))::int
      );
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.data_quality_logs (
        entity_type, entity_id, field, old_value, new_value,
        changed_by, operation, override_reason
      ) VALUES (
        'actions', NEW.id, 'apply_completed_action',
        OLD.status::text, NEW.status::text,
        auth.uid(), 'ACTION_APPLY',
        'ERROR: ' || SQLERRM
      );
    END;
  END IF;
  RETURN NEW;
END;
$$;

-- Hook: efter calculate_yearly_performance wrapper – uppdatera compliance fields
CREATE OR REPLACE FUNCTION public.recalculate_performance_with_adjustments(
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
  v_pi public.performance_indicators;
  v_delta_kwh numeric := 0;
  v_delta_ghg numeric := 0;
  v_base_energy numeric;
  v_base_pe numeric;
  v_base_ghg numeric;
  v_scale numeric;
  v_a_temp numeric;
  v_primary_use public.space_type;
  v_meps_2030 numeric;
  v_meps_2033 numeric;
  v_crrem_version text;
  v_building public.buildings;
BEGIN
  v_pi := public.calculate_yearly_performance(
    p_building_id, p_year, p_override, p_override_reason
  );

  SELECT COALESCE(SUM(delta_total_energy_kwh), 0),
         COALESCE(SUM(COALESCE(delta_ghg_kg, 0)), 0)
    INTO v_delta_kwh, v_delta_ghg
    FROM public.performance_adjustments
   WHERE building_id = p_building_id
     AND year = p_year
     AND is_active = true;

  IF v_delta_kwh <> 0 OR v_delta_ghg <> 0 THEN
    v_base_energy := COALESCE(v_pi.total_energy_kwh, 0);
    v_base_pe := COALESCE(v_pi.primary_energy_intensity, 0) * COALESCE(v_pi.a_temp, 0);
    v_base_ghg := COALESCE(v_pi.ghg_intensity, 0) * COALESCE(v_pi.a_temp, 0);
    v_a_temp := COALESCE(v_pi.a_temp, 0);

    IF v_base_energy > 0 THEN
      v_scale := GREATEST(0, v_base_energy + v_delta_kwh) / v_base_energy;
    ELSE
      v_scale := 1;
    END IF;

    v_base_energy := GREATEST(0, v_base_energy + v_delta_kwh);
    v_base_pe := GREATEST(0, v_base_pe * v_scale);
    v_base_ghg := GREATEST(0, v_base_ghg * v_scale + v_delta_ghg);

    SELECT b.* INTO v_building FROM public.buildings b WHERE b.id = p_building_id;
    v_primary_use := COALESCE(v_building.primary_use, 'office'::public.space_type);

    BEGIN
      SELECT COALESCE(value->>'default_crrem_version', 'v2.0-1.5C')
        INTO v_crrem_version
        FROM public.system_config WHERE key = 'crrem_defaults';
    EXCEPTION WHEN OTHERS THEN
      v_crrem_version := 'v2.0-1.5C';
    END;

    SELECT mt.threshold_kwh_m2 INTO v_meps_2030
      FROM public.meps_thresholds mt
     WHERE mt.category = v_primary_use AND mt.target_year = 2030
     ORDER BY mt.valid_from DESC LIMIT 1;
    SELECT mt.threshold_kwh_m2 INTO v_meps_2033
      FROM public.meps_thresholds mt
     WHERE mt.category = v_primary_use AND mt.target_year = 2033
     ORDER BY mt.valid_from DESC LIMIT 1;

    UPDATE public.performance_indicators SET
      total_energy_kwh = v_base_energy,
      energy_intensity = CASE WHEN v_a_temp > 0
        THEN round(v_base_energy / v_a_temp, 4) ELSE NULL END,
      primary_energy_intensity = CASE WHEN v_a_temp > 0
        THEN round(v_base_pe / v_a_temp, 4) ELSE NULL END,
      ghg_intensity = CASE WHEN v_a_temp > 0
        THEN round(v_base_ghg / v_a_temp, 6) ELSE NULL END,
      energy_class = app.classify_energy_class(
        CASE WHEN v_a_temp > 0 THEN v_base_pe / v_a_temp ELSE NULL END
      ),
      meps_2030_gap = CASE
        WHEN v_pi.data_gap_status = 'INCOMPLETE_DATA'
             AND NOT COALESCE(v_pi.override_applied, false)
        THEN NULL
        WHEN v_a_temp > 0 AND v_meps_2030 IS NOT NULL
        THEN round((v_base_energy / NULLIF(v_a_temp, 0)) - v_meps_2030, 4)
        ELSE NULL END,
      meps_2033_gap = CASE
        WHEN v_pi.data_gap_status = 'INCOMPLETE_DATA'
             AND NOT COALESCE(v_pi.override_applied, false)
        THEN NULL
        WHEN v_a_temp > 0 AND v_meps_2033 IS NOT NULL
        THEN round((v_base_energy / NULLIF(v_a_temp, 0)) - v_meps_2033, 4)
        ELSE NULL END,
      crrem_stranding_year = CASE
        WHEN v_pi.data_gap_status = 'INCOMPLETE_DATA'
             AND NOT COALESCE(v_pi.override_applied, false)
        THEN NULL
        WHEN v_a_temp > 0 THEN
          public.calculate_crrem_stranding_year(
            p_building_id, p_year,
            round(v_base_ghg / NULLIF(v_a_temp, 0), 6),
            COALESCE(v_pi.crrem_version_used, v_crrem_version),
            v_primary_use::text
          )
        ELSE NULL END,
      calculation_method = 'calculate_yearly_performance_v2+adjustments',
      calculated_at = now(),
      updated_at = now()
    WHERE id = v_pi.id
    RETURNING * INTO v_pi;
  END IF;

  -- Fas 8: always refresh compliance + risk
  UPDATE public.performance_indicators SET
    meps_status = app.meps_status_from_gap(meps_2030_gap),
    crrem_misalignment_year = crrem_stranding_year,
    financial_risk_flag = (
      crrem_stranding_year IS NOT NULL AND crrem_stranding_year < 2035
    ),
    updated_at = now()
  WHERE id = v_pi.id
  RETURNING * INTO v_pi;

  BEGIN
    PERFORM public.calculate_combined_risk_score(p_building_id, p_year);
    SELECT * INTO v_pi FROM public.performance_indicators WHERE id = v_pi.id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN v_pi;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. generate_renovation_plan
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_renovation_plan(
  p_building_id uuid,
  p_year int DEFAULT NULL,
  p_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_year int;
  v_pi public.performance_indicators;
  v_plan_id uuid;
  v_property_id uuid;
  v_bname text;
  r record;
  v_order int := 0;
  v_total_cost numeric := 0;
  v_gap_red numeric := 0;
  v_shift int := 0;
  v_score numeric;
BEGIN
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::int - 1);

  SELECT b.property_id, b.name INTO v_property_id, v_bname
    FROM public.buildings b WHERE b.id = p_building_id;

  SELECT * INTO v_pi FROM public.performance_indicators
   WHERE building_id = p_building_id AND year = v_year;
  IF NOT FOUND THEN
    SELECT * INTO v_pi FROM public.performance_indicators
     WHERE building_id = p_building_id ORDER BY year DESC LIMIT 1;
    IF FOUND THEN v_year := v_pi.year; END IF;
  END IF;

  v_score := public.calculate_combined_risk_score(p_building_id, v_year);

  INSERT INTO public.renovation_plans (
    building_id, property_id, title, status,
    target_misalignment_year, target_meps_status,
    total_estimated_cost, currency,
    baseline_combined_score, created_by
  ) VALUES (
    p_building_id, v_property_id,
    COALESCE(p_title, 'Renovationsplan – ' || COALESCE(v_bname, 'byggnad')),
    'draft',
    GREATEST(2035, COALESCE(v_pi.crrem_misalignment_year, v_pi.crrem_stranding_year, 2030) + 10),
    'compliant',
    0, 'SEK',
    v_score, auth.uid()
  )
  RETURNING id INTO v_plan_id;

  FOR r IN
    SELECT * FROM public.actions a
     WHERE a.building_id = p_building_id
       AND a.status IN ('proposed', 'approved', 'in_progress')
     ORDER BY a.priority_score DESC NULLS LAST
     LIMIT 8
  LOOP
    v_order := v_order + 1;
    INSERT INTO public.renovation_plan_actions (
      plan_id, action_id, sort_order, expected_impact
    ) VALUES (
      v_plan_id, r.id, v_order,
      jsonb_build_object(
        'meps_gap', COALESCE(r.estimated_meps_gap_reduction,
          CASE WHEN r.estimated_saving_kwh IS NOT NULL AND v_pi.a_temp > 0
            THEN round(r.estimated_saving_kwh / v_pi.a_temp, 2) ELSE NULL END),
        'misalignment_shift', COALESCE(r.estimated_misalignment_year_shift,
          CASE WHEN r.estimated_saving_kwh IS NOT NULL AND v_pi.a_temp > 0
            THEN GREATEST(0, floor((r.estimated_saving_kwh / v_pi.a_temp) / 10)::int)
            ELSE NULL END),
        'ped', r.estimated_ped_reduction
      )
    );
    v_total_cost := v_total_cost + COALESCE(r.investment_cost, 0);
    v_gap_red := v_gap_red + COALESCE(r.estimated_meps_gap_reduction,
      CASE WHEN r.estimated_saving_kwh IS NOT NULL AND COALESCE(v_pi.a_temp,0) > 0
        THEN r.estimated_saving_kwh / v_pi.a_temp ELSE 0 END);
    v_shift := v_shift + COALESCE(r.estimated_misalignment_year_shift, 0);
  END LOOP;

  UPDATE public.renovation_plans SET
    total_estimated_cost = v_total_cost,
    projected_combined_score = GREATEST(0, COALESCE(v_score, 0) - LEAST(40, v_gap_red)),
    target_misalignment_year = COALESCE(v_pi.crrem_misalignment_year, v_pi.crrem_stranding_year)
      + GREATEST(v_shift, CASE WHEN v_gap_red > 0 THEN floor(v_gap_red / 10)::int ELSE 0 END),
    updated_at = now()
  WHERE id = v_plan_id;

  RETURN v_plan_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. Batch: beräkna risk för alla PI ett givet år
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_all_risk_scores(p_year int)
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT building_id FROM public.performance_indicators WHERE year = p_year
  LOOP
    PERFORM public.calculate_combined_risk_score(r.building_id, p_year);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.risk_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renovation_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renovation_plan_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS risk_scores_select ON public.risk_scores;
CREATE POLICY risk_scores_select ON public.risk_scores
  FOR SELECT TO authenticated
  USING (app.user_has_building_access(building_id) OR app.is_admin());

DROP POLICY IF EXISTS risk_scores_write ON public.risk_scores;
CREATE POLICY risk_scores_write ON public.risk_scores
  FOR ALL TO authenticated
  USING (app.can_write())
  WITH CHECK (app.can_write());

DROP POLICY IF EXISTS renovation_plans_select ON public.renovation_plans;
CREATE POLICY renovation_plans_select ON public.renovation_plans
  FOR SELECT TO authenticated
  USING (
    app.is_admin()
    OR (building_id IS NOT NULL AND app.user_has_building_access(building_id))
    OR (property_id IS NOT NULL AND app.user_has_property_access(property_id))
  );

DROP POLICY IF EXISTS renovation_plans_write ON public.renovation_plans;
CREATE POLICY renovation_plans_write ON public.renovation_plans
  FOR ALL TO authenticated
  USING (app.can_write())
  WITH CHECK (app.can_write());

DROP POLICY IF EXISTS renovation_plan_actions_select ON public.renovation_plan_actions;
CREATE POLICY renovation_plan_actions_select ON public.renovation_plan_actions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.renovation_plans rp
       WHERE rp.id = plan_id
         AND (
           app.is_admin()
           OR (rp.building_id IS NOT NULL AND app.user_has_building_access(rp.building_id))
           OR (rp.property_id IS NOT NULL AND app.user_has_property_access(rp.property_id))
         )
    )
  );

DROP POLICY IF EXISTS renovation_plan_actions_write ON public.renovation_plan_actions;
CREATE POLICY renovation_plan_actions_write ON public.renovation_plan_actions
  FOR ALL TO authenticated
  USING (app.can_write())
  WITH CHECK (app.can_write());

GRANT EXECUTE ON FUNCTION public.calculate_combined_risk_score(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_performance_compliance_fields(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_after_action(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_renovation_plan(uuid, int, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_all_risk_scores(int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.meps_status_from_gap(numeric) TO authenticated, service_role;

-- =============================================================================
-- End Fas 8
-- =============================================================================
