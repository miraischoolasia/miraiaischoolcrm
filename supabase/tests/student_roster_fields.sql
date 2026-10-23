-- Checks for 20261030100000_student_roster_fields.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/student_roster_fields.sql

begin;

-- 20261101300000_staff_pic_sync gives every new admin / staff account its own PIC name (same as the account name).
-- This test makes its own PIC names, so the sync is off for it (the change is rolled back with the rest).
alter table public.teachers disable trigger teachers_sync_pic;

create function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
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

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

grant execute on all functions in schema pg_temp to authenticated;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000c1'),  -- admin
  ('00000000-0000-0000-0000-0000000000c2');  -- teacher

insert into public.teachers (id, auth_user_id, username, full_name, role) overriding system value values
  (9871, '00000000-0000-0000-0000-0000000000c1', 'rf_admin', 'Admin', 'admin'),
  (9872, '00000000-0000-0000-0000-0000000000c2', 'rf_teacher', 'Teacher', 'teacher');
insert into public.teachers (id, username, full_name, role) overriding system value values
  (9873, 'rf_staff', 'Violet 老师', 'staff'),
  (9874, 'rf_staff2', 'Twin', 'staff'),
  (9875, 'rf_staff3', 'Tw in', 'staff'),
  (9876, 'rf_staff4', 'Twin', 'admin');

insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values
  (9971, 'Kid One', 0, '2099-12-31', '2099-12-31', '2099-12-31'),
  (9972, 'Kid Two', 0, '2099-12-31', '2099-12-31', '2099-12-31'),
  (9973, 'Kid Three', 0, '2099-12-31', '2099-12-31', '2099-12-31'),
  (9974, 'Kid Four', 0, '2099-12-31', '2099-12-31', '2099-12-31');

-- The five lists start with the values of the master lists.
select pg_temp.ok((select count(*) from public.student_field_options where field = 'membership') = 10, 'the membership levels are there');
select pg_temp.ok((select array_agg(name order by sort_order) from public.student_field_options where field = 'region') = array['西马', '东马'],
  'the two regions are there');

-- The eight values.
update public.students
set sales_person_id = 9873, membership = '26001', fb_name = 'Mum Tan', region = '西马', enrol_method = '每月报名',
    payment_mode = '一次性付款', hero_member = '每年', fee_month = 7
where id = 9971;
select pg_temp.ok((select sales_person_id = 9873 and membership = '26001' and fee_month = 7 from public.students where id = 9971),
  'a student keeps the eight new things');

select pg_temp.fails($$update public.students set membership = 'PLATINUM' where id = 9971$$, 'not one of the choices', 'a value off the list is refused');
select pg_temp.fails($$update public.students set fee_month = 13 where id = 9971$$, 'check|violates', 'the fee month is 1 to 12');
update public.students set sales_person_id = 9872 where id = 9971;
select pg_temp.ok((select sales_person_id from public.students where id = 9971) = 9872, 'a teacher can be the sales person (a parent may come to a teacher)');
update public.teachers set is_active = false where id = 9875;
select pg_temp.fails($$update public.students set sales_person_id = 9875 where id = 9971$$, 'active staff member or teacher', 'someone who has left cannot be named as the sales person');
update public.teachers set is_active = true where id = 9875;
update public.students set sales_person_id = 9873 where id = 9971;

-- Only an admin changes the lists; renaming renames on every student.
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
set local role authenticated;
select pg_temp.fails($$select public.save_student_field_option('membership', null, 'VIP', null, null)$$, 'only admin', 'a teacher cannot add a choice');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
select public.save_student_field_option('membership', '26001', '2026 BASIC', null, null);
select public.save_student_field_option('membership', null, 'PLATINUM', null, null);
reset role;
select pg_temp.ok((select membership from public.students where id = 9971) = '2026 BASIC', 'renaming a choice renames it on its students');
update public.students set membership = 'PLATINUM' where id = 9971;
select pg_temp.ok((select membership from public.students where id = 9971) = 'PLATINUM', 'a choice an admin added can be used');

