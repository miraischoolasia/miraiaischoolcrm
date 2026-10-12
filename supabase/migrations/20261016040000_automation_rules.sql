-- Automation rules: the "when / wait / only if / message" cards an admin fills in inside the CRM.
--
-- A rule says: when a class (or trial, or Zoom meeting) starts, wait so many minutes before it,
-- only for these classes and ages, then put this message into the approval queue.
-- The rules are read by automation.run_rules(), which runs every 15 minutes (pg_cron) and also
-- when an admin presses "Run now". It only adds rows to automation_queue; nothing is sent until
-- a person approves it.
--
-- * Everybody who can see Leads can read the rules; only an admin can add, change or remove one.
-- * A rule can only pick from the events listed in automation.rule_events, so it can never reach
--   fees, notes or anything else outside the automation data pack.
-- * Reminders are queued up to 3 hours before they are due, and up to 1 hour late, so a short
--   gap in the schedule does not lose them. A class that has already started is never queued.
-- * One reminder per rule, per child, per class: dedupe_key stops a second copy.

-- ---------------------------------------------------------------------------------------------
-- The reminder view now looks a week ahead (rules can say "2 days before") and also says which
-- schedule and classroom each row comes from. Columns are only added at the end, so the n8n flow
-- that reads it keeps working.
-- ---------------------------------------------------------------------------------------------

create or replace view automation.class_reminders as
with days as (
  select (series.d)::date as class_date
  from generate_series(
    (now() at time zone 'Asia/Kuala_Lumpur')::date,
    (now() at time zone 'Asia/Kuala_Lumpur')::date + 7,
    interval '1 day'
  ) as series(d)
),
weekly as (
  select
    sc.id as schedule_id,
    sc.classroom_id,
    c.name as classroom_name,
    sc.title,
    sc.start_time,
    days.class_date
  from days
  join public.schedules sc
    on sc.event_type = 'regular'
   and sc.status = 'active'
   and sc.day_of_week = extract(dow from days.class_date)::int
   and sc.start_recur is not null
   and sc.start_recur <= days.class_date
   and (sc.end_recur is null or days.class_date <= sc.end_recur)
  join public.classrooms c
    on c.id = sc.classroom_id
   and c.category = 'regular'
   and c.status = 'active'
  where extract(day from days.class_date) < 29
    and not exists (
      select 1
      from public.schedule_exceptions e
      where e.schedule_id = sc.id
        and e.exception_date = days.class_date
    )
),
people_in_class as (
  select
    'regular'::text as kind,
    w.schedule_id,
    w.classroom_id,
    w.classroom_name,
    w.title as class_title,
    w.start_time,
    w.class_date,
    p.student_id
  from weekly w
  join public.student_classroom_periods p
    on p.classroom_id = w.classroom_id
   and (p.start_date is null or p.start_date <= w.class_date)
   and (p.end_date is null or w.class_date < p.end_date)
  union all
  select
    'replacement'::text,
    sc.id,
    sc.classroom_id,
    null::text,
    sc.title,
    sc.start_time,
    sc.scheduled_date,
    sc.student_id
  from public.schedules sc
  join days on days.class_date = sc.scheduled_date
  where sc.event_type = 'replacement'
    and sc.status = 'active'
    and sc.student_id is not null
)
select
  'class1h:' || s.id || ':' || x.schedule_id || ':' || to_char(x.class_date, 'YYYY-MM-DD') as dedupe_key,
  x.kind,
  s.id as student_id,
  s.full_name as child_name,
  contact.parent_name,
  coalesce(contact.child_phone, contact.parent_phone) as phone,
  (contact.child_phone is not null) as phone_is_childs,
  x.classroom_name,
  x.class_title,
  x.class_date,
  ((x.class_date + x.start_time) at time zone 'Asia/Kuala_Lumpur') as starts_at,
  to_char(x.start_time, 'FMHH12:MI am') as start_label,
  x.schedule_id,
  x.classroom_id
from people_in_class x
join public.students s on s.id = x.student_id and s.is_active
left join automation.student_contacts contact on contact.student_id = s.id
where coalesce(contact.child_phone, contact.parent_phone) ~ '^[0-9]{8,15}$';

revoke all on automation.class_reminders from public, anon, authenticated;
grant select on automation.class_reminders to n8n_automation;

