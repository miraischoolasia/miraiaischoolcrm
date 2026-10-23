-- needs: fake-data  (local-test/seed: its students, classes, attendance and leads; "node local-test/run.mjs dbtests" loads them first)
-- Checks for 20261027200000_convert_hoa_student.sql (with 20261026400000 for months), on a
-- database that has them. It rolls back. Every check prints PASS; the first failure stops the run.
--   psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/convert_hoa_student.sql

begin;

do $t$
declare
  v_admin uuid := (select auth_user_id from public.teachers where role = 'admin' and is_active and auth_user_id is not null order by id limit 1);
  v_teacher uuid := (select auth_user_id from public.teachers where role = 'teacher' and is_active and auth_user_id is not null
                     and not public.has_permission('students', 'edit') order by id limit 1);
  v_hoa bigint;
  v_hoa2 bigint;
  v_regular bigint := (select id from public.students where student_type = 'regular' order by id limit 1);
  v_class public.classrooms%rowtype;
  v_trial_class bigint := (select id from public.classrooms where category = 'trial' and status = 'active' order by id limit 1);
  v_package bigint := (select id from public.packages where is_active and kind = 'regular' order by id limit 1);
  v_lead bigint;
  v_bookings_before integer;
  v_row public.students%rowtype;
  v_period_start date;
begin
  select * into v_class from public.classrooms where category = 'regular' and status = 'active' order by id limit 1;
  select id into v_hoa from public.students where student_type = 'trial' order by id limit 1;
  select id into v_hoa2 from public.students where student_type = 'trial' and id <> v_hoa order by id limit 1;
  select count(*) into v_bookings_before from public.trial_bookings where student_id = v_hoa;
  select tb.lead_id into v_lead from public.trial_bookings tb
  join public.leads l on l.id = tb.lead_id and l.converted_student_id is null
  where tb.student_id = v_hoa limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  -- Only an HOA student; only a regular class.
  begin
    perform public.convert_hoa_student(v_regular, v_class.id, current_date);
    raise exception 'FAIL 1: a regular student was converted';
  exception when others then
    if sqlerrm !~ 'Only an HOA student' then raise; end if;
  end;
  if v_trial_class is not null then
    begin
      perform public.convert_hoa_student(v_hoa, v_trial_class, current_date);
      raise exception 'FAIL 1: put in an HOA class';
    exception when others then
      if sqlerrm !~ 'not an HOA class' then raise; end if;
    end;
  end if;
  raise notice 'PASS 1 only an HOA student, only into a regular class';

  -- With a package: same student, regular, in the class from the first day, package added.
  perform public.convert_hoa_student(
    v_hoa, v_class.id, '2026-11-02', v_package, 12, '2027-01-31', '2027-11-01', '2027-11-01', null, v_lead
  );
  select * into v_row from public.students where id = v_hoa;
  if v_row.student_type <> 'regular' or v_row.classroom_id <> v_class.id or not v_row.is_active
    or v_row.package_id is distinct from v_package or v_row.lesson_expiry_date <> '2027-01-31' then
    raise exception 'FAIL 2: student after converting: %', row_to_json(v_row);
  end if;
  select start_date into v_period_start from public.student_classroom_periods
  where student_id = v_hoa and classroom_id = v_class.id and end_date is null;
  if v_period_start <> '2026-11-02' then
    raise exception 'FAIL 2: joins the class on %, not the first day', v_period_start;
  end if;
  if not exists (select 1 from public.student_enrollments where student_id = v_hoa and package_id = v_package and start_date = '2026-11-02') then
    raise exception 'FAIL 2: no enrollment';
  end if;
  raise notice 'PASS 2 the same student is now regular, in the class from the first day, on the package';

  if (select count(*) from public.trial_bookings where student_id = v_hoa) <> v_bookings_before then
    raise exception 'FAIL 3: HOA bookings changed';
  end if;
  if not exists (select 1 from public.admin_activity_logs where action_type = 'student_converted_from_hoa' and entity_id = v_hoa) then
    raise exception 'FAIL 3: no activity line';
  end if;
  if v_lead is not null and (select converted_student_id from public.leads where id = v_lead) <> v_hoa then
    raise exception 'FAIL 3: lead not converted to this student';
  end if;
  raise notice 'PASS 3 HOA bookings kept, lead converted, one activity line';

  -- Converting twice is refused.
  begin
    perform public.convert_hoa_student(v_hoa, v_class.id, current_date);
    raise exception 'FAIL 4: converted twice';
  exception when others then
    if sqlerrm !~ 'Only an HOA student' then raise; end if;
    raise notice 'PASS 4 a student is converted once';
  end;

  -- Without a package (a school with no packages): far-off dates, months on the class.
  if v_hoa2 is not null then
    perform public.convert_hoa_student(v_hoa2, v_class.id, '2026-11-01', null, 0, null, null, null, 3, null);
    select * into v_row from public.students where id = v_hoa2;
    if v_row.student_type <> 'regular' or v_row.lesson_expiry_date <> '2099-12-31' or v_row.remaining_hours <> 0 then
      raise exception 'FAIL 5: student without a package: %', row_to_json(v_row);
    end if;
    if not exists (
      select 1 from public.student_month_plans
      where student_id = v_hoa2 and classroom_id = v_class.id and months = 3 and end_date = '2027-01-31' and is_active
    ) then
      raise exception 'FAIL 5: no months for the class';
    end if;
    raise notice 'PASS 5 without a package: far-off dates and 3 months to 31 Jan';
  end if;

  -- A teacher without Students edit cannot convert.
  if v_teacher is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_teacher, 'role', 'authenticated')::text, true);
    begin
      perform public.convert_hoa_student((select id from public.students where student_type = 'trial' order by id desc limit 1), v_class.id, current_date);
      raise exception 'FAIL 6: a teacher converted a student';
    exception when others then
      if sqlerrm !~ 'not allowed' then raise; end if;
      raise notice 'PASS 6 only Students edit converts';
    end;
  end if;
end $t$;

rollback;
