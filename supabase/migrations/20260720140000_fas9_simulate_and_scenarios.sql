-- =============================================================================
-- Fas 9: Dry-run simulation + renovation plan from actions (engine-based)
-- =============================================================================
-- Pure projection: no status change, no performance_adjustments, no PI writes.
-- Same scale/MEPS/CRREM math as recalculate_performance_with_adjustments.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Optional columns on renovation_plans
-- ---------------------------------------------------------------------------
ALTER TABLE public.renovation_plans
  ADD COLUMN IF NOT EXISTS scenario_key text,
  ADD COLUMN IF NOT EXISTS projection jsonb;

COMMENT ON COLUMN public.renovation_plans.scenario_key IS
  'Fas 9: economy | balanced | aggressive (optional)';
COMMENT ON COLUMN public.renovation_plans.projection IS
  'Fas 9: full SimulationResult snapshot from engine dry-run';

-- ---------------------------------------------------------------------------
-- 1. Score combined risk from virtual metrics (no risk_scores / PI writes)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.score_combined_risk_virtual(
  p_building_id uuid,
  p_year int,
  p_meps_2030_gap numeric,
  p_crrem_stranding_year int,
  p_data_completeness_percent numeric,
  p_data_gap_status public.data_gap_status
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_w jsonb;
  v_wm numeric := 0.40;
  v_wc numeric := 0.35;
  v_wp numeric := 0.15;
  v_wd numeric := 0.10;
  v_meps_score numeric := 0;
  v_crrem_score numeric := 0;
  v_phys_score numeric := 0;
  v_dq_score numeric := 0;
  v_phys_avg numeric;
  v_property_id uuid;
  v_years_out numeric;
  v_gap_status text;
BEGIN
  v_gap_status := p_data_gap_status::text;

  BEGIN
    SELECT value INTO v_w FROM public.system_config WHERE key = 'combined_risk_weights';
    IF v_w IS NOT NULL THEN
      v_wm := COALESCE((v_w->>'meps')::numeric, 0.40);
      v_wc := COALESCE((v_w->>'crrem')::numeric, 0.35);
      v_wp := COALESCE((v_w->>'physical')::numeric, 0.15);
      v_wd := COALESCE((v_w->>'data_quality')::numeric, 0.10);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF p_meps_2030_gap IS NULL THEN
    v_meps_score := 50;
  ELSIF p_meps_2030_gap <= 0 THEN
    v_meps_score := 0;
  ELSE
    v_meps_score := LEAST(100, (p_meps_2030_gap / 150.0) * 100);
  END IF;

  IF p_crrem_stranding_year IS NULL THEN
    v_crrem_score := 30;
  ELSE
    v_years_out := p_crrem_stranding_year - EXTRACT(YEAR FROM CURRENT_DATE)::numeric;
    IF v_years_out <= 0 THEN
      v_crrem_score := 100;
    ELSIF v_years_out >= 25 THEN
      v_crrem_score := 0;
    ELSE
      v_crrem_score := (1 - v_years_out / 25.0) * 100;
    END IF;
  END IF;

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

  IF p_data_completeness_percent IS NULL THEN
    v_dq_score := 50;
  ELSE
    v_dq_score := GREATEST(0, 100 - p_data_completeness_percent);
  END IF;
  IF v_gap_status = 'INCOMPLETE_DATA' THEN
    v_dq_score := GREATEST(v_dq_score, 80);
  ELSIF v_gap_status = 'EXTRAPOLATED_WARNING' THEN
    v_dq_score := GREATEST(v_dq_score, 40);
  END IF;

  RETURN GREATEST(0, LEAST(100, round(
    v_wm * v_meps_score
    + v_wc * v_crrem_score
    + v_wp * v_phys_score
    + v_wd * v_dq_score
  , 2)));
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Project PI metrics with virtual energy delta (no writes)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.project_performance_with_virtual_delta(
  p_building_id uuid,
  p_year int,
  p_extra_delta_kwh numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app, extensions
AS $$
DECLARE
  v_pi public.performance_indicators;
  v_year int := p_year;
  v_building public.buildings;
  v_primary_use public.space_type;
  v_crrem_version text;
  v_meps_2030 numeric;
  v_meps_2033 numeric;
  v_fin_year int := 2035;
  v_w jsonb;
  v_base_energy numeric;
  v_base_pe numeric;
  v_base_ghg numeric;
  v_a_temp numeric;
  v_scale numeric;
  v_energy numeric;
  v_pe numeric;
  v_ghg numeric;
  v_intensity numeric;
  v_pe_int numeric;
  v_ghg_int numeric;
  v_gap_2030 numeric;
  v_gap_2033 numeric;
  v_strand int;
  v_meps_status text;
  v_score numeric;
  v_fin boolean;
  v_warnings text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO v_pi
    FROM public.performance_indicators
   WHERE building_id = p_building_id AND year = v_year;

  IF NOT FOUND THEN
    SELECT * INTO v_pi
      FROM public.performance_indicators
     WHERE building_id = p_building_id
     ORDER BY year DESC LIMIT 1;
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'ok', false,
        'building_id', p_building_id,
        'year', p_year,
        'warnings', jsonb_build_array('Ingen prestanda (PI) för byggnaden')
      );
    END IF;
    v_year := v_pi.year;
    v_warnings := array_append(v_warnings, 'Använde senaste PI-år ' || v_year::text);
  END IF;

  SELECT b.* INTO v_building FROM public.buildings b WHERE b.id = p_building_id;
  v_primary_use := COALESCE(v_building.primary_use, 'office'::public.space_type);

  BEGIN
    SELECT value INTO v_w FROM public.system_config WHERE key = 'combined_risk_weights';
    IF v_w IS NOT NULL THEN
      v_fin_year := COALESCE((v_w->>'financial_risk_year')::int, 2035);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

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

  v_a_temp := COALESCE(v_pi.a_temp, 0);
  v_base_energy := COALESCE(v_pi.total_energy_kwh, 0);
  v_base_pe := COALESCE(v_pi.primary_energy_intensity, 0) * NULLIF(v_a_temp, 0);
  v_base_ghg := COALESCE(v_pi.ghg_intensity, 0) * NULLIF(v_a_temp, 0);

  IF v_base_energy > 0 THEN
    v_scale := GREATEST(0, v_base_energy + COALESCE(p_extra_delta_kwh, 0)) / v_base_energy;
  ELSE
    v_scale := 1;
  END IF;

  v_energy := GREATEST(0, v_base_energy + COALESCE(p_extra_delta_kwh, 0));
  v_pe := GREATEST(0, COALESCE(v_base_pe, 0) * v_scale);
  v_ghg := GREATEST(0, COALESCE(v_base_ghg, 0) * v_scale);

  IF v_a_temp > 0 THEN
    v_intensity := round(v_energy / v_a_temp, 4);
    v_pe_int := round(v_pe / v_a_temp, 4);
    v_ghg_int := round(v_ghg / v_a_temp, 6);
  ELSE
    v_intensity := NULL;
    v_pe_int := NULL;
    v_ghg_int := NULL;
    v_warnings := array_append(v_warnings, 'Saknar Atemp');
  END IF;

  IF v_pi.data_gap_status = 'INCOMPLETE_DATA'
     AND NOT COALESCE(v_pi.override_applied, false) THEN
    v_gap_2030 := NULL;
    v_gap_2033 := NULL;
    v_strand := NULL;
    v_warnings := array_append(v_warnings, 'INCOMPLETE_DATA – gap/CRREM null utan override');
  ELSE
    IF v_a_temp > 0 AND v_meps_2030 IS NOT NULL THEN
      v_gap_2030 := round((v_energy / v_a_temp) - v_meps_2030, 4);
    ELSE
      v_gap_2030 := NULL;
    END IF;
    IF v_a_temp > 0 AND v_meps_2033 IS NOT NULL THEN
      v_gap_2033 := round((v_energy / v_a_temp) - v_meps_2033, 4);
    ELSE
      v_gap_2033 := NULL;
    END IF;
    IF v_a_temp > 0 AND v_ghg_int IS NOT NULL THEN
      BEGIN
        v_strand := public.calculate_crrem_stranding_year(
          p_building_id, v_year, v_ghg_int,
          COALESCE(v_pi.crrem_version_used, v_crrem_version),
          v_primary_use::text
        );
      EXCEPTION WHEN OTHERS THEN
        v_strand := v_pi.crrem_stranding_year;
        v_warnings := array_append(v_warnings, 'CRREM-beräkning misslyckades – behöll baseline');
      END;
    ELSE
      v_strand := NULL;
    END IF;
  END IF;

  v_meps_status := app.meps_status_from_gap(v_gap_2030);
  v_score := app.score_combined_risk_virtual(
    p_building_id, v_year, v_gap_2030, v_strand,
    v_pi.data_completeness_percent, v_pi.data_gap_status
  );
  v_fin := (v_strand IS NOT NULL AND v_strand < v_fin_year);

  RETURN jsonb_build_object(
    'ok', true,
    'building_id', p_building_id,
    'year', v_year,
    'extra_delta_kwh', COALESCE(p_extra_delta_kwh, 0),
    'energy_intensity', v_intensity,
    'primary_energy_intensity', v_pe_int,
    'ghg_intensity', v_ghg_int,
    'total_energy_kwh', v_energy,
    'meps_2030_gap', v_gap_2030,
    'meps_2033_gap', v_gap_2033,
    'meps_status', v_meps_status,
    'crrem_stranding_year', v_strand,
    'crrem_misalignment_year', v_strand,
    'combined_score', v_score,
    'financial_risk_flag', v_fin,
    'data_gap_status', v_pi.data_gap_status,
    'data_completeness_percent', v_pi.data_completeness_percent,
    'a_temp', NULLIF(v_a_temp, 0),
    'warnings', to_jsonb(v_warnings)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Snapshot helper: baseline metrics from current PI + virtual score
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.baseline_metrics_json(
  p_building_id uuid,
  p_year int
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
BEGIN
  -- delta 0 = current state (already includes active adjustments in PI)
  RETURN public.project_performance_with_virtual_delta(p_building_id, p_year, 0);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. simulate_actions_package
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.simulate_actions_package(
  p_building_id uuid,
  p_action_ids uuid[],
  p_year int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_year int;
  v_baseline jsonb;
  v_projected jsonb;
  v_saving numeric := 0;
  v_warnings text[] := ARRAY[]::text[];
  v_actions jsonb := '[]'::jsonb;
  r record;
  v_act_saving numeric;
  v_id uuid;
  v_delta_score numeric;
  v_delta_gap numeric;
  v_strand_gain int;
BEGIN
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::int - 1);

  IF p_action_ids IS NULL OR cardinality(p_action_ids) = 0 THEN
    v_baseline := app.baseline_metrics_json(p_building_id, v_year);
    RETURN jsonb_build_object(
      'building_id', p_building_id,
      'year', COALESCE((v_baseline->>'year')::int, v_year),
      'saving_kwh', 0,
      'baseline', v_baseline,
      'projected', v_baseline,
      'delta', jsonb_build_object(
        'energy_intensity', 0,
        'meps_2030_gap', 0,
        'stranding_years_gained', 0,
        'combined_score', 0
      ),
      'actions', '[]'::jsonb,
      'warnings', jsonb_build_array('Inga åtgärder i paketet')
    );
  END IF;

  FOREACH v_id IN ARRAY p_action_ids
  LOOP
    SELECT a.id, a.title, a.estimated_saving_kwh, a.investment_cost, a.building_id
      INTO r
      FROM public.actions a
     WHERE a.id = v_id;

    IF NOT FOUND THEN
      v_warnings := array_append(v_warnings, 'Åtgärd saknas: ' || v_id::text);
      CONTINUE;
    END IF;
    IF r.building_id IS DISTINCT FROM p_building_id THEN
      v_warnings := array_append(v_warnings, 'Åtgärd tillhör annan byggnad: ' || COALESCE(r.title, v_id::text));
      CONTINUE;
    END IF;

    v_act_saving := COALESCE(r.estimated_saving_kwh, 0);
    IF v_act_saving <= 0 THEN
      v_warnings := array_append(
        v_warnings,
        'Saknar estimated_saving_kwh: ' || COALESCE(r.title, v_id::text)
      );
    END IF;

    v_saving := v_saving + v_act_saving;
    v_actions := v_actions || jsonb_build_array(jsonb_build_object(
      'id', r.id,
      'title', r.title,
      'estimated_saving_kwh', r.estimated_saving_kwh,
      'investment_cost', r.investment_cost
    ));
  END LOOP;

  v_baseline := app.baseline_metrics_json(p_building_id, v_year);
  IF COALESCE((v_baseline->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'building_id', p_building_id,
      'year', v_year,
      'saving_kwh', v_saving,
      'baseline', v_baseline,
      'projected', v_baseline,
      'delta', jsonb_build_object(),
      'actions', v_actions,
      'warnings', COALESCE(v_baseline->'warnings', '[]'::jsonb) || to_jsonb(v_warnings)
    );
  END IF;

  v_year := COALESCE((v_baseline->>'year')::int, v_year);
  -- Negative delta = energy reduction
  v_projected := public.project_performance_with_virtual_delta(
    p_building_id, v_year, -v_saving
  );

  v_delta_score := COALESCE((v_projected->>'combined_score')::numeric, 0)
    - COALESCE((v_baseline->>'combined_score')::numeric, 0);
  v_delta_gap := COALESCE((v_projected->>'meps_2030_gap')::numeric, 0)
    - COALESCE((v_baseline->>'meps_2030_gap')::numeric, 0);
  v_strand_gain := COALESCE((v_projected->>'crrem_stranding_year')::int, 0)
    - COALESCE((v_baseline->>'crrem_stranding_year')::int, 0);
  -- If projected stranding is later, years gained is positive
  IF (v_baseline->>'crrem_stranding_year') IS NULL
     OR (v_projected->>'crrem_stranding_year') IS NULL THEN
    v_strand_gain := 0;
  END IF;

  IF v_saving <= 0 THEN
    v_warnings := array_append(v_warnings, 'Noll spar – simuleringen visar ingen effekt');
  END IF;

  RETURN jsonb_build_object(
    'building_id', p_building_id,
    'year', v_year,
    'saving_kwh', v_saving,
    'baseline', v_baseline,
    'projected', v_projected,
    'delta', jsonb_build_object(
      'energy_intensity',
        COALESCE((v_projected->>'energy_intensity')::numeric, 0)
        - COALESCE((v_baseline->>'energy_intensity')::numeric, 0),
      'meps_2030_gap', v_delta_gap,
      'stranding_years_gained', v_strand_gain,
      'combined_score', v_delta_score
    ),
    'actions', v_actions,
    'warnings', to_jsonb(v_warnings)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. simulate_action_impact (single)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.simulate_action_impact(
  p_action_id uuid,
  p_year int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_action public.actions;
BEGIN
  SELECT * INTO v_action FROM public.actions WHERE id = p_action_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'building_id', null,
      'year', p_year,
      'saving_kwh', 0,
      'warnings', jsonb_build_array('Åtgärd hittades inte')
    );
  END IF;

  RETURN public.simulate_actions_package(
    v_action.building_id,
    ARRAY[p_action_id],
    p_year
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. create_renovation_plan_from_actions (engine projection)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_renovation_plan_from_actions(
  p_building_id uuid,
  p_action_ids uuid[],
  p_year int DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_scenario_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_year int;
  v_sim jsonb;
  v_plan_id uuid;
  v_property_id uuid;
  v_bname text;
  v_order int := 0;
  v_total_cost numeric := 0;
  v_id uuid;
  r record;
  v_base_score numeric;
  v_proj_score numeric;
  v_target_meps text;
  v_target_misalign int;
  v_share numeric;
  v_saving numeric;
  v_act_saving numeric;
BEGIN
  SELECT b.property_id, b.name INTO v_property_id, v_bname
    FROM public.buildings b WHERE b.id = p_building_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'building % not found', p_building_id;
  END IF;

  -- Supersede old drafts for same building
  UPDATE public.renovation_plans
     SET status = 'completed',
         notes = COALESCE(notes, '') || ' [superseded]',
         updated_at = now()
   WHERE building_id = p_building_id
     AND status = 'draft';

  v_sim := public.simulate_actions_package(p_building_id, p_action_ids, p_year);
  v_year := COALESCE((v_sim->>'year')::int, p_year, EXTRACT(YEAR FROM CURRENT_DATE)::int - 1);
  v_base_score := (v_sim->'baseline'->>'combined_score')::numeric;
  v_proj_score := (v_sim->'projected'->>'combined_score')::numeric;
  v_target_meps := v_sim->'projected'->>'meps_status';
  v_target_misalign := (v_sim->'projected'->>'crrem_misalignment_year')::int;
  v_saving := COALESCE((v_sim->>'saving_kwh')::numeric, 0);

  INSERT INTO public.renovation_plans (
    building_id, property_id, title, status,
    target_misalignment_year, target_meps_status,
    total_estimated_cost, currency,
    baseline_combined_score, projected_combined_score,
    notes, scenario_key, projection, created_by
  ) VALUES (
    p_building_id, v_property_id,
    COALESCE(
      p_title,
      CASE p_scenario_key
        WHEN 'economy' THEN 'Billig plan – '
        WHEN 'balanced' THEN 'Balanserad plan – '
        WHEN 'aggressive' THEN 'Aggressiv plan – '
        ELSE 'Renovationsplan – '
      END || COALESCE(v_bname, 'byggnad')
    ),
    'draft',
    v_target_misalign,
    v_target_meps,
    0, 'SEK',
    v_base_score, v_proj_score,
    jsonb_build_object(
      'scenario', p_scenario_key,
      'meets_meps_2030', COALESCE(v_target_meps, '') = 'compliant',
      'meets_misalign_2035', COALESCE(v_target_misalign, 0) >= 2035,
      'saving_kwh', v_saving
    )::text,
    p_scenario_key,
    v_sim,
    auth.uid()
  )
  RETURNING id INTO v_plan_id;

  IF p_action_ids IS NOT NULL THEN
    FOREACH v_id IN ARRAY p_action_ids
    LOOP
      SELECT a.* INTO r FROM public.actions a WHERE a.id = v_id;
      IF NOT FOUND THEN CONTINUE; END IF;
      IF r.building_id IS DISTINCT FROM p_building_id THEN CONTINUE; END IF;

      v_order := v_order + 1;
      v_total_cost := v_total_cost + COALESCE(r.investment_cost, 0);
      v_act_saving := COALESCE(r.estimated_saving_kwh, 0);
      v_share := CASE WHEN v_saving > 0 THEN v_act_saving / v_saving ELSE 0 END;

      INSERT INTO public.renovation_plan_actions (
        plan_id, action_id, sort_order, expected_impact
      ) VALUES (
        v_plan_id, v_id, v_order,
        jsonb_build_object(
          'meps_gap',
            round(COALESCE((v_sim->'delta'->>'meps_2030_gap')::numeric, 0) * v_share, 2),
          'misalignment_shift',
            round(COALESCE((v_sim->'delta'->>'stranding_years_gained')::numeric, 0) * v_share)::int,
          'ped', r.estimated_ped_reduction,
          'saving_kwh', v_act_saving,
          'share', round(v_share, 4)
        )
      );
    END LOOP;
  END IF;

  UPDATE public.renovation_plans SET
    total_estimated_cost = v_total_cost,
    updated_at = now()
  WHERE id = v_plan_id;

  RETURN v_plan_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION app.score_combined_risk_virtual(uuid, int, numeric, int, numeric, public.data_gap_status)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_performance_with_virtual_delta(uuid, int, numeric)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.baseline_metrics_json(uuid, int)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.simulate_actions_package(uuid, uuid[], int)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.simulate_action_impact(uuid, int)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_renovation_plan_from_actions(uuid, uuid[], int, text, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.simulate_action_impact IS
  'Fas 9: dry-run single action – no writes; engine-aligned MEPS/CRREM/risk.';
COMMENT ON FUNCTION public.simulate_actions_package IS
  'Fas 9: dry-run package of actions – summed savings, one projection.';
COMMENT ON FUNCTION public.create_renovation_plan_from_actions IS
  'Fas 9: persist renovation plan from action list using engine simulation.';

-- =============================================================================
-- End Fas 9
-- =============================================================================
