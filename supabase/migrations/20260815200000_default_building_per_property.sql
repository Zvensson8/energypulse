-- One implicit building per property. Energy still lives on buildings;
-- the UI hides the hus-step until there is more than one.

INSERT INTO public.buildings (property_id, name)
SELECT p.id, p.name
FROM public.properties p
WHERE NOT EXISTS (
  SELECT 1 FROM public.buildings b WHERE b.property_id = p.id
);
