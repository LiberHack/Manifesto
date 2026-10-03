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

-- Like Supabase: GoTrue deletes users as supabase_auth_admin, which has no
-- privileges in `public`. After-triggers fired by the cascade run as this role.
create role supabase_auth_admin nologin;
grant usage on schema auth to supabase_auth_admin;
grant select, delete on auth.users to supabase_auth_admin;

-- Like Supabase: the caller's id comes from the JWT `sub` claim.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Like Supabase: API roles get table and function privileges by default, so
-- RLS policies and explicit revokes are what actually restrict them.
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;
