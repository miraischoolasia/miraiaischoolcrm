-- Checks for 20261027400000_student_profile_extras.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/student_profile_extras.sql

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
  ('00000000-0000-0000-0000-0000000000a7'),  -- admin
  ('00000000-0000-0000-0000-0000000000a8');  -- teacher

insert into public.teachers (id, auth_user_id, username, full_name, role) overriding system value values
  (9851, '00000000-0000-0000-0000-0000000000a7', 'sp_admin', 'Admin', 'admin'),
  (9852, '00000000-0000-0000-0000-0000000000a8', 'sp_teacher', 'Teacher', 'teacher');
insert into public.teachers (id, username, full_name, role) overriding system value values
  (9853, 'sp_staff', 'Crystal', 'staff');

insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date)
  overriding system value values (9951, 'Kid', 0, '2099-12-31', '2099-12-31', '2099-12-31');

select pg_temp.ok((select array_agg(name order by sort_order) from public.student_kinds) = array['新生', '续报', '回流生'],
  'the three kinds of student are there');

update public.students set name_zh = '小明', student_kind = '续报', consultant_id = 9853, second_parent_phone = '0123456789' where id = 9951;
select pg_temp.ok((select name_zh = '小明' and student_kind = '续报' and consultant_id = 9853 and second_parent_phone = '0123456789'
                   from public.students where id = 9951), 'a student keeps the four new things');

select pg_temp.fails($$update public.students set student_kind = 'VIP' where id = 9951$$,
  'foreign key|violates', 'a kind not on the school''s list is refused');
select pg_temp.fails($$update public.students set consultant_id = 9852 where id = 9951$$,
  'active staff member', 'a teacher-only login cannot be the consultant');

select pg_temp.login('00000000-0000-0000-0000-0000000000a8');
set local role authenticated;
select pg_temp.fails($$select public.save_student_kind(null, 'VIP', null, null)$$, 'only admin', 'a teacher cannot add a kind');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a7');
set local role authenticated;
select public.save_student_kind('续报', 'Renewal', null, null);
reset role;
select pg_temp.ok((select student_kind from public.students where id = 9951) = 'Renewal',
  'renaming a kind renames it on its students');

delete from public.teachers where id = 9853;
select pg_temp.ok((select consultant_id from public.students where id = 9951) is null,
  'a removed staff member leaves the student without a consultant');

select pg_temp.ok((select value from public.app_settings where key = 'student_fields')
                   = '{"name_zh": false, "student_kind": false, "consultant": false, "second_parent_phone": false}'::jsonb,
  'the four fields start switched off');

select pg_temp.login('00000000-0000-0000-0000-0000000000a8');
set local role authenticated;
select pg_temp.fails($$select public.set_student_fields('{"name_zh": true}')$$, 'only admin', 'a teacher cannot switch the fields on');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000a7');
set local role authenticated;
select public.set_student_fields('{"name_zh": true, "consultant": true, "junk": 1}');
reset role;
select pg_temp.ok((select value from public.app_settings where key = 'student_fields')
                   = '{"name_zh": true, "student_kind": false, "consultant": true, "second_parent_phone": false}'::jsonb,
  'an admin switches fields on; anything else in the setting is dropped');

rollback;
