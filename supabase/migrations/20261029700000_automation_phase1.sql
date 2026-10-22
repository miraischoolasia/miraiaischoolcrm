-- Automations, phase 1 (the owner's choices of 2026-10-22).
--
-- New things a flow can start from:
--   class_absent     a child is marked absent (any attendance status that does not count as attended) in a
--                    regular class, once the teacher has saved attendance. Trial classes have their own triggers.
--   lessons_left     a child's lessons left go down (a lesson was used); with "Lessons left is N" a flow speaks
--                    once, when the count reaches N.
--   birthday         a child's birthday (students.date_of_birth), this year's and next year's.
--   student_created  a new student is added.
--   app_account      a student or parent gets a student-app login.
--   lead_stage       a lead moves into a stage (any way: by hand, a flow, a stage rule).
--   lead_tag         a lead gets a tag.
-- New conditions ("only if"): does not have a tag, is a student or a lead, the student kind, day of the week and
--   hours, absent N times in a row, exactly N lessons left, the tag that was just added, the attendance status.
-- New steps: remove a tag, notify staff (a note in the CRM, for the PIC / consultant, the class teachers or a
--   chosen person), create a follow-up task (Calendar).
-- A family gets at most N automatic messages in 7 days (automation_settings.family_weekly_cap, default 5,
--   0 = no limit); the rest are skipped and the flow's log says why.
--
-- Built on Stage rules (20261029400000, 20261029500000): their triggers and rule_events are kept as they are.
-- The runner, the walker, the flow checker and the step function are changed IN PLACE (their text is
-- patched where shown below), the way 20261022010000 did; a place that is not found stops the migration.

-- ---------------------------------------------------------------------------------------------------------
-- 1. Settings and logs
-- ---------------------------------------------------------------------------------------------------------

alter table public.automation_settings
  add column if not exists family_weekly_cap smallint not null default 5 check (family_weekly_cap between 0 and 50);

grant update (family_weekly_cap) on public.automation_settings to authenticated;

comment on column public.automation_settings.family_weekly_cap is
  'Most automatic flow messages one family (phone or chat) gets in 7 days; 0 = no limit.';

alter table public.automation_flow_log drop constraint if exists automation_flow_log_kind_check;
alter table public.automation_flow_log
  add constraint automation_flow_log_kind_check
  check (kind in (
    'stage_stopped', 'cooldown', 'condition_no', 'no_message', 'no_phone', 'opted_out',
    'replied', 'no_reply', 'reply_branch', 'action_done', 'action_skipped', 'channel_off',
    'keyword_matched', 'weekly_limit'
  ));

-- ---------------------------------------------------------------------------------------------------------
-- 2. Staff notifications (the "Notify staff" step)
-- ---------------------------------------------------------------------------------------------------------

create table public.staff_notifications (
  id bigint generated always as identity primary key,
  teacher_id bigint not null references public.teachers (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  body text not null default '' check (char_length(body) <= 2000),
  lead_id bigint references public.leads (id) on delete set null,
  student_id bigint references public.students (id) on delete set null,
  flow_id bigint references public.automation_flows (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index staff_notifications_teacher_idx on public.staff_notifications (teacher_id, created_at desc);
create index staff_notifications_unread_idx on public.staff_notifications (teacher_id) where read_at is null;

alter table public.staff_notifications enable row level security;

-- Each person sees and marks only their own notes; they are written by flows (the database itself).
create policy staff_notifications_select_own on public.staff_notifications
for select to authenticated using (teacher_id = (select public.current_teacher_id()));
create policy staff_notifications_update_own on public.staff_notifications
for update to authenticated
using (teacher_id = (select public.current_teacher_id()))
with check (teacher_id = (select public.current_teacher_id()));

revoke all on public.staff_notifications from anon;
grant select, update (read_at) on public.staff_notifications to authenticated;

create or replace function public.mark_staff_notifications_read(p_ids bigint[] default null)
returns integer
language sql
security definer
set search_path = public
as $$
  with done as (
    update public.staff_notifications n
    set read_at = now()
    where n.teacher_id = public.current_teacher_id()
      and n.read_at is null
      and (p_ids is null or n.id = any (p_ids))
    returning 1
  )
  select count(*)::integer from done;
$$;

revoke all on function public.mark_staff_notifications_read(bigint[]) from public, anon;
grant execute on function public.mark_staff_notifications_read(bigint[]) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Lead stage and tag changes (what "a lead moves into a stage" and "a lead gets a tag" read)
-- ---------------------------------------------------------------------------------------------------------

create table automation.lead_changes (
  id bigint generated always as identity primary key,
  lead_id bigint not null references public.leads (id) on delete cascade,
  kind text not null check (kind in ('stage', 'tag')),
  -- The stage key, or the tag id as text.
  value text not null,
  changed_at timestamptz not null default now()
);

create index lead_changes_time_idx on automation.lead_changes (changed_at desc);

revoke all on automation.lead_changes from public, anon, authenticated;

create or replace function automation.record_lead_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status is not null then
    insert into automation.lead_changes (lead_id, kind, value) values (new.id, 'stage', new.status);
  end if;
  insert into automation.lead_changes (lead_id, kind, value)
  select new.id, 'tag', t::text
  from unnest(coalesce(new.tag_ids, '{}'::bigint[])) t
  where tg_op = 'INSERT' or not (t = any (coalesce(old.tag_ids, '{}'::bigint[])));
  -- Old rows are of no use to any flow (events are only read 62 days back).
  if random() < 0.01 then
    delete from automation.lead_changes where changed_at < now() - interval '120 days';
  end if;
  return null;
end;
$$;

revoke all on function automation.record_lead_changes() from public, anon, authenticated;

drop trigger if exists leads_record_changes on public.leads;
create trigger leads_record_changes
after insert or update of status, tag_ids on public.leads
for each row execute function automation.record_lead_changes();

-- ---------------------------------------------------------------------------------------------------------
-- 4. The new events (same 16 columns as automation.rule_events_base)
-- ---------------------------------------------------------------------------------------------------------

alter table public.automation_flows drop constraint if exists automation_flows_trigger_type_check;
alter table public.automation_flows
  add constraint automation_flows_trigger_type_check
  check (trigger_type in (
    'class_start', 'replacement_start', 'trial_start', 'zoom_start',
    'lesson_expiry', 'account_fee_expiry', 'club_fee_expiry', 'lead_created', 'form_submitted',
    'parent_no_reply', 'parent_waiting',
    'trial_booked', 'package_start', 'lead_idle', 'task_due',
    'message_keyword',
    'trial_attended', 'trial_absent',
    'class_absent', 'lessons_left', 'birthday', 'student_created', 'app_account', 'lead_stage', 'lead_tag'
  ));

-- The lead of a student: the lead that became the student, else the parent's lead.
create or replace function automation.student_lead(p_student bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select l.id from public.leads l where l.converted_student_id = p_student order by l.id limit 1),
    (select sc.parent_lead_id from automation.student_contacts sc where sc.student_id = p_student and sc.parent_lead_id is not null limit 1)
  );
$$;

revoke all on function automation.student_lead(bigint) from public, anon, authenticated;

create or replace view automation.phase1_events as
-- A child marked absent in a regular class: the latest saved attendance of that class day.
with latest_logs as (
  select distinct on (ll.schedule_id, ll.lesson_date)
    ll.id, ll.schedule_id, ll.lesson_date, ll.submitted_at
  from public.lesson_logs ll
  where ll.lesson_date > (now() at time zone 'Asia/Kuala_Lumpur')::date - 62
  order by ll.schedule_id, ll.lesson_date, ll.revision_number desc
)
select
  'class_absent'::text as trigger_type,
  'absent:' || lg.schedule_id || ':' || lg.lesson_date || ':' || lls.student_id as event_key,
  coalesce(sc.child_phone, sc.parent_phone) as phone,
  sc.parent_name,
  coalesce(sc.child_name, s.full_name) as child_name,
  lls.student_id,
  automation.student_lead(lls.student_id) as lead_id,
  lg.submitted_at as starts_at,
  to_char(sch.start_time, 'FMHH12:MI am') as start_label,
  lg.lesson_date as class_date,
  cr.name as class_label,
  sch.classroom_id,
  s.age,
  s.remaining_hours::numeric as hours_left,
  (select l.status from public.leads l where l.id = automation.student_lead(lls.student_id)) as lead_status,
  'absent:' || lg.schedule_id || ':' || lg.lesson_date as group_key
from latest_logs lg
join public.lesson_log_students lls on lls.lesson_log_id = lg.id
join public.attendance_statuses st on st.key = lls.attendance_status and not st.attended
join public.students s on s.id = lls.student_id and s.is_active
join public.schedules sch on sch.id = lg.schedule_id
left join public.classrooms cr on cr.id = sch.classroom_id
left join lateral (
  select c.* from automation.student_contacts c where c.student_id = lls.student_id
  order by (c.parent_phone is null), (c.child_phone is null), c.parent_person_id nulls last limit 1
) sc on true
where not exists (
  select 1 from automation.trials t join public.trial_bookings tb on tb.id = t.id
  where tb.schedule_id = lg.schedule_id and t.booking_date = lg.lesson_date and t.student_id = lls.student_id
)

union all

-- Lessons left went down: one event per new count (the lesson that used it), from the time it was used.
select
  'lessons_left',
  'left:' || s.id || ':' || s.remaining_hours || ':' || lg.id,
  coalesce(sc.child_phone, sc.parent_phone),
  sc.parent_name,
  coalesce(sc.child_name, s.full_name),
  s.id,
  automation.student_lead(s.id),
  lg.created_at,
  to_char(lg.created_at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI am'),
  (lg.created_at at time zone 'Asia/Kuala_Lumpur')::date,
  null::text,
  null::bigint,
  s.age,
  s.remaining_hours::numeric,
  (select l.status from public.leads l where l.id = automation.student_lead(s.id)),
  'left:' || s.id || ':' || lg.id
from public.students s
join lateral (
  select led.id, led.created_at, led.delta_lessons
  from public.student_lesson_ledger led
  where led.student_id = s.id
  order by led.created_at desc, led.id desc
  limit 1
) lg on true
left join lateral (
  select c.* from automation.student_contacts c where c.student_id = s.id
  order by (c.parent_phone is null), (c.child_phone is null), c.parent_person_id nulls last limit 1
) sc on true
where s.is_active
  and s.remaining_hours between 0 and 50
  and lg.delta_lessons < 0
  and lg.created_at > now() - interval '62 days'

union all

-- Birthdays: this year's and next year's (29 February is the 28th in other years), from midnight Malaysia time.
select
  'birthday',
  'bday:' || s.id || ':' || y.yr,
  coalesce(sc.child_phone, sc.parent_phone),
  sc.parent_name,
  coalesce(sc.child_name, s.full_name),
  s.id,
  automation.student_lead(s.id),
  (y.bd::timestamp at time zone 'Asia/Kuala_Lumpur'),
  '12:00 am',
  y.bd,
  null::text,
  null::bigint,
  (y.yr - extract(year from s.date_of_birth))::integer,
  s.remaining_hours::numeric,
  (select l.status from public.leads l where l.id = automation.student_lead(s.id)),
  'bday:' || s.id || ':' || y.yr
from public.students s
cross join lateral (
  select g.yr::integer as yr,
    make_date(
      g.yr::integer,
      extract(month from s.date_of_birth)::integer,
      case
        when extract(month from s.date_of_birth) = 2 and extract(day from s.date_of_birth) = 29
             and not (g.yr % 4 = 0 and (g.yr % 100 <> 0 or g.yr % 400 = 0)) then 28
        else extract(day from s.date_of_birth)::integer
      end
    ) as bd
  from generate_series(
    extract(year from now() at time zone 'Asia/Kuala_Lumpur')::integer,
    extract(year from now() at time zone 'Asia/Kuala_Lumpur')::integer + 1
  ) as g(yr)
) y
left join lateral (
  select c.* from automation.student_contacts c where c.student_id = s.id
  order by (c.parent_phone is null), (c.child_phone is null), c.parent_person_id nulls last limit 1
) sc on true
where s.is_active and s.date_of_birth is not null

union all

-- A new student.
select
  'student_created',
  'newstudent:' || s.id,
  coalesce(sc.child_phone, sc.parent_phone),
  sc.parent_name,
  coalesce(sc.child_name, s.full_name),
  s.id,
  automation.student_lead(s.id),
  s.created_at,
  to_char(s.created_at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI am'),
  (s.created_at at time zone 'Asia/Kuala_Lumpur')::date,
  null::text,
  null::bigint,
  s.age,
  s.remaining_hours::numeric,
  (select l.status from public.leads l where l.id = automation.student_lead(s.id)),
  'newstudent:' || s.id
from public.students s
left join lateral (
  select c.* from automation.student_contacts c where c.student_id = s.id
  order by (c.parent_phone is null), (c.child_phone is null), c.parent_person_id nulls last limit 1
) sc on true
where s.is_active and s.created_at > now() - interval '62 days'

union all

-- A student-app login was made (for the student, or for a parent: the message goes to the parent).
select
  'app_account',
  'app:' || pa.kind || ':' || coalesce(pa.student_id, pa.parent_person_id),
  coalesce(par.phone, sc.parent_phone, sc.child_phone),
  coalesce(par.full_name, sc.parent_name),
  coalesce(ch.full_name, sc.child_name, s.full_name),
  coalesce(pa.student_id, ch.student_id),
  coalesce(par.lead_id, automation.student_lead(coalesce(pa.student_id, ch.student_id))),
  pa.created_at,
  to_char(pa.created_at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI am'),
  (pa.created_at at time zone 'Asia/Kuala_Lumpur')::date,
  null::text,
  null::bigint,
  coalesce(s.age, cs.age),
  coalesce(s.remaining_hours, cs.remaining_hours)::numeric,
  (select l.status from public.leads l where l.id = coalesce(par.lead_id, automation.student_lead(coalesce(pa.student_id, ch.student_id)))),
  'app:' || pa.kind || ':' || coalesce(pa.student_id, pa.parent_person_id)
from public.portal_accounts pa
left join public.students s on s.id = pa.student_id
left join lateral (
  select c.* from automation.student_contacts c where c.student_id = pa.student_id
  order by (c.parent_phone is null), (c.child_phone is null), c.parent_person_id nulls last limit 1
) sc on true
left join public.people par on par.id = pa.parent_person_id
left join lateral (
  select c.full_name, c.student_id from public.people c
  where c.parent_id = pa.parent_person_id and c.kind = 'student'
  order by c.id limit 1
) ch on true
left join public.students cs on cs.id = ch.student_id
where pa.is_active and pa.created_at > now() - interval '62 days'

union all

-- A lead moved into a stage (lead_status is the stage it moved into) or got a tag.
select
  case c.kind when 'stage' then 'lead_stage' else 'lead_tag' end,
  case c.kind when 'stage' then 'stage:' || c.id else 'tag:' || c.lead_id || ':' || c.value || ':' || c.id end,
  l.phone,
  l.full_name,
  nullif(btrim(l.children -> 0 ->> 'name'), ''),
  l.converted_student_id,
  l.id,
  c.changed_at,
  to_char(c.changed_at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI am'),
  (c.changed_at at time zone 'Asia/Kuala_Lumpur')::date,
  null::text,
  null::bigint,
  case when coalesce(l.children -> 0 ->> 'age', '') ~ '^[0-9]{1,2}$' then (l.children -> 0 ->> 'age')::integer end,
  null::numeric,
  case c.kind when 'stage' then c.value else l.status end,
  case c.kind when 'stage' then 'stage:' || c.id else 'tag:' || c.id end
from automation.lead_changes c
join public.leads l on l.id = c.lead_id
where c.changed_at > now() - interval '62 days';

revoke all on automation.phase1_events from public, anon, authenticated;

-- Everything a rule can be about: as in 20261029400000, plus the events above.
create or replace view automation.rule_events as
select
  b.trigger_type,
  b.event_key,
  b.phone,
  b.parent_name,
  b.child_name,
  b.student_id,
  b.lead_id,
  b.starts_at,
  b.start_label,
  b.class_date,
  b.class_label,
  b.classroom_id,
  b.age,
  b.hours_left,
  b.lead_status,
  b.group_key,
  x.source_id,
  x.pic_id,
  x.tag_ids,
  x.form_ids,
  x.keyword_id
from (
  select * from automation.rule_events_base
  union all
  select * from automation.trial_result_events
  union all
  select * from automation.phase1_events
) b
left join lateral (
  select
    l.source_id,
    l.pic_id,
    l.source_rule_id as keyword_id,
    coalesce(l.tag_ids, '{}')::bigint[] as tag_ids,
    coalesce(
      (
        select array_agg(distinct fs.form_id::text)
        from public.form_submissions fs
        where fs.lead_id = l.id and fs.status = 'completed'
      ),
      '{}'::text[]
    ) as form_ids
  from public.leads l
  where l.id = coalesce(
    b.lead_id,
    (
      select par.lead_id
      from public.people ch
      join public.people par on par.id = ch.parent_id
      where ch.student_id = b.student_id and par.lead_id is not null
      limit 1
    )
  )
) x on true;

revoke all on automation.rule_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 5. What the new conditions read
-- ---------------------------------------------------------------------------------------------------------

-- Lessons in a row, up to and including this day, at which the child was not marked as attended.
create or replace function automation.absent_streak(p_student bigint, p_until date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  with lessons as (
    select distinct on (ll.schedule_id, ll.lesson_date)
      ll.lesson_date, lls.attendance_status
    from public.lesson_logs ll
    join public.lesson_log_students lls on lls.lesson_log_id = ll.id and lls.student_id = p_student
    where ll.lesson_date <= p_until and ll.lesson_date > p_until - 365
    order by ll.schedule_id, ll.lesson_date, ll.revision_number desc
  ),
  marked as (
    select l.lesson_date, coalesce(st.attended, true) as attended
    from lessons l
    left join public.attendance_statuses st on st.key = l.attendance_status
  )
  select count(*)::integer
  from marked m
  where not m.attended
    and m.lesson_date > coalesce((select max(a.lesson_date) from marked a where a.attended), date '1900-01-01');
$$;

revoke all on function automation.absent_streak(bigint, date) from public, anon, authenticated;

-- The attendance status of an absence event ("absent:<schedule>:<date>:<student>").
create or replace function automation.absence_status(p_event_key text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lls.attendance_status
  from public.lesson_logs ll
  join public.lesson_log_students lls on lls.lesson_log_id = ll.id
  where p_event_key ~ '^absent:[0-9]+:[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]+$'
    and ll.schedule_id = split_part(p_event_key, ':', 2)::bigint
    and ll.lesson_date = split_part(p_event_key, ':', 3)::date
    and lls.student_id = split_part(p_event_key, ':', 4)::bigint
  order by ll.revision_number desc
  limit 1;
$$;

revoke all on function automation.absence_status(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 6. The walker learns the new conditions (it is given the event and the student as well)
-- ---------------------------------------------------------------------------------------------------------

do $patch$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p
  where p.pronamespace = 'automation'::regnamespace and p.proname = 'flow_walk';
  if v_oid is null then
    raise exception 'automation.flow_walk is missing.';
  end if;
  v_def := replace(pg_get_functiondef(v_oid), chr(13), '');

  v_new := replace(v_def,
    'p_now timestamp with time zone DEFAULT now()',
    'p_now timestamp with time zone DEFAULT now(), p_event_key text DEFAULT NULL::text, p_student bigint DEFAULT NULL::bigint');
  if v_new = v_def then
    raise exception 'flow_walk: the argument list was not found.';
  end if;
  v_def := v_new;

  v_new := replace(v_def,
    $a$      else
        matched := false;
        v_detail := 'Unknown block';$a$,
    $b$      elsif v_kind = 'tag_not' then
        matched := not exists (
          select 1 from jsonb_array_elements_text(n -> 'ids') i
          join unnest(coalesce(p_tags, '{}'::bigint[])) t on t::text = i
        );
        v_detail := case when matched then 'The lead has none of these tags' else 'The lead has one of these tags' end;
      elsif v_kind = 'subject' then
        matched := case n ->> 'is' when 'student' then p_student is not null else p_student is null end;
        v_detail := case
          when p_student is not null then 'This is a student'
          else 'This is a lead (not a student yet)'
        end;
      elsif v_kind = 'student_kind' then
        v_word := (select s.student_kind from public.students s where s.id = p_student);
        matched := v_word is not null
          and exists (select 1 from jsonb_array_elements_text(n -> 'ids') i where i = v_word);
        v_detail := case
          when p_student is null then 'This is not a student'
          when v_word is null then 'The student has no kind set'
          when matched then format('The student is "%s"', v_word)
          else format('The student is "%s", not one of the ticked kinds', v_word)
        end;
      elsif v_kind = 'weekday' then
        v_start := coalesce(p_event_at, p_now);
        lo := extract(dow from v_start at time zone 'Asia/Kuala_Lumpur')::integer;
        hi := extract(hour from v_start at time zone 'Asia/Kuala_Lumpur')::integer;
        matched := exists (select 1 from jsonb_array_elements_text(n -> 'days') d where d = lo::text)
          and (n ->> 'from' is null or hi >= (n ->> 'from')::integer)
          and (n ->> 'to' is null or hi < (n ->> 'to')::integer);
        v_detail := case
          when matched then 'It happened on one of the ticked days and hours'
          else format('It happened on %s at %s:00, outside the ticked days or hours',
            (array['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'])[lo + 1], hi)
        end;
      elsif v_kind = 'absent_streak' then
        hits := case
          when p_student is not null and p_event_key ~ '^absent:[0-9]+:[0-9]{4}-[0-9]{2}-[0-9]{2}:[0-9]+$'
            then automation.absent_streak(p_student, split_part(p_event_key, ':', 3)::date)
        end;
        matched := hits is not null and hits >= coalesce((n ->> 'min')::integer, 2);
        v_detail := case
          when hits is null then 'This is not an absence'
          when matched then format('Absent %s times in a row', hits)
          else format('Absent %s time(s) in a row, fewer than %s', hits, n ->> 'min')
        end;
      elsif v_kind = 'hours_is' then
        matched := p_hours is not null and p_hours = (n ->> 'value')::numeric;
        v_detail := case
          when p_hours is null then 'The lessons left are not known'
          when matched then format('%s lessons left', round(p_hours))
          else format('%s lessons left, not %s', round(p_hours), n ->> 'value')
        end;
      elsif v_kind = 'tag_added' then
        v_word := case when p_event_key ~ '^tag:[0-9]+:[0-9]+:[0-9]+$' then split_part(p_event_key, ':', 3) end;
        matched := v_word is not null
          and exists (select 1 from jsonb_array_elements_text(n -> 'ids') i where i = v_word);
        v_detail := case
          when v_word is null then 'No tag was added'
          when matched then 'The tag that was added is one of the ticked tags'
          else 'The tag that was added is not one of the ticked tags'
        end;
      elsif v_kind = 'att_status' then
        v_word := automation.absence_status(p_event_key);
        matched := v_word is not null
          and exists (select 1 from jsonb_array_elements_text(n -> 'ids') i where i = v_word);
        v_detail := case
          when v_word is null then 'This is not an absence'
          when matched then format('Marked "%s"', v_word)
          else format('Marked "%s", not one of the ticked statuses', v_word)
        end;
      else
        matched := false;
        v_detail := 'Unknown block';$b$);
  if v_new = v_def then
    raise exception 'flow_walk: the place for new conditions was not found.';
  end if;

  drop function automation.flow_walk(
    jsonb, integer, bigint, numeric, text, bigint, bigint, bigint[], text[], bigint, jsonb, jsonb,
    timestamp with time zone, timestamp with time zone
  );
  execute v_new;
  revoke all on function automation.flow_walk(
    jsonb, integer, bigint, numeric, text, bigint, bigint, bigint[], text[], bigint, jsonb, jsonb,
    timestamp with time zone, timestamp with time zone, text, bigint
  ) from public, anon, authenticated;
end;
$patch$;

-- ---------------------------------------------------------------------------------------------------------
-- 7. Steps: remove a tag, notify staff, create a follow-up task
-- ---------------------------------------------------------------------------------------------------------

-- The staff a step is for: 'pic' (the lead's PIC, else the student's consultant), 'teachers' (the class
-- teachers of the event's class, else of the child's classes today), or one account id.
create or replace function automation.flow_staff_targets(
  p_to text,
  p_lead bigint,
  p_student bigint,
  p_event_key text
)
returns bigint[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids bigint[];
  v_classroom bigint;
begin
  if p_to = 'pic' then
    select array_remove(array[coalesce(
      (select o.teacher_id from public.leads l join public.lead_options o on o.id = l.pic_id where l.id = p_lead),
      (select s.consultant_id from public.students s where s.id = p_student)
    )], null) into v_ids;
  elsif p_to = 'teachers' then
    if p_event_key ~ '^absent:[0-9]+:' then
      select sch.classroom_id into v_classroom from public.schedules sch where sch.id = split_part(p_event_key, ':', 2)::bigint;
    end if;
    select coalesce(array_agg(distinct ct.teacher_id), '{}') into v_ids
    from public.classroom_teachers ct
    where ct.classroom_id = v_classroom
       or (v_classroom is null and ct.classroom_id in (
         select p.classroom_id from public.student_classroom_periods p
         where p.student_id = p_student
           and (p.start_date is null or p.start_date <= (now() at time zone 'Asia/Kuala_Lumpur')::date)
           and (p.end_date is null or p.end_date > (now() at time zone 'Asia/Kuala_Lumpur')::date)
       ));
  elsif p_to ~ '^[0-9]{1,12}$' then
    v_ids := array[p_to::bigint];
  else
    v_ids := '{}';
  end if;
  return array(select t.id from public.teachers t where t.id = any (v_ids) and t.is_active);
end;
$$;

revoke all on function automation.flow_staff_targets(text, bigint, bigint, text) from public, anon, authenticated;

-- Fills {child} and {parent} in a staff step's text.
create or replace function automation.fill_staff_text(p_text text, p_parent text, p_child text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(coalesce(p_text, ''),
    '{child}', coalesce(nullif(btrim(p_child), ''), 'the child')),
    '{parent}', coalesce(nullif(btrim(p_parent), ''), 'the parent'));
$$;

-- A step for the team. The step's value is JSON:
--   notify_staff  {"to": "pic"|"teachers"|"<account id>", "text": "..."}
--   create_task   {"to": ..., "title": "...", "days": 0..60}
create or replace function automation.do_staff_step(
  p_flow bigint,
  p_action text,
  p_value text,
  p_lead bigint,
  p_student bigint,
  p_event_key text,
  p_parent text,
  p_child text,
  out kind text,
  out detail text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
  v_to bigint[];
  v_text text;
  v_title text;
  v_days integer;
  v_flow_name text;
begin
  begin
    v := p_value::jsonb;
  exception when others then
    kind := 'action_skipped';
    detail := 'This step is not set up properly.';
    return;
  end;
  v_to := automation.flow_staff_targets(v ->> 'to', p_lead, p_student, p_event_key);
  if cardinality(v_to) = 0 then
    kind := 'action_skipped';
    detail := case v ->> 'to'
      when 'pic' then 'Nobody is in charge of this family yet (no PIC or consultant), so nobody was told.'
      when 'teachers' then 'No class teacher was found for this child, so nobody was told.'
      else 'That person is no longer active, so nobody was told.'
    end;
    return;
  end if;
  select f.name into v_flow_name from public.automation_flows f where f.id = p_flow;

  if p_action = 'notify_staff' then
    v_text := left(automation.fill_staff_text(v ->> 'text', p_parent, p_child), 2000);
    insert into public.staff_notifications (teacher_id, title, body, lead_id, student_id, flow_id)
    select t, left(coalesce(nullif(btrim(split_part(v_text, chr(10), 1)), ''), coalesce(v_flow_name, 'Automation')), 200),
      v_text, p_lead, p_student, p_flow
    from unnest(v_to) t;
    kind := 'action_done';
    detail := format('Told %s staff member(s) in the CRM.', cardinality(v_to));
  else
    v_title := left(coalesce(nullif(btrim(automation.fill_staff_text(v ->> 'title', p_parent, p_child)), ''), 'Follow up'), 160);
    v_days := least(greatest(coalesce((v ->> 'days')::integer, 1), 0), 60);
    insert into public.calendar_items (kind, title, notes, item_date, assignee_id, lead_id)
    select 'task', v_title, left(coalesce('From the automation "' || v_flow_name || '"', ''), 2000),
      (now() at time zone 'Asia/Kuala_Lumpur')::date + v_days, t, p_lead
    from unnest(v_to) t;
    kind := 'action_done';
    detail := format('Made the task "%s" for %s staff member(s), due in %s day(s).', v_title, cardinality(v_to), v_days);
  end if;
exception when others then
  kind := 'action_skipped';
  detail := left('Could not do this step: ' || sqlerrm, 480);
end;
$$;

revoke all on function automation.do_staff_step(bigint, text, text, bigint, bigint, text, text, text) from public, anon, authenticated;

do $patch$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p
  where p.pronamespace = 'automation'::regnamespace and p.proname = 'do_flow_action';
  if v_oid is null then
    raise exception 'automation.do_flow_action is missing.';
  end if;
  v_def := replace(pg_get_functiondef(v_oid), chr(13), '');

  -- Team steps work for a student with no lead too.
  v_new := replace(v_def,
    $a$  if v_lead is null then
    perform automation.log_flow_event(
      p_flow, p_event_key, p_node, 'action_skipped',
      'This family has no lead, so there was nothing to change.',$a$,
    $b$  if p_action in ('notify_staff', 'create_task') then
    select s.kind, s.detail into v_kind, v_detail
    from automation.do_staff_step(p_flow, p_action, p_value, v_lead, p_student, p_event_key, p_parent, p_child) s;
    perform automation.log_flow_event(
      p_flow, p_event_key, p_node, v_kind, v_detail,
      p_phone, p_parent, p_child, v_lead, p_student, p_starts
    );
    return;
  end if;

  if v_lead is null then
    perform automation.log_flow_event(
      p_flow, p_event_key, p_node, 'action_skipped',
      'This family has no lead, so there was nothing to change.',$b$);
  if v_new = v_def then
    raise exception 'do_flow_action: the place for team steps was not found.';
  end if;
  v_def := v_new;

  v_new := replace(v_def,
    $a$    elsif p_action = 'assign_pic' then$a$,
    $b$    elsif p_action = 'remove_tag' then
      v_id := p_value::bigint;
      select o.label into v_label from public.lead_options o where o.id = v_id and o.kind = 'tag';
      update public.leads l
      set tag_ids = array_remove(l.tag_ids, v_id)
      where l.id = v_lead and v_id = any (l.tag_ids);
      get diagnostics v_rows = row_count;
      v_detail := case
        when v_rows > 0 then format('Took the tag "%s" off the lead.', coalesce(v_label, v_id::text))
        else format('The lead does not have the tag "%s".', coalesce(v_label, v_id::text))
      end;
    elsif p_action = 'assign_pic' then$b$);
  if v_new = v_def then
    raise exception 'do_flow_action: the place for remove_tag was not found.';
  end if;
  execute v_new;
end;
$patch$;

-- ---------------------------------------------------------------------------------------------------------
-- 8. The flow checker accepts the new conditions and steps
-- ---------------------------------------------------------------------------------------------------------

do $patch$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'automation_flows_validate';
  if v_oid is null then
    raise exception 'automation_flows_validate is missing.';
  end if;
  v_def := replace(pg_get_functiondef(v_oid), chr(13), '');

  v_new := replace(v_def,
    $a$      else
        raise exception 'A step has an unknown action.';$a$,
    $b$      elsif n ->> 'action' = 'remove_tag' then
        if coalesce(n ->> 'value', '') !~ '^[0-9]{1,12}$' then
          raise exception 'A step that removes a tag needs one picked.';
        end if;
      elsif n ->> 'action' in ('notify_staff', 'create_task') then
        declare
          sv jsonb;
        begin
          begin
            sv := (n ->> 'value')::jsonb;
          exception when others then
            raise exception 'A step for the team is not set up properly.';
          end;
          if jsonb_typeof(sv) <> 'object'
             or coalesce(sv ->> 'to', '') !~ '^(pic|teachers|[0-9]{1,12})$' then
            raise exception 'A step for the team needs who it is for.';
          end if;
          if n ->> 'action' = 'notify_staff'
             and char_length(btrim(coalesce(sv ->> 'text', ''))) not between 1 and 1000 then
            raise exception 'A note to staff needs text (up to 1000 characters).';
          end if;
          if n ->> 'action' = 'create_task' and (
               char_length(btrim(coalesce(sv ->> 'title', ''))) not between 1 and 160
               or coalesce(sv ->> 'days', '1') !~ '^[0-9]{1,2}$'
               or coalesce(sv ->> 'days', '1')::integer > 60
             ) then
            raise exception 'A task needs a title (up to 160 characters) and is due 0 to 60 days later.';
          end if;
        end;
      else
        raise exception 'A step has an unknown action.';$b$);
  if v_new = v_def then
    raise exception 'automation_flows_validate: the action place was not found.';
  end if;
  v_def := v_new;

  v_new := replace(v_def,
    $a$      else
        raise exception 'A condition has an unknown kind.';$a$,
    $b$      elsif n ->> 'kind' in ('tag_not', 'student_kind', 'tag_added', 'att_status') then
        if jsonb_typeof(n -> 'ids') is distinct from 'array'
           or jsonb_array_length(n -> 'ids') not between 1 and 50
           or exists (
             select 1 from jsonb_array_elements(n -> 'ids') x
             where jsonb_typeof(x) <> 'string' or char_length(x #>> '{}') not between 1 and 60
           ) then
          raise exception 'A condition needs at least one choice ticked.';
        end if;
      elsif n ->> 'kind' = 'subject' then
        if coalesce(n ->> 'is', '') not in ('student', 'lead') then
          raise exception 'Say whether the condition is for students or for leads.';
        end if;
      elsif n ->> 'kind' = 'weekday' then
        if jsonb_typeof(n -> 'days') is distinct from 'array'
           or jsonb_array_length(n -> 'days') not between 1 and 7
           or exists (select 1 from jsonb_array_elements_text(n -> 'days') d where d !~ '^[0-6]$')
           or (n ->> 'from' is not null and coalesce(n ->> 'from', '') !~ '^([0-9]|1[0-9]|2[0-3])$')
           or (n ->> 'to' is not null and coalesce(n ->> 'to', '') !~ '^([1-9]|1[0-9]|2[0-4])$')
           or (n ->> 'from' is not null and n ->> 'to' is not null and (n ->> 'from')::integer >= (n ->> 'to')::integer) then
          raise exception 'A day and time condition needs at least one day, and hours from 0 to 24 with the start before the end.';
        end if;
      elsif n ->> 'kind' = 'absent_streak' then
        if coalesce(n ->> 'min', '') !~ '^[0-9]{1,2}$' or (n ->> 'min')::integer not between 2 and 20 then
          raise exception 'Absent in a row must be 2 to 20 times.';
        end if;
      elsif n ->> 'kind' = 'hours_is' then
        if coalesce(n ->> 'value', '') !~ '^[0-9]{1,3}$' or (n ->> 'value')::integer > 500 then
          raise exception 'Lessons left must be a whole number from 0 to 500.';
        end if;
      else
        raise exception 'A condition has an unknown kind.';$b$);
  if v_new = v_def then
    raise exception 'automation_flows_validate: the condition place was not found.';
  end if;
  execute v_new;
end;
$patch$;

-- ---------------------------------------------------------------------------------------------------------
-- 9. The runner: gives the walker the event and student, and keeps to the weekly limit per family
-- ---------------------------------------------------------------------------------------------------------

do $patch$
declare
  v_oid oid;
  v_def text;
  v_new text;
  v_count integer;
begin
  select p.oid into v_oid
  from pg_proc p
  where p.pronamespace = 'automation'::regnamespace and p.proname = 'run_rules';
  if v_oid is null then
    raise exception 'automation.run_rules is missing.';
  end if;
  v_def := replace(pg_get_functiondef(v_oid), chr(13), '');

  v_count := (length(v_def) - length(replace(v_def, 'sent_map, replies, ev.starts_at', ''))) / length('sent_map, replies, ev.starts_at');
  if v_count <> 2 then
    raise exception 'run_rules: expected 2 walker calls, found %.', v_count;
  end if;
  v_def := replace(v_def, 'sent_map, replies, ev.starts_at', 'sent_map, replies, ev.starts_at, now(), ev.event_key, ev.student_id');

  v_new := replace(v_def,
    $a$            -- A button message is a GoHighLevel workflow: it needs a Messenger / Instagram chat and goes out by itself.$a$,
    $b$            -- A family gets at most so many automatic messages in 7 days (the school's setting; 0 = no limit). A message
            -- that is already queued for this event counts as its own, not against the limit.
            if coalesce((select s.family_weekly_cap from public.automation_settings s limit 1), 5) > 0
               and (
                 select count(*)
                 from public.automation_queue q
                 where q.rule_key like 'flow\_%'
                   and q.status not in ('skipped', 'expired', 'failed')
                   and q.created_at > now() - interval '7 days'
                   and q.dedupe_key <> 'flow:' || f.id || ':' || m.node_id || ':' || ev.event_key
                   and (
                     (chat_conv is null and q.phone = ev.phone)
                     or (chat_conv is not null and q.conversation_id = chat_conv)
                   )
               ) >= coalesce((select s.family_weekly_cap from public.automation_settings s limit 1), 5)
               and not exists (
                 select 1 from public.automation_queue q
                 where q.dedupe_key = 'flow:' || f.id || ':' || m.node_id || ':' || ev.event_key
               ) then
              perform automation.log_flow_event(
                f.id, ev.event_key, m.node_id, 'weekly_limit',
                format(
                  'This family already got %s automatic messages in the last 7 days (the school''s limit), so this one was not sent.',
                  coalesce((select s.family_weekly_cap from public.automation_settings s limit 1), 5)
                ),
                ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
              );
              continue;
            end if;
            -- A button message is a GoHighLevel workflow: it needs a Messenger / Instagram chat and goes out by itself.$b$);
  if v_new = v_def then
    raise exception 'run_rules: the place for the weekly limit was not found.';
  end if;
  execute v_new;
end;
$patch$;
