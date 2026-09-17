-- Pre-migration 2026 data: four accounts, two teams, one pending join request.
-- participants rows are created by the handle_new_user trigger, so they are
-- filled in with UPDATE rather than INSERT.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ada@example.com',   '{"name":"Ada"}'),
  ('22222222-2222-2222-2222-222222222222', 'linus@example.com', '{"name":"Linus"}'),
  ('33333333-3333-3333-3333-333333333333', 'grace@example.com', '{"name":"Grace"}'),
  ('44444444-4444-4444-4444-444444444444', 'solo@example.com',  '{"name":"Solo"}');

update public.participants set skills = '{Rust}', role = 'admin', dietary = 'vegan',
  experience = 'experienced', created_at = now() - interval '4 days'
  where id = '11111111-1111-1111-1111-111111111111';
update public.participants set skills = '{C,Go}', experience = 'intermediate',
  created_at = now() - interval '3 days'
  where id = '22222222-2222-2222-2222-222222222222';
update public.participants set skills = '{COBOL}', experience = 'beginner',
  created_at = now() - interval '2 days'
  where id = '33333333-3333-3333-3333-333333333333';
update public.participants set created_at = now() - interval '1 days'
  where id = '44444444-4444-4444-4444-444444444444';

insert into public.teams (id, name, leader_id, skills_wanted, description) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'fsociety', '11111111-1111-1111-1111-111111111111', '{Rust}', 'hack the planet'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'lonewolf', '44444444-4444-4444-4444-444444444444', '{Go}',   null);

update public.participants set team_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
update public.participants set team_id = 'aaaaaaaa-0000-0000-0000-000000000002'
  where id = '44444444-4444-4444-4444-444444444444';

insert into public.join_requests (participant_id, team_id, status)
values ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001', 'pending');

insert into public.schedule_items (label, starts_at, sort_order) values ('Opening', now(), 1);
insert into public.announcements (body, sort_order) values ('Lunch on floor 2', 1);
