INSERT INTO public.skills (name) VALUES
  ('TypeScript'), ('JavaScript'), ('Python'), ('Rust'), ('Go'),
  ('C++'), ('Java'), ('Vue'), ('React'), ('Svelte'),
  ('UI/UX'), ('DevOps'), ('Docker'), ('Kubernetes'), ('GraphQL'),
  ('PostgreSQL'), ('Linux'), ('Security'), ('Embedded'), ('Machine Learning')
ON CONFLICT DO NOTHING;
