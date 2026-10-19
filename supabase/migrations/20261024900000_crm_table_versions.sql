-- A version number per table, so the CRM page can tell which tables changed while it was away.
--
-- Before: whenever the page came back (the tab looked at again, or Realtime reconnecting, which a phone
-- does every few seconds) it read all ~25 tables again. Now it first asks crm_table_versions() (one small
-- request) and reads again only the tables whose number went up.
--
-- * crm_table_changes has one row per table: a number that goes up by one with every statement that
--   really inserted, updated or deleted a row (a statement that touched nothing does not count).
-- * The number is written inside the same transaction as the change, so the page can never see the new
--   number before the change itself is visible.
-- * crm_table_versions(p_tables) answers for every table the page asks about: whether it exists, whether
--   its number is kept, and the number. A table that exists but has no number is read every time, so a
--   table added later without a trigger is never missed.

create table if not exists public.crm_table_changes (
  table_name text primary key,
  version bigint not null default 0,
  changed_at timestamptz not null default now()
);

alter table public.crm_table_changes enable row level security;

-- Only table names and numbers: nothing private.
drop policy if exists "crm_table_changes_select_signed_in" on public.crm_table_changes;
create policy "crm_table_changes_select_signed_in"
on public.crm_table_changes
for select to authenticated
using (true);

revoke all on public.crm_table_changes from anon, authenticated;
grant select on public.crm_table_changes to authenticated;

create or replace function public.crm_bump_table_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- changed_rows is the transition table of the statement: empty when it touched no row.
  if not exists (select 1 from changed_rows) then
    return null;
  end if;
  insert into public.crm_table_changes as c (table_name, version, changed_at)
  values (tg_table_name, 1, now())
  on conflict (table_name) do update set version = c.version + 1, changed_at = now();
  return null;
end;
$$;

revoke all on function public.crm_bump_table_version() from public, anon, authenticated;

-- Every table the CRM page reads at start (src/lib/coreSync.ts CORE_GROUPS). A table missing from this
-- database is skipped.
do $$
declare
  t text;
begin
  foreach t in array array[
    'classrooms', 'classroom_teachers', 'teachers', 'students', 'student_classroom_periods',
    'schedules', 'schedule_students', 'schedule_exceptions', 'trial_bookings', 'lesson_logs',
    'lesson_log_student_reviews', 'lesson_review_scores', 'leads', 'makeup_plans', 'lead_options',
    'packages', 'review_criteria', 'attendance_statuses', 'reward_presets', 'reward_levels',
    'subjects', 'age_groups', 'program_levels'
  ]
  loop
    if to_regclass('public.' || quote_ident(t)) is null then
      continue;
    end if;
    -- A transition table can only be named for one event, hence three triggers.
    execute format('drop trigger if exists crm_version_insert on public.%I', t);
    execute format('drop trigger if exists crm_version_update on public.%I', t);
    execute format('drop trigger if exists crm_version_delete on public.%I', t);
    execute format(
      'create trigger crm_version_insert after insert on public.%I referencing new table as changed_rows '
      'for each statement execute function public.crm_bump_table_version()', t);
    execute format(
      'create trigger crm_version_update after update on public.%I referencing new table as changed_rows '
      'for each statement execute function public.crm_bump_table_version()', t);
    execute format(
      'create trigger crm_version_delete after delete on public.%I referencing old table as changed_rows '
      'for each statement execute function public.crm_bump_table_version()', t);
  end loop;
end;
$$;

create or replace function public.crm_table_versions(p_tables text[])
returns table (table_name text, present boolean, tracked boolean, version bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.name,
    to_regclass('public.' || quote_ident(t.name)) is not null,
    exists (
      select 1
      from pg_trigger g
      where g.tgrelid = to_regclass('public.' || quote_ident(t.name))
        and g.tgname in ('crm_version_insert', 'crm_version_update', 'crm_version_delete')
      having count(*) = 3
    ),
    coalesce(c.version, 0)
  from unnest(p_tables) as t(name)
  left join public.crm_table_changes c on c.table_name = t.name;
$$;

revoke all on function public.crm_table_versions(text[]) from public, anon;
grant execute on function public.crm_table_versions(text[]) to authenticated;

notify pgrst, 'reload schema';
