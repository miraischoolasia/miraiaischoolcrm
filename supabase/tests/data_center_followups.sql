-- Checks for 20261102700000_data_center_followups.sql (needs department 1's 20261102500000_auto_followups.sql).
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/data_center_followups.sql

begin;

create function pg_temp.fails(p_sql text, p_pattern text, p_name text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then
      raise notice 'PASS % [%]', p_name, sqlerrm;
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

insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000012' || lpad(n::text, 2, '0'))::uuid, 'dcf' || n || '@mirai.internal',
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 3) n;
-- 1 Amy and 2 Ben: ECs with the Data Center tick (not admins); 3 nobody.
insert into public.teachers (id, full_name, username, role, is_active, auth_user_id, permissions)
overriding system value values
  (91201, 'DCF Amy', 'dcf_amy', 'staff', true, '00000000-0000-0000-0000-000000001201', '{"data_center": {"level": "view"}}'),
  (91202, 'DCF Ben', 'dcf_ben', 'staff', true, '00000000-0000-0000-0000-000000001202', '{"data_center": {"level": "view"}}'),
  (91203, 'DCF None', 'dcf_none', 'staff', true, '00000000-0000-0000-0000-000000001203', '{}');

create function pg_temp.as_user(p_n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000012' || lpad(p_n::text, 2, '0'), true);
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000012' || lpad(p_n::text, 2, '0'), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function pg_temp.as_user(int) to authenticated;
grant execute on function pg_temp.ok(boolean, text) to authenticated;
grant execute on function pg_temp.fails(text, text, text) to authenticated;

-- March 2020 follow-ups. Amy: 3 due (1 done on time, 1 done late, 1 overdue), 1 cancelled. Ben: 1 done on time.
-- A hand-made follow-up (no step) does not count.
insert into public.calendar_items (kind, title, item_date, assignee_id, is_done, done_at, cancelled_at, followup_round, followup_step) values
  ('task', 'f1', '2020-03-02', 91201, true, '2020-03-02 02:00+00', null, 1, 1),
  ('task', 'f2', '2020-03-03', 91201, true, '2020-03-05 02:00+00', null, 1, 2),
  ('task', 'f3', '2020-03-04', 91201, false, null, null, 1, 3),
  ('task', 'f4', '2020-03-05', 91201, false, null, '2020-03-04 02:00+00', 1, 4),
  ('task', 'f5', '2020-03-06', 91202, true, '2020-03-06 01:00+00', null, 1, 1);
insert into public.calendar_items (kind, title, item_date, assignee_id, is_done) values ('task', 'by hand', '2020-03-07', 91201, false);

set local role authenticated;

select pg_temp.as_user(3);
select pg_temp.fails($$select * from public.data_center_followups('2020-03-01')$$, 'data center tick', 'no tick: no follow-up numbers');

-- Ben (not an admin) sees Amy's numbers too: open ranking.
select pg_temp.as_user(2);
create temporary table dcf as select * from public.data_center_followups('2020-03-15');
select pg_temp.ok((select scheduled = 3 and done = 2 and on_time = 1 and overdue = 1 from dcf where assignee_id = 91201),
  'Amy: 3 due (the cancelled one and the hand-made one left out), 2 done, 1 on time, 1 overdue — seen by Ben');
select pg_temp.ok((select scheduled = 1 and done = 1 and on_time = 1 and overdue = 0 from dcf where assignee_id = 91202), 'Ben: 1 of 1 on time');
select pg_temp.ok((select count(*) = 1 from public.followup_completion where month = '2020-03-01'),
  'department 1''s own view still shows Ben only his own row');
select pg_temp.ok((select count(*) = 0 from public.data_center_followups('2020-04-01') where assignee_id in (91201, 91202)), 'another month: none');

reset role;
rollback;
