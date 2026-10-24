-- Today page by role: what an EC (sales), an LC (learning consultant), a teacher and the admin have to do today.
--
-- Each person sees only their own: the figures are worked out here, in the database, for the signed-in person
-- (auth.uid()). Anyone else's Today can only be asked for by an admin (today_person). Nothing here writes anything,
-- and the quotation tables are only read.
--
--   today_roles(person)   which roles a person has: EC (a PIC of leads, or the sales person of quotations) and
--                         LC (the Learning Consultant of students, student_handled_by)
--   today_ec(person)      leads, this month's conversions and money, their unpaid quotations
--   today_lc(person)      their students: at risk, expiring, absent today, progress cards, birthdays, this month
--   today_team()          admin only: one line per person, and the quotations waiting for an admin to approve
--   role_names / set_role_names(ec, lc)   the school's own words for "EC" and "LC" (app_settings row role_names)

-- ---------------------------------------------------------------------------------------------------------
-- 1. Whose Today
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.today_person(p_teacher_id bigint)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me bigint := public.current_teacher_id();
begin
  if v_me is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if p_teacher_id is null or p_teacher_id = v_me then
    return v_me;
  end if;
  if not public.is_admin() then
    raise exception 'You can only see your own Today.' using errcode = '42501';
  end if;
  return p_teacher_id;
end;
$$;

revoke all on function public.today_person(bigint) from public, anon, authenticated;

-- A Malaysian day.
create or replace function public.today_my()
returns date
language sql
stable
set search_path = public
as $$
  select (timezone('Asia/Kuala_Lumpur', now()))::date;
$$;

revoke all on function public.today_my() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2. The school's words for EC and LC
-- ---------------------------------------------------------------------------------------------------------

insert into public.app_settings (key, value)
values ('role_names', '{"ec": "EC", "lc": "LC"}'::jsonb)
on conflict (key) do nothing;

