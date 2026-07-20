-- =============================================================================
-- Fas 9 fix: score_combined_risk_virtual must accept data_gap_status enum
-- (v_pi.data_gap_status is enum; PostgreSQL does not auto-match to text overload)
-- =============================================================================

DROP FUNCTION IF EXISTS app.score_combined_risk_virtual(uuid, int, numeric, int, numeric, text);

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

-- Also accept text for flexibility (e.g. null cast paths)
CREATE OR REPLACE FUNCTION app.score_combined_risk_virtual(
  p_building_id uuid,
  p_year int,
  p_meps_2030_gap numeric,
  p_crrem_stranding_year int,
  p_data_completeness_percent numeric,
  p_data_gap_status text
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app
AS $$
  SELECT app.score_combined_risk_virtual(
    p_building_id,
    p_year,
    p_meps_2030_gap,
    p_crrem_stranding_year,
    p_data_completeness_percent,
    CASE
      WHEN p_data_gap_status IS NULL THEN NULL
      ELSE p_data_gap_status::public.data_gap_status
    END
  );
$$;

GRANT EXECUTE ON FUNCTION app.score_combined_risk_virtual(uuid, int, numeric, int, numeric, public.data_gap_status)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.score_combined_risk_virtual(uuid, int, numeric, int, numeric, text)
  TO authenticated, service_role;
