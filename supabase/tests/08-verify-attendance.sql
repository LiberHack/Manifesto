-- Runs after phase 1 verification; 2027 is current.
select assert(raises($$select public.set_attendance_intention(
 '00000000-0000-0000-0000-000000000201',
 '00000000-0000-0000-0000-000000000102', 'coming', null, null)$$, 'not_eligible'),
 'one person cannot confirm a teammate');
select public.set_attendance_intention('00000000-0000-0000-0000-000000000201',
 '00000000-0000-0000-0000-000000000101', 'unsure', array['transport'], 'Need a ride');
select assert((select intention = 'unsure' and intention_at is not null from public.registrations
 where id = '00000000-0000-0000-0000-000000000201'), 'intention has an individual timestamp');
select assert((select details = 'Need a ride' from public.attendance_barriers
 where registration_id = '00000000-0000-0000-0000-000000000201'), 'private barrier saved separately');
select assert(raises($$select public.record_checkin('00000000-0000-0000-0000-000000000201',
 '00000000-0000-0000-0000-000000000102', now(), 'Arrival')$$, 'not_organizer'),
 'participant cannot check in another person');
update public.participants set role = 'admin' where id = '00000000-0000-0000-0000-000000000101';
select public.record_checkin('00000000-0000-0000-0000-000000000201',
 '00000000-0000-0000-0000-000000000101', now(), 'Arrival');
select public.record_checkin('00000000-0000-0000-0000-000000000201',
 '00000000-0000-0000-0000-000000000101', null, 'Duplicate scan correction');
select assert((select count(*) = 2 from public.checkin_events
 where registration_id = '00000000-0000-0000-0000-000000000201'), 'check-in and correction audited');
select public.record_checkin('00000000-0000-0000-0000-000000000201',
 '00000000-0000-0000-0000-000000000101', now(), 'Verified arrival');
select assert(raises($$select public.change_seat('00000000-0000-0000-0000-000000000201',
 '00000000-0000-0000-0000-000000000101', 'cancel')$$, 'already_checked_in'),
 'checked-in registration cannot self-cancel and corrupt the metric');

-- One free seat, two concurrent admissions. The edition row lock must serialize them.
create extension if not exists dblink;
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-000000000109', 'attendance9@example.com', '{"name":"Attendance 9"}'),
 ('00000000-0000-0000-0000-000000000110', 'attendance10@example.com', '{"name":"Attendance 10"}'),
 ('00000000-0000-0000-0000-000000000111', 'attendance11@example.com', '{"name":"Attendance 11"}');
update public.editions set participant_cap =
 (select count(*) + 1 from public.registrations where edition_slug = '2027' and seat_state in ('accepted','offered'))
 where slug = '2027';
select dblink_connect('race1', 'dbname=liberhack user=postgres host=127.0.0.1 port=' || current_setting('port'));
select dblink_connect('race2', 'dbname=liberhack user=postgres host=127.0.0.1 port=' || current_setting('port'));
select dblink_send_query('race1', $$insert into public.registrations (id, participant_id, edition_slug)
 values ('00000000-0000-0000-0000-000000000209','00000000-0000-0000-0000-000000000109','2027') returning id::text$$);
select dblink_send_query('race2', $$insert into public.registrations (id, participant_id, edition_slug)
 values ('00000000-0000-0000-0000-000000000210','00000000-0000-0000-0000-000000000110','2027') returning id::text$$);
select * from dblink_get_result('race1', false) as t(id text);
select * from dblink_get_result('race2', false) as t(id text);
select dblink_disconnect('race1');
select dblink_disconnect('race2');
select assert((select count(*) = participant_cap from public.registrations r
 join public.editions e on e.slug = r.edition_slug
 where e.slug = '2027' and r.seat_state in ('accepted','offered') group by participant_cap),
 'concurrent admissions fill exactly one available seat');
