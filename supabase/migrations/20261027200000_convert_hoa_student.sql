-- One step from HOA to a regular student (decided 2026-10-20).
--
-- Before: an HOA (trial) student had to be edited to Regular with a class, and
-- then renewed with a package, in two steps; the Inbox sign-up made a second
-- student for the same child instead. convert_hoa_student does it on the same
-- student, all or nothing:
--   - student_type becomes 'regular', the student is active and in the class
--     (its teacher), joining on the start date;
--   - with a package: the package is added as a renewal does (classes, end date,
--     fee dates, enrollment, ledger);
--   - without one (a school with no packages): the far-off dates the other
--     students without a package have, and, when months are given, that many
--     months for the class (student_month_plans, 20261026400000);
--   - the lead the child came through is marked converted to this student;
--   - the HOA bookings, attendance and points stay on the student;
--   - one activity line "HOA -> regular".
-- Students edit, as the two steps it replaces.

create or replace function public.convert_hoa_student(
  p_student_id bigint,
  p_classroom_id bigint,
  p_start_date date,
  p_package_id bigint default null,
  p_class_count integer default 0,
  p_lesson_expiry_date date default null,
  p_account_fee_expiry_date date default null,
  p_mirai_club_expiry_date date default null,
  p_months integer default null,
  p_lead_id bigint default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_classroom public.classrooms%rowtype;
  v_lead public.leads%rowtype;
  v_far_off constant date := '2099-12-31';
begin
  if not public.has_permission('students', 'edit') then
    raise exception 'Your account is not allowed to change students.';
  end if;

  select * into v_student from public.students where id = p_student_id for update;
  if not found then
    raise exception 'Student not found.';
  end if;
  if v_student.student_type <> 'trial' then
    raise exception 'Only an HOA student can be converted to a regular student.';
  end if;

  select * into v_classroom from public.classrooms where id = p_classroom_id;
  if not found or v_classroom.status <> 'active' then
    raise exception 'Pick a class that is still running.';
  end if;
  if v_classroom.category = 'trial' then
    raise exception 'Pick a regular class, not an HOA class.';
  end if;

  if p_start_date is null then
    raise exception 'Pick the first day.';
  end if;

  if p_package_id is not null and not exists (select 1 from public.packages where id = p_package_id and is_active) then
    raise exception 'Pick an active package.';
  end if;

  if p_lead_id is not null then
    select * into v_lead from public.leads where id = p_lead_id for update;
    if not found then
      raise exception 'Lead not found.';
    end if;
    if v_lead.converted_student_id is not null and v_lead.converted_student_id <> p_student_id then
      raise exception 'This lead was already converted to another student.';
    end if;
  end if;

  -- Regular, active, in the class (its teacher). The class history trigger
  -- opens the stay today; it starts on the first day instead.
  update public.students
  set student_type = 'regular',
      is_active = true,
      classroom_id = v_classroom.id,
      teacher_id = coalesce(v_classroom.teacher_id, teacher_id),
      remaining_hours = case when p_package_id is null then 0 else remaining_hours end,
      lesson_expiry_date = case when p_package_id is null then v_far_off else lesson_expiry_date end,
      account_fee_expiry_date = case when p_package_id is null then v_far_off else account_fee_expiry_date end,
      mirai_club_expiry_date = case when p_package_id is null then v_far_off else mirai_club_expiry_date end
  where id = p_student_id;

  update public.student_classroom_periods
  set start_date = p_start_date
  where student_id = p_student_id and classroom_id = v_classroom.id and end_date is null;

  if p_package_id is not null then
    perform public.enroll_student_package(
      p_student_id,
      p_package_id,
      p_start_date,
      coalesce(p_class_count, 0),
      p_lesson_expiry_date,
      coalesce(p_account_fee_expiry_date, v_student.account_fee_expiry_date),
      coalesce(p_mirai_club_expiry_date, v_student.mirai_club_expiry_date),
      'Converted from HOA.'
    );
  elsif p_months is not null then
    perform public.add_student_month_plan(p_student_id, v_classroom.id, p_start_date, p_months, 'Converted from HOA.');
  end if;

  if p_lead_id is not null then
    update public.leads
    set status = 'converted', converted_student_id = p_student_id
    where id = p_lead_id;
  end if;

  perform public.record_admin_activity(
    'student_converted_from_hoa',
    'student',
    p_student_id,
    v_student.full_name,
    jsonb_build_object(
      'classroom_id', v_classroom.id,
      'package_id', p_package_id,
      'start_date', p_start_date,
      'months', p_months,
      'lead_id', p_lead_id
    )
  );

  return p_student_id;
end;
$$;

revoke all on function public.convert_hoa_student(bigint, bigint, date, bigint, integer, date, date, date, integer, bigint) from public, anon;
grant execute on function public.convert_hoa_student(bigint, bigint, date, bigint, integer, date, date, date, integer, bigint) to authenticated;
