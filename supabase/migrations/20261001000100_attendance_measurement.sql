-- Fixed snapshots retain pre-event cohort membership even when rosters change later.
create table public.attendance_snapshots (
  edition_slug text not null references public.editions(slug),
  cutoff text not null check (cutoff in ('14_days','7_days','1_day')),
  registration_id uuid not null references public.registrations(id) on delete cascade,
  team_id uuid,
  formation_source public.formation_source,
  captured_at timestamptz not null default now(),
  primary key (edition_slug, cutoff, registration_id)
);
alter table public.attendance_snapshots enable row level security;
revoke all on public.attendance_snapshots from anon, authenticated;

create function public.capture_attendance_snapshot(p_edition text, p_cutoff text)
returns integer language plpgsql as $$
declare n integer;
begin
  if p_cutoff not in ('14_days','7_days','1_day') then raise exception 'invalid_cutoff'; end if;
  -- Once captured, a cutoff is immutable. Run at the scheduled milestone.
  if exists (select 1 from public.attendance_snapshots where edition_slug = p_edition and cutoff = p_cutoff)
    then raise exception 'snapshot_already_captured'; end if;
  insert into public.attendance_snapshots (edition_slug, cutoff, registration_id, team_id, formation_source)
  select r.edition_slug, p_cutoff, r.id, r.team_id, m.source
  from public.registrations r
  left join lateral (
    select source from public.membership_events
    where registration_id = r.id and event = 'joined' and team_id = r.team_id
    order by created_at desc, id desc limit 1
  ) m on true
  where r.edition_slug = p_edition;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function public.capture_attendance_snapshot(text, text) from public, anon, authenticated;
