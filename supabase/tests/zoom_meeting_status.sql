-- Checks for 20261031700000_zoom_meeting_status.sql: Zoom meeting status + events, and weekly repeat on the calendar.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/zoom_meeting_status.sql

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
values ('00000000-0000-0000-0000-0000000000c1', 'test_zms_admin@example.test', 'authenticated', 'authenticated'),
       ('00000000-0000-0000-0000-0000000000c2', 'test_zms_plain@example.test', 'authenticated', 'authenticated');
insert into public.teachers (id, full_name, username, role, auth_user_id, is_active)
overriding system value
values (991001, 'ZMS Admin', 'test_zms_admin', 'admin', '00000000-0000-0000-0000-0000000000c1', true),
       (991002, 'ZMS Plain', 'test_zms_plain', 'teacher', '00000000-0000-0000-0000-0000000000c2', true);
insert into public.lead_stages (key, label) values ('new', 'New') on conflict do nothing;
insert into public.leads (id, full_name, phone, status, children)
overriding system value
values (991001, 'ZMS Parent', '60123450991', 'new', '[]'::jsonb);

select (timezone('Asia/Kuala_Lumpur', now()))::date as today \gset

-- ---------------------------------------------------------------------------------------------
-- 1. Meeting status and events
-- ---------------------------------------------------------------------------------------------

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;

insert into public.lead_zoom_meetings (lead_id, starts_at, link, status)
values (991001, now() + interval '2 days', 'https://zoom.example/j/1', 'completed')
returning id as mid \gset

select pg_temp.ok((select status = 'scheduled' and completed_at is null and cancelled_at is null
  from public.lead_zoom_meetings where id = :mid), 'a new meeting is always scheduled');
select pg_temp.ok((select count(*) = 1 and min(event) = 'created' from public.lead_zoom_meeting_events where meeting_id = :mid),
  'creating it writes a created event');

update public.lead_zoom_meetings set starts_at = starts_at + interval '1 day' where id = :mid;
select pg_temp.ok((select count(*) = 1 and bool_and(previous_starts_at is not null and previous_starts_at < starts_at)
  from public.lead_zoom_meeting_events where meeting_id = :mid and event = 'rescheduled'), 'a new time writes a rescheduled event with the old time');

update public.lead_zoom_meetings set status = 'completed' where id = :mid;
select pg_temp.ok((select status = 'completed' and completed_at is not null and cancelled_at is null
  from public.lead_zoom_meetings where id = :mid), 'complete stamps completed_at');
select pg_temp.ok((select count(*) = 1 from public.lead_zoom_meeting_events where meeting_id = :mid and event = 'completed'), 'a completed event is written');

update public.lead_zoom_meetings set status = 'scheduled' where id = :mid;
select pg_temp.ok((select completed_at is null and cancelled_at is null from public.lead_zoom_meetings where id = :mid), 'back to scheduled clears the stamps');
select pg_temp.ok((select count(*) = 1 from public.lead_zoom_meeting_events where meeting_id = :mid and event = 'reopened'), 'a reopened event is written');

update public.lead_zoom_meetings set status = 'cancelled' where id = :mid;
select pg_temp.ok((select status = 'cancelled' and cancelled_at is not null and completed_at is null
  from public.lead_zoom_meetings where id = :mid), 'cancel stamps cancelled_at');
select pg_temp.ok((select count(*) = 1 from public.lead_zoom_meeting_events where meeting_id = :mid and event = 'cancelled'), 'a cancelled event is written');

update public.lead_zoom_meetings set link = 'https://zoom.example/j/2' where id = :mid;
select pg_temp.ok((select count(*) = 5 from public.lead_zoom_meeting_events where meeting_id = :mid), 'a link change alone writes no event');

reset role;
select pg_temp.ok(not exists (select 1 from automation.zoom_meetings where id = :mid), 'Automations no longer see a cancelled meeting');
update public.lead_zoom_meetings set status = 'scheduled' where id = :mid;
select pg_temp.ok(exists (select 1 from automation.zoom_meetings where id = :mid), 'and see it again once it is scheduled');
select pg_temp.ok((select count(*) = 6 from automation.zoom_meeting_events where meeting_id = :mid), 'the events view lists the history');

-- A person without the Leads tick cannot change a meeting.
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
set local role authenticated;
with changed as (update public.lead_zoom_meetings set status = 'completed' where id = :mid returning 1)
select count(*) as n_changed from changed \gset
select pg_temp.ok(:n_changed = 0, 'someone without the Leads tick changes nothing');
reset role;

-- ---------------------------------------------------------------------------------------------
-- 2. Weekly repeat
-- ---------------------------------------------------------------------------------------------

