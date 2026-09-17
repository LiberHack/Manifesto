\set ON_ERROR_STOP on

-- Runs after 02/03 in the same session: '2026' is archived, '2027' is current,
-- and `assert()` is already defined.

-- The point of the default: backfilling this column onto editions that already
-- exist must not open the participant area.
select assert(
  not exists (select 1 from public.editions where ops_enabled),
  'ops_enabled backfills as closed for every existing edition');

select assert(
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'editions'
     and column_name = 'ops_enabled' and is_nullable = 'NO') = 1,
  'ops_enabled is not null');

-- Going live and opening registration stay separate events.
insert into public.editions (slug, name, status, participant_cap)
values ('2028', 'LiberHack 2028', 'draft', 120);

select assert(
  (select not ops_enabled from public.editions where slug = '2028'),
  'a new edition starts closed');

update public.editions set ops_enabled = true where slug = '2028';

select assert(
  (select ops_enabled from public.editions where slug = '2028')
    and not (select ops_enabled from public.editions where slug = '2027'),
  'opening one edition leaves the others closed');

delete from public.editions where slug = '2028';

select 'OPS TOGGLE VERIFICATION COMPLETE' as result;
