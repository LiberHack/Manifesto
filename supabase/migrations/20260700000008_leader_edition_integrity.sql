-- supabase/migrations/20260700000008_leader_edition_integrity.sql
--
-- Enforce that teams.leader_id must reference a registration belonging to the
-- same edition as the team.  A composite FK would require replacing the FK
-- added in migration 04; a trigger is less invasive and equally strict.

create or replace function public.check_leader_edition()
returns trigger language plpgsql as $$
begin
  if not exists (
    select 1 from public.registrations
    where id = new.leader_id
      and edition_slug = new.edition_slug
  ) then
    raise exception
      'leader_id must belong to the same edition as the team (edition_slug=%)',
      new.edition_slug
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger enforce_leader_edition
  before insert or update of leader_id, edition_slug on public.teams
  for each row execute function public.check_leader_edition();
