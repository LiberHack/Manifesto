-- ============================================================
-- Edition archiving, phase 1 — admin "go live"
-- Spec: docs/superpowers/specs/2026-09-16-second-edition-live-mode-design.md
--
-- Archiving the outgoing edition and promoting the incoming one must happen in
-- one transaction: editions_one_current would reject the intermediate state
-- where both are current, and a failure between the two statements would leave
-- the site with no live edition.
-- ============================================================

create or replace function public.promote_edition(target_slug text)
returns public.editions
language plpgsql
security definer
as $$
declare
  promoted public.editions;
begin
  if not exists (
    select 1 from public.editions where slug = target_slug and status = 'draft'
  ) then
    raise exception 'edition_not_draft'
      using hint = 'Only a draft edition can be promoted to live';
  end if;

  -- Retire the outgoing edition first so the one-current partial unique index
  -- never sees two current rows.
  update public.editions
  set status = 'archived', is_current = false
  where is_current and slug <> target_slug;

  update public.editions
  set status = 'live', is_current = true
  where slug = target_slug
  returning * into promoted;

  return promoted;
end;
$$;

revoke all on function public.promote_edition(text) from public, anon, authenticated;
