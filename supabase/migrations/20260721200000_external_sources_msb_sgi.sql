-- Expand external_data_snapshots sources: boverket, msb, sgi
-- (legacy smhi/gsi rows may remain; app no longer writes them)

ALTER TABLE public.external_data_snapshots
  DROP CONSTRAINT IF EXISTS external_data_snapshots_source_check;

ALTER TABLE public.external_data_snapshots
  ADD CONSTRAINT external_data_snapshots_source_check
  CHECK (source IN ('smhi', 'boverket', 'gsi', 'msb', 'sgi'));

COMMENT ON TABLE public.external_data_snapshots IS
  'Cached responses from open external sources (Boverket, MSB, SGI/SGU). Legacy smhi/gsi allowed for old rows.';
