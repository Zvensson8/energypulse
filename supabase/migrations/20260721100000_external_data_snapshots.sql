-- External data snapshots (SMHI, Boverket, GSI) – prepare for API integrations
-- Stubs write here; live adapters reuse the same table.

CREATE TABLE IF NOT EXISTS public.external_data_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  source        text NOT NULL CHECK (source IN ('smhi', 'boverket', 'gsi')),
  status        text NOT NULL CHECK (
    status IN ('disabled', 'stub', 'ok', 'error', 'missing_coords')
  ),
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  message       text,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_data_snapshots_property
  ON public.external_data_snapshots (property_id, source, fetched_at DESC);

COMMENT ON TABLE public.external_data_snapshots IS
  'Cached responses from SMHI / Boverket / GSI for property climate & geo context.';

ALTER TABLE public.external_data_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY external_data_snapshots_select ON public.external_data_snapshots
  FOR SELECT TO authenticated
  USING (app.user_has_property_access(property_id));

CREATE POLICY external_data_snapshots_write ON public.external_data_snapshots
  FOR ALL TO authenticated
  USING (app.can_write() AND app.user_has_property_access(property_id))
  WITH CHECK (app.can_write() AND app.user_has_property_access(property_id));
