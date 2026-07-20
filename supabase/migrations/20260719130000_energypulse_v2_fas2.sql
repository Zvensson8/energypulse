-- =============================================================================
-- EnergyPulse v2.0 – FAS 2: Ingestion Engine support objects
-- =============================================================================
-- Prerequisites: 20260719_energypulse_v2_fas1.sql
-- Adds:
--   - ingestion_dead_letters (retry / dead-letter store)
--   - public.decrypt_tenant_name_audit (RPC wrapper for GDPR decrypt)
-- =============================================================================

BEGIN;

-- Dead-letter queue for failed import rows
CREATE TABLE IF NOT EXISTS public.ingestion_dead_letters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        uuid NOT NULL,
  row_number      int NOT NULL,
  payload         jsonb NOT NULL,
  error_code      text NOT NULL,
  error_message   text NOT NULL,
  retry_count     int NOT NULL DEFAULT 0,
  max_retries     int NOT NULL DEFAULT 3,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'retrying', 'failed', 'resolved')),
  last_error_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_dead_letters_batch
  ON public.ingestion_dead_letters (batch_id, status);

CREATE INDEX IF NOT EXISTS idx_ingestion_dead_letters_status
  ON public.ingestion_dead_letters (status, created_at);

COMMENT ON TABLE public.ingestion_dead_letters IS
  'Fas 2: Failed ingestion rows for retry. status: pending|retrying|failed|resolved.';

DROP TRIGGER IF EXISTS trg_ingestion_dead_letters_updated_at ON public.ingestion_dead_letters;
CREATE TRIGGER trg_ingestion_dead_letters_updated_at
  BEFORE UPDATE ON public.ingestion_dead_letters
  FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

ALTER TABLE public.ingestion_dead_letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ingestion_dead_letters_select ON public.ingestion_dead_letters;
CREATE POLICY ingestion_dead_letters_select ON public.ingestion_dead_letters
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
       WHERE up.id = auth.uid() AND up.is_active
         AND up.role IN ('admin', 'portfolio_manager', 'property_manager')
    )
  );

DROP POLICY IF EXISTS ingestion_dead_letters_write ON public.ingestion_dead_letters;
CREATE POLICY ingestion_dead_letters_write ON public.ingestion_dead_letters
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
       WHERE up.id = auth.uid() AND up.is_active
         AND up.role IN ('admin', 'portfolio_manager', 'property_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
       WHERE up.id = auth.uid() AND up.is_active
         AND up.role IN ('admin', 'portfolio_manager', 'property_manager')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ingestion_dead_letters TO authenticated, service_role;

-- Public RPC wrapper so PostgREST can call app.decrypt_tenant_name
CREATE OR REPLACE FUNCTION public.decrypt_tenant_name_audit(
  p_space_id uuid,
  p_reason text DEFAULT 'explicit_reveal'
)
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, app
AS $$
  SELECT app.decrypt_tenant_name(p_space_id, p_reason);
$$;

COMMENT ON FUNCTION public.decrypt_tenant_name_audit(uuid, text) IS
  'GDPR: Public wrapper for app.decrypt_tenant_name. Always audits DECRYPT. viewer blocked.';

GRANT EXECUTE ON FUNCTION public.decrypt_tenant_name_audit(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_space_tenant_name(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_yearly_performance(uuid, int, boolean, text) TO authenticated, service_role;

COMMIT;
