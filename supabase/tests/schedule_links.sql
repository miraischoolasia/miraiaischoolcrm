-- Checks for 20261025200000_schedule_links.sql, 20261025210000_portal_lesson_zoom_link.sql and
-- 20261025220000_reassign_keeps_co_teacher_lessons.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/schedule_links.sql
-- Every check prints PASS; the first failure stops the run.

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

-- Seed: one class with two teachers' weekly lessons (like EduHero's SCI Form 1).
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000e1'),  -- admin
  ('00000000-0000-0000-0000-0000000000e2'),  -- Angeline, main teacher
  ('00000000-0000-0000-0000-0000000000e3'),  -- Joey, second teacher
  ('00000000-0000-0000-0000-0000000000e4');  -- Kee, takes over from Angeline

insert into public.teachers (id, auth_user_id, username, full_name, role) overriding system value values
  (9501, '00000000-0000-0000-0000-0000000000e1', 'sl_admin', 'Admin', 'admin'),
  (9502, '00000000-0000-0000-0000-0000000000e2', 'sl_angeline', 'Angeline', 'teacher'),
  (9503, '00000000-0000-0000-0000-0000000000e3', 'sl_joey', 'Joey', 'teacher'),
  (9504, '00000000-0000-0000-0000-0000000000e4', 'sl_kee', 'Kee', 'teacher');

insert into public.classrooms (id, name, age_group, program_level, teacher_id) overriding system value values
  (9601, 'SCI Test', '9-11 Years Old', 'Coder Foundation', 9502);
insert into public.classroom_teachers (classroom_id, teacher_id) values (9601, 9502), (9601, 9503)
on conflict do nothing;

-- 1. The two columns ---------------------------------------------------------
insert into public.schedules (id, teacher_id, title, event_type, recurrence_type, day_of_week, start_time, end_time,
                              start_recur, classroom_id, fb_group_url, zoom_link)
  overriding system value values
  (9701, 9502, 'SCI MS ANGELINE', 'regular', 'weekly', 1, '08:15', '09:30', '2026-09-01', 9601,
   'https://www.facebook.com/groups/1', 'https://us06web.zoom.us/j/1'),
  (9702, 9503, 'SAINS MS JOEY', 'regular', 'weekly', 1, '08:15', '09:30', '2026-09-01', 9601,
   'https://www.facebook.com/groups/2', 'https://us06web.zoom.us/j/2');

select pg_temp.ok((select fb_group_url from public.schedules where id = 9701) = 'https://www.facebook.com/groups/1',
  'a weekly lesson keeps its own FB group');
select pg_temp.fails($$update public.schedules set fb_group_url = 'not a link' where id = 9701$$,
  'schedules_fb_group_url_http', 'an FB group that is not a link is refused');
select pg_temp.fails($$update public.schedules set zoom_link = 'zoom.us/j/1 pwd' where id = 9701$$,
  'schedules_zoom_link_http', 'a Zoom link that is not a link is refused');

-- 2. The student app falls back to the lesson's own link before the class's ----
select pg_temp.ok(
  pg_get_functiondef('public.portal_home(bigint)'::regprocedure) ~ 's\.zoom_link,\s+c\.zoom_link\)',
  'portal_home: the lesson''s fixed Zoom link comes before the class''s');

-- 3. Changing the main teacher moves only that teacher's lessons --------------
select pg_temp.login('00000000-0000-0000-0000-0000000000e1');
set local role authenticated;
select public.reassign_classroom_teacher(9601, 9504, '2026-10-26');
reset role;

select pg_temp.ok((select teacher_id from public.schedules where id = 9702) = 9503,
  'the second teacher''s lesson stays with her');
select pg_temp.ok((select end_recur from public.schedules where id = 9701) = date '2026-10-25',
  'the main teacher''s series ends the day before');
select pg_temp.ok(exists (
  select 1 from public.schedules
  where classroom_id = 9601 and teacher_id = 9504 and start_recur = date '2026-10-26'
    and fb_group_url = 'https://www.facebook.com/groups/1' and zoom_link = 'https://us06web.zoom.us/j/1'),
  'the new teacher''s series keeps the FB group and Zoom link');
select pg_temp.ok((select count(*) from public.schedules where classroom_id = 9601) = 3,
  'nothing else was split');

rollback;
