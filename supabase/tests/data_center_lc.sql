-- Checks for 20261101420000_data_center_lc.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/data_center_lc.sql

begin;

create function pg_temp.fails(p_sql text, p_pattern text, p_name text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then
      raise notice 'PASS % [%]', p_name, sqlerrm;
      return;
    end if;
    raise exception 'FAIL % (wrong error: %)', p_name, sqlerrm;
  end;
  raise exception 'FAIL % (no error)', p_name;
end;
$$;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000008' || lpad(n::text, 2, '0'))::uuid, 'dcl' || n || '@mirai.internal',
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 3) n;

-- 1 LC Lily (tick), 2 LC Mia (tick), 3 nothing.
insert into public.teachers (id, full_name, username, role, is_active, auth_user_id, permissions)
overriding system value
values
  (9801, 'DCL Lily', 'dcl_lily', 'staff', true, '00000000-0000-0000-0000-000000000801', '{"data_center": {"level": "view"}}'),
  (9802, 'DCL Mia', 'dcl_mia', 'staff', true, '00000000-0000-0000-0000-000000000802', '{"data_center": {"level": "view"}}'),
  (9803, 'DCL None', 'dcl_none', 'staff', true, '00000000-0000-0000-0000-000000000803', '{}');

create function pg_temp.as_user(p_n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000008' || lpad(p_n::text, 2, '0'), true);
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000008' || lpad(p_n::text, 2, '0'), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function pg_temp.as_user(int) to authenticated;
grant execute on function pg_temp.ok(boolean, text) to authenticated;
grant execute on function pg_temp.fails(text, text, text) to authenticated;

-- The roster rule as plain as it gets for this check: regular classes count, changes counted from 1 January.
update public.app_settings set value = '{}'::jsonb where key = 'student_roster';

insert into public.classrooms (id, name, age_group, program_level, teacher_id) overriding system value values
  (98811, 'DCL Math', '9-11 Years Old', 'Coder Foundation', null),
  (98812, 'DCL Sci', '9-11 Years Old', 'Coder Foundation', null);
insert into public.classrooms (id, name, age_group, program_level, teacher_id, category) overriding system value values
  (98813, 'DCL Trial', '9-11 Years Old', 'Coder Foundation', null, 'trial');

-- March 2020. Lily's students:
--   A: two classes all month (stays)
--   B: one class all month, a second added on the 10th, and a student-care alert
--   C: in class at the start, stopped on the 15th (stopped every class: at risk)
--   D: a trial class only (not counted)
-- Mia's student E: started on the 5th. Student F: nobody handles them.
insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, student_type, consultant_id)
overriding system value values
  (98801, 'DCL A', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'regular', 9801),
  (98802, 'DCL B', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'regular', 9801),
  (98803, 'DCL C', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'regular', 9801),
  (98804, 'DCL D', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'regular', 9801),
  (98805, 'DCL E', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'regular', 9802),
  (98806, 'DCL F', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'regular', null);
insert into public.student_classroom_periods (student_id, classroom_id, start_date, end_date) values
  (98801, 98811, '2020-01-01', null), (98801, 98812, '2020-01-01', null),
  (98802, 98811, '2020-01-01', null), (98802, 98812, '2020-03-10', null),
  (98803, 98811, '2020-01-01', '2020-03-15'),
  (98804, 98813, '2020-01-01', null),
  (98805, 98811, '2020-03-05', null),
  (98806, 98811, '2020-01-01', null);
insert into automation.quality_alerts (kind, trigger_type, dedupe_key, classroom_id, student_id, teacher_id, lesson_date, reason)
values ('absent_streak', 'student_care', 'dcl-test-1', 98811, 98802, 9801, '2020-03-20', 'Absent 3 lessons in a row'),
       ('absent_streak', 'student_care', 'dcl-test-0', 98811, 98801, 9801, '2020-02-20', 'Absent in February');
insert into public.progress_card_sends (student_id, month, sent_by) values (98801, '2020-03-01', 9801), (98805, '2020-03-01', 9802);

set local role authenticated;

select pg_temp.as_user(3);
select pg_temp.fails($$select * from public.data_center_lc_report('2020-03-01')$$, 'data center tick', 'no tick: no LC report');
select pg_temp.fails($$select * from public.data_center_lc_students('2020-03-01', 9801)$$, 'data center tick', 'no tick: no risk list');
select pg_temp.fails($$select * from public.data_center_lc_rows('2020-03-01')$$, 'permission denied', 'the inner rows are not open');

select pg_temp.as_user(2);
create temporary table dcl as select * from public.data_center_lc_report('2020-03-10');
select pg_temp.ok((select students = 2 and students_at_start = 3 and students_still_in = 2
    and stays_at_start = 4 and stays_added = 1 and stays_stopped = 1
    and at_risk = 2 and cards_due = 3 and cards_sent = 1
  from dcl where lc_id = 9801),
  'Lily: 2 in class at the end (C stopped), 3 at the start, 4 stays + 1 added - 1 stopped, 2 at risk, 1 of 3 cards sent; the trial class does not count');
select pg_temp.ok((select students = 1 and students_at_start = 0 and stays_added = 1 and at_risk = 0 and cards_sent = 1
  from dcl where lc_id = 9802), 'Mia (open ranking: Mia sees Lily too): her new student, card sent');
select pg_temp.ok((select lc_name = '(nobody)' and students >= 1 from dcl where lc_id is null), 'a student nobody handles is "(nobody)"');

create temporary table dcl_risk as select * from public.data_center_lc_students('2020-03-01', 9801);
select pg_temp.ok((select count(*) = 2 from dcl_risk), 'Lily has 2 students at risk');
select pg_temp.ok((select stopped_all and reasons = '{}' from dcl_risk where student_id = 98803), 'C: stopped every class');
select pg_temp.ok((select not stopped_all and reasons = '{"Absent 3 lessons in a row"}' and not card_sent from dcl_risk where student_id = 98802),
  'B: this month''s alert (not last month''s), no card sent');
select pg_temp.ok((select count(*) = 0 from dcl_risk where student_id = 98801), 'A: February''s alert does not count in March');
select pg_temp.ok((select count(*) >= 0 from public.data_center_lc_students('2020-03-01', null)), 'the "(nobody)" list opens');

reset role;
rollback;
