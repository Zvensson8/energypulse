-- =============================================================================
-- EnergyPulse Fas 7 – Action & Risk Workflow Engine
-- action_applications, performance_adjustments, risk workflow, mitigation plans,
-- data_edit_sessions, improvement detection, SQL-funktioner + triggers
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.application_status AS ENUM ('applied', 'reverted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.risk_workflow_status AS ENUM (
    'open', 'monitoring', 'resolved', 'dismissed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.compliance_risk_kind AS ENUM (
    'meps_2030', 'meps_2033', 'crrem_stranding'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.mitigation_plan_status AS ENUM (
    'draft', 'accepted', 'rejected', 'superseded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.data_edit_entity AS ENUM (
    'energy_consumption', 'areas', 'performance_indicators'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2. actions.source
-- ---------------------------------------------------------------------------
ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';

COMMENT ON COLUMN public.actions.source IS
  'manual | improvement_detection | mitigation_plan';

-- ---------------------------------------------------------------------------
-- 3. performance_adjustments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.performance_adjustments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id              uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  year                     int NOT NULL,
  source_type              text NOT NULL, -- action_application | manual_edit | import
  source_id                uuid,
  delta_total_energy_kwh   numeric(16,3) NOT NULL DEFAULT 0,
  delta_ghg_kg             numeric(16,3),
  is_active                boolean NOT NULL DEFAULT true,
  notes                    text,
  created_by               uuid,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT performance_adjustments_year_chk CHECK (year BETWEEN 2000 AND 2100)
);

CREATE INDEX IF NOT EXISTS idx_perf_adj_building_year_active
  ON public.performance_adjustments (building_id, year)
  WHERE is_active = true;

SELECT app.attach_standard_triggers('public.performance_adjustments');

-- ---------------------------------------------------------------------------
-- 4. action_applications (före/efter)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.action_applications (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id                   uuid NOT NULL REFERENCES public.actions(id) ON DELETE CASCADE,
  building_id                 uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  target_year                 int NOT NULL,
  applied_by                  uuid,
  applied_at                  timestamptz NOT NULL DEFAULT now(),
  status                      public.application_status NOT NULL DEFAULT 'applied',
  method                      text NOT NULL DEFAULT 'modeled_saving_v1',
  reason                      text,
  saving_kwh_applied          numeric(14,3),
  -- baseline
  baseline_energy_intensity   numeric(12,4),
  baseline_primary_energy     numeric(12,4),
  baseline_ghg_intensity      numeric(12,6),
  baseline_meps_2030_gap      numeric(12,4),
  baseline_meps_2033_gap      numeric(12,4),
  baseline_stranding_year     int,
  baseline_data_gap_status    public.data_gap_status,
  -- result
  result_energy_intensity     numeric(12,4),
  result_primary_energy       numeric(12,4),
  result_ghg_intensity        numeric(12,6),
  result_meps_2030_gap        numeric(12,4),
  result_meps_2033_gap        numeric(12,4),
  result_stranding_year       int,
  result_data_gap_status      public.data_gap_status,
  adjustment_id               uuid REFERENCES public.performance_adjustments(id) ON DELETE SET NULL,
  reverted_at                 timestamptz,
  reverted_by                 uuid,
  revert_reason               text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT action_applications_year_chk CHECK (target_year BETWEEN 2000 AND 2100)
);

CREATE INDEX IF NOT EXISTS idx_action_app_action
  ON public.action_applications (action_id, status);
CREATE INDEX IF NOT EXISTS idx_action_app_building
  ON public.action_applications (building_id, target_year);

SELECT app.attach_standard_triggers('public.action_applications');

-- En aktiv application per action
CREATE UNIQUE INDEX IF NOT EXISTS uq_action_app_active
  ON public.action_applications (action_id)
  WHERE status = 'applied';

-- ---------------------------------------------------------------------------
-- 5. physical_risks workflow
-- ---------------------------------------------------------------------------
ALTER TABLE public.physical_risks
  ADD COLUMN IF NOT EXISTS workflow_status public.risk_workflow_status
    NOT NULL DEFAULT 'open';
ALTER TABLE public.physical_risks
  ADD COLUMN IF NOT EXISTS status_reason text;
ALTER TABLE public.physical_risks
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;
ALTER TABLE public.physical_risks
  ADD COLUMN IF NOT EXISTS status_changed_by uuid;

COMMENT ON COLUMN public.physical_risks.workflow_status IS
  'open | monitoring | resolved | dismissed – resolved/dismissed kräver status_reason';

-- ---------------------------------------------------------------------------
-- 6. compliance_risks (MEPS/CRREM)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.compliance_risks (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id        uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  year               int NOT NULL,
  risk_kind          public.compliance_risk_kind NOT NULL,
  metric_value       numeric(14,4),
  severity           numeric(6,2),
  workflow_status    public.risk_workflow_status NOT NULL DEFAULT 'open',
  status_reason      text,
  status_changed_at  timestamptz,
  status_changed_by  uuid,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compliance_risks_year_chk CHECK (year BETWEEN 2000 AND 2100)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_compliance_risks_open
  ON public.compliance_risks (building_id, year, risk_kind)
  WHERE workflow_status IN ('open', 'monitoring');

CREATE INDEX IF NOT EXISTS idx_compliance_risks_status
  ON public.compliance_risks (workflow_status, year);

SELECT app.attach_standard_triggers('public.compliance_risks');

-- ---------------------------------------------------------------------------
-- 7. mitigation_plans
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mitigation_plans (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  building_id                uuid NOT NULL REFERENCES public.buildings(id) ON DELETE CASCADE,
  year                       int NOT NULL,
  status                     public.mitigation_plan_status NOT NULL DEFAULT 'draft',
  total_cost                 numeric(14,2),
  total_saving_kwh           numeric(14,3),
  expected_meps_delta        numeric(12,4),
  expected_stranding_after   int,
  baseline_meps_2030_gap     numeric(12,4),
  baseline_stranding_year    int,
  generated_by               uuid,
  accepted_at                timestamptz,
  accepted_by                uuid,
  notes                      text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mitigation_plan_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id               uuid NOT NULL REFERENCES public.mitigation_plans(id) ON DELETE CASCADE,
  action_id             uuid REFERENCES public.actions(id) ON DELETE SET NULL,
  sort_order            int NOT NULL DEFAULT 0,
  include_in_plan       boolean NOT NULL DEFAULT true,
  title_snapshot        text,
  investment_cost       numeric(14,2),
  estimated_saving_kwh  numeric(14,3),
  payback_years         numeric(8,2),
  priority_score        numeric(8,4),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mitigation_plans_building
  ON public.mitigation_plans (building_id, year, status);

SELECT app.attach_standard_triggers('public.mitigation_plans');

-- ---------------------------------------------------------------------------
-- 8. data_edit_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_edit_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       public.data_edit_entity NOT NULL,
  entity_id         uuid NOT NULL,
  building_id       uuid REFERENCES public.buildings(id) ON DELETE SET NULL,
  snapshot_before   jsonb NOT NULL,
  snapshot_after    jsonb,
  reason            text NOT NULL,
  changed_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  rolled_back_at    timestamptz,
  rollback_reason   text,
  rolled_back_by    uuid,
  CONSTRAINT data_edit_reason_chk CHECK (length(trim(reason)) >= 5)
);

CREATE INDEX IF NOT EXISTS idx_data_edit_sessions_entity
  ON public.data_edit_sessions (entity_type, entity_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 9. system_config seeds
-- ---------------------------------------------------------------------------
INSERT INTO public.system_config (key, value, description)
VALUES
  (
    'improvement_detection',
    '{"min_primary_energy_intensity": 170, "min_years": 3, "min_improvement_pct": 10}'::jsonb,
    'Fas 7: trösklar för förslag om ny energideklaration'
  ),
  (
    'fas7_workflow',
    '{"apply_on_completed": true, "adjustment_method": "modeled_saving_v1"}'::jsonb,
    'Fas 7: workflow-flaggor'
  )
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 10. recalculate_performance_with_adjustments
-- ---------------------------------------------------------------------------
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
  -- Basberäkning från mätvärden
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

  IF v_delta_kwh = 0 AND v_delta_ghg = 0 THEN
    UPDATE public.performance_indicators
       SET calculation_method = 'calculate_yearly_performance_v2'
     WHERE id = v_pi.id;
    RETURN v_pi;
  END IF;

  v_base_energy := COALESCE(v_pi.total_energy_kwh, 0);
  v_base_pe := COALESCE(v_pi.primary_energy_intensity, 0) * COALESCE(v_pi.a_temp, 0);
  v_base_ghg := COALESCE(v_pi.ghg_intensity, 0) * COALESCE(v_pi.a_temp, 0);
  v_a_temp := COALESCE(v_pi.a_temp, 0);

  -- Skala PE/GHG proportionellt mot energiförändring om bas > 0
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

  RETURN v_pi;
END;
$$;

COMMENT ON FUNCTION public.recalculate_performance_with_adjustments IS
  'Fas 7: bas-calc + aktiva performance_adjustments (modeled savings).';

-- ---------------------------------------------------------------------------
-- 11. apply_completed_action
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_completed_action(
  p_action_id uuid,
  p_year int DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS public.action_applications
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app, extensions
AS $$
DECLARE
  v_action public.actions;
  v_year int;
  v_baseline public.performance_indicators;
  v_result public.performance_indicators;
  v_adj_id uuid;
  v_saving numeric;
  v_app public.action_applications;
  v_existing uuid;
BEGIN
  SELECT * INTO v_action FROM public.actions WHERE id = p_action_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'action % not found', p_action_id;
  END IF;

  -- Redan applied?
  SELECT id INTO v_existing
    FROM public.action_applications
   WHERE action_id = p_action_id AND status = 'applied'
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    SELECT * INTO v_app FROM public.action_applications WHERE id = v_existing;
    RETURN v_app;
  END IF;

  v_year := COALESCE(
    p_year,
    EXTRACT(YEAR FROM COALESCE(v_action.completed_date, CURRENT_DATE))::int,
    EXTRACT(YEAR FROM CURRENT_DATE)::int - 1
  );

  -- Snapshot baseline (senaste PI för year, annars senaste överhuvudtaget)
  SELECT * INTO v_baseline
    FROM public.performance_indicators
   WHERE building_id = v_action.building_id AND year = v_year;

  IF NOT FOUND THEN
    SELECT * INTO v_baseline
      FROM public.performance_indicators
     WHERE building_id = v_action.building_id
     ORDER BY year DESC LIMIT 1;
    IF FOUND THEN
      v_year := v_baseline.year;
    END IF;
  END IF;

  v_saving := COALESCE(v_action.estimated_saving_kwh, 0);

  -- Om ingen spar: bara recalc + logga noll-application
  IF v_saving > 0 THEN
    INSERT INTO public.performance_adjustments (
      building_id, year, source_type, source_id,
      delta_total_energy_kwh, is_active, notes, created_by
    ) VALUES (
      v_action.building_id, v_year, 'action_application', p_action_id,
      -v_saving, true,
      'Fas7 modeled saving från action ' || p_action_id::text,
      auth.uid()
    )
    RETURNING id INTO v_adj_id;
  END IF;

  BEGIN
    v_result := public.recalculate_performance_with_adjustments(
      v_action.building_id, v_year, false, null
    );
  EXCEPTION WHEN OTHERS THEN
    -- Om area saknas m.m. – spara ändå application med baseline only
    v_result := v_baseline;
  END;

  INSERT INTO public.action_applications (
    action_id, building_id, target_year, applied_by, status, method, reason,
    saving_kwh_applied, adjustment_id,
    baseline_energy_intensity, baseline_primary_energy, baseline_ghg_intensity,
    baseline_meps_2030_gap, baseline_meps_2033_gap, baseline_stranding_year,
    baseline_data_gap_status,
    result_energy_intensity, result_primary_energy, result_ghg_intensity,
    result_meps_2030_gap, result_meps_2033_gap, result_stranding_year,
    result_data_gap_status
  ) VALUES (
    p_action_id, v_action.building_id, v_year, auth.uid(), 'applied',
    'modeled_saving_v1', p_reason, v_saving, v_adj_id,
    v_baseline.energy_intensity, v_baseline.primary_energy_intensity,
    v_baseline.ghg_intensity, v_baseline.meps_2030_gap, v_baseline.meps_2033_gap,
    v_baseline.crrem_stranding_year, v_baseline.data_gap_status,
    v_result.energy_intensity, v_result.primary_energy_intensity,
    v_result.ghg_intensity, v_result.meps_2030_gap, v_result.meps_2033_gap,
    v_result.crrem_stranding_year, v_result.data_gap_status
  )
  RETURNING * INTO v_app;

  INSERT INTO public.data_quality_logs (
    entity_type, entity_id, field, old_value, new_value,
    changed_by, operation, override_reason
  ) VALUES (
    'action_applications', v_app.id, 'apply_completed_action',
    COALESCE(v_baseline.meps_2030_gap::text, 'null')
      || '|' || COALESCE(v_baseline.crrem_stranding_year::text, 'null'),
    COALESCE(v_result.meps_2030_gap::text, 'null')
      || '|' || COALESCE(v_result.crrem_stranding_year::text, 'null'),
    auth.uid(), 'ACTION_APPLY',
    COALESCE(p_reason, 'Åtgärd completed – modeled saving tillämpad')
  );

  RETURN v_app;
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. revert_action_application
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revert_action_application(
  p_application_id uuid,
  p_reason text
)
RETURNS public.action_applications
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app, extensions
AS $$
DECLARE
  v_app public.action_applications;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'revert_reason required (min 5 chars)';
  END IF;

  SELECT * INTO v_app FROM public.action_applications WHERE id = p_application_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'application % not found', p_application_id;
  END IF;
  IF v_app.status = 'reverted' THEN
    RETURN v_app;
  END IF;

  IF v_app.adjustment_id IS NOT NULL THEN
    UPDATE public.performance_adjustments
       SET is_active = false, updated_at = now()
     WHERE id = v_app.adjustment_id;
  END IF;

  PERFORM public.recalculate_performance_with_adjustments(
    v_app.building_id, v_app.target_year, false, null
  );

  UPDATE public.action_applications SET
    status = 'reverted',
    reverted_at = now(),
    reverted_by = auth.uid(),
    revert_reason = p_reason,
    updated_at = now()
  WHERE id = p_application_id
  RETURNING * INTO v_app;

  INSERT INTO public.data_quality_logs (
    entity_type, entity_id, field, old_value, new_value,
    changed_by, operation, override_reason
  ) VALUES (
    'action_applications', p_application_id, 'status',
    'applied', 'reverted', auth.uid(), 'ROLLBACK', p_reason
  );

  RETURN v_app;
END;
$$;

-- ---------------------------------------------------------------------------
-- 13. Trigger: actions → completed
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.trg_action_completed_apply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app
AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    IF NEW.completed_date IS NULL THEN
      NEW.completed_date := CURRENT_DATE;
    END IF;
    -- Apply efter UPDATE (statement-level via AFTER) – se AFTER-trigger
  END IF;
  RETURN NEW;
END;
$$;

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
    EXCEPTION WHEN OTHERS THEN
      -- Logga men blockera inte status-uppdatering
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

DROP TRIGGER IF EXISTS trg_actions_completed_before ON public.actions;
CREATE TRIGGER trg_actions_completed_before
  BEFORE UPDATE OF status ON public.actions
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION app.trg_action_completed_apply();

DROP TRIGGER IF EXISTS trg_actions_completed_after ON public.actions;
CREATE TRIGGER trg_actions_completed_after
  AFTER UPDATE OF status ON public.actions
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION app.trg_action_completed_apply_after();

-- ---------------------------------------------------------------------------
-- 14. Risk workflow status
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_physical_risk_status(
  p_risk_id uuid,
  p_status public.risk_workflow_status,
  p_reason text DEFAULT NULL
)
RETURNS public.physical_risks
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_row public.physical_risks;
  v_old text;
BEGIN
  IF p_status IN ('resolved', 'dismissed')
     AND (p_reason IS NULL OR length(trim(p_reason)) < 5) THEN
    RAISE EXCEPTION 'status_reason required for resolved/dismissed (min 5 chars)';
  END IF;

  SELECT * INTO v_row FROM public.physical_risks WHERE id = p_risk_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'physical_risk not found'; END IF;
  v_old := v_row.workflow_status::text;

  UPDATE public.physical_risks SET
    workflow_status = p_status,
    status_reason = CASE
      WHEN p_status IN ('resolved', 'dismissed') THEN p_reason
      ELSE COALESCE(p_reason, status_reason)
    END,
    status_changed_at = now(),
    status_changed_by = auth.uid(),
    updated_at = now()
  WHERE id = p_risk_id
  RETURNING * INTO v_row;

  INSERT INTO public.data_quality_logs (
    entity_type, entity_id, field, old_value, new_value,
    changed_by, operation, override_reason
  ) VALUES (
    'physical_risks', p_risk_id, 'workflow_status',
    v_old, p_status::text, auth.uid(), 'RISK_STATUS', p_reason
  );

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_compliance_risk_status(
  p_risk_id uuid,
  p_status public.risk_workflow_status,
  p_reason text DEFAULT NULL
)
RETURNS public.compliance_risks
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_row public.compliance_risks;
  v_old text;
BEGIN
  IF p_status IN ('resolved', 'dismissed')
     AND (p_reason IS NULL OR length(trim(p_reason)) < 5) THEN
    RAISE EXCEPTION 'status_reason required for resolved/dismissed (min 5 chars)';
  END IF;

  SELECT * INTO v_row FROM public.compliance_risks WHERE id = p_risk_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'compliance_risk not found'; END IF;
  v_old := v_row.workflow_status::text;

  UPDATE public.compliance_risks SET
    workflow_status = p_status,
    status_reason = CASE
      WHEN p_status IN ('resolved', 'dismissed') THEN p_reason
      ELSE COALESCE(p_reason, status_reason)
    END,
    status_changed_at = now(),
    status_changed_by = auth.uid(),
    updated_at = now()
  WHERE id = p_risk_id
  RETURNING * INTO v_row;

  INSERT INTO public.data_quality_logs (
    entity_type, entity_id, field, old_value, new_value,
    changed_by, operation, override_reason
  ) VALUES (
    'compliance_risks', p_risk_id, 'workflow_status',
    v_old, p_status::text, auth.uid(), 'RISK_STATUS', p_reason
  );

  RETURN v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- 15. refresh_compliance_risks
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_compliance_risks(p_year int)
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_count int := 0;
  r record;
  v_id uuid;
BEGIN
  FOR r IN
    SELECT pi.building_id, pi.year, pi.meps_2030_gap, pi.meps_2033_gap,
           pi.crrem_stranding_year, pi.energy_intensity
      FROM public.performance_indicators pi
     WHERE pi.year = p_year
  LOOP
    -- MEPS 2030
    IF r.meps_2030_gap IS NOT NULL AND r.meps_2030_gap > 0 THEN
      SELECT id INTO v_id FROM public.compliance_risks
       WHERE building_id = r.building_id AND year = r.year
         AND risk_kind = 'meps_2030'
         AND workflow_status IN ('open', 'monitoring')
       LIMIT 1;
      IF v_id IS NULL THEN
        -- hoppa om dismissed/resolved finns för samma key? skapa endast om ingen stängd nyligen
        IF NOT EXISTS (
          SELECT 1 FROM public.compliance_risks
           WHERE building_id = r.building_id AND year = r.year
             AND risk_kind = 'meps_2030'
             AND workflow_status IN ('resolved', 'dismissed')
        ) THEN
          INSERT INTO public.compliance_risks (
            building_id, year, risk_kind, metric_value, severity, workflow_status
          ) VALUES (
            r.building_id, r.year, 'meps_2030', r.meps_2030_gap,
            LEAST(16, r.meps_2030_gap / 10.0), 'open'
          );
          v_count := v_count + 1;
        END IF;
      ELSE
        UPDATE public.compliance_risks SET
          metric_value = r.meps_2030_gap,
          severity = LEAST(16, r.meps_2030_gap / 10.0),
          updated_at = now()
        WHERE id = v_id;
      END IF;
    END IF;

    -- CRREM stranding within 10y
    IF r.crrem_stranding_year IS NOT NULL
       AND r.crrem_stranding_year <= EXTRACT(YEAR FROM CURRENT_DATE)::int + 10 THEN
      SELECT id INTO v_id FROM public.compliance_risks
       WHERE building_id = r.building_id AND year = r.year
         AND risk_kind = 'crrem_stranding'
         AND workflow_status IN ('open', 'monitoring')
       LIMIT 1;
      IF v_id IS NULL THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.compliance_risks
           WHERE building_id = r.building_id AND year = r.year
             AND risk_kind = 'crrem_stranding'
             AND workflow_status IN ('resolved', 'dismissed')
        ) THEN
          INSERT INTO public.compliance_risks (
            building_id, year, risk_kind, metric_value, severity, workflow_status
          ) VALUES (
            r.building_id, r.year, 'crrem_stranding',
            r.crrem_stranding_year::numeric,
            GREATEST(1, 16 - (r.crrem_stranding_year - EXTRACT(YEAR FROM CURRENT_DATE)::int)),
            'open'
          );
          v_count := v_count + 1;
        END IF;
      ELSE
        UPDATE public.compliance_risks SET
          metric_value = r.crrem_stranding_year::numeric,
          severity = GREATEST(1, 16 - (r.crrem_stranding_year
            - EXTRACT(YEAR FROM CURRENT_DATE)::int)),
          updated_at = now()
        WHERE id = v_id;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 16. Improvement detection
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_improvement_candidates(
  p_min_intensity numeric DEFAULT 170,
  p_min_years int DEFAULT 3,
  p_min_improvement_pct numeric DEFAULT 10
)
RETURNS TABLE (
  building_id uuid,
  building_name text,
  latest_year int,
  latest_primary_energy numeric,
  latest_energy_class public.energy_class,
  oldest_intensity numeric,
  latest_intensity numeric,
  improvement_pct numeric,
  years_span int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      pi.building_id,
      pi.year,
      pi.primary_energy_intensity,
      pi.energy_intensity,
      pi.energy_class,
      ROW_NUMBER() OVER (PARTITION BY pi.building_id ORDER BY pi.year DESC) AS rn_desc,
      ROW_NUMBER() OVER (PARTITION BY pi.building_id ORDER BY pi.year ASC) AS rn_asc,
      COUNT(*) OVER (PARTITION BY pi.building_id) AS n_years
    FROM public.performance_indicators pi
    WHERE pi.energy_intensity IS NOT NULL
  ),
  ends AS (
    SELECT
      d.building_id,
      d.year AS latest_year,
      d.primary_energy_intensity AS latest_primary_energy,
      d.energy_class AS latest_energy_class,
      d.energy_intensity AS latest_intensity,
      o.energy_intensity AS oldest_intensity,
      d.n_years,
      o.year AS oldest_year
    FROM ranked d
    JOIN ranked o ON o.building_id = d.building_id AND o.rn_asc = 1
    WHERE d.rn_desc = 1
      AND d.n_years >= p_min_years
  )
  SELECT
    e.building_id,
    b.name AS building_name,
    e.latest_year,
    e.latest_primary_energy,
    e.latest_energy_class,
    e.oldest_intensity,
    e.latest_intensity,
    CASE WHEN e.oldest_intensity > 0
      THEN round(((e.oldest_intensity - e.latest_intensity) / e.oldest_intensity) * 100, 1)
      ELSE 0 END AS improvement_pct,
    (e.latest_year - e.oldest_year) AS years_span
  FROM ends e
  JOIN public.buildings b ON b.id = e.building_id
  WHERE (
      COALESCE(e.latest_primary_energy, e.latest_intensity) >= p_min_intensity
      OR e.latest_energy_class IN ('E', 'F', 'G')
    )
    AND e.oldest_intensity > e.latest_intensity
    AND CASE WHEN e.oldest_intensity > 0
      THEN ((e.oldest_intensity - e.latest_intensity) / e.oldest_intensity) * 100
      ELSE 0 END >= p_min_improvement_pct;
$$;

CREATE OR REPLACE FUNCTION public.suggest_declaration_actions()
RETURNS int
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  r record;
  v_count int := 0;
  v_min numeric := 170;
  v_years int := 3;
  v_pct numeric := 10;
  v_cfg jsonb;
BEGIN
  SELECT value INTO v_cfg FROM public.system_config WHERE key = 'improvement_detection';
  IF v_cfg IS NOT NULL THEN
    v_min := COALESCE((v_cfg->>'min_primary_energy_intensity')::numeric, 170);
    v_years := COALESCE((v_cfg->>'min_years')::int, 3);
    v_pct := COALESCE((v_cfg->>'min_improvement_pct')::numeric, 10);
  END IF;

  FOR r IN
    SELECT * FROM public.detect_improvement_candidates(v_min, v_years, v_pct)
  LOOP
    -- Finns redan öppen deklarationsåtgärd?
    IF EXISTS (
      SELECT 1 FROM public.actions a
       WHERE a.building_id = r.building_id
         AND a.source = 'improvement_detection'
         AND a.status IN ('proposed', 'approved', 'in_progress')
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.actions (
      building_id, title, category, description, status, source,
      estimated_saving_kwh, priority_score
    ) VALUES (
      r.building_id,
      'Ny energideklaration – ' || r.building_name,
      'other',
      format(
        'Automatiskt förslag (Fas 7): primärenergi/intensitet fortfarande hög (%.0f) men historisk förbättring %.1f %% över %s år (%.0f → %.0f kWh/m²). Ny deklaration kan bekräfta lägre klass och påverka CRREM-riskår positivt.',
        COALESCE(r.latest_primary_energy, r.latest_intensity),
        r.improvement_pct,
        r.years_span,
        r.oldest_intensity,
        r.latest_intensity
      ),
      'proposed',
      'improvement_detection',
      0,
      LEAST(1, r.improvement_pct / 50.0)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 17. Mitigation plan generate / accept
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_mitigation_plan(
  p_building_id uuid,
  p_year int DEFAULT NULL
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
  r record;
  v_order int := 0;
  v_total_cost numeric := 0;
  v_total_saving numeric := 0;
  v_intensity_red numeric := 0;
  v_a_temp numeric;
  v_gap numeric;
  v_stranding int;
BEGIN
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::int - 1);

  SELECT * INTO v_pi FROM public.performance_indicators
   WHERE building_id = p_building_id AND year = v_year;
  IF NOT FOUND THEN
    SELECT * INTO v_pi FROM public.performance_indicators
     WHERE building_id = p_building_id ORDER BY year DESC LIMIT 1;
    IF FOUND THEN v_year := v_pi.year; END IF;
  END IF;

  v_a_temp := COALESCE(v_pi.a_temp, 1);
  v_gap := COALESCE(v_pi.meps_2030_gap, 0);
  v_stranding := v_pi.crrem_stranding_year;

  -- Supersede previous drafts
  UPDATE public.mitigation_plans
     SET status = 'superseded', updated_at = now()
   WHERE building_id = p_building_id AND year = v_year AND status = 'draft';

  INSERT INTO public.mitigation_plans (
    building_id, year, status, generated_by,
    baseline_meps_2030_gap, baseline_stranding_year
  ) VALUES (
    p_building_id, v_year, 'draft', auth.uid(),
    v_pi.meps_2030_gap, v_pi.crrem_stranding_year
  )
  RETURNING id INTO v_plan_id;

  FOR r IN
    SELECT *
      FROM public.actions a
     WHERE a.building_id = p_building_id
       AND a.status IN ('proposed', 'approved')
     ORDER BY a.priority_score DESC NULLS LAST
     LIMIT 10
  LOOP
    v_order := v_order + 1;
    INSERT INTO public.mitigation_plan_items (
      plan_id, action_id, sort_order, include_in_plan,
      title_snapshot, investment_cost, estimated_saving_kwh,
      payback_years, priority_score
    ) VALUES (
      v_plan_id, r.id, v_order, true,
      r.title, r.investment_cost, r.estimated_saving_kwh,
      r.payback_years, r.priority_score
    );

    v_total_cost := v_total_cost + COALESCE(r.investment_cost, 0);
    v_total_saving := v_total_saving + COALESCE(r.estimated_saving_kwh, 0);
    v_intensity_red := v_intensity_red
      + COALESCE(r.estimated_saving_kwh, 0) / NULLIF(v_a_temp, 0);

    EXIT WHEN v_order >= 5;
  END LOOP;

  UPDATE public.mitigation_plans SET
    total_cost = v_total_cost,
    total_saving_kwh = v_total_saving,
    expected_meps_delta = -v_intensity_red,
    expected_stranding_after = CASE
      WHEN v_stranding IS NULL THEN NULL
      ELSE v_stranding + GREATEST(0, floor(v_intensity_red / 10)::int)
    END,
    updated_at = now()
  WHERE id = v_plan_id;

  RETURN v_plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_mitigation_plan(
  p_plan_id uuid,
  p_item_ids uuid[] DEFAULT NULL
)
RETURNS public.mitigation_plans
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_plan public.mitigation_plans;
  r record;
BEGIN
  SELECT * INTO v_plan FROM public.mitigation_plans WHERE id = p_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan not found'; END IF;
  IF v_plan.status <> 'draft' THEN
    RAISE EXCEPTION 'plan is not draft';
  END IF;

  FOR r IN
    SELECT * FROM public.mitigation_plan_items
     WHERE plan_id = p_plan_id
       AND include_in_plan = true
       AND (p_item_ids IS NULL OR id = ANY (p_item_ids))
  LOOP
    IF r.action_id IS NOT NULL THEN
      UPDATE public.actions SET
        status = 'approved',
        source = CASE WHEN source = 'manual' THEN 'mitigation_plan' ELSE source END,
        updated_at = now()
      WHERE id = r.action_id
        AND status = 'proposed';
    END IF;
  END LOOP;

  -- Mark non-selected as excluded
  IF p_item_ids IS NOT NULL THEN
    UPDATE public.mitigation_plan_items
       SET include_in_plan = false
     WHERE plan_id = p_plan_id
       AND NOT (id = ANY (p_item_ids));
  END IF;

  UPDATE public.mitigation_plans SET
    status = 'accepted',
    accepted_at = now(),
    accepted_by = auth.uid(),
    updated_at = now()
  WHERE id = p_plan_id
  RETURNING * INTO v_plan;

  INSERT INTO public.data_quality_logs (
    entity_type, entity_id, field, old_value, new_value,
    changed_by, operation, override_reason
  ) VALUES (
    'mitigation_plans', p_plan_id, 'status',
    'draft', 'accepted', auth.uid(), 'PLAN_ACCEPT',
    'Åtgärdsplan accepterad'
  );

  RETURN v_plan;
END;
$$;

-- ---------------------------------------------------------------------------
-- 18. Data edit (energy_consumption) + rollback
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_energy_consumption_edit(
  p_consumption_id uuid,
  p_new_kwh numeric,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_old public.energy_consumption;
  v_session_id uuid;
  v_role public.user_role;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason required (min 5 chars)';
  END IF;

  v_role := app.current_user_role();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'portfolio_manager') THEN
    -- service role (auth.uid null) allowed for scripts
    IF auth.uid() IS NOT NULL THEN
      RAISE EXCEPTION 'only admin/portfolio_manager may edit consumption';
    END IF;
  END IF;

  SELECT * INTO v_old FROM public.energy_consumption WHERE id = p_consumption_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'consumption row not found'; END IF;

  INSERT INTO public.data_edit_sessions (
    entity_type, entity_id, building_id, snapshot_before, reason, changed_by
  ) VALUES (
    'energy_consumption', p_consumption_id, v_old.building_id,
    to_jsonb(v_old), p_reason, auth.uid()
  )
  RETURNING id INTO v_session_id;

  UPDATE public.energy_consumption SET
    consumption_kwh = p_new_kwh,
    updated_at = now()
  WHERE id = p_consumption_id;

  UPDATE public.data_edit_sessions SET
    snapshot_after = (
      SELECT to_jsonb(ec) FROM public.energy_consumption ec WHERE ec.id = p_consumption_id
    )
  WHERE id = v_session_id;

  -- Recalc year
  PERFORM public.recalculate_performance_with_adjustments(
    v_old.building_id, v_old.year, false, null
  );

  INSERT INTO public.data_quality_logs (
    entity_type, entity_id, field, old_value, new_value,
    changed_by, operation, override_reason
  ) VALUES (
    'energy_consumption', p_consumption_id, 'consumption_kwh',
    v_old.consumption_kwh::text, p_new_kwh::text,
    auth.uid(), 'DATA_EDIT', p_reason
  );

  RETURN v_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_area_edit(
  p_area_id uuid,
  p_a_temp numeric,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_old public.areas;
  v_session_id uuid;
  v_role public.user_role;
  y int;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason required (min 5 chars)';
  END IF;
  v_role := app.current_user_role();
  IF auth.uid() IS NOT NULL AND (v_role IS NULL OR v_role NOT IN ('admin', 'portfolio_manager')) THEN
    RAISE EXCEPTION 'only admin/portfolio_manager may edit areas';
  END IF;

  SELECT * INTO v_old FROM public.areas WHERE id = p_area_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'area not found'; END IF;

  INSERT INTO public.data_edit_sessions (
    entity_type, entity_id, building_id, snapshot_before, reason, changed_by
  ) VALUES (
    'areas', p_area_id, v_old.building_id, to_jsonb(v_old), p_reason, auth.uid()
  )
  RETURNING id INTO v_session_id;

  UPDATE public.areas SET a_temp = p_a_temp, updated_at = now() WHERE id = p_area_id;

  UPDATE public.data_edit_sessions SET
    snapshot_after = (SELECT to_jsonb(a) FROM public.areas a WHERE a.id = p_area_id)
  WHERE id = v_session_id;

  -- Recalc years overlapping this area
  FOR y IN
    SELECT DISTINCT pi.year FROM public.performance_indicators pi
     WHERE pi.building_id = v_old.building_id
  LOOP
    BEGIN
      PERFORM public.recalculate_performance_with_adjustments(
        v_old.building_id, y, false, null
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  INSERT INTO public.data_quality_logs (
    entity_type, entity_id, field, old_value, new_value,
    changed_by, operation, override_reason
  ) VALUES (
    'areas', p_area_id, 'a_temp',
    v_old.a_temp::text, p_a_temp::text,
    auth.uid(), 'DATA_EDIT', p_reason
  );

  RETURN v_session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rollback_data_edit(
  p_session_id uuid,
  p_reason text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_s public.data_edit_sessions;
  v_role public.user_role;
  v_bid uuid;
  v_year int;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'rollback reason required';
  END IF;
  v_role := app.current_user_role();
  IF auth.uid() IS NOT NULL AND (v_role IS NULL OR v_role NOT IN ('admin', 'portfolio_manager')) THEN
    RAISE EXCEPTION 'only admin/portfolio_manager may rollback';
  END IF;

  SELECT * INTO v_s FROM public.data_edit_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'session not found'; END IF;
  IF v_s.rolled_back_at IS NOT NULL THEN
    RAISE EXCEPTION 'already rolled back';
  END IF;

  IF v_s.entity_type = 'energy_consumption' THEN
    UPDATE public.energy_consumption SET
      consumption_kwh = (v_s.snapshot_before->>'consumption_kwh')::numeric,
      updated_at = now()
    WHERE id = v_s.entity_id;
    v_bid := v_s.building_id;
    v_year := (v_s.snapshot_before->>'year')::int;
  ELSIF v_s.entity_type = 'areas' THEN
    UPDATE public.areas SET
      a_temp = (v_s.snapshot_before->>'a_temp')::numeric,
      updated_at = now()
    WHERE id = v_s.entity_id;
    v_bid := v_s.building_id;
  ELSE
    RAISE EXCEPTION 'rollback not implemented for %', v_s.entity_type;
  END IF;

  UPDATE public.data_edit_sessions SET
    rolled_back_at = now(),
    rollback_reason = p_reason,
    rolled_back_by = auth.uid()
  WHERE id = p_session_id;

  IF v_bid IS NOT NULL AND v_year IS NOT NULL THEN
    PERFORM public.recalculate_performance_with_adjustments(v_bid, v_year, false, null);
  ELSIF v_bid IS NOT NULL THEN
    PERFORM public.recalculate_performance_with_adjustments(
      v_bid, EXTRACT(YEAR FROM CURRENT_DATE)::int - 1, false, null
    );
  END IF;

  INSERT INTO public.data_quality_logs (
    entity_type, entity_id, field, old_value, new_value,
    changed_by, operation, override_reason
  ) VALUES (
    'data_edit_sessions', p_session_id, 'rollback',
    'applied', 'rolled_back', auth.uid(), 'ROLLBACK', p_reason
  );

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 19. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.performance_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitigation_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitigation_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_edit_sessions ENABLE ROW LEVEL SECURITY;

-- performance_adjustments
DROP POLICY IF EXISTS perf_adj_select ON public.performance_adjustments;
CREATE POLICY perf_adj_select ON public.performance_adjustments
  FOR SELECT TO authenticated
  USING (app.user_has_building_access(building_id) OR app.is_admin());

DROP POLICY IF EXISTS perf_adj_write ON public.performance_adjustments;
CREATE POLICY perf_adj_write ON public.performance_adjustments
  FOR ALL TO authenticated
  USING (app.can_write() AND (app.user_has_building_access(building_id) OR app.is_admin()))
  WITH CHECK (app.can_write() AND (app.user_has_building_access(building_id) OR app.is_admin()));

-- action_applications
DROP POLICY IF EXISTS action_app_select ON public.action_applications;
CREATE POLICY action_app_select ON public.action_applications
  FOR SELECT TO authenticated
  USING (app.user_has_building_access(building_id) OR app.is_admin());

DROP POLICY IF EXISTS action_app_write ON public.action_applications;
CREATE POLICY action_app_write ON public.action_applications
  FOR ALL TO authenticated
  USING (app.can_write())
  WITH CHECK (app.can_write());

-- compliance_risks
DROP POLICY IF EXISTS compliance_risks_select ON public.compliance_risks;
CREATE POLICY compliance_risks_select ON public.compliance_risks
  FOR SELECT TO authenticated
  USING (app.user_has_building_access(building_id) OR app.is_admin());

DROP POLICY IF EXISTS compliance_risks_write ON public.compliance_risks;
CREATE POLICY compliance_risks_write ON public.compliance_risks
  FOR ALL TO authenticated
  USING (app.can_write())
  WITH CHECK (app.can_write());

-- mitigation_plans
DROP POLICY IF EXISTS mitigation_plans_select ON public.mitigation_plans;
CREATE POLICY mitigation_plans_select ON public.mitigation_plans
  FOR SELECT TO authenticated
  USING (app.user_has_building_access(building_id) OR app.is_admin());

DROP POLICY IF EXISTS mitigation_plans_write ON public.mitigation_plans;
CREATE POLICY mitigation_plans_write ON public.mitigation_plans
  FOR ALL TO authenticated
  USING (app.can_write())
  WITH CHECK (app.can_write());

DROP POLICY IF EXISTS mitigation_items_select ON public.mitigation_plan_items;
CREATE POLICY mitigation_items_select ON public.mitigation_plan_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mitigation_plans mp
       WHERE mp.id = plan_id
         AND (app.user_has_building_access(mp.building_id) OR app.is_admin())
    )
  );

DROP POLICY IF EXISTS mitigation_items_write ON public.mitigation_plan_items;
CREATE POLICY mitigation_items_write ON public.mitigation_plan_items
  FOR ALL TO authenticated
  USING (app.can_write())
  WITH CHECK (app.can_write());

-- data_edit_sessions
DROP POLICY IF EXISTS data_edit_select ON public.data_edit_sessions;
CREATE POLICY data_edit_select ON public.data_edit_sessions
  FOR SELECT TO authenticated
  USING (app.is_portfolio_manager_or_admin() OR changed_by = auth.uid());

DROP POLICY IF EXISTS data_edit_write ON public.data_edit_sessions;
CREATE POLICY data_edit_write ON public.data_edit_sessions
  FOR ALL TO authenticated
  USING (app.is_portfolio_manager_or_admin())
  WITH CHECK (app.is_portfolio_manager_or_admin());

-- Grants
GRANT EXECUTE ON FUNCTION public.recalculate_performance_with_adjustments(uuid, int, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_completed_action(uuid, int, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revert_action_application(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_physical_risk_status(uuid, public.risk_workflow_status, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_compliance_risk_status(uuid, public.risk_workflow_status, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_compliance_risks(int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.detect_improvement_candidates(numeric, int, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.suggest_declaration_actions() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_mitigation_plan(uuid, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_mitigation_plan(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_energy_consumption_edit(uuid, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_area_edit(uuid, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rollback_data_edit(uuid, text) TO authenticated, service_role;

-- =============================================================================
-- End Fas 7 migration
-- =============================================================================
