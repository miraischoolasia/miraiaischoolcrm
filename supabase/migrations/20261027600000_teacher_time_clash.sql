-- One teacher, one class at a time (boss 2026-10-20: "不让存").
--
-- Every way a lesson is made or changed goes through these tables, so the
-- check lives here: the Calendar and the class page (schedules), dragging a
-- lesson to another day (move_class_occurrence makes a one-day class), a trial
-- move, a change of class teacher (reassign_classroom_teacher), an import,
-- bringing back a cancelled day (schedule_exceptions), a substitute teacher for
-- one day (lesson_substitutes) and make-up minutes added to a lesson
-- (makeup_sessions).
--
-- A lesson clashes when the same teacher - or the substitute covering it that
-- day - has another lesson that really meets that day (weekday, term dates,
-- not cancelled, the 29th-31st rule: schedule_meets_on) and the times overlap,
-- make-up minutes included. Only today and the next 12 months are checked:
-- days that are over cannot be double-booked any more.
--
-- The checks run at the end of the change (deferred), so a move that adds the
-- new day before cancelling the old one is judged on the finished result.
--
-- Lessons that already clash before this migration keep working: a change to
-- a lesson is refused only for a clash it did not have before (so its title,
-- links or students can still be edited), and nothing is checked when the
-- migration runs. current_teacher_clashes() lists the clashes there are.

-- ---------------------------------------------------------------------------
-- 1. Helpers

-- Make-up minutes added after a weekly lesson of a class on one day.
create or replace function public.lesson_extra_minutes(p_classroom_id bigint, p_date date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(ms.extra_minutes), 0)::int
  from public.makeup_sessions ms
  join public.makeup_plans mp on mp.id = ms.plan_id
  where mp.classroom_id = p_classroom_id and ms.session_date = p_date;
$$;

revoke all on function public.lesson_extra_minutes(bigint, date) from public, anon, authenticated;

-- The teacher's lessons on one day that overlap p_start-p_end: their own
-- (unless someone else covers it that day) and the ones they cover as a
-- substitute.
create or replace function public.teacher_lessons_overlapping(
  p_teacher_id bigint, p_date date, p_start time, p_end interval, p_exclude_schedule_id bigint default null
)
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  with candidates as materialized (
    select s.id, s.classroom_id, s.event_type, s.end_time
    from public.schedules s
    where s.status = 'active'
      and s.id is distinct from p_exclude_schedule_id
      and s.start_time - time '00:00' < p_end
      and (
        (s.teacher_id = p_teacher_id
          and not exists (select 1 from public.lesson_substitutes ls
                          where ls.schedule_id = s.id and ls.lesson_date = p_date and ls.teacher_id <> p_teacher_id))
        or exists (select 1 from public.lesson_substitutes ls
                   where ls.schedule_id = s.id and ls.lesson_date = p_date and ls.teacher_id = p_teacher_id)
      )
  )
  select c.id
  from candidates c
  where p_start - time '00:00' < c.end_time - time '00:00'
          + make_interval(mins => case when c.event_type = 'regular' and c.classroom_id is not null
                                       then public.lesson_extra_minutes(c.classroom_id, p_date) else 0 end)
    and public.schedule_meets_on(c.id, p_date);
$$;

revoke all on function public.teacher_lessons_overlapping(bigint, date, time, interval, bigint) from public, anon, authenticated;

-- When a lesson ends on a day, make-up minutes included (as a length from midnight).
create or replace function public.lesson_end_on(p_schedule_id bigint, p_date date)
returns interval
language sql
stable
security definer
set search_path = public
as $$
  select s.end_time - time '00:00'
         + make_interval(mins => case when s.event_type = 'regular' and s.classroom_id is not null
                                      then public.lesson_extra_minutes(s.classroom_id, p_date) else 0 end)
  from public.schedules s
  where s.id = p_schedule_id;
$$;

