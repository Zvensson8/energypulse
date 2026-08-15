-- Dashboard-created users never got a user_profiles row.
-- Without it, RLS treats them as having no property access.

INSERT INTO public.user_profiles (id, email, role, is_active)
SELECT u.id, u.email, 'admin'::public.user_role, true
FROM auth.users u
WHERE lower(u.email) IN (
  'andreas@liljeblads.com',
  'andreas.svensson@fastudent.se'
)
ON CONFLICT (id) DO UPDATE
SET email = excluded.email,
    role = 'admin',
    is_active = true,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE role = 'admin')
        THEN 'admin'::public.user_role
      ELSE 'viewer'::public.user_role
    END,
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
