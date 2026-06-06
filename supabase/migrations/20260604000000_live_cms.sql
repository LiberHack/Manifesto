-- ============================================================
-- Live CMS Tables: event_config, schedule_items, announcements
-- ============================================================

-- event_config: singleton table (always one row, id = 1)
create table if not exists public.event_config (
  id int primary key default 1,
  event_name text not null,
  event_start timestamptz not null,
  event_end timestamptz not null,
  constraint only_one_row check (id = 1)
);

-- schedule_items: event schedule (talks, meals, ceremonies, etc.)
create table if not exists public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  sort_order int not null,
  created_at timestamptz default now()
);

-- announcements: live announcements during the event
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  body text not null,
  sort_order int not null,
  created_at timestamptz default now()
);

-- ============================================================
-- Row-Level Security
-- The app uses the service-role key for all mutations.
-- These policies enable public read access via anon role.
-- ============================================================

alter table public.event_config enable row level security;
alter table public.schedule_items enable row level security;
alter table public.announcements enable row level security;

-- Public read access for all three tables
create policy "event_config_select" on public.event_config
  for select to anon using (true);

create policy "schedule_items_select" on public.schedule_items
  for select to anon using (true);

create policy "announcements_select" on public.announcements
  for select to anon using (true);

-- ============================================================
-- Seed Data
-- ============================================================

-- Event configuration
insert into public.event_config (id, event_name, event_start, event_end)
values (1, 'LiberHack 2026', '2026-06-05 16:00:00+00', '2026-06-07 14:00:00+00')
on conflict (id) do nothing;

