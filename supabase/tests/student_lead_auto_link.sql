-- Checks for 20261028200000_student_lead_auto_link.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/student_lead_auto_link.sql

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

-- Leads (the family sync makes each one a parent record).
insert into public.leads (id, full_name, phone, status, tag_ids) overriding system value
values (99701, 'Mrs One', '60123450101', 'new', '{}'),
       (99702, 'Mrs Two', '60123450102', 'contacted', '{}'),
       (99703, 'Mrs Three', '60123450103', 'new', '{}'),
       (99704, 'Mrs Four', '60123450104', 'lost', '{}');
select pg_temp.ok((select count(*) from public.people where kind = 'parent' and lead_id in (99701, 99702, 99703, 99704)) = 4,
  'each lead has a parent record');

-- A student with the lead's number (written another way): the lead is converted and the family is tied.
insert into public.students (id, full_name, phone, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values
  (9901, 'Kid One', '012-345 0101', 0, '2099-12-31', '2099-12-31', '2099-12-31');
select pg_temp.ok((select status from public.leads where id = 99701) = 'converted', 'a new student with the same number converts the lead');
select pg_temp.ok((select converted_student_id from public.leads where id = 99701) = 9901, 'the lead points at the student');
select pg_temp.ok((select parent_id from public.people where student_id = 9901) = (select id from public.people where lead_id = 99701 and kind = 'parent'),
  'the student is a child of the parent of the lead');
select pg_temp.ok((select full_name from public.leads where id = 99701) = 'Mrs One' and (select phone from public.leads where id = 99701) = '60123450101',
  'the lead keeps its name and phone');

-- A brother: the lead keeps the first student, the brother is tied to the same parent.
insert into public.students (id, full_name, phone, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values
  (9902, 'Kid One Brother', '60123450101', 0, '2099-12-31', '2099-12-31', '2099-12-31');
select pg_temp.ok((select converted_student_id from public.leads where id = 99701) = 9901, 'the lead keeps its first student');
select pg_temp.ok((select parent_id from public.people where student_id = 9902) = (select parent_id from public.people where student_id = 9901),
  'a brother has the same parent');

-- The second parent phone finds the lead too.
insert into public.students (id, full_name, phone, second_parent_phone, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values
  (9903, 'Kid Two', '60199990000', '0123450102', 0, '2099-12-31', '2099-12-31', '2099-12-31');
select pg_temp.ok((select converted_student_id from public.leads where id = 99702) = 9903, 'the second parent phone finds the lead');

-- A phone entered later does it too.
insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values (9904, 'Kid Three', 0, '2099-12-31', '2099-12-31', '2099-12-31');
select pg_temp.ok((select converted_student_id from public.leads where id = 99703) is null, 'no phone: the lead stays open');
update public.students set phone = '60123450103' where id = 9904;
select pg_temp.ok((select converted_student_id from public.leads where id = 99703) = 9904, 'a phone added later finds the lead');

-- A lead that already has a student keeps it, and a number no lead has touches nothing.
update public.leads set converted_student_id = 9904, status = 'converted' where id = 99704;
insert into public.students (id, full_name, phone, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values (9905, 'Kid Four', '60123450104', 0, '2099-12-31', '2099-12-31', '2099-12-31');
select pg_temp.ok((select converted_student_id from public.leads where id = 99704) = 9904, 'a lead that already has a student keeps it');
insert into public.students (id, full_name, phone, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values (9906, 'Kid Five', '60177770000', 0, '2099-12-31', '2099-12-31', '2099-12-31');
select pg_temp.ok((select count(*) from public.leads where converted_student_id = 9906) = 0, 'a number no lead has changes nothing');

rollback;
