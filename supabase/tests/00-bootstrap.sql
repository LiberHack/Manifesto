-- Minimal stand-in for the parts of a Supabase database the migrations touch.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

-- Supabase grants the client roles everything in `public` by default; mirror
-- that so the migrations' revokes are actually exercised.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$ select null::uuid $$;
