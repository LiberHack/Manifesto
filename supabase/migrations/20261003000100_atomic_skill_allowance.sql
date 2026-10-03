-- The 5-new-skills allowance was a count in the app followed by a separate
-- insert, so concurrent profile saves could each pass the count: four parallel
-- saves added 12 skills for one account in the E2E stress run. Do the count and
-- the insert in one function, serialised per account.
create or replace function public.add_skills_to_catalogue(p_names text[], p_created_by uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowance constant integer := 5;  -- shared/skills.ts MAX_NEW_SKILLS
  remaining integer;
  added integer;
begin
  -- One account's saves queue behind each other; other accounts are unaffected.
  perform pg_advisory_xact_lock(hashtextextended('skills_allowance:' || p_created_by::text, 0));

  select allowance - count(*) into remaining
  from public.skills where created_by = p_created_by;
  if remaining <= 0 then
    return 0;
  end if;

  -- Names already in the catalogue (any case) are not new and cost nothing.
  with fresh as (
    select distinct on (lower(btrim(n))) btrim(n) as name
    from unnest(p_names) as n
    where btrim(n) <> ''
      and not exists (select 1 from public.skills s where lower(s.name) = lower(btrim(n)))
    limit remaining
  )
  insert into public.skills (name, created_by)
  select name, p_created_by from fresh
  on conflict do nothing;

  get diagnostics added = row_count;
  return added;
end;
$$;

revoke all on function public.add_skills_to_catalogue(text[], uuid) from public, anon, authenticated;
