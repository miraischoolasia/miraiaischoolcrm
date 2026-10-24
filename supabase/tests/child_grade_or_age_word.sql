-- Checks for 20261102900000_child_grade_or_age_word.sql ({child_grade_or_age} in a queued message).
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/child_grade_or_age_word.sql

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, grade_level, grade_year, age)
  overriding system value values (99911, 'Grade Kid', 0, '2099-12-31', '2099-12-31', '2099-12-31', 4, 2026, 9);
insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, age)
  overriding system value values (99912, 'Age Kid', 0, '2099-12-31', '2099-12-31', '2099-12-31', 8);
insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values (99913, 'Blank Kid', 0, '2099-12-31', '2099-12-31', '2099-12-31');
insert into public.leads (id, full_name, phone, status, children) overriding system value
values (99921, 'Two Kids Mum', '0100000921', 'new',
  '[{"name":"Alba","age":7,"gradeLevel":2,"gradeYear":2026},{"name":"Ben","age":13}]'::jsonb),
 (99922, 'One Kid Mum', '0100000922', 'new', '[{"name":"Cara","age":10}]'::jsonb);

-- Age mode (the default): the age.
select pg_temp.ok(automation.child_grade_or_age(99911, null, null) = '9', 'age mode: the age, even when a grade is stored');
select pg_temp.ok(automation.child_grade_or_age(99912, null, null) = '8', 'age mode: a student age');
select pg_temp.ok(automation.child_grade_or_age(99913, null, null) = '', 'a student with neither: empty');
select pg_temp.ok(automation.child_grade_or_age(null, 99921, 'Ben') = '13', 'a lead child by name: the age');
select pg_temp.ok(automation.child_grade_or_age(null, 99922, 'Someone else') = '10', 'one child only: that child');
select pg_temp.ok(automation.child_grade_or_age(null, 99921, 'Nobody') = '', 'two children, name not found: empty');
select pg_temp.ok(automation.child_grade_or_age(null, null, null) = '', 'nobody known: empty');

-- Grade mode: the grade where there is one, otherwise the age.
update public.app_settings set value = '{"mode":"grade"}'::jsonb where key = 'age_display';
select pg_temp.ok(automation.child_grade_or_age(99911, null, null) = 'Year ' || public.grade_now(4::smallint, 2026::smallint), 'grade mode: Year n');
select pg_temp.ok(automation.child_grade_or_age(99912, null, null) = '8', 'grade mode, no grade stored: falls back to the age');
select pg_temp.ok(automation.child_grade_or_age(null, 99921, 'alba') = 'Year ' || public.grade_now(2::smallint, 2026::smallint), 'a lead child: grade, name matched without case');
select pg_temp.ok(automation.child_grade_or_age(null, 99921, 'Ben') = '13', 'a lead child without a grade: the age');

-- In the queue.
insert into public.automation_queue (rule_key, rule_name, dedupe_key, phone, message, due_at, expires_at, student_id)
values ('t_grade', 't', 't_grade:1', '0100000911', 'Hi, {child_grade_or_age} class', now(), now() + interval '1 day', 99911);
select pg_temp.ok((select message from public.automation_queue where dedupe_key = 't_grade:1') = 'Hi, Year ' || public.grade_now(4::smallint, 2026::smallint) || ' class',
  'the word is filled as the message enters the queue');
insert into public.automation_queue (rule_key, rule_name, dedupe_key, phone, message, due_at, expires_at)
values ('t_grade', 't', 't_grade:2', '0100000912', 'No child {child_grade_or_age}.', now(), now() + interval '1 day');
select pg_temp.ok((select message from public.automation_queue where dedupe_key = 't_grade:2') = 'No child .', 'no child known: empty, not left as a word');

rollback;
