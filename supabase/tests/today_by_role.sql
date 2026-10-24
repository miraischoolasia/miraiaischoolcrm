-- Checks for 20261102600000_today_by_role.sql: each person's own Today, and nobody else's.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/today_by_role.sql

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

create function pg_temp.fails(p_sql text, p_pattern text, p_name text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then
      raise notice 'PASS %', p_name;
      return;
    end if;
    raise exception 'FAIL % (wrong error: %)', p_name, sqlerrm;
  end;
  raise exception 'FAIL % (no error)', p_name;
end;
$$;

create function pg_temp.login(p_sub text) returns void language sql as $$
  select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', p_sub), true);
$$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000e1'), ('00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-0000000000e3'), ('00000000-0000-0000-0000-0000000000e4');
insert into public.teachers (id, auth_user_id, username, full_name, role) overriding system value values
  (99801, '00000000-0000-0000-0000-0000000000e1', 'today_admin', 'Today Admin', 'admin'),
  (99802, '00000000-0000-0000-0000-0000000000e2', 'today_ec', 'Today EC', 'staff'),
  (99803, '00000000-0000-0000-0000-0000000000e3', 'today_lc', 'Today LC', 'staff'),
  (99804, '00000000-0000-0000-0000-0000000000e4', 'today_other', 'Today Other', 'staff');

-- The staff accounts may see Leads and Students.
update public.teachers set permissions = '{"leads": {"level": "view"}, "students": {"level": "view"}}'::jsonb
where id in (99802, 99803, 99804);

-- EC: PIC of two leads (one open, one converted this month); a lead of somebody else.
-- A staff account gets its PIC name by itself (20261101300000); make sure both exist and point at them.
insert into public.lead_options (kind, label, teacher_id) values ('pic', 'Today EC', 99802), ('pic', 'Today Other', 99804)
on conflict do nothing;
update public.lead_options set teacher_id = 99802, is_active = true where kind = 'pic' and label = 'Today EC';
update public.lead_options set teacher_id = 99804, is_active = true where kind = 'pic' and label = 'Today Other';
insert into public.leads (id, full_name, phone, status, pic_id, added_date) overriding system value values
  (99821, 'Open Lead', '60190000001', 'new', (select id from public.lead_options where kind = 'pic' and teacher_id = 99802), current_date),
  (99822, 'Won Lead', '60190000002', 'converted', (select id from public.lead_options where kind = 'pic' and teacher_id = 99802), current_date - 40),
  (99823, 'Other Lead', '60190000003', 'new', (select id from public.lead_options where kind = 'pic' and teacher_id = 99804), current_date);
insert into public.classrooms (id, name, age_group, program_level, teacher_id, status, category) overriding system value
values (99851, 'Today Class', '9-11 Years Old', 'Coder Foundation', 99801, 'active', 'regular');
insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, student_type, consultant_id, classroom_id)
overriding system value values
  (99831, 'Won Child', 1, current_date + 5, '2099-12-31', '2099-12-31', 'regular', 99803, 99851),
  (99832, 'Other Child', 20, '2099-12-31', '2099-12-31', '2099-12-31', 'regular', 99804, 99851);
update public.student_classroom_periods set start_date = current_date - 60 where student_id in (99831, 99832);
insert into public.lead_conversions (lead_id, student_id, converted_at, how, sales_person_id)
values (99822, 99831, now(), 'new_student', 99802);

-- ---------------------------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select pg_temp.ok((public.today_roles() ->> 'ec')::boolean and not (public.today_roles() ->> 'lc')::boolean, 'EC: has the EC job only');
select pg_temp.login('00000000-0000-0000-0000-0000000000e3');
select pg_temp.ok((public.today_roles() ->> 'lc')::boolean and not (public.today_roles() ->> 'ec')::boolean, 'LC: has the LC job only');

-- ---------------------------------------------------------------------------------------------
-- EC sees their own leads and conversions only
-- ---------------------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select pg_temp.ok((public.today_ec() ->> 'leads_open')::int = 1, 'EC: one open lead of their own');
select pg_temp.ok((public.today_ec() ->> 'leads_new_today')::int = 1, 'EC: one new lead today');
select pg_temp.ok((public.today_ec() ->> 'converted_month')::int = 1, 'EC: one conversion this month');
select pg_temp.fails($$select public.today_ec(99804)$$, 'only see your own', 'EC cannot ask for another person');
select pg_temp.fails($$select public.today_team()$$, 'Only admin', 'EC cannot see the team');
select pg_temp.fails($$select public.set_role_names('Sales', 'Care')$$, 'Only admin', 'EC cannot rename the roles');

-- ---------------------------------------------------------------------------------------------
-- LC sees their own students only
-- ---------------------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e3');
select pg_temp.ok((public.today_lc() ->> 'students')::int = 1, 'LC: one student of their own');
select pg_temp.ok(jsonb_array_length(public.today_lc() -> 'expiring') = 1
  and (public.today_lc() -> 'expiring' -> 0 ->> 'student_id')::int = 99831, 'LC: the expiring package is theirs');
select pg_temp.fails($$select public.today_lc(99804)$$, 'only see your own', 'LC cannot ask for another person');

-- ---------------------------------------------------------------------------------------------
-- Admin: anyone's Today, the team, the names
-- ---------------------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select pg_temp.ok((public.today_ec(99802) ->> 'leads_open')::int = 1, 'admin: looks at an EC');
select pg_temp.ok((public.today_lc(99803) ->> 'students')::int = 1, 'admin: looks at an LC');
select pg_temp.ok(
  (select (p ->> 'converted_month')::int from jsonb_array_elements(public.today_team() -> 'people') p where (p ->> 'teacher_id')::int = 99802) = 1,
  'admin: the team line of the EC');
insert into automation.quality_alerts (kind, trigger_type, dedupe_key, classroom_id, student_id, teacher_id, lesson_date, reason)
values ('absent_streak', 'student_care', 'today-test-1', 99851, 99831, 99801, current_date, 'Absent twice');
select pg_temp.ok(jsonb_array_length(public.today_teacher(99801) -> 'watch') = 1, 'admin: looks at the students to watch of a teacher');
select pg_temp.login('00000000-0000-0000-0000-0000000000e2');
select pg_temp.fails($$select public.today_teacher(99801)$$, 'only see your own', 'EC cannot ask for the Today of a teacher');
select pg_temp.ok(jsonb_array_length(public.today_teacher() -> 'watch') = 0, 'a person with no classes watches nobody');
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
select public.set_role_names('Sales', 'Care');
select pg_temp.ok((select value ->> 'ec' from public.app_settings where key = 'role_names') = 'Sales', 'admin: renames the roles');
select pg_temp.fails($$select public.set_role_names('', 'Care')$$, '1 to 30', 'a role needs a name');

rollback;
