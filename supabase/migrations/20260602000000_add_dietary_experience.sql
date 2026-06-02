create type public.experience_level as enum ('beginner', 'intermediate', 'experienced');

alter table public.participants
  add column dietary text null,
  add column experience public.experience_level null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.participants (id, name, email, skills, dietary, experience)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(
      array(select jsonb_array_elements_text(new.raw_user_meta_data->'skills')),
      '{}'::text[]
    ),
    nullif(trim(new.raw_user_meta_data->>'dietary'), ''),
    case
      when new.raw_user_meta_data->>'experience' in ('beginner', 'intermediate', 'experienced')
      then (new.raw_user_meta_data->>'experience')::public.experience_level
      else null
    end
  );
  return new;
end;
$$;

-- Backfill existing participants from auth metadata
update public.participants p
set
  dietary = nullif(trim(u.raw_user_meta_data->>'dietary'), ''),
  experience = case
    when u.raw_user_meta_data->>'experience' in ('beginner', 'intermediate', 'experienced')
    then (u.raw_user_meta_data->>'experience')::public.experience_level
    else null
  end
from auth.users u
where p.id = u.id;