-- Trials also say which classroom they are in (added at the end).
create or replace view automation.trials as
select
  tb.id,
  tb.booking_date,
  sc.start_time,
  sc.end_time,
  sc.title as class_title,
  c.name as classroom_name,
  t.full_name as teacher_name,
  tb.lead_id,
  tb.student_id,
  tb.child_name,
  tb.child_age,
  tb.phone,
  tb.created_at,
  sc.classroom_id
from public.trial_bookings tb
left join public.schedules sc on sc.id = tb.schedule_id
left join public.classrooms c on c.id = sc.classroom_id
left join public.teachers t on t.id = sc.teacher_id;

revoke all on automation.trials from public, anon, authenticated;
grant select on automation.trials to n8n_automation;

-- ---------------------------------------------------------------------------------------------
-- Everything a rule can be about, in one place. One row per event per child, with the time it
-- starts. Only the rule runner (and an admin through it) reads this view.
-- ---------------------------------------------------------------------------------------------

create or replace view automation.rule_events as
select
  'class_start'::text as trigger_type,
  'class:' || r.student_id || ':' || r.schedule_id || ':' || to_char(r.class_date, 'YYYY-MM-DD') as event_key,
  r.phone,
  r.parent_name,
  r.child_name,
  r.student_id,
  null::bigint as lead_id,
  r.starts_at,
  r.start_label,
  r.class_date,
  coalesce(r.classroom_name, r.class_title) as class_label,
  r.classroom_id,
  st.age as age
from automation.class_reminders r
left join automation.students st on st.id = r.student_id
where r.kind = 'regular'

union all

select
  'replacement_start',
  'replacement:' || r.student_id || ':' || r.schedule_id || ':' || to_char(r.class_date, 'YYYY-MM-DD'),
  r.phone,
  r.parent_name,
  r.child_name,
  r.student_id,
  null::bigint,
  r.starts_at,
  r.start_label,
  r.class_date,
  coalesce(r.classroom_name, r.class_title),
  r.classroom_id,
  st.age
from automation.class_reminders r
left join automation.students st on st.id = r.student_id
where r.kind = 'replacement'

union all

select
  'trial_start',
  'trial:' || t.id,
  t.phone,
  ld.full_name,
  t.child_name,
  t.student_id,
  t.lead_id,
  ((t.booking_date + t.start_time) at time zone 'Asia/Kuala_Lumpur'),
  to_char(t.start_time, 'FMHH12:MI am'),
  t.booking_date,
  coalesce(t.classroom_name, t.class_title),
  t.classroom_id,
  t.child_age
from automation.trials t
left join automation.leads ld on ld.id = t.lead_id
where t.start_time is not null
  and t.phone ~ '^[0-9]{8,15}$'
  and t.booking_date between (now() at time zone 'Asia/Kuala_Lumpur')::date
                         and (now() at time zone 'Asia/Kuala_Lumpur')::date + 7

union all

