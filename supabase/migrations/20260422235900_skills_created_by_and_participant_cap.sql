-- 1. Track who created each skill (nullable = seeded/unknown)
ALTER TABLE public.skills ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Enforce 120-participant registration cap in the trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (SELECT count(*) FROM public.participants) >= 120 THEN
    RAISE EXCEPTION 'registration_closed' USING HINT = 'Registration is closed — 120 participant limit reached';
  END IF;

  INSERT INTO public.participants (id, name, email, skills)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(
      array(SELECT jsonb_array_elements_text(new.raw_user_meta_data->'skills')),
      '{}'::text[]
    )
  );
  RETURN new;
END;
$$;
