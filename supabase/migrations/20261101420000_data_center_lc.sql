-- Data Center, part 2: the Learning Consultant (LC) view (boss 2026-10-23; plan: side notes data-center-plan.md).
-- Reads department 2's class-quality data (20261030700000) and changes none of it.
--
-- Whose student: the student's LC (students.consultant_id), else whoever handles them (student_handled_by: the
-- converted lead's PIC). Counted classes and changes follow the roster table's rule (class_counts_for_roster, changes
-- counted from the roster setting's day, else 1 January of the month's year), as Teacher quality's retention does.
--
-- data_center_lc_report(month): per LC — students in class at the month's end (or today), students at the month's
--   start and how many of them are still in class at its end (stay rate), class stays at the start / added / stopped
--   (subject stop rate), students at risk, progress cards due and sent.
-- data_center_lc_students(month, lc): that LC's students at risk, with why: a student-care alert this month
--   (department 2's alerts: absent streak, low participation, leaving early), or they stopped every class this month.
--   lc = null: students with nobody handling them.

create or replace function public.data_center_lc_rows(p_month date)
returns table (
  student_id bigint,
  lc_id bigint,
  at_start boolean,
  at_end boolean,
  in_month boolean,
  stays_at_start integer,
  stays_added integer,
  stays_stopped integer
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select date_trunc('month', p_month)::date as m_from,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as m_to,
      least((date_trunc('month', p_month) + interval '1 month - 1 day')::date,
            (timezone('utc', now()) at time zone 'Asia/Kuala_Lumpur')::date) as day_end,
      coalesce(
        (select (value ->> 'changes_from')::date from public.app_settings
         where key = 'student_roster' and value ->> 'changes_from' ~ '^\d{4}-\d{2}-\d{2}$'),
        make_date(extract(year from p_month)::integer, 1, 1)) as count_from
  ),
  stays as (
    select p.student_id, p.start_date, p.end_date
    from public.student_classroom_periods p
    join public.classrooms c on c.id = p.classroom_id
    join public.students s on s.id = p.student_id and s.student_type = 'regular'
    cross join bounds b
    where automation.class_counts_for_roster(c.category, c.category_name)
      and (p.start_date is null or p.start_date <= b.m_to)
      and (p.end_date is null or p.end_date >= b.m_from)
  )
  select
    st.student_id,
    public.student_handled_by(st.student_id),
    bool_or((st.start_date is null or st.start_date < b.m_from) and (st.end_date is null or st.end_date >= b.m_from)),
    bool_or((st.start_date is null or st.start_date <= b.day_end) and (st.end_date is null or st.end_date >= b.day_end)),
    true,
    (count(*) filter (where (st.start_date is null or st.start_date < b.m_from) and (st.end_date is null or st.end_date >= b.m_from)))::integer,
    (count(*) filter (where st.start_date between greatest(b.m_from, b.count_from) and b.m_to))::integer,
    (count(*) filter (where st.end_date between greatest(b.m_from, b.count_from) and b.m_to))::integer
  from stays st cross join bounds b
  group by st.student_id;
$$;

revoke all on function public.data_center_lc_rows(date) from public, anon, authenticated;

create or replace function public.data_center_lc_report(p_month date)
returns table (
  lc_id bigint,
  lc_name text,
  students integer,
  students_at_start integer,
  students_still_in integer,
  stays_at_start integer,
  stays_added integer,
  stays_stopped integer,
  at_risk integer,
  cards_due integer,
  cards_sent integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from date := date_trunc('month', p_month)::date;
  v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not public.has_permission('data_center', 'view') then
    raise exception 'You do not have the Data Center tick.' using errcode = '42501';
  end if;
  if p_month is null then
    raise exception 'Pick a month.';
  end if;

  return query
  with r as (
    select * from public.data_center_lc_rows(v_from)
  ),
  care as (
    select distinct a.student_id from automation.quality_alerts a
    where a.trigger_type = 'student_care' and a.lesson_date between v_from and v_to and a.student_id is not null
  ),
  sent as (
    select distinct ps.student_id from public.progress_card_sends ps where ps.month = v_from
  )
  select
    r.lc_id,
    coalesce(t.full_name, '(nobody)'),
    (count(*) filter (where r.at_end))::integer,
    (count(*) filter (where r.at_start))::integer,
    (count(*) filter (where r.at_start and r.at_end))::integer,
    coalesce(sum(r.stays_at_start), 0)::integer,
    coalesce(sum(r.stays_added), 0)::integer,
    coalesce(sum(r.stays_stopped), 0)::integer,
    (count(*) filter (where r.student_id in (select student_id from care) or (r.at_start and not r.at_end)))::integer,
    count(*)::integer,
    (count(*) filter (where r.student_id in (select student_id from sent)))::integer
  from r
  left join public.teachers t on t.id = r.lc_id
  group by r.lc_id, t.full_name
  order by (r.lc_id is null), count(*) filter (where r.at_end) desc, t.full_name;
end;
$$;

revoke all on function public.data_center_lc_report(date) from public, anon;
grant execute on function public.data_center_lc_report(date) to authenticated;

create or replace function public.data_center_lc_students(p_month date, p_lc_id bigint)
returns table (
  student_id bigint,
  student_name text,
  student_code text,
  stopped_all boolean,
  reasons text[],
  card_sent boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from date := date_trunc('month', p_month)::date;
  v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
begin
  if not public.has_permission('data_center', 'view') then
    raise exception 'You do not have the Data Center tick.' using errcode = '42501';
  end if;
  if p_month is null then
    raise exception 'Pick a month.';
  end if;

  return query
  with r as (
    select * from public.data_center_lc_rows(v_from) x where x.lc_id is not distinct from p_lc_id
  ),
  care as (
    select a.student_id, array_agg(distinct a.reason order by a.reason) as reasons
    from automation.quality_alerts a
    where a.trigger_type = 'student_care' and a.lesson_date between v_from and v_to and a.student_id is not null
    group by a.student_id
  )
  select
    s.id,
    s.full_name,
    s.student_code,
    r.at_start and not r.at_end,
    coalesce(c.reasons, '{}'::text[]),
    exists (select 1 from public.progress_card_sends ps where ps.student_id = s.id and ps.month = v_from)
  from r
  join public.students s on s.id = r.student_id
  left join care c on c.student_id = r.student_id
  where c.student_id is not null or (r.at_start and not r.at_end)
  order by (r.at_start and not r.at_end) desc, s.full_name;
end;
$$;

revoke all on function public.data_center_lc_students(date, bigint) from public, anon;
grant execute on function public.data_center_lc_students(date, bigint) to authenticated;
