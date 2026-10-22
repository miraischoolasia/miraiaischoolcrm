-- Checks for 20261029200000_app_chat.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/app_chat.sql

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

-- Seed: Joey teaches class A with assistant Mei; Tan teaches class B; Crystal
-- is Ali's consultant; Siti is in class B; an admin; a parent login.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000d1'),  -- admin
  ('00000000-0000-0000-0000-0000000000d2'),  -- teacher Joey (class A)
  ('00000000-0000-0000-0000-0000000000d3'),  -- assistant Mei (class A)
  ('00000000-0000-0000-0000-0000000000d4'),  -- teacher Tan (class B)
  ('00000000-0000-0000-0000-0000000000d5'),  -- consultant Crystal (staff, no Inbox tick)
  ('00000000-0000-0000-0000-0000000000d6'),  -- student Ali
  ('00000000-0000-0000-0000-0000000000d7'),  -- student Siti
  ('00000000-0000-0000-0000-0000000000d8');  -- Ali's parent

insert into public.teachers (id, auth_user_id, username, full_name, role) overriding system value values
  (9961, '00000000-0000-0000-0000-0000000000d1', 'ac_admin', 'Admin', 'admin'),
  (9962, '00000000-0000-0000-0000-0000000000d2', 'ac_joey', 'Joey', 'teacher'),
  (9963, '00000000-0000-0000-0000-0000000000d3', 'ac_mei', 'Mei', 'teacher'),
  (9964, '00000000-0000-0000-0000-0000000000d4', 'ac_tan', 'Tan', 'teacher'),
  (9965, '00000000-0000-0000-0000-0000000000d5', 'ac_crystal', 'Crystal', 'staff');

insert into public.classrooms (id, name, age_group, program_level, teacher_id) overriding system value values
  (9971, 'Class A', '9-11 Years Old', 'Coder Foundation', 9962),
  (9972, 'Class B', '9-11 Years Old', 'Coder Foundation', 9964);
insert into public.classroom_teachers (classroom_id, teacher_id) values (9971, 9963);

insert into public.students (id, full_name, student_code, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, classroom_id, auth_user_id, consultant_id)
  overriding system value values
  (9981, 'Ali', 'S9981', 0, '2099-12-31', '2099-12-31', '2099-12-31', 9971, '00000000-0000-0000-0000-0000000000d6', 9965),
  (9982, 'Siti', 'S9982', 0, '2099-12-31', '2099-12-31', '2099-12-31', 9972, '00000000-0000-0000-0000-0000000000d7', null);
update public.student_classroom_periods set start_date = '2026-01-01' where student_id in (9981, 9982);

-- 1. Off by default -----------------------------------------------------------
select pg_temp.ok(not public.app_chat_enabled(), 'chat starts off');
select pg_temp.login('00000000-0000-0000-0000-0000000000d6');
set local role authenticated;
select pg_temp.ok((select count(*) from public.portal_chat_contacts()) = 0, 'off: the student sees no one');
select pg_temp.fails($$select public.portal_chat_send(9962, 'hi')$$, 'not turned on', 'off: the student cannot send');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000d2');
set local role authenticated;
select pg_temp.fails($$select public.set_app_chat_enabled(true)$$, 'only an admin', 'a teacher cannot turn chat on');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select public.set_app_chat_enabled(true);
reset role;
select pg_temp.ok(public.app_chat_enabled(), 'the admin turns chat on');

-- 2. Whom a student may write to ----------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000d6');
set local role authenticated;
select pg_temp.ok(
  (select array_agg(staff_id order by staff_id) from public.portal_chat_contacts()) = array[9962, 9963, 9965]::bigint[],
  'Ali sees his teacher, the assistant and his consultant');
select pg_temp.ok((select role from public.portal_chat_contacts() where staff_id = 9965) = 'consultant', 'the consultant is marked');
select pg_temp.ok((select classes from public.portal_chat_contacts() where staff_id = 9963) = 'Class A', 'a teacher shows the class');
select pg_temp.fails($$select public.portal_chat_send(9964, 'hi')$$, 'only write to your class', 'not another class''s teacher');
select pg_temp.fails($$select public.portal_chat_send(9961, 'hi')$$, 'only write to your class', 'not the admin');
select pg_temp.fails($$select public.portal_chat_send(9962, '   ')$$, '1 to 2000', 'not an empty message');
select pg_temp.fails($$insert into public.app_chat_messages (thread_id, sender, body) values (1, 'student', 'x')$$,
  'permission denied', 'no direct writes');