create or replace function public.set_role_names(p_ec text, p_lc text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ec text := btrim(coalesce(p_ec, ''));
  v_lc text := btrim(coalesce(p_lc, ''));
begin
  if not public.is_admin() then
    raise exception 'Only admin can change these names.';
  end if;
  if char_length(v_ec) not between 1 and 30 or char_length(v_lc) not between 1 and 30 then
    raise exception 'Each name needs 1 to 30 characters.';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('role_names', jsonb_build_object('ec', v_ec, 'lc', v_lc), timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_role_names(text, text) from public, anon;
grant execute on function public.set_role_names(text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Which roles a person has
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.today_roles(p_teacher_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id bigint := public.today_person(p_teacher_id);
  v_ec boolean;
  v_lc boolean;
begin
  v_ec :=
    -- Every staff account has a PIC name by itself (20261101300000), so the job is "has leads", not "has a name".
    exists (
      select 1
      from public.lead_options o
      join public.leads l on l.pic_id = o.id
      where o.kind = 'pic' and o.teacher_id = v_id
    )
    or exists (select 1 from public.quotations q where q.sales_person_id = v_id)
    or exists (select 1 from public.lead_conversions c where c.sales_person_id = v_id);
  v_lc := exists (
    select 1 from public.students s where s.is_active and s.consultant_id = v_id
  ) or exists (
    select 1
    from public.leads l
    join public.lead_options o on o.id = l.pic_id and o.kind = 'pic'
    where o.teacher_id = v_id and l.converted_student_id is not null
  );
  return jsonb_build_object('teacher_id', v_id, 'ec', v_ec, 'lc', v_lc);
end;
$$;

revoke all on function public.today_roles(bigint) from public, anon;
grant execute on function public.today_roles(bigint) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 4. EC: leads, this month, unpaid quotations
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.today_ec(p_teacher_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id bigint := public.today_person(p_teacher_id);
  v_today date := public.today_my();
  v_month date := date_trunc('month', public.today_my())::date;
  v_leads_open integer;
  v_leads_new integer;
  v_leads_month integer;
  v_converted integer;
  v_revenue numeric;
  v_quotes jsonb;
  v_trials jsonb;
begin
  -- Needs the Leads tick (an admin always has it); without it there is nothing to show.
  if not (public.is_admin() or public.has_permission('leads')) then
    return jsonb_build_object('teacher_id', v_id, 'available', false);
  end if;

  select
    count(*) filter (where l.status not in ('converted', 'lost')),
    count(*) filter (where l.added_date = v_today),
    count(*) filter (where l.added_date >= v_month)
  into v_leads_open, v_leads_new, v_leads_month
  from public.leads l
  join public.lead_options o on o.id = l.pic_id and o.kind = 'pic'
  where o.teacher_id = v_id;

  select count(distinct c.lead_id)
  into v_converted
  from public.lead_conversions c
  where c.sales_person_id = v_id and not c.historical
    and (c.converted_at at time zone 'Asia/Kuala_Lumpur')::date >= v_month;

  select coalesce(sum(coalesce(q.paid_amount, q.total)), 0)
  into v_revenue
  from public.quotations q
  where q.sales_person_id = v_id and q.status = 'paid'
    and (q.paid_at at time zone 'Asia/Kuala_Lumpur')::date >= v_month;

  select coalesce(jsonb_agg(jsonb_build_object(
      'reference', r.reference_no,
      'child_name', r.child_name,
      'total', r.total,
      'status', r.status,
      'lead_id', r.lead_id,
      'sent_on', (r.created_at at time zone 'Asia/Kuala_Lumpur')::date,
      'parent_said_wrong', r.parent_said_wrong_at is not null
    ) order by r.parent_said_wrong_at is null, r.created_at desc), '[]'::jsonb)
  into v_quotes
  from (
    select q.*
    from public.quotations q
    where q.sales_person_id = v_id
      and q.status in ('needs_approval', 'sent', 'viewed', 'confirmed')
    order by q.created_at desc
    limit 10
  ) r;

  -- Today's trials (HOA / trial classes) of their leads.
  select coalesce(jsonb_agg(jsonb_build_object(
      'lead_id', tb.lead_id,
      'child_name', tb.child_name,
      'start_time', s.start_time,
      'class_name', c.name
    ) order by s.start_time, tb.child_name), '[]'::jsonb)
  into v_trials
  from public.trial_bookings tb
  join public.leads l on l.id = tb.lead_id
  join public.lead_options o on o.id = l.pic_id and o.kind = 'pic' and o.teacher_id = v_id
  join public.schedules s on s.id = tb.schedule_id
  left join public.classrooms c on c.id = s.classroom_id
  where tb.booking_date = v_today;

  return jsonb_build_object(
    'teacher_id', v_id,
    'available', true,
    'trials_today', v_trials,
    'leads_open', v_leads_open,
    'leads_new_today', v_leads_new,
    'leads_month', v_leads_month,
    'converted_month', v_converted,
    'revenue_month', v_revenue,
    'quotations', v_quotes
  );
end;
$$;

revoke all on function public.today_ec(bigint) from public, anon;
grant execute on function public.today_ec(bigint) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 5. LC: their students
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.today_lc(p_teacher_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id bigint := public.today_person(p_teacher_id);
  v_today date := public.today_my();
  v_month date := date_trunc('month', public.today_my())::date;
  v_mine bigint[];
  v_students integer;
  v_added integer;
  v_stopped integer;
  v_risk jsonb;
  v_expiring jsonb;
  v_absent jsonb;
  v_birthdays jsonb;
  v_cards_due integer;
  v_cards_sent integer;
begin
  if not (public.is_admin() or public.has_permission('students')) then
    return jsonb_build_object('teacher_id', v_id, 'available', false);
  end if;

  select coalesce(array_agg(r.student_id), '{}'::bigint[]),
         count(*) filter (where r.at_end)::integer,
         coalesce(sum(r.stays_added), 0)::integer,
         coalesce(sum(r.stays_stopped), 0)::integer
  into v_mine, v_students, v_added, v_stopped
  from public.data_center_lc_rows(v_month) r
  where r.lc_id = v_id;

  -- At risk: a student-care alert this month (absent streak, low participation, leaves early), newest first.
  select coalesce(jsonb_agg(jsonb_build_object(
      'student_id', a.student_id, 'name', s.full_name, 'why', a.reason, 'lesson_date', a.lesson_date
    ) order by a.lesson_date desc nulls last), '[]'::jsonb)
  into v_risk
  from (
    select distinct on (a0.student_id) a0.*
    from automation.quality_alerts a0
    where a0.trigger_type = 'student_care' and a0.student_id = any (v_mine)
      and a0.lesson_date >= v_month
    order by a0.student_id, a0.lesson_date desc nulls last
  ) a
  join public.students s on s.id = a.student_id;

  -- Package ends within 14 days, or one lesson left.
  select coalesce(jsonb_agg(jsonb_build_object(
      'student_id', s.id, 'name', s.full_name, 'ends_on', s.lesson_expiry_date, 'lessons_left', s.remaining_hours
    ) order by s.lesson_expiry_date), '[]'::jsonb)
  into v_expiring
  from public.students s
  where s.id = any (v_mine) and s.is_active and s.student_type = 'regular'
    and ((s.lesson_expiry_date between v_today and v_today + 14) or s.remaining_hours between 0 and 1);

  -- Absent today (or on leave) in a lesson that was taken.
  select coalesce(jsonb_agg(jsonb_build_object(
      'student_id', s.id, 'name', s.full_name, 'status', lls.attendance_status
    ) order by s.full_name), '[]'::jsonb)
  into v_absent
  from public.lesson_log_students lls
  join public.lesson_logs ll on ll.id = lls.lesson_log_id and ll.lesson_date = v_today
  join public.students s on s.id = lls.student_id
  where lls.student_id = any (v_mine)
    and lls.attendance_status not in ('present')
    and not exists (
      select 1 from public.lesson_logs newer
      where newer.schedule_id = ll.schedule_id and newer.lesson_date = ll.lesson_date and newer.revision_number > ll.revision_number
    );

  select coalesce(jsonb_agg(jsonb_build_object('student_id', s.id, 'name', s.full_name) order by s.full_name), '[]'::jsonb)
  into v_birthdays
  from public.students s
  where s.id = any (v_mine) and s.is_active and s.date_of_birth is not null
    and extract(month from s.date_of_birth) = extract(month from v_today)
    and extract(day from s.date_of_birth) = extract(day from v_today);

  select count(*)::integer,
         (count(*) filter (where s.id in (select ps.student_id from public.progress_card_sends ps where ps.month = v_month)))::integer
  into v_cards_due, v_cards_sent
  from public.students s
  where s.id = any (v_mine) and s.is_active and s.student_type = 'regular';

  return jsonb_build_object(
    'teacher_id', v_id,
    'available', true,
    'students', v_students,
    'stays_added', v_added,
    'stays_stopped', v_stopped,
    'at_risk', v_risk,
    'expiring', v_expiring,
    'absent_today', v_absent,
    'birthdays', v_birthdays,
    'cards_due', v_cards_due,
    'cards_sent', v_cards_sent
  );
end;
$$;

revoke all on function public.today_lc(bigint) from public, anon;
grant execute on function public.today_lc(bigint) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 6. The team today (admin only)
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.today_team()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := public.today_my();
  v_month date := date_trunc('month', public.today_my())::date;
  v_people jsonb;
  v_approvals jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admin can see the whole team.' using errcode = '42501';
  end if;

  with lc as (
    select r.lc_id, count(*) filter (where r.at_end) as students
    from public.data_center_lc_rows(v_month) r
    where r.lc_id is not null
    group by r.lc_id
  ),
  risk as (
    select public.student_handled_by(a.student_id) as lc_id, count(distinct a.student_id) as n
    from automation.quality_alerts a
    where a.trigger_type = 'student_care' and a.lesson_date >= v_month and a.student_id is not null
    group by 1
  ),
  late as (
    select c.assignee_id, count(*) as n
    from public.calendar_items c
    where c.kind = 'task' and c.lead_id is not null and not c.is_done and c.item_date < v_today and c.assignee_id is not null
    group by c.assignee_id
  ),
  conv as (
    select c.sales_person_id, count(distinct c.lead_id) as n
    from public.lead_conversions c
    where not c.historical and (c.converted_at at time zone 'Asia/Kuala_Lumpur')::date >= v_month and c.sales_person_id is not null
    group by c.sales_person_id
  ),
  pics as (
    select distinct o.teacher_id as id
    from public.lead_options o
    join public.leads l on l.pic_id = o.id
    where o.kind = 'pic' and o.teacher_id is not null
  ),
  classes as (
    select s.teacher_id,
           count(*) as lessons,
           -- Only a lesson that has ended counts as "not taken".
           count(*) filter (
             where s.end_time < (timezone('Asia/Kuala_Lumpur', now()))::time
               and not exists (select 1 from public.lesson_logs ll where ll.schedule_id = s.id and ll.lesson_date = v_today)
           ) as not_taken
    from public.schedules s
    where s.status = 'active' and public.schedule_meets_on(s.id, v_today)
    group by s.teacher_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'teacher_id', t.id,
      'name', t.full_name,
      'role', t.role,
      'is_ec', t.id in (select id from pics) or t.id in (select sales_person_id from conv),
      'is_lc', t.id in (select lc_id from lc),
      'overdue_followups', coalesce((select n from late where assignee_id = t.id), 0),
      'converted_month', coalesce((select n from conv where sales_person_id = t.id), 0),
      'students', coalesce((select students from lc where lc_id = t.id), 0),
      'at_risk', coalesce((select n from risk where lc_id = t.id), 0),
      'lessons_today', coalesce((select lessons from classes where teacher_id = t.id), 0),
      'not_taken', coalesce((select not_taken from classes where teacher_id = t.id), 0)
    ) order by t.full_name), '[]'::jsonb)
  into v_people
  from public.teachers t
  where t.is_active and t.role <> 'admin';

  select coalesce(jsonb_agg(jsonb_build_object(
      'reference', q.reference_no,
      'child_name', q.child_name,
      'total', q.total,
      'discount_amount', q.discount_amount,
      'lead_id', q.lead_id,
      'sales_person_id', q.sales_person_id
    ) order by q.created_at), '[]'::jsonb)
  into v_approvals
  from public.quotations q
  where q.status = 'needs_approval';

  return jsonb_build_object('people', v_people, 'approvals', v_approvals);
end;
$$;

revoke all on function public.today_team() from public, anon;
grant execute on function public.today_team() to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 7. Teacher: students to watch in their own classes
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.today_teacher(p_teacher_id bigint default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id bigint := public.today_person(p_teacher_id);
  v_month date := date_trunc('month', public.today_my())::date;
  v_watch jsonb;
begin
  -- A student-care alert this month (absent streak, low participation, leaves early) in a class the person teaches.
  select coalesce(jsonb_agg(jsonb_build_object(
      'student_id', a.student_id, 'name', s.full_name, 'why', a.reason,
      'lesson_date', a.lesson_date, 'class_name', c.name
    ) order by a.lesson_date desc nulls last), '[]'::jsonb)
  into v_watch
  from (
    select distinct on (a0.student_id) a0.*
    from automation.quality_alerts a0
    where a0.trigger_type = 'student_care' and a0.student_id is not null and a0.lesson_date >= v_month
    order by a0.student_id, a0.lesson_date desc nulls last
  ) a
  join public.students s on s.id = a.student_id
  left join public.classrooms c on c.id = a.classroom_id
  where a.teacher_id = v_id or c.teacher_id = v_id;

  return jsonb_build_object('teacher_id', v_id, 'watch', v_watch);
end;
$$;

revoke all on function public.today_teacher(bigint) from public, anon;
grant execute on function public.today_teacher(bigint) to authenticated;