select count(*) as expected_weekdays
from generate_series(:'today'::date, :'today'::date + 84, interval '1 day') g
where extract(isodow from g) between 1 and 5 \gset

select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;

select public.calendar_series_create('meeting', 'ZMS weekly Zoom', null, :'today'::date, array[1,2,3,4,5]::smallint[],
  '20:00', '21:00', null, 991001, null) as sid \gset

select pg_temp.ok((select count(*) = :expected_weekdays from public.calendar_items where series_id = :sid),
  'a series with no end is written 12 weeks ahead on its weekdays');
select pg_temp.ok((select bool_and(extract(isodow from item_date) between 1 and 5 and series_date = item_date
  and start_time = '20:00' and assignee_id = 991001 and kind = 'meeting') from public.calendar_items where series_id = :sid),
  'every occurrence has the series time, person and kind');
select pg_temp.ok(public.calendar_series_extend(:sid) = 0, 'extending again writes nothing new');

-- One occurrence deleted on its own stays deleted.
select min(id) as one_id, min(item_date) as one_date from public.calendar_items where series_id = :sid \gset
delete from public.calendar_items where id = :one_id;
select pg_temp.ok(public.calendar_series_extend(:sid) = 0, 'a deleted occurrence is not written again');
select pg_temp.ok((select :'one_date'::date = any (skipped_dates) from public.calendar_item_series where id = :sid), 'it is remembered as skipped');

-- A ticked-off occurrence is left alone by "all upcoming".
select id as done_id, item_date as done_date from public.calendar_items where series_id = :sid order by item_date offset 1 limit 1 \gset
update public.calendar_items set is_done = true where id = :done_id;
select public.calendar_series_update(:sid, '{"title":"ZMS renamed","start_time":"19:30","end_time":"20:30"}'::jsonb);
select pg_temp.ok((select count(*) = :expected_weekdays - 1 - 1 from public.calendar_items
  where series_id = :sid and title = 'ZMS renamed' and start_time = '19:30'), 'all upcoming take the new title and time');
select pg_temp.ok((select title = 'ZMS weekly Zoom' from public.calendar_items where id = :done_id), 'a ticked-off occurrence is not changed');

-- Other weekdays: the coming ones are written again on the new days only.
select public.calendar_series_update(:sid, '{"weekdays":[1,3]}'::jsonb);
select pg_temp.ok((select count(*) filter (where not is_done) > 0 and bool_and(extract(isodow from item_date) in (1, 3) or is_done)
  from public.calendar_items where series_id = :sid), 'new weekdays replace the coming occurrences');
select pg_temp.ok((select count(*) = (select count(*) from generate_series(:'today'::date, :'today'::date + 84, interval '1 day') g where extract(isodow from g) in (1, 3))
  + (case when extract(isodow from :'done_date'::date) in (1, 3) then 0 else 1 end)
  from public.calendar_items where series_id = :sid), 'the count matches Monday and Wednesday (plus the ticked-off one)');

-- Delete this and the following from a later day: earlier days stay, the series ends the day before.
select (:'today'::date + 28) as cut \gset
select count(*) as before_cut from public.calendar_items where series_id = :sid and item_date < :'cut'::date \gset
select public.calendar_series_delete(:sid, :'cut'::date);
select pg_temp.ok((select count(*) = :before_cut from public.calendar_items where series_id = :sid), 'delete following keeps the days before');
select pg_temp.ok((select until_date = :'cut'::date - 1 from public.calendar_item_series where id = :sid), 'and ends the series the day before');
select pg_temp.ok(public.calendar_series_extend(:sid) = 0, 'the daily top-up does not bring it back');

-- Delete from the start: the series goes; nothing is left to repeat.
select public.calendar_series_delete(:sid, :'today'::date);
select pg_temp.ok(not exists (select 1 from public.calendar_item_series where id = :sid), 'deleting from the first day removes the series');
select pg_temp.ok(not exists (select 1 from public.calendar_items where series_id = :sid), 'and its occurrences');

-- Only someone who may edit the calendar can create one.
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c2');
set local role authenticated;
select pg_temp.fails($$select public.calendar_series_create('meeting', 'ZMS nope', null, current_date, array[1]::smallint[], null, null, null, null, null)$$,
  'not allowed', 'someone without the calendar tick cannot create a series');
reset role;

-- A series with an end date stops there.
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');
set local role authenticated;
select public.calendar_series_create('task', 'ZMS short', null, :'today'::date, array[1,2,3,4,5,6,7]::smallint[], null, null, null, null, :'today'::date + 6) as sid2 \gset
select pg_temp.ok((select count(*) = 7 and max(item_date) = :'today'::date + 6 from public.calendar_items where series_id = :sid2), 'a series with an end date stops on it');
reset role;

rollback;
