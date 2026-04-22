create unique index unique_pending_request 
on public.join_requests (participant_id, team_id) 
where status = 'pending';

alter table public.join_requests 
drop constraint unique_participant_team;
