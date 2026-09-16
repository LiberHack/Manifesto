-- ============================================================
-- Edition archiving, phase 1 — participant cap moves to registrations
-- Spec: docs/superpowers/specs/2026-09-16-second-edition-live-mode-design.md
--
-- handle_new_user() drops the 120-participant count: with carried-over accounts
-- it would count people who never opted into the current edition. The cap is now
-- per edition (editions.participant_cap) and enforced on registrations insert.
-- handle_new_user() is reduced to the identity mirror (name, email).
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.participants (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

-- ------------------------------------------------------------
-- Per-edition participant cap
-- ------------------------------------------------------------

create or replace function public.enforce_edition_cap()
returns trigger
language plpgsql
as $$
declare
  cap int;
  taken int;
begin
  select participant_cap into cap
  from public.editions
  where slug = new.edition_slug;

  if cap is null then
    return new;
  end if;

  select count(*) into taken
  from public.registrations
  where edition_slug = new.edition_slug;

  if taken >= cap then
    raise exception 'registration_closed'
      using hint = format('Registration is closed — %s participant limit reached', cap);
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_edition_cap on public.registrations;
create trigger enforce_edition_cap
  before insert on public.registrations
  for each row
  execute function public.enforce_edition_cap();
