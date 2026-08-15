ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS liljeblads_work_order_id uuid;

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS sent_to_work_order_at timestamptz;

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS liljeblads_component_id uuid;

COMMENT ON COLUMN public.actions.liljeblads_work_order_id IS
  'Liljeblads work_orders.id after send. Not a FK — other database.';
COMMENT ON COLUMN public.actions.sent_to_work_order_at IS
  'When this action was last sent as a Liljeblads work order.';
COMMENT ON COLUMN public.actions.liljeblads_component_id IS
  'Optional Liljeblads component chosen when creating the work order.';