-- The switches and the counting rule.
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
set local role authenticated;
select pg_temp.fails($$select public.set_student_roster_counts(array['正课'], null)$$, 'only admin', 'a teacher cannot change how subjects are counted');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
select public.set_student_fields('{"sales_person": true, "roster_table": true, "junk": 1}');
select public.set_student_roster_counts(array['正课'], '2026-10-21');
reset role;
select pg_temp.ok((select (value ->> 'sales_person')::boolean and (value ->> 'roster_table')::boolean and not (value ->> 'membership')::boolean
                          and not (value ? 'junk') from public.app_settings where key = 'student_fields'),
  'an admin switches fields on; anything else is dropped');
select pg_temp.ok((select value = '{"count_categories": ["正课"], "changes_from": "2026-10-21"}'::jsonb from public.app_settings where key = 'student_roster'),
  'the counting rule is saved');

-- A lead that becomes a student gives its PIC as the student's sales person.
insert into public.lead_options (id, kind, label, teacher_id) overriding system value values (99871, 'pic', 'Violet小老师', null);
insert into public.lead_options (id, kind, label) overriding system value values (99872, 'pic', 'Twin'), (99873, 'pic', 'Nobody');
insert into public.lead_options (id, kind, label, teacher_id) overriding system value values (99874, 'pic', 'Linked', 9874);

insert into public.leads (id, full_name, phone, status, pic_id) overriding system value values
  (99971, 'Lead A', '60123450971', 'new', 99871),
  (99972, 'Lead B', '60123450972', 'new', 99872),
  (99973, 'Lead C', '60123450973', 'new', 99873),
  (99974, 'Lead D', '60123450974', 'new', 99874),
  (99975, 'Lead E', '60123450975', 'new', 99874);

update public.leads set status = 'converted', converted_student_id = 9972 where id = 99971;
select pg_temp.ok((select sales_person_id from public.students where id = 9972) = 9873,
  'a PIC with no account finds the staff member with the same name (小 and spaces left out)');
update public.leads set status = 'converted', converted_student_id = 9973 where id = 99972;
select pg_temp.ok((select sales_person_id from public.students where id = 9973) is null, 'two staff members with that name: nobody is picked');
update public.leads set status = 'converted', converted_student_id = 9973 where id = 99973;
select pg_temp.ok((select sales_person_id from public.students where id = 9973) is null, 'a PIC that matches nobody leaves it empty');
update public.leads set status = 'converted', converted_student_id = 9974 where id = 99974;
select pg_temp.ok((select sales_person_id from public.students where id = 9974) = 9874, 'a PIC linked to an account gives that account');

-- Never over a sales person that is already there; and only while the school shows the field.
update public.students set sales_person_id = 9873 where id = 9974;
update public.leads set converted_student_id = null where id = 99974;
update public.leads set converted_student_id = 9974 where id = 99974;
select pg_temp.ok((select sales_person_id from public.students where id = 9974) = 9873, 'an existing sales person is kept');

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
select public.set_student_fields('{"roster_table": true}');
reset role;
update public.students set sales_person_id = null where id = 9974;
update public.leads set status = 'converted', converted_student_id = 9974 where id = 99975;
select pg_temp.ok((select sales_person_id from public.students where id = 9974) is null, 'nothing is written while the school does not show the sales person');

-- With the sales person on, a consultant no longer becomes the PIC of a lead that has none.
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
select public.set_student_fields('{"sales_person": true}');
reset role;
insert into public.leads (id, full_name, phone, status, converted_student_id) overriding system value values (99976, 'Lead F', '60123450976', 'converted', 9971);
update public.students set consultant_id = 9873 where id = 9971;
select pg_temp.ok((select pic_id from public.leads where id = 99976) is null, 'the consultant does not become the PIC while the sales person is kept');
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
select public.set_student_fields('{}');
reset role;
update public.students set consultant_id = null where id = 9971;
update public.students set consultant_id = 9873 where id = 9971;
select pg_temp.ok((select pic_id from public.leads where id = 99976) is not null, 'without the sales person the old behaviour stays (consultant becomes PIC)');

rollback;
