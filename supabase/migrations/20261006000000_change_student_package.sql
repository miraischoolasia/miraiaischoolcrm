-- Change Package: correct a package picked by mistake.
--
-- Replaces the student's most recent enrollment instead of adding a new one
-- on top (which is what a renewal does). The classes the wrong package gave
-- are taken back and the right package's are given, so classes already
-- attended stay deducted:
--   remaining = remaining - wrong package's classes + right package's classes
-- The lesson and fee dates come from the app (worked out from the package,
-- editable there). Everything is written to the admin ledger and the
-- activity log as a correction.

create or replace function public.change_student_package(
  p_student_id bigint,
  p_package_id bigint,
  p_start_date date,
  p_class_count integer,
  p_lesson_expiry_date date,
  p_account_fee_expiry_date date,
  p_mirai_club_expiry_date date,
  p_remark text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_enrollment public.student_enrollments%rowtype;
  v_old_package public.packages%rowtype;
  v_package public.packages%rowtype;
  v_remaining integer;
  v_delta integer;
  v_actor bigint := public.current_teacher_id();
  v_remark text := coalesce(
    nullif(trim(coalesce(p_remark, '')), ''),
    'Package corrected (picked by mistake).'
  );
begin
  if not public.has_permission('students', 'edit') then
    raise exception 'Your account is not allowed to change a student''s package.';
  end if;

  select * into v_student from public.students where id = p_student_id for update;
  if not found or v_student.student_type <> 'regular' then
    raise exception 'Only regular students have a package to change.';
  end if;

  select * into v_enrollment
  from public.student_enrollments
  where student_id = p_student_id
  order by id desc
  limit 1
  for update;
  if not found then
    raise exception 'There is no package sign-up to change. Use Renew to add one.';
  end if;

  select * into v_package from public.packages where id = p_package_id;
  if not found or not v_package.is_active then
    raise exception 'Pick an active package.';
  end if;

  if coalesce(p_class_count, -1) < 0 or p_class_count > 500 then
    raise exception 'Classes must be between 0 and 500.';
  end if;

  if p_start_date is null or p_lesson_expiry_date is null or p_lesson_expiry_date < p_start_date then
    raise exception 'The package must end on or after the day it starts.';
  end if;

  if p_account_fee_expiry_date is null or p_mirai_club_expiry_date is null then
    raise exception 'Fill in the Account Fee and Mirai Club dates.';
  end if;

  v_delta := p_class_count - v_enrollment.class_count;
  v_remaining := v_student.remaining_hours + v_delta;

  select * into v_old_package from public.packages where id = v_enrollment.package_id;

  update public.student_enrollments
  set package_id = p_package_id,
      start_date = p_start_date,
      end_date = p_lesson_expiry_date,
      class_count = p_class_count,
      remark = v_remark,
      actor_teacher_id = v_actor
  where id = v_enrollment.id;

  update public.students
  set package_id = p_package_id,
      remaining_hours = v_remaining,
      lesson_expiry_date = p_lesson_expiry_date,
      account_fee_expiry_date = p_account_fee_expiry_date,
      mirai_club_expiry_date = p_mirai_club_expiry_date
  where id = p_student_id;

  if v_delta <> 0 then
    insert into public.student_admin_ledger (student_id, action_type, delta_hours, remark, actor_teacher_id)
    values (p_student_id, 'hours_added', v_delta, v_remark, v_actor);
  end if;

  if p_lesson_expiry_date is distinct from v_student.lesson_expiry_date then
    insert into public.student_admin_ledger (student_id, action_type, old_date, new_date, remark, actor_teacher_id)
    values (p_student_id, 'lesson_expiry_updated', v_student.lesson_expiry_date, p_lesson_expiry_date, v_remark, v_actor);
  end if;

  if p_account_fee_expiry_date is distinct from v_student.account_fee_expiry_date then
    insert into public.student_admin_ledger (student_id, action_type, old_date, new_date, remark, actor_teacher_id)
    values (p_student_id, 'account_fee_expiry_updated', v_student.account_fee_expiry_date, p_account_fee_expiry_date, v_remark, v_actor);
  end if;

  if p_mirai_club_expiry_date is distinct from v_student.mirai_club_expiry_date then
    insert into public.student_admin_ledger (student_id, action_type, old_date, new_date, remark, actor_teacher_id)
    values (p_student_id, 'mirai_club_expiry_updated', v_student.mirai_club_expiry_date, p_mirai_club_expiry_date, v_remark, v_actor);
  end if;

  perform public.record_admin_activity(
    'student_package_corrected',
    'student',
    p_student_id,
    v_student.full_name,
    jsonb_build_object(
      'previous_package', v_old_package.name,
      'new_package', v_package.name,
      'start_date', p_start_date,
      'previous_classes_left', v_student.remaining_hours,
      'new_classes_left', v_remaining
    )
  );

  return v_remaining;
end;
$$;

revoke all on function public.change_student_package(bigint, bigint, date, integer, date, date, date, text) from public, anon;
grant execute on function public.change_student_package(bigint, bigint, date, integer, date, date, date, text) to authenticated;
