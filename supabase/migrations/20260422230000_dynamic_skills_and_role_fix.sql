-- 1. Fix participant_role enum: rename 'leader' to 'admin' (idempotent)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum
    JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
    WHERE typname = 'participant_role' AND enumlabel = 'leader'
  ) THEN
    ALTER TYPE public.participant_role RENAME VALUE 'leader' TO 'admin';
  END IF;
END
$$;

-- 2. Skills catalogue
CREATE TABLE IF NOT EXISTS public.skills (
  id   uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  CONSTRAINT skills_pkey PRIMARY KEY (id)
);

-- Case-insensitive uniqueness (no two skills that differ only in case)
CREATE UNIQUE INDEX IF NOT EXISTS skills_name_lower_idx ON public.skills (lower(name));

-- Seed (ignore conflicts)
INSERT INTO public.skills (name) VALUES
  ('TypeScript'), ('JavaScript'), ('Python'), ('Rust'), ('Go'),
  ('C++'), ('Java'), ('Vue'), ('React'), ('Svelte'),
  ('UI/UX'), ('DevOps'), ('Docker'), ('Kubernetes'), ('GraphQL'),
  ('PostgreSQL'), ('Linux'), ('Security'), ('Embedded'), ('Machine Learning')
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'skills' AND policyname = 'skills_select'
  ) THEN
    CREATE POLICY "skills_select" ON public.skills FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'skills' AND policyname = 'skills_insert'
  ) THEN
    CREATE POLICY "skills_insert" ON public.skills FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END
$$;