revoke all on function public.lesson_end_on(bigint, date) from public, anon, authenticated;

-- Whether a lesson with these values met on a day (how a lesson was before a change).
create or replace function public.lesson_pattern_meets(
  p_schedule_id bigint, p_event_type text, p_day_of_week smallint, p_scheduled_date date,
  p_start_recur date, p_end_recur date, p_classroom_id bigint, p_date date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.schedule_exceptions e
                     where e.schedule_id = p_schedule_id and e.exception_date = p_date)
    and case
      when p_event_type = 'replacement' then p_date = p_scheduled_date
      else extract(dow from p_date)::int = p_day_of_week
        and p_date >= p_start_recur
        and (p_end_recur is null or p_date <= p_end_recur)
        and (extract(day from p_date)::int < 29
             or coalesce((select category from public.classrooms where id = p_classroom_id), 'regular') = 'trial'
             or public.lesson_extra_minutes(p_classroom_id, p_date) > 0)
    end;
$$;

revoke all on function public.lesson_pattern_meets(bigint, text, smallint, date, date, date, bigint, date) from public, anon, authenticated;

-- The days to check for a lesson: from today, up to 12 months ahead.
create or replace function public.clash_check_days(
  p_event_type text, p_day_of_week smallint, p_scheduled_date date, p_start_recur date, p_end_recur date
)
returns setof date
language sql
stable
set search_path = public
as $$
  with bounds as (select (timezone('Asia/Kuala_Lumpur', now()))::date as today)
  select d.day::date
  from bounds b,
       generate_series(
         case when p_event_type = 'replacement' then p_scheduled_date else greatest(p_start_recur, b.today) end,
         case when p_event_type = 'replacement' then p_scheduled_date
              else least(coalesce(p_end_recur, b.today + 365), b.today + 365) end,
         interval '1 day'
       ) as d(day)
  where d.day::date >= b.today
    and (p_event_type = 'replacement' or extract(dow from d.day)::int = p_day_of_week);
$$;

revoke all on function public.clash_check_days(text, smallint, date, date, date) from public, anon, authenticated;

-- A readable line for one clash, e.g. "Time clash: Ms Joey already teaches SCI
-- Year 5 on Thu 23 Oct 2026, 7:00pm-8:15pm. ..."
create or replace function public.clash_message(p_teacher_id bigint, p_other_schedule_id bigint, p_date date)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select format('Time clash: %s already teaches %s on %s, %s-%s. One teacher cannot have two classes at the same time, so change the day, the time or the teacher.',
                coalesce((select full_name from public.teachers where id = p_teacher_id), 'This teacher'),
                coalesce(c.name, s.title),
                to_char(p_date, 'Dy FMDD Mon YYYY'),
                to_char(s.start_time, 'FMHH12:MIam'),
                to_char(time '00:00' + public.lesson_end_on(s.id, p_date), 'FMHH12:MIam'))
  from public.schedules s left join public.classrooms c on c.id = s.classroom_id
  where s.id = p_other_schedule_id;
$$;

revoke all on function public.clash_message(bigint, bigint, date) from public, anon, authenticated;

-- Who teaches a lesson on a day: the substitute when there is one.
create or replace function public.lesson_teacher_on(p_schedule_id bigint, p_date date)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select ls.teacher_id from public.lesson_substitutes ls where ls.schedule_id = p_schedule_id and ls.lesson_date = p_date),
    (select s.teacher_id from public.schedules s where s.id = p_schedule_id));
$$;

revoke all on function public.lesson_teacher_on(bigint, date) from public, anon, authenticated;

-- The first clash of a lesson on one day, if any.
create or replace function public.lesson_clash_on(p_schedule_id bigint, p_date date)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select o.id
  from public.schedules s,
       public.teacher_lessons_overlapping(public.lesson_teacher_on(s.id, p_date), p_date, s.start_time,
                                          public.lesson_end_on(s.id, p_date), s.id) as o(id)
  where s.id = p_schedule_id
  order by o.id
  limit 1;
