-- Checks for 20261101900000_converted_needs_regular_class.sql: a lead is Converted only when its child is in a regular class.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/converted_needs_regular_class.sql

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

create function pg_temp.stage(p_lead bigint) returns text language sql as $$
  select status from public.leads where id = p_lead;
$$;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000d1');
insert into public.teachers (id, auth_user_id, username, full_name, role) overriding system value
values (99961, '00000000-0000-0000-0000-0000000000d1', 'conv_class_admin', 'Conv Class Admin', 'admin');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

insert into public.classrooms (id, name, age_group, program_level, teacher_id, status, category) overriding system value
values (99971, 'Conv Trial', '6-8 Years Old', 'Coder Foundation', 99961, 'active', 'trial'),
       (99972, 'Conv Regular', '6-8 Years Old', 'Coder Foundation', 99961, 'active', 'regular'),
       (99973, 'Conv Regular Two', '6-8 Years Old', 'Coder Foundation', 99961, 'active', 'regular');

select pg_temp.ok((select options ->> 'students' from public.lead_stage_rules where key = 'converted_on_student_phone') = 'regular',
  'the phone rule is set to regular classes only');

-- ---------------------------------------------------------------------------------------------
-- The helper
-- ---------------------------------------------------------------------------------------------
insert into public.students (id, full_name, student_type, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values (99901, 'Helper Kid', 'regular', 0, '2099-12-31', '2099-12-31', '2099-12-31');
select pg_temp.ok(not public.student_in_regular_class(99901), 'no class: not in a regular class');
insert into public.student_classroom_periods (student_id, classroom_id, start_date) values (99901, 99971, current_date - 5);
select pg_temp.ok(not public.student_in_regular_class(99901), 'a trial class is not a regular class');
insert into public.student_classroom_periods (student_id, classroom_id, start_date, end_date) values (99901, 99972, current_date - 30, current_date - 1);
select pg_temp.ok(not public.student_in_regular_class(99901), 'a regular class that already ended does not count');
insert into public.student_classroom_periods (student_id, classroom_id, start_date) values (99901, 99973, current_date + 7);
select pg_temp.ok(public.student_in_regular_class(99901), 'a regular class that starts next week counts (the child has joined)');

-- ---------------------------------------------------------------------------------------------
-- A student made from a lead
-- ---------------------------------------------------------------------------------------------
insert into public.leads (id, full_name, phone, status) overriding system value
values (99911, 'Conv One', '60123490911', 'trial_completed'),
       (99912, 'Conv Two', '60123490912', 'trial_completed'),
       (99913, 'Conv Three', '60123490913', 'trial_completed'),
       (99914, 'Conv Four', '60123490914', 'trial_completed');

-- No class: tied, keeps its stage (the Mirai lead #176 case).
select public.create_student_record('Kid No Class', null, 12, current_date, current_date, current_date, null, 'regular', null, null, 99911);
select pg_temp.ok(pg_temp.stage(99911) = 'trial_completed' and (select converted_student_id from public.leads where id = 99911) is not null,
  'made with no class: the lead is tied to the student but keeps its stage');
-- ...and converts the moment the child joins a regular class.
select converted_student_id as s11 from public.leads where id = 99911 \gset
select public.add_student_to_classroom(:s11, 99972);
select pg_temp.ok(pg_temp.stage(99911) = 'converted', 'joining a regular class later converts the lead');

-- A trial class only: not converted; then moved to a regular class: converted.
select public.create_student_record('Kid Trial Class', null, 0, current_date, current_date, current_date, null, 'trial', null, 99971, 99912);
select pg_temp.ok(pg_temp.stage(99912) = 'trial_completed', 'made in a trial class: the lead keeps its stage');
select converted_student_id as s12 from public.leads where id = 99912 \gset
update public.students set classroom_id = 99972 where id = :s12;
select pg_temp.ok(pg_temp.stage(99912) = 'converted', 'moved from the trial class to a regular class: the lead is converted');

-- A regular class from the start: converted at once (as before).
select public.create_student_record('Kid Regular', null, 12, current_date, current_date, current_date, null, 'regular', null, 99972, 99913);
select pg_temp.ok(pg_temp.stage(99913) = 'converted', 'made in a regular class: converted at once');

-- The switch: with "student made from a lead" off, joining a class does not convert it.
select public.set_lead_stage_rule('converted_on_enrol', false, null);
select public.create_student_record('Kid Switch', null, 0, current_date, current_date, current_date, null, 'regular', null, null, 99914);
select converted_student_id as s14 from public.leads where id = 99914 \gset
select public.add_student_to_classroom(:s14, 99972);
select pg_temp.ok(pg_temp.stage(99914) = 'trial_completed', 'switched off: joining a regular class leaves the lead alone');
select public.set_lead_stage_rule('converted_on_enrol', true, null);

-- ---------------------------------------------------------------------------------------------
-- A student with the lead's number (family record tied to the parent)
-- ---------------------------------------------------------------------------------------------
insert into public.leads (id, full_name, phone, status) overriding system value
values (99921, 'Phone Parent', '60123490921', 'contacted'),
       (99922, 'Phone Parent Two', '60123490922', 'lost');
insert into public.students (id, full_name, phone, student_type, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values (99902, 'Phone Kid', '60123490921', 'regular', 0, '2099-12-31', '2099-12-31', '2099-12-31');
select pg_temp.ok(pg_temp.stage(99921) = 'contacted', 'phone, no class: the lead is left alone');
select public.add_student_to_classroom(99902, 99972);
select pg_temp.ok(pg_temp.stage(99921) = 'converted' and (select converted_student_id from public.leads where id = 99921) = 99902,
  'phone, then a regular class: the lead is converted and tied to the student');
-- A lead already tied to another student keeps that student (a sister joins later).
insert into public.students (id, full_name, phone, student_type, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values (99903, 'Phone Sister', '60123490921', 'regular', 0, '2099-12-31', '2099-12-31', '2099-12-31');
select public.add_student_to_classroom(99903, 99972);
select pg_temp.ok((select converted_student_id from public.leads where id = 99921) = 99902, 'a sister joining later does not take the lead over');

-- Switched off.
select public.set_lead_stage_rule('converted_on_student_phone', false, null);
insert into public.students (id, full_name, phone, student_type, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values (99904, 'Phone Kid Two', '60123490922', 'regular', 0, '2099-12-31', '2099-12-31', '2099-12-31');
select public.add_student_to_classroom(99904, 99972);
select pg_temp.ok(pg_temp.stage(99922) = 'lost', 'phone rule off: joining a regular class leaves the lead alone');
select public.set_lead_stage_rule('converted_on_student_phone', true, '{"students": "regular"}');

rollback;
