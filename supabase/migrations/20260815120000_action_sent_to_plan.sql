ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS liljeblads_plan_item_id uuid;

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS sent_to_plan_at timestamptz;

COMMENT ON COLUMN public.actions.liljeblads_plan_item_id IS
  'Liljeblads maintenance_plan_items.id after send. Not a FK — other database.';
COMMENT ON COLUMN public.actions.sent_to_plan_at IS
  'When this action was last upserted onto the Liljeblads maintenance plan.';
