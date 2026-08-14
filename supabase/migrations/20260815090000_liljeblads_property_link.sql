-- Link EnergyPulse properties to Liljeblads properties (source of technical assets).
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS liljeblads_property_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_properties_liljeblads_property_id
  ON public.properties (liljeblads_property_id)
  WHERE liljeblads_property_id IS NOT NULL;

COMMENT ON COLUMN public.properties.liljeblads_property_id IS
  'Liljeblads properties.id. EnergyPulse shows components from that record; Jarvis reads energy back via this link.';
