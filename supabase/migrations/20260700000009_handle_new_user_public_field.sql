-- supabase/migrations/20260700000009_handle_new_user_public_field.sql

-- Update handle_new_user to read the `public` field from user metadata.
-- The `public` field on registrations controls archive visibility (default: true = visible).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  v_edition text;
begin
  insert into public.participants (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  );

  select slug into v_edition from public.editions where is_current = true limit 1;

  if v_edition is not null then
    insert into public.registrations (participant_id, edition_slug, skills, dietary, experience, public)
    values (
      new.id,
      v_edition,
      coalesce(
        array(select jsonb_array_elements_text(coalesce(new.raw_user_meta_data->'skills', '[]'::jsonb))),
        '{}'::text[]
      ),
      nullif(trim(coalesce(new.raw_user_meta_data->>'dietary', '')), ''),
      case
        when new.raw_user_meta_data->>'experience' in ('beginner','intermediate','experienced')
        then (new.raw_user_meta_data->>'experience')::public.experience_level
        else null
      end,
      coalesce((new.raw_user_meta_data->>'public')::boolean, true)
    );
  end if;

  return new;
end;
$$;
