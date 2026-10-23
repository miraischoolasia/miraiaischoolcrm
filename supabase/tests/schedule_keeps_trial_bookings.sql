-- Checks for 20261101700000_schedule_keeps_trial_bookings.sql: a trial slot cannot be edited into days that leave a
-- booking without a class.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/schedule_keeps_trial_bookings.sql

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
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

create function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000000000d1', 'test_skb_admin@example.test', 'authenticated', 'authenticated');
insert into public.teachers (id, full_name, username, role, auth_user_id, is_active)
overriding system value
values (992001, 'SKB Admin', 'test_skb_admin', 'admin', '00000000-0000-0000-0000-0000000000d1', true);

select (timezone('Asia/Kuala_Lumpur', now()))::date as today \gset
-- The next Thursday that is at least 8 days away, and the one after it.
select (:'today'::date + ((4 - extract(dow from :'today'::date)::int + 7) % 7) + 7) as booked_day \gset
select (:'booked_day'::date + 7) as later_day \gset

insert into public.classrooms (id, name, age_group, program_level, teacher_id, category)
overriding system value
values (992001, 'SKB Trial', '9-11 Years Old', 'Coder Foundation', 992001, 'trial');

insert into public.schedules (id, teacher_id, classroom_id, title, event_type, recurrence_type, day_of_week, start_time, end_time, start_recur, end_recur, status)
overriding system value
values (992001, 992001, 992001, 'SKB slot', 'regular', 'weekly', 4, '17:00', '19:00', :'today'::date - 20, null, 'active');

insert into public.trial_bookings (id, schedule_id, booking_date, child_name, child_age)
overriding system value
values (992001, 992001, :'booked_day', 'SKB Child', 9),
       (992002, 992001, :'later_day', 'SKB Child Two', 8);

-- ---------------------------------------------------------------------------------------------
-- A person editing through the API
-- ---------------------------------------------------------------------------------------------

select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;

select pg_temp.fails($$update public.schedules set end_recur = current_date where id = 992001$$, '2 trial bookings would be left without a class', 'an earlier last day that drops two bookings is refused');
select pg_temp.fails($$update public.schedules set start_recur = end_recur_one_day, end_recur = end_recur_one_day from (select (now()::date + 1) as end_recur_one_day) d where id = 992001$$, 'would be left without a class', 'a weekly slot turned into one single day is refused');
select pg_temp.fails($$update public.schedules set day_of_week = 6 where id = 992001$$, 'would be left without a class', 'another weekday is refused');
select pg_temp.fails($$update public.schedules set status = 'cancelled' where id = 992001$$, 'would be left without a class', 'cancelling the slot is refused');
select pg_temp.fails($$update public.schedules set event_type = 'replacement', recurrence_type = 'none', day_of_week = null, scheduled_date = current_date + 30, start_recur = null where id = 992001$$, 'would be left without a class', 'turning it into a one-off class is refused');

select pg_temp.ok((select day_of_week = 4 and end_recur is null and status = 'active' from public.schedules where id = 992001), 'the slot is untouched after the refusals');

-- An end date that still keeps the first booking drops only the second: refused with 1.
select pg_temp.fails(format($$update public.schedules set end_recur = %L where id = 992001$$, :'booked_day'::date), '1 trial booking would be left without a class', 'dropping one booking says one');

-- Edits that keep the bookings are fine.
update public.schedules set end_recur = :'later_day'::date where id = 992001;
select pg_temp.ok((select end_recur = :'later_day'::date from public.schedules where id = 992001), 'an end date that keeps every booking is allowed');
update public.schedules set title = 'SKB slot renamed', start_time = '18:00', end_time = '20:00' where id = 992001;
select pg_temp.ok((select start_time = '18:00' from public.schedules where id = 992001), 'a new time or title is allowed');
update public.schedules set end_recur = null where id = 992001;

-- A booking that was already without a class does not block other edits, and a day with its attendance in stays.
reset role;
insert into public.trial_bookings (id, schedule_id, booking_date, child_name, child_age)
overriding system value
values (992003, 992001, :'booked_day'::date + 1, 'SKB Lost Child', 7);   -- a Friday: no class
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
update public.schedules set end_recur = :'later_day'::date + 70 where id = 992001;
select pg_temp.ok((select end_recur = :'later_day'::date + 70 from public.schedules where id = 992001), 'a booking that already had no class does not block an edit');

reset role;
insert into public.lesson_logs (schedule_id, teacher_id, lesson_date)
values (992001, 992001, :'booked_day'::date);
select pg_temp.login('00000000-0000-0000-0000-0000000000d1');
set local role authenticated;
select pg_temp.fails($$update public.schedules set day_of_week = 6 where id = 992001$$, '1 trial booking would be left without a class', 'only the booking without attendance counts (the day with attendance in stays)');

-- ---------------------------------------------------------------------------------------------
-- The database's own routines are not stopped
-- ---------------------------------------------------------------------------------------------

reset role;
update public.schedules set day_of_week = 6 where id = 992001;
select pg_temp.ok((select day_of_week = 6 from public.schedules where id = 992001), 'an edit by the database itself (hand-over, move) is not blocked');

rollback;
