-- Checks for 20261027500000_video_grants.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/video_grants.sql

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

-- Seed: one topic (SCI, 9-11) taught by two teachers in two classes, the same subject one age up,
-- and a class with no subject.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000c1'),  -- admin
  ('00000000-0000-0000-0000-0000000000c2'),  -- teacher Joey
  ('00000000-0000-0000-0000-0000000000c3'),  -- staff who may edit students
  ('00000000-0000-0000-0000-0000000000c4');  -- teacher Angeline, who may also edit students

insert into public.teachers (id, auth_user_id, username, full_name, role) overriding system value values
  (9861, '00000000-0000-0000-0000-0000000000c1', 'vg_admin', 'Admin', 'admin'),
  (9862, '00000000-0000-0000-0000-0000000000c2', 'vg_joey', 'Joey', 'teacher');
insert into public.teachers (id, auth_user_id, username, full_name, role, permissions) overriding system value values
  (9863, '00000000-0000-0000-0000-0000000000c3', 'vg_staff', 'Crystal', 'staff', '{"students": {"level": "edit"}}'),
  (9864, '00000000-0000-0000-0000-0000000000c4', 'vg_angeline', 'Angeline', 'teacher', '{"students": {"level": "edit"}}');

insert into public.subjects (id, name) overriding system value values (9871, 'SCI test');

insert into public.classrooms (id, name, age_group, program_level, teacher_id, subject_id) overriding system value values
  (9881, 'SCI 9-11 · Joey', '9-11 Years Old', 'Coder Foundation', 9862, 9871),
  (9882, 'SCI 9-11 · Angeline', '9-11 Years Old', 'Coder Foundation', 9864, 9871),
  (9883, 'SCI 12-14', '12-14 Years Old', 'Coder Foundation', 9864, 9871),
  (9884, 'Robotics club', '9-11 Years Old', 'Coder Foundation', 9862, null);

insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, classroom_id)
  overriding system value values
  (9891, 'Ali', 0, '2099-12-31', '2099-12-31', '2099-12-31', 9881),
  (9892, 'Siti', 0, '2099-12-31', '2099-12-31', '2099-12-31', 9882);
update public.student_classroom_periods set start_date = '2026-01-01' where student_id in (9891, 9892);

insert into public.class_videos (id, classroom_id, teacher_id, title, year, month, bunny_library_id, bunny_video_id) overriding system value values
  (9901, 9881, 9862, 'Joey Oct', 2026, 10, '1', 'vg-a'),
  (9902, 9882, 9864, 'Angeline Oct', 2026, 10, '1', 'vg-b'),
  (9903, 9883, 9864, 'Older Oct', 2026, 10, '1', 'vg-c'),
  (9904, 9884, 9862, 'Club Oct', 2026, 10, '1', 'vg-d'),
  (9905, 9881, 9862, 'Joey Nov', 2026, 11, '1', 'vg-e');

-- 1. Month access off (Mirai): own classes, as before -----------------------
update public.app_settings set value = '{"month_access": false}' where key = 'class_videos';
select pg_temp.ok(public.student_can_watch_video(9891, 9901) and not public.student_can_watch_video(9891, 9902),
  'month access off: a child sees their own class''s videos only');

-- 2. Month access on: age group x subject x month, any class or teacher -----
update public.app_settings set value = '{"month_access": true}' where key = 'class_videos';
select pg_temp.ok(not public.student_can_watch_video(9891, 9901), 'month access on: nothing until staff ticks it');

select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
set local role authenticated;
select pg_temp.fails($$select public.set_student_video_grants(array[9891]::bigint[], '9-11 Years Old', 9871, null, '[{"year":2026,"month":10}]', true)$$,
  'only staff', 'a teacher cannot open recordings');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000c4');
set local role authenticated;
select pg_temp.fails($$select public.set_student_video_grants(array[9891]::bigint[], '9-11 Years Old', 9871, null, '[{"year":2026,"month":10}]', true)$$,
  'only staff', 'a teacher who may edit students still cannot open recordings');
reset role;

select pg_temp.login('00000000-0000-0000-0000-0000000000c3');
set local role authenticated;
select pg_temp.ok(public.set_student_video_grants(array[9891, 9892]::bigint[], '9-11 Years Old', 9871, null, '[{"year":2026,"month":10}]', true) = 2,
  'staff opens October of SCI 9-11 for two children at once');
select pg_temp.ok(public.set_student_video_grants(array[9891]::bigint[], '12-14 Years Old', 9871, null, '[{"year":2026,"month":10}]', true) = 1,
  'and an older age group for one of them');
select pg_temp.fails($$select public.set_student_video_grants(array[9891]::bigint[], null, null, 9881, '[{"year":2026,"month":10}]', true)$$,
  'has a subject', 'a class with a subject is opened by its topic, not on its own');
select pg_temp.ok(public.set_student_video_grants(array[9891]::bigint[], null, null, 9884, '[{"year":2026,"month":10}]', true) = 1,
  'a class with no subject is opened on its own');
reset role;

select pg_temp.ok(public.student_can_watch_video(9891, 9901) and public.student_can_watch_video(9891, 9902),
  'the child sees October from both teachers of the topic');
select pg_temp.ok(public.student_can_watch_video(9891, 9903), 'and the older age group they were given');
select pg_temp.ok(public.student_can_watch_video(9891, 9904), 'and the no-subject class they were given');
select pg_temp.ok(not public.student_can_watch_video(9891, 9905), 'but not November, which is not ticked');
select pg_temp.ok(not public.student_can_watch_video(9892, 9903), 'the other child does not get the older age group');

-- 3. Leaving closes that topic only; a move between teachers keeps it ------
-- Siti moves from Angeline's class to Joey's (same topic): nothing closes.
insert into public.student_classroom_periods (student_id, classroom_id, start_date) values (9892, 9881, '2026-10-20');
update public.student_classroom_periods set end_date = '2026-10-19' where student_id = 9892 and classroom_id = 9882 and end_date is null;
set constraints all immediate;
set constraints all deferred;
select pg_temp.ok((select ends_on from public.student_video_grants where student_id = 9892 and subject_id = 9871 and year = 2026 and month = 10) is null,
  'a move to another teacher of the same topic keeps the months');

-- Ali stops SCI 9-11: that topic closes from the stop day, the older age group stays.
update public.student_classroom_periods set end_date = '2026-10-25' where student_id = 9891 and classroom_id = 9881 and end_date is null;
set constraints all immediate;
set constraints all deferred;
select pg_temp.ok((select ends_on from public.student_video_grants where student_id = 9891 and age_group = '9-11 Years Old' and subject_id = 9871 and month = 10) = date '2026-10-25',
  'stopping a class closes its age group x subject from the stop day');
select pg_temp.ok((select ends_on from public.student_video_grants where student_id = 9891 and age_group = '12-14 Years Old') is null,
  'months of another age group ticked by staff stay open');

-- 4. Closing months ------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000c3');
set local role authenticated;
select pg_temp.ok(public.set_student_video_grants(array[9892]::bigint[], '9-11 Years Old', 9871, null, '[{"year":2026,"month":10}]', false) = 1,
  'staff closes a month again');
reset role;
select pg_temp.ok(not public.student_can_watch_video(9892, 9901), 'and the child no longer sees it');

rollback;
