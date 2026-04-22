 alter table public.teams
      drop constraint teams_leader_id_fkey;
      
       alter table public.teams
         add constraint teams_leader_id_fkey
         foreign key (leader_id) references auth.users(id) on delete cascade;
