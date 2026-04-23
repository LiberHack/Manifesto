-- Drop existing objects in dependency order
drop trigger if exists on_request_approved on public.join_requests;
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_request_approved();
drop function if exists public.handle_new_user();
drop table if exists public.join_requests;
drop table if exists public.participants;
drop table if exists public.teams;
drop type if exists public.request_status;
drop type if exists public.participant_role;

-- Enums
create type public.participant_role as enum ('participant', 'leader');
create type public.request_status as enum ('pending', 'approved', 'rejected');

-- Tables
create table public.teams (
  id uuid not null default gen_random_uuid(),
  name character varying(32) not null,
  leader_id uuid not null,
  skills_wanted text[] not null,
  description character varying(200) null,
  created_at timestamp with time zone not null default now(),
  constraint teams_pkey primary key (id),
  constraint teams_leader_id_fkey foreign key (leader_id) references auth.users (id) on delete cascade
) tablespace pg_default;

create table public.participants (
  id uuid not null,
  name text not null,
  email text not null,
  skills text[] not null default '{}'::text[],
  role public.participant_role not null default 'participant'::participant_role,
  team_id uuid null,
  created_at timestamp with time zone not null default now(),
  constraint participants_pkey primary key (id),
  constraint participants_email_key unique (email),
  constraint participants_id_fkey foreign key (id) references auth.users (id) on delete cascade,
  constraint participants_team_id_fkey foreign key (team_id) references public.teams (id) on delete set null
) tablespace pg_default;

create index if not exists participants_team_id_idx on public.participants using btree (team_id) tablespace pg_default;

create table public.join_requests (
  id uuid not null default gen_random_uuid(),
  participant_id uuid not null,
  team_id uuid not null,
  status public.request_status not null default 'pending'::request_status,
  created_at timestamp with time zone not null default now(),
  constraint join_requests_pkey primary key (id),
  constraint join_requests_participant_id_fkey foreign key (participant_id) references public.participants (id) on delete cascade,
  constraint join_requests_team_id_fkey foreign key (team_id) references public.teams (id) on delete cascade
) tablespace pg_default;

create index if not exists join_requests_team_id_status_idx on public.join_requests using btree (team_id, status) tablespace pg_default;
create index if not exists join_requests_participant_id_status_idx on public.join_requests using btree (participant_id, status) tablespace pg_default;
create unique index if not exists unique_pending_request on public.join_requests using btree (participant_id, team_id) tablespace pg_default
  where (status = 'pending'::request_status);

-- Functions
create or replace function public.handle_request_approved()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.status = 'approved' and old.status = 'pending' then
    update public.participants
    set team_id = new.team_id
    where id = new.participant_id;

    update public.join_requests
    set status = 'rejected'
    where participant_id = new.participant_id
      and id != new.id
      and status = 'pending';
  end if;
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.participants (id, name, email, skills)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(
      array(select jsonb_array_elements_text(new.raw_user_meta_data->'skills')),
      '{}'::text[]
    )
  );
  return new;
end;
$$;

-- Triggers
create trigger on_request_approved
  after update on public.join_requests
  for each row
  execute function public.handle_request_approved();

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
