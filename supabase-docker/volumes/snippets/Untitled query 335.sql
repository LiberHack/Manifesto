-- Per-team project URL
alter table public.teams
  add column github_url text null;

-- Global visibility toggle
alter table public.event_config
  add column github_urls_public boolean not null default false;
