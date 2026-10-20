-- Checks for 20261026400000_student_code_and_month_plans.sql, on a database that has it.
-- It rolls back. Every check prints PASS; the first failure stops the run.
--   psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/student_code_and_month_plans.sql

begin;

-- Its own test data, so it also works on an empty database (the dbtests run).
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000b2');
insert into public.teachers (id, auth_user_id, username, full_name, role) overriding system value values
  (9861, '00000000-0000-0000-0000-0000000000b1', 'sc_admin', 'Admin', 'admin'),
  (9862, '00000000-0000-0000-0000-0000000000b2', 'sc_teacher', 'Teacher', 'teacher');
insert into public.classrooms (id, name, age_group, program_level) overriding system value values
  (9861, 'SC Class A', '12-14 Years Old', 'Coder Foundation'),
  (9862, 'SC Class B', '12-14 Years Old', 'Coder Foundation');
insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values
  (9961, 'Kid A', 0, '2099-12-31', '2099-12-31', '2099-12-31'),
  (9962, 'Kid B', 0, '2099-12-31', '2099-12-31', '2099-12-31');

do $t$
declare
  v_admin uuid := (select auth_user_id from public.teachers where role = 'admin' and is_active and auth_user_id is not null order by id limit 1);
  v_teacher uuid := (select auth_user_id from public.teachers where role = 'teacher' and is_active and auth_user_id is not null
                     and not public.has_permission('students', 'edit') order by id limit 1);
  v_a bigint;
  v_b bigint;
  v_class bigint := (select id from public.classrooms order by id limit 1);
  v_class2 bigint := (select id from public.classrooms order by id offset 1 limit 1);
  v_plan public.student_month_plans%rowtype;
  v_ok boolean;
begin
  select id into v_a from public.students order by id limit 1;
  select id into v_b from public.students order by id offset 1 limit 1;

  -- The switch: off unless switched on.
  if (select (value ->> 'enabled')::boolean from public.app_settings where key = 'student_code') is not false then
    raise exception 'FAIL 1: the student code should start switched off';
  end if;
  raise notice 'PASS 1 the student code starts switched off';

  -- Codes are unique, ignoring case and spaces at the ends.
  update public.students set student_code = 'EH-001' where id = v_a;
  begin
    update public.students set student_code = ' eh-001 ' where id = v_b;
    raise exception 'FAIL 2: a second child got the same code';
  exception when unique_violation then
    raise notice 'PASS 2 a code is used once';
  end;

  -- The end date: the day before the same date that many months later.
  if public.month_plan_end_date('2026-11-01', 3) <> '2027-01-31'
    or public.month_plan_end_date('2026-01-15', 1) <> '2026-02-14'
    or public.month_plan_end_date('2026-12-01', 12) <> '2027-11-30' then
    raise exception 'FAIL 3: end date worked out wrong';
  end if;
  raise notice 'PASS 3 end dates';

  -- Admin adds months per class; each class keeps its own dates.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_plan := public.add_student_month_plan(v_a, v_class, '2026-11-01', 3, 'Maths');
  if v_plan.end_date <> '2027-01-31' then
    raise exception 'FAIL 4: saved end date %', v_plan.end_date;
  end if;
  perform public.add_student_month_plan(v_a, v_class2, '2026-12-15', 6, null);
  if (select count(*) from public.student_month_plans where student_id = v_a and is_active) <> 2 then
    raise exception 'FAIL 4: each class should have its own months';
  end if;
  raise notice 'PASS 4 months saved per class with their own end dates';

  begin
    perform public.add_student_month_plan(v_a, v_class, '2026-11-01', 0, null);
    raise exception 'FAIL 5: 0 months was accepted';
  exception when others then
    if sqlerrm !~ 'Months must be' then raise; end if;
    raise notice 'PASS 5 months must be 1 to 60';
  end;

  -- Hidden, not deleted.
  perform public.hide_student_month_plan(v_plan.id);
  select is_active into v_ok from public.student_month_plans where id = v_plan.id;
  if v_ok is not false then
    raise exception 'FAIL 6: hidden months should stay, switched off';
  end if;
  raise notice 'PASS 6 months entered by mistake are hidden, kept';

  -- A teacher without Students edit cannot add months or switch the code.
  if v_teacher is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', v_teacher, 'role', 'authenticated')::text, true);
    begin
      perform public.add_student_month_plan(v_a, v_class, '2026-11-01', 1, null);
      raise exception 'FAIL 7: a teacher added months';
    exception when others then
      if sqlerrm !~ 'Only staff who may edit students' then raise; end if;
    end;
    begin
      perform public.set_student_code_enabled(true);
      raise exception 'FAIL 7: a teacher switched the code on';
    exception when others then
      if sqlerrm !~ 'Only admin' then raise; end if;
    end;
    raise notice 'PASS 7 only Students edit adds months, only admin switches the code';
  end if;

  -- Admin switches the code on.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  perform public.set_student_code_enabled(true);
  if (select (value ->> 'enabled')::boolean from public.app_settings where key = 'student_code') is not true then
    raise exception 'FAIL 8: switch did not turn on';
  end if;
  raise notice 'PASS 8 admin switches the student code on';
end $t$;

rollback;
