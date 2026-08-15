-- HITL: proposed → approved | cancelled. Who approved, when.

ALTER TABLE public.actions
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

COMMENT ON COLUMN public.actions.approved_by IS
  'User who moved the action from proposed to approved.';
COMMENT ON COLUMN public.actions.approved_at IS
  'When the action was approved. Null if never approved.';
