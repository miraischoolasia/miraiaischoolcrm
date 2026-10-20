-- Checks for 20261026200000_class_videos_fast_read.sql, on a database that has it.
-- Read-only in effect: it rolls back. Every check prints PASS; the first failure stops the run.
--   psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/class_videos_fast_read.sql
--
-- 1. The read rule no longer calls a function once per video row.
-- 2. Every staff login with a sign-in sees exactly the videos the old rule showed.
-- 3. One page of videos for a teacher is quick (under 1 second).

begin;

do $t$
declare
  v_qual text;
  v_teacher record;
  v_old bigint;
  v_new bigint;
  v_started timestamptz;
  v_ms numeric;
  v_checked integer := 0;
begin
  select qual into v_qual from pg_policies where tablename = 'class_videos' and policyname = 'class_videos_select_staff';
  if v_qual is null or v_qual ~ 'can_manage_class_videos\(class_videos\.classroom_id\)' then
    raise exception 'FAIL 1: the read rule still runs per video: %', v_qual;
  end if;
  raise notice 'PASS 1 the read rule is worked out once per query';

  for v_teacher in
    select id, auth_user_id from public.teachers where is_active and auth_user_id is not null order by id
  loop
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', v_teacher.auth_user_id, 'role', 'authenticated')::text, true);
    -- The old rule, as the table owner (no row rules).
    select count(*) into v_old from public.class_videos v
    where public.can_view_classes()
       or public.has_permission('videos')
       or v.teacher_id = public.current_teacher_id()
       or public.can_manage_class_videos(v.classroom_id);
    execute 'set local role authenticated';
    select count(*) into v_new from public.class_videos;
    if v_old <> v_new then
      raise exception 'FAIL 2: teacher % saw % videos before, % now', v_teacher.id, v_old, v_new;
    end if;
    v_checked := v_checked + 1;
  end loop;
  execute 'reset role';
  raise notice 'PASS 2 the same videos for all % staff logins', v_checked;

  select id, auth_user_id into v_teacher from public.teachers
  where is_active and auth_user_id is not null and role = 'teacher' order by id limit 1;
  if found then
    perform set_config('request.jwt.claims', json_build_object('sub', v_teacher.auth_user_id, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_started := clock_timestamp();
    perform v.id from public.class_videos v order by v.id limit 1000;
    v_ms := extract(epoch from clock_timestamp() - v_started) * 1000;
    execute 'reset role';
    if v_ms > 1000 then
      raise exception 'FAIL 3: one page took % ms', round(v_ms);
    end if;
    raise notice 'PASS 3 one page for teacher % in % ms', v_teacher.id, round(v_ms);
  end if;
end $t$;

rollback;
