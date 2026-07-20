-- =============================================================================
-- Manual insert of energy_consumption (past month etc.) with audit + recalc
-- =============================================================================

CREATE OR REPLACE FUNCTION public.insert_energy_consumption_manual(
  p_building_id uuid,
  p_energy_source_id uuid,
  p_year int,
  p_month int,
  p_kwh numeric,
  p_reason text,
  p_is_estimated boolean DEFAULT false,
  p_quality_class public.quality_class DEFAULT 'B'
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, app
AS $$
DECLARE
  v_role public.user_role;
  v_id uuid;
  v_session_id uuid;
  v_existing uuid;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'reason required (min 5 chars)';
  END IF;
  IF p_kwh IS NULL OR p_kwh < 0 THEN
    RAISE EXCEPTION 'consumption_kwh must be >= 0';
  END IF;
  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION 'month must be 1–12';
  END IF;
  IF p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'year out of range';
  END IF;

  v_role := app.current_user_role();
  IF auth.uid() IS NOT NULL AND (v_role IS NULL OR v_role NOT IN ('admin', 'portfolio_manager')) THEN
    RAISE EXCEPTION 'only admin/portfolio_manager may insert consumption';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.buildings WHERE id = p_building_id) THEN
    RAISE EXCEPTION 'building not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.energy_sources WHERE id = p_energy_source_id) THEN
    RAISE EXCEPTION 'energy source not found';
  END IF;

  -- Building-level uniqueness (space_id IS NULL)
  SELECT id INTO v_existing
    FROM public.energy_consumption
   WHERE building_id = p_building_id
     AND energy_source_id = p_energy_source_id
     AND year = p_year
     AND month = p_month
     AND space_id IS NULL
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'value already exists for this source/month – edit the existing row instead (id %)', v_existing;
  END IF;

  INSERT INTO public.energy_consumption (
    building_id, space_id, energy_source_id, year, month,
    consumption_kwh, is_weather_corrected, is_estimated, quality_class
  ) VALUES (
    p_building_id, NULL, p_energy_source_id, p_year, p_month,
    p_kwh, false, COALESCE(p_is_estimated, false),
    COALESCE(p_quality_class, 'B'::public.quality_class)
  )
  RETURNING id INTO v_id;

  INSERT INTO public.data_edit_sessions (
    entity_type, entity_id, building_id,
    snapshot_before, snapshot_after, reason, changed_by
  ) VALUES (
    'energy_consumption', v_id, p_building_id,
    jsonb_build_object('operation', 'insert'),
    (SELECT to_jsonb(ec) FROM public.energy_consumption ec WHERE ec.id = v_id),
    p_reason, auth.uid()
  )
  RETURNING id INTO v_session_id;

  BEGIN
    PERFORM public.recalculate_performance_with_adjustments(
      p_building_id, p_year, false, null
    );
  EXCEPTION WHEN OTHERS THEN
    -- still keep insert; performance may recalculate later
    NULL;
  END;

  INSERT INTO public.data_quality_logs (
    entity_type, entity_id, field, old_value, new_value,
    changed_by, operation, override_reason
  ) VALUES (
    'energy_consumption', v_id, 'consumption_kwh',
    null, p_kwh::text,
    auth.uid(), 'DATA_EDIT', p_reason
  );

  RETURN v_session_id;
END;
$$;

-- Extend rollback: delete row if session was an insert
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
  v_op text;
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

  v_op := v_s.snapshot_before->>'operation';

  IF v_s.entity_type = 'energy_consumption' THEN
    IF v_op = 'insert' THEN
      v_bid := v_s.building_id;
      v_year := COALESCE(
        (v_s.snapshot_after->>'year')::int,
        (v_s.snapshot_before->>'year')::int
      );
      DELETE FROM public.energy_consumption WHERE id = v_s.entity_id;
    ELSE
      UPDATE public.energy_consumption SET
        consumption_kwh = (v_s.snapshot_before->>'consumption_kwh')::numeric,
        updated_at = now()
      WHERE id = v_s.entity_id;
      v_bid := v_s.building_id;
      v_year := (v_s.snapshot_before->>'year')::int;
    END IF;
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

GRANT EXECUTE ON FUNCTION public.insert_energy_consumption_manual(
  uuid, uuid, int, int, numeric, text, boolean, public.quality_class
) TO authenticated, service_role;

COMMENT ON FUNCTION public.insert_energy_consumption_manual IS
  'Manual add of monthly consumption (building-level) with data_edit_sessions audit + recalc.';
