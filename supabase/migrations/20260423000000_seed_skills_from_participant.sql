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

  IF jsonb_array_length(coalesce(new.raw_user_meta_data->'skills', '[]'::jsonb)) > 5 THEN
    RAISE EXCEPTION 'too_many_skills' USING HINT = 'A participant may not register more than 5 skills';
  END IF;

  -- Add any unknown skills to the catalogue; skip duplicates (case-insensitive)
  INSERT INTO public.skills (name, created_by)
  SELECT skill, new.id
  FROM jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'skills', '[]'::jsonb)) AS skill
  ON CONFLICT (lower(name)) DO NOTHING;

  RETURN new;
END;
$$;
