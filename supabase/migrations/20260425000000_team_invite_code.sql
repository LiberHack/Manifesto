alter table public.teams
  add column if not exists invite_code text unique not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

create or replace function public.rotate_team_invite_code(team_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  new_code text;
begin
  loop
    new_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    exit when not exists (select 1 from public.teams where invite_code = new_code);
  end loop;

  update public.teams set invite_code = new_code where id = team_id;
  return new_code;
end;
$$;