select assert(raises($$update public.editions set participant_cap = 1 where slug = '2027'$$,
 'cap_below_reserved_seats'), 'admin cannot lower cap below reserved seats');
insert into public.registrations (id, participant_id, edition_slug, seat_state)
 values ('00000000-0000-0000-0000-000000000211','00000000-0000-0000-0000-000000000111','2027','waitlisted');
select assert((select seat_state = 'waitlisted' from public.registrations
 where id = '00000000-0000-0000-0000-000000000211'), 'full edition accepts a waitlist registration');
select public.change_seat('00000000-0000-0000-0000-000000000202',
 '00000000-0000-0000-0000-000000000102', 'cancel');
select assert((select seat_state = 'offered' and offer_expires_at > now() from public.registrations
 where id = '00000000-0000-0000-0000-000000000211'), 'cancellation creates an expiring offer');
select assert(raises($$select public.change_seat('00000000-0000-0000-0000-000000000211',
 '00000000-0000-0000-0000-000000000110', 'accept')$$, 'not_eligible'),
 'another participant cannot accept the offer');
update public.registrations set offer_expires_at = now() - interval '1 minute'
 where id = '00000000-0000-0000-0000-000000000211';
select assert(public.expire_seat_offers('2027') = 1, 'expired offer is processed');
select assert((select seat_state = 'waitlisted' and offer_attempts = 1 from public.registrations
 where id = '00000000-0000-0000-0000-000000000211'), 'expired offer is retained without immediate repeat');
select assert((select count(*) <= participant_cap from public.registrations r
 join public.editions e on e.slug = r.edition_slug
 where e.slug = '2027' and r.seat_state in ('accepted','offered') group by participant_cap),
 'expired offers do not overbook');
select assert((select count(*) = 1 from public.registrations
 where edition_slug = '2027' and seat_state = 'cancelled'), 'cancellations remain in registration history');
select assert((select count(*) = count(*) filter (where seat_state in ('accepted','offered')) +
 count(*) filter (where seat_state = 'cancelled') + count(*) filter (where seat_state = 'waitlisted')
 from public.registrations where edition_slug = '2027'),
 'metric denominator reconciles with waitlist and cancellations');
select assert((select count(*) filter (where checked_in_at is not null) <=
 count(*) filter (where seat_state in ('accepted','offered'))
 from public.registrations where edition_slug = '2027'), 'checked-in count fits valid-seat denominator');
select assert(public.capture_attendance_snapshot('2027', '7_days') =
 (select count(*) from public.registrations where edition_slug = '2027'),
 'fixed snapshot contains every registration');
select assert((select count(*) > 0 from public.attendance_snapshots
 where edition_slug = '2027' and cutoff = '7_days' and formation_source = 'founded'),
 'snapshot retains formation source');
insert into public.notification_jobs (edition_slug, registration_id, kind, dedup_key)
 values ('2027', '00000000-0000-0000-0000-000000000201', 'arrival', 'arrival:2027:201')
 on conflict (dedup_key) do nothing;
insert into public.notification_jobs (edition_slug, registration_id, kind, dedup_key)
 values ('2027', '00000000-0000-0000-0000-000000000201', 'arrival', 'arrival:2027:201')
 on conflict (dedup_key) do nothing;
select assert((select count(*) = 1 from public.notification_jobs where dedup_key = 'arrival:2027:201'),
 'notification job deduplicates');
set role authenticated;
select assert(denied($$select * from public.attendance_barriers$$), 'barriers are not directly readable');
select assert(denied($$select * from public.checkin_events$$), 'check-in audit is not directly readable');
select assert(denied($$select * from public.notification_jobs$$), 'jobs are not directly readable');
select assert(raises($$select public.change_seat('00000000-0000-0000-0000-000000000211',
 '00000000-0000-0000-0000-000000000111', 'cancel')$$, 'permission denied for function change_seat'),
 'seat mutation is server-only');
reset role;
select 'ATTENDANCE VERIFICATION COMPLETE' as result;