select
  'zoom_start',
  'zoom:' || z.id,
  ld.phone,
  ld.full_name,
  nullif(btrim(ld.children -> 0 ->> 'name'), ''),
  null::bigint,
  ld.id,
  z.starts_at,
  to_char(z.starts_at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI am'),
  (z.starts_at at time zone 'Asia/Kuala_Lumpur')::date,
  'Zoom meeting',
  null::bigint,
  case when (ld.children -> 0 ->> 'age') ~ '^[0-9]{1,2}$' then (ld.children -> 0 ->> 'age')::integer end
from automation.zoom_meetings z
join automation.leads ld on ld.id = z.lead_id
where ld.phone ~ '^[0-9]{8,15}$'
  and z.starts_at > now() - interval '1 day'
  and z.starts_at < now() + interval '8 days';

revoke all on automation.rule_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The rules
-- ---------------------------------------------------------------------------------------------

create table if not exists public.automation_rules (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  trigger_type text not null
    check (trigger_type in ('class_start', 'replacement_start', 'trial_start', 'zoom_start')),
  -- How long before the event starts the message is due: 5 minutes up to 7 days.
  offset_minutes integer not null check (offset_minutes between 5 and 10080),
  -- Empty means any classroom.
  classroom_ids bigint[] not null default '{}' check (cardinality(classroom_ids) <= 50),
  age_min integer check (age_min is null or age_min between 0 and 30),
  age_max integer check (age_max is null or age_max between 0 and 30),
  message text not null check (char_length(btrim(message)) between 1 and 3000),
  enabled boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (age_min is null or age_max is null or age_min <= age_max)
);

create or replace function public.automation_rules_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists automation_rules_touch on public.automation_rules;
create trigger automation_rules_touch
before update on public.automation_rules
for each row execute function public.automation_rules_touch();

alter table public.automation_rules enable row level security;

create policy "automation_rules_select_permitted"
on public.automation_rules
for select to authenticated
using ((select public.has_permission('leads')));

create policy "automation_rules_insert_admin"
on public.automation_rules
for insert to authenticated
with check ((select public.is_admin()));

create policy "automation_rules_update_admin"
on public.automation_rules
for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "automation_rules_delete_admin"
on public.automation_rules
for delete to authenticated
using ((select public.is_admin()));

revoke all on public.automation_rules from anon, authenticated;
grant select on public.automation_rules to authenticated;
grant insert (name, trigger_type, offset_minutes, classroom_ids, age_min, age_max, message, enabled)
on public.automation_rules to authenticated;
grant update (name, trigger_type, offset_minutes, classroom_ids, age_min, age_max, message, enabled)
on public.automation_rules to authenticated;
grant delete on public.automation_rules to authenticated;

-- The reminder the school already uses, ready to switch on. It starts off.
insert into public.automation_rules (name, trigger_type, offset_minutes, message, enabled)
select
  'Class reminder (1 hour before)',
  'class_start',
  60,
  'Hi {child}，提醒一下，今天 {time} 有 AI Coding 课哦，记得准时上课！😊 如果今天不能上课，请告诉我们一声。',
  false
where not exists (select 1 from public.automation_rules);

-- ---------------------------------------------------------------------------------------------
-- The runner
-- ---------------------------------------------------------------------------------------------

create or replace function automation.run_rules()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued integer := 0;
  is_paused boolean;
begin
  -- Reminders for events that already started are no longer useful.
  update public.automation_queue
  set status = 'expired'
  where status = 'pending'
    and expires_at is not null
    and expires_at < now();

  -- Finished rows older than 90 days are tidied away.
  delete from public.automation_queue
  where status in ('sent', 'skipped', 'expired')
    and created_at < now() - interval '90 days';

  select s.paused into is_paused from public.automation_settings s limit 1;
  if coalesce(is_paused, false) then
    return 0;
  end if;

  insert into public.automation_queue
    (rule_key, rule_name, dedupe_key, phone, parent_name, child_name, lead_id, student_id,
     message, due_at, expires_at)
  select
    'rule_' || r.id,
    r.name,
    'rule:' || r.id || ':' || e.event_key,
    e.phone,
    left(e.parent_name, 200),
    left(e.child_name, 200),
    e.lead_id,
    e.student_id,
    left(
      replace(replace(replace(replace(replace(r.message,
        '{child}', coalesce(nullif(btrim(e.child_name), ''), 'your child')),
        '{parent}', coalesce(nullif(btrim(e.parent_name), ''), 'there')),
        '{time}', e.start_label),
        '{date}', to_char(e.class_date, 'Dy DD Mon')),
        '{class}', coalesce(e.class_label, 'class')),
      4000),
    e.starts_at - make_interval(mins => r.offset_minutes),
    e.starts_at
  from public.automation_rules r
  join automation.rule_events e on e.trigger_type = r.trigger_type
  where r.enabled
    and e.starts_at > now()
    and e.starts_at - make_interval(mins => r.offset_minutes) <= now() + interval '3 hours'
    and e.starts_at - make_interval(mins => r.offset_minutes) >= now() - interval '1 hour'
    and (cardinality(r.classroom_ids) = 0 or e.classroom_id = any (r.classroom_ids))
    and (r.age_min is null or e.age >= r.age_min)
    and (r.age_max is null or e.age <= r.age_max)
  on conflict (dedupe_key) do nothing;

  get diagnostics queued = row_count;
  return queued;
end;
$$;

revoke all on function automation.run_rules() from public, anon, authenticated;

-- "Run now" in the CRM: the same runner, for an admin only.
create or replace function public.run_automation_rules()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Only an admin can run the automation rules.' using errcode = '42501';
  end if;
  return automation.run_rules();
end;
$$;

revoke all on function public.run_automation_rules() from public, anon;
grant execute on function public.run_automation_rules() to authenticated;

-- Every 15 minutes, from the database itself, so it does not depend on the VPS being up.
create extension if not exists pg_cron;

select cron.schedule('automation-run-rules', '*/15 * * * *', $cron$select automation.run_rules()$cron$);