select public.portal_chat_send(9962, 'Teacher, I cannot open the homework');
select public.portal_chat_send(9962, 'Page 3');
select public.portal_chat_send(9965, 'Can I change class?');
select pg_temp.ok((select count(*) from public.app_chat_threads) = 2, 'one thread per teacher, sent twice');
reset role;

-- 3. Unread counts and who sees what ------------------------------------------
select pg_temp.ok((select unread_for_staff from public.app_chat_threads where staff_id = 9962) = 2, 'two unread for Joey');

select pg_temp.login('00000000-0000-0000-0000-0000000000d7');
set local role authenticated;
select pg_temp.ok((select count(*) from public.app_chat_threads) = 0, 'Siti sees none of Ali''s threads');
select pg_temp.ok((select count(*) from public.app_chat_messages) = 0, 'or his messages');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000d8');
set local role authenticated;
select pg_temp.ok((select count(*) from public.app_chat_messages) = 0, 'a parent login sees nothing');
select pg_temp.fails($$select public.portal_chat_send(9962, 'hi')$$, 'student''s own login', 'a parent login cannot send');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000d3');
set local role authenticated;
select pg_temp.ok((select count(*) from public.app_chat_staff_threads()) = 0, 'the assistant does not see the thread to Joey');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000d5');
set local role authenticated;
select pg_temp.ok((select count(*) from public.app_chat_staff_threads()) = 1, 'the consultant sees her thread without an Inbox tick');
select pg_temp.ok((select student_code || ' ' || student_name from public.app_chat_staff_threads()) = 'S9981 Ali', 'with the student''s code and name');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000d2');
set local role authenticated;
select pg_temp.ok((select count(*) from public.app_chat_messages) = 2, 'Joey reads his two messages');
select public.app_chat_mark_read((select thread_id from public.app_chat_staff_threads()));
select public.app_chat_reply((select thread_id from public.app_chat_staff_threads()), 'Try the link again');
reset role;
select pg_temp.ok((select unread_for_staff = 0 and unread_for_student = 1 and staff_read_at is not null
  from public.app_chat_threads where staff_id = 9962), 'Joey read it and answered: one unread for Ali');

-- 4. Admin reads everything, answers nothing -----------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select pg_temp.ok((select count(*) from public.app_chat_staff_threads()) = 2, 'the admin sees every thread');
select pg_temp.ok((select count(*) from public.app_chat_staff_threads() where mine) = 0, 'none of them the admin''s own');
select pg_temp.fails($$select public.app_chat_reply((select id from public.app_chat_threads where staff_id = 9962), 'hello')$$,
  'only the teacher or consultant', 'the admin cannot answer someone else''s thread');
select public.app_chat_mark_read((select id from public.app_chat_threads where staff_id = 9965));
reset role;
select pg_temp.ok((select unread_for_staff from public.app_chat_threads where staff_id = 9965) = 1, 'the admin looking does not mark it read');

-- 5. The student reads; a teacher who leaves the class becomes read only -------
select pg_temp.login('00000000-0000-0000-0000-0000000000d6');
set local role authenticated;
select pg_temp.ok((select unread from public.portal_chat_contacts() where staff_id = 9962) = 1, 'Ali has one unread from Joey');
select public.app_chat_mark_read((select thread_id from public.portal_chat_contacts() where staff_id = 9962));
select pg_temp.ok((select unread from public.portal_chat_contacts() where staff_id = 9962) = 0, 'and reads it');
reset role;

update public.classrooms set teacher_id = 9964 where id = 9971;  -- Tan takes over class A
select pg_temp.login('00000000-0000-0000-0000-0000000000d6');
set local role authenticated;
select pg_temp.ok((select can_send = false from public.portal_chat_contacts() where staff_id = 9962), 'Joey stays in the list, read only');
select pg_temp.ok((select can_send from public.portal_chat_contacts() where staff_id = 9964), 'Tan can be written to');
select pg_temp.fails($$select public.portal_chat_send(9962, 'hi')$$, 'only write to your class', 'and Joey cannot');
reset role;

-- 6. Turning chat off stops sending ------------------------------------------
update public.app_settings set value = '{"enabled": false}' where key = 'app_chat';
select pg_temp.login('00000000-0000-0000-0000-0000000000d2');
set local role authenticated;
select pg_temp.fails($$select public.app_chat_reply((select id from public.app_chat_threads where staff_id = 9962), 'x')$$,
  'not turned on', 'off: staff cannot answer');
reset role;

rollback;
