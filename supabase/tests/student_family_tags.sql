-- Checks for 20261028000000_student_family_tags.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/student_family_tags.sql

begin;

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
  ('00000000-0000-0000-0000-0000000000c2'),  -- staff, Students view
  ('00000000-0000-0000-0000-0000000000c3'),  -- staff, Students edit
  ('00000000-0000-0000-0000-0000000000c4');  -- staff, Leads edit only

insert into public.teachers (id, auth_user_id, username, full_name, role, permissions) overriding system value values
  (9871, '00000000-0000-0000-0000-0000000000c1', 'ft_admin', 'Admin', 'admin', '{}'),
  (9872, '00000000-0000-0000-0000-0000000000c2', 'ft_view', 'Viewer', 'staff', '{"students": {"level": "view"}}'),
  (9873, '00000000-0000-0000-0000-0000000000c3', 'ft_edit', 'Editor', 'staff', '{"students": {"level": "edit"}}'),
  (9874, '00000000-0000-0000-0000-0000000000c4', 'ft_leads', 'Sales', 'staff', '{"leads": {"level": "edit"}}');

insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values
  (9971, 'Kid One', 0, '2099-12-31', '2099-12-31', '2099-12-31'),
  (9972, 'Kid Two', 0, '2099-12-31', '2099-12-31', '2099-12-31');

insert into public.lead_options (id, kind, label, color) overriding system value values
  (99801, 'tag', 'Crystal', '#dc2626'),
  (99802, 'tag', 'Violet', '#f59e0b'),
  (99803, 'source', 'A source', null);

-- The students were saved, so the family table already holds them.
select pg_temp.ok((select count(*) from public.people where student_id in (9971, 9972)) = 2,
  'each student has a family record');
select pg_temp.ok((select tag_ids from public.people where student_id = 9971) = '{}',
  'a record starts with no tags');

-- Only real tags can be put on a person.
select pg_temp.fails($$update public.people set tag_ids = '{99803}' where student_id = 9971$$,
  'not a tag', 'a source is not a tag');
select pg_temp.fails($$update public.people set tag_ids = '{424242}' where student_id = 9971$$,
  'not a tag', 'a tag that does not exist is refused');

-- The tag list is readable with Students access, and only the tags.
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
set local role authenticated;
select pg_temp.ok((select count(*) from public.lead_options where kind = 'tag' and id in (99801, 99802)) = 2,
  'Students view reads the tags');
select pg_temp.ok((select count(*) from public.lead_options where id = 99803) = 0,
  'but not the sources');
select pg_temp.fails($$insert into public.lead_options (kind, label) values ('tag', 'Nope')$$,
  'row-level security', 'Students view cannot add a tag');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000c3');
set local role authenticated;
insert into public.lead_options (kind, label, color) values ('tag', 'Made by office', '#16a34a');
select pg_temp.ok((select count(*) from public.lead_options where label = 'Made by office') = 1,
  'Students edit adds a tag');
select pg_temp.fails($$insert into public.lead_options (kind, label) values ('source', 'Sneaky')$$,
  'row-level security', 'Students edit still cannot add a source');
reset role;

-- Setting a student's tags.
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
set local role authenticated;
select pg_temp.fails($$select public.set_student_tags(9971, '{99801}')$$, 'not allowed', 'Students view cannot tag a student');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000c4');
set local role authenticated;
select pg_temp.fails($$select public.set_student_tags(9971, '{99801}')$$, 'not allowed', 'Leads access alone cannot tag a student');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000c3');
set local role authenticated;
select public.set_student_tags(9971, '{99802,99801,99801}');
reset role;
select pg_temp.ok((select tag_ids from public.people where student_id = 9971) = '{99801,99802}',
  'Students edit tags a student (sorted, no repeats)');
select pg_temp.ok((select tag_ids from public.people where student_id = 9972) = '{}', 'the other student is untouched');

-- A student whose family record is missing gets it made.
delete from public.people where student_id = 9972;
select pg_temp.login('00000000-0000-0000-0000-0000000000c3');
set local role authenticated;
select public.set_student_tags(9972, '{99801}');
reset role;
select pg_temp.ok((select tag_ids from public.people where student_id = 9972) = '{99801}',
  'a missing family record is made, then tagged');

select pg_temp.login('00000000-0000-0000-0000-0000000000c3');
set local role authenticated;
select public.set_student_tags(9971, '{}');
reset role;
select pg_temp.ok((select tag_ids from public.people where student_id = 9971) = '{}', 'tags come off');

-- A parent's tags follow Leads or Students.
insert into public.people (id, kind, full_name, phone) overriding system value values (99701, 'parent', 'Mum', '60123450001');
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
set local role authenticated;
select pg_temp.fails($$select public.set_person_tags(99701, '{99801}')$$, 'not allowed', 'view-only cannot tag a parent');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c4');
set local role authenticated;
select public.set_person_tags(99701, '{99801}');
reset role;
select pg_temp.ok((select tag_ids from public.people where id = 99701) = '{99801}', 'Leads edit tags a parent');

-- A student's own record needs Students edit even for set_person_tags.
select pg_temp.login('00000000-0000-0000-0000-0000000000c4');
set local role authenticated;
select pg_temp.fails($$select public.set_person_tags((select id from public.people where student_id = 9971), '{99801}')$$,
  'not allowed', 'Leads access alone cannot tag an enrolled student through the person');
reset role;

-- A lead becomes a student: the tags go with it.
insert into public.leads (id, full_name, phone, tag_ids) overriding system value values (99601, 'Lead A', '60123450002', '{99801,99802}');
select pg_temp.ok((select tag_ids from public.people where student_id = 9972) = '{99801}', 'before converting: the student has their own tag');
update public.leads set status = 'converted', converted_student_id = 9972 where id = 99601;
select pg_temp.ok((select tag_ids from public.people where student_id = 9972) = '{99801,99802}',
  'converting adds the lead''s tags to the student''s own');

insert into public.leads (id, full_name, phone, tag_ids, status, converted_student_id) overriding system value
values (99602, 'Lead B', '60123450003', '{99802}', 'converted', 9971);
select pg_temp.ok((select tag_ids from public.people where student_id = 9971) = '{99802}',
  'a lead saved already converted hands its tags over too');

-- Nothing changes when the lead is edited later, or has no tags.
update public.people set tag_ids = '{}' where student_id = 9972;
update public.leads set full_name = 'Lead A2' where id = 99601;
select pg_temp.ok((select tag_ids from public.people where student_id = 9972) = '{}', 'editing a converted lead does not tag the student again');

rollback;
