-- supabase/migrations/20260700000007_edition_lifecycle_rpcs.sql

-- close_edition: mark edition as archived, unset is_current
create or replace function public.close_edition(p_slug text)
returns void language plpgsql security definer as $$
begin
  update public.editions
  set status = 'archived', is_current = false
  where slug = p_slug and status = 'live';

  if not found then
    raise exception 'Edition % is not live or does not exist', p_slug;
  end if;
end;
$$;

-- go_live_edition: promote draft to live+current (requires no other edition is current)
create or replace function public.go_live_edition(p_slug text)
returns void language plpgsql security definer as $$
begin
  if exists (select 1 from public.editions where is_current = true) then
    raise exception 'Close the current edition before going live with a new one';
  end if;

  update public.editions
  set status = 'live', is_current = true
  where slug = p_slug and status = 'draft';

  if not found then
    raise exception 'Edition % is not a draft or does not exist', p_slug;
  end if;
end;
$$;
