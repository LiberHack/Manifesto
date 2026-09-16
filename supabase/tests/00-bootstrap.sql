-- Minimal stand-in for the parts of a Supabase database the migrations touch.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

create schema if not exists auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$ select null::uuid $$;