$$;

revoke all on function public.lesson_clash_on(bigint, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Lessons (schedules)

create or replace function public.check_schedule_clash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now public.schedules%rowtype;
  v_teacher bigint;
  v_day date;
  v_other bigint;
  v_before bigint[] := '{}';
begin
  -- Judged on the lesson as it is at the end of the change.
  select * into v_now from public.schedules where id = new.id;
  if not found or v_now.status <> 'active' then
    return null;
  end if;

  if tg_op = 'UPDATE'
     and (v_now.teacher_id, v_now.event_type, v_now.day_of_week, v_now.scheduled_date, v_now.start_time, v_now.end_time,
          v_now.start_recur, v_now.end_recur, v_now.status, v_now.classroom_id)
         is not distinct from
         (old.teacher_id, old.event_type, old.day_of_week, old.scheduled_date, old.start_time, old.end_time,
          old.start_recur, old.end_recur, old.status, old.classroom_id) then
    return null;
  end if;

  -- What the lesson already clashed with before the change is not held against it.
  if tg_op = 'UPDATE' and old.status = 'active' then
    select coalesce(array_agg(distinct o.id), '{}') into v_before
    from public.clash_check_days(old.event_type, old.day_of_week, old.scheduled_date, old.start_recur, old.end_recur) as d(day),
         public.teacher_lessons_overlapping(
           coalesce((select ls.teacher_id from public.lesson_substitutes ls where ls.schedule_id = old.id and ls.lesson_date = d.day), old.teacher_id),
           d.day, old.start_time, old.end_time - time '00:00', old.id) as o(id)
    where public.lesson_pattern_meets(old.id, old.event_type, old.day_of_week, old.scheduled_date,
                                      old.start_recur, old.end_recur, old.classroom_id, d.day);
  end if;

  for v_day in
    select d.day from public.clash_check_days(v_now.event_type, v_now.day_of_week, v_now.scheduled_date, v_now.start_recur, v_now.end_recur) as d(day)
  loop
    if not public.schedule_meets_on(v_now.id, v_day) then
      continue;
    end if;
    v_teacher := public.lesson_teacher_on(v_now.id, v_day);
    select o.id into v_other
    from public.teacher_lessons_overlapping(v_teacher, v_day, v_now.start_time, public.lesson_end_on(v_now.id, v_day), v_now.id) as o(id)
    where not (o.id = any (v_before))
    order by o.id
    limit 1;
    if v_other is not null then
      raise exception using errcode = '23P01', message = public.clash_message(v_teacher, v_other, v_day);
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function public.check_schedule_clash() from public, anon, authenticated;

drop trigger if exists schedules_teacher_clash on public.schedules;
create constraint trigger schedules_teacher_clash
  after insert or update on public.schedules
  deferrable initially deferred
  for each row execute function public.check_schedule_clash();

-- ---------------------------------------------------------------------------
-- 3. A cancelled day brought back

create or replace function public.check_restored_day_clash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other bigint;
begin
  if old.exception_date < (timezone('Asia/Kuala_Lumpur', now()))::date
     or not public.schedule_meets_on(old.schedule_id, old.exception_date)
     or not exists (select 1 from public.schedules where id = old.schedule_id and status = 'active') then
    return null;
  end if;
  v_other := public.lesson_clash_on(old.schedule_id, old.exception_date);
  if v_other is not null then
    raise exception using errcode = '23P01',
      message = public.clash_message(public.lesson_teacher_on(old.schedule_id, old.exception_date), v_other, old.exception_date);
  end if;
  return null;
end;
$$;

revoke all on function public.check_restored_day_clash() from public, anon, authenticated;

drop trigger if exists schedule_exceptions_teacher_clash on public.schedule_exceptions;
create constraint trigger schedule_exceptions_teacher_clash
  after delete on public.schedule_exceptions
  deferrable initially deferred
  for each row execute function public.check_restored_day_clash();

-- ---------------------------------------------------------------------------
-- 4. A substitute for one day

create or replace function public.check_substitute_clash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other bigint;
begin
  if new.lesson_date < (timezone('Asia/Kuala_Lumpur', now()))::date
     or not exists (select 1 from public.lesson_substitutes
                    where schedule_id = new.schedule_id and lesson_date = new.lesson_date and teacher_id = new.teacher_id)
     or not exists (select 1 from public.schedules where id = new.schedule_id and status = 'active')
     or not public.schedule_meets_on(new.schedule_id, new.lesson_date) then
    return null;
  end if;
  v_other := public.lesson_clash_on(new.schedule_id, new.lesson_date);
  if v_other is not null then
    raise exception using errcode = '23P01', message = public.clash_message(new.teacher_id, v_other, new.lesson_date);
  end if;
  return null;
end;
$$;

revoke all on function public.check_substitute_clash() from public, anon, authenticated;

drop trigger if exists lesson_substitutes_teacher_clash on public.lesson_substitutes;
create constraint trigger lesson_substitutes_teacher_clash
  after insert or update on public.lesson_substitutes
  deferrable initially deferred
  for each row execute function public.check_substitute_clash();

-- ---------------------------------------------------------------------------
-- 5. Make-up minutes added after a lesson (on the 29th-31st the make-up day
--    brings the whole lesson back)

create or replace function public.check_makeup_clash()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_classroom bigint;
  v_lesson bigint;
  v_other bigint;
begin
  if new.session_date < (timezone('Asia/Kuala_Lumpur', now()))::date
     or not exists (select 1 from public.makeup_sessions where id = new.id) then
    return null;
  end if;
  select classroom_id into v_classroom from public.makeup_plans where id = new.plan_id;
  for v_lesson in
    select s.id from public.schedules s
    where s.classroom_id = v_classroom and s.status = 'active' and s.event_type = 'regular'
      and public.schedule_meets_on(s.id, new.session_date)
    order by s.id
  loop
    v_other := public.lesson_clash_on(v_lesson, new.session_date);
    if v_other is not null then
      raise exception using errcode = '23P01',
        message = 'The make-up minutes run into another class. '
                  || public.clash_message(public.lesson_teacher_on(v_lesson, new.session_date), v_other, new.session_date);
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function public.check_makeup_clash() from public, anon, authenticated;

drop trigger if exists makeup_sessions_teacher_clash on public.makeup_sessions;
create constraint trigger makeup_sessions_teacher_clash
  after insert or update on public.makeup_sessions
  deferrable initially deferred
  for each row execute function public.check_makeup_clash();

-- ---------------------------------------------------------------------------
-- 6. The clashes there are now, from today on (for the school to tidy up;
--    nothing is changed). Each pair once, with its first day.

create or replace function public.current_teacher_clashes()
returns table (teacher_id bigint, schedule_id bigint, other_schedule_id bigint, first_day date, days integer)
language sql
stable
security definer
set search_path = public
as $$
  select public.lesson_teacher_on(s.id, d.day), s.id, o.id, min(d.day), count(*)::int
  from public.schedules s,
       public.clash_check_days(s.event_type, s.day_of_week, s.scheduled_date, s.start_recur, s.end_recur) as d(day),
       public.teacher_lessons_overlapping(public.lesson_teacher_on(s.id, d.day), d.day, s.start_time,
                                          public.lesson_end_on(s.id, d.day), s.id) as o(id)
  where s.status = 'active'
    and (public.is_admin() or public.has_permission('calendar', 'view'))
    and public.schedule_meets_on(s.id, d.day)
    and s.id < o.id
  group by 1, s.id, o.id
  order by min(d.day), s.id;
$$;

revoke all on function public.current_teacher_clashes() from public, anon;
grant execute on function public.current_teacher_clashes() to authenticated;
