-- Checks for 20261102500000_auto_followups.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/auto_followups.sql

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

-- A known schedule for the test: days 1, 2, 4, 10, 30 at 10:00.
insert into public.app_settings (key, value)
values ('followup_schedule', '{"enabled": true, "days": [1, 2, 4, 10, 30], "time": "10:00", "round2_after_days": 14}')
on conflict (key) do update set value = excluded.value;

-- Two staff accounts and an admin. Each gets its own PIC name by itself (20261101300000); without that file, make them.
insert into public.teachers (id, username, full_name, role, is_active) overriding system value
values (99701, 'fu_violet', 'Violet FU', 'staff', true),
       (99702, 'fu_derrick', 'Derrick FU', 'staff', true),
       (99703, 'fu_boss', 'Boss FU', 'admin', true);
insert into public.lead_options (kind, label, teacher_id)
select 'pic', t.full_name, t.id from public.teachers t
where t.id in (99701, 99702) and not exists (select 1 from public.lead_options o where o.kind = 'pic' and o.teacher_id = t.id);
create function pg_temp.pic(p_teacher bigint) returns bigint language sql as $$
  select id from public.lead_options where kind = 'pic' and teacher_id = p_teacher
$$;

-- 1. A new lead gets its five follow-ups, for its PIC's account.
insert into public.leads (id, full_name, phone, status, pic_id, created_at) overriding system value
values (99751, 'FU Family', '60123479751', 'new', pg_temp.pic(99701), timestamptz '2026-11-02 09:00+08');
select pg_temp.ok((select count(*) from public.calendar_items where lead_id = 99751 and followup_step is not null) = 5,
  'a new lead gets five follow-ups');
select pg_temp.ok(
  (select array_agg(item_date order by followup_step) from public.calendar_items where lead_id = 99751)
    = array[date '2026-11-03', date '2026-11-04', date '2026-11-06', date '2026-11-12', date '2026-12-02'],
  'on the 1st, 2nd, 4th, 10th and 30th day');
select pg_temp.ok(
  (select bool_and(assignee_id = 99701 and start_time = time '10:00' and followup_round = 1 and kind = 'task')
   from public.calendar_items where lead_id = 99751),
  'at 10:00, for the PIC''s account, round 1');
select pg_temp.ok((select title from public.calendar_items where lead_id = 99751 and followup_step = 2) = 'Follow up 2/5 · FU Family',
  'named by step and family');

-- 2. A lead that comes in Converted, or by a bulk import that says so, gets none; nor when the school turned it off.
insert into public.leads (id, full_name, phone, status) overriding system value
values (99752, 'FU Converted', '60123479752', 'converted');
select pg_temp.ok(not exists (select 1 from public.calendar_items where lead_id = 99752), 'a converted lead gets none');
select set_config('app.skip_auto_followups', 'on', true);
insert into public.leads (id, full_name, phone, status) overriding system value
values (99753, 'FU Imported', '60123479753', 'new');
select set_config('app.skip_auto_followups', '', true);
select pg_temp.ok(not exists (select 1 from public.calendar_items where lead_id = 99753), 'an import that says so gets none');
update public.app_settings set value = value || '{"enabled": false}' where key = 'followup_schedule';
insert into public.leads (id, full_name, phone, status) overriding system value
values (99754, 'FU Off', '60123479754', 'new');
select pg_temp.ok(not exists (select 1 from public.calendar_items where lead_id = 99754), 'none while the school turned it off');
update public.app_settings set value = value || '{"enabled": true}' where key = 'followup_schedule';

-- 3. Another PIC: what is left goes to the new person; what is done stays.
update public.calendar_items set is_done = true where lead_id = 99751 and followup_step = 1;
select pg_temp.ok((select done_at is not null from public.calendar_items where lead_id = 99751 and followup_step = 1),
  'ticking done keeps the time');
update public.leads set pic_id = pg_temp.pic(99702) where id = 99751;
select pg_temp.ok((select assignee_id from public.calendar_items where lead_id = 99751 and followup_step = 1) = 99701,
  'a done follow-up keeps its person');
select pg_temp.ok(
  (select bool_and(assignee_id = 99702) from public.calendar_items where lead_id = 99751 and followup_step > 1),
  'the open ones go to the new PIC''s account');

-- 4. Moving the 2nd three days later moves the 3rd to 5th too, not the 1st.
update public.calendar_items set item_date = item_date + 3 where lead_id = 99751 and followup_step = 2;
select pg_temp.ok(
  (select array_agg(item_date order by followup_step) from public.calendar_items where lead_id = 99751)
    = array[date '2026-11-03', date '2026-11-07', date '2026-11-09', date '2026-11-15', date '2026-12-05'],
  'the later ones move with it');

-- 5. Lost: what is left is cancelled (kept, not deleted); the done one stays done.
update public.leads set status = 'lost' where id = 99751;
select pg_temp.ok(
  (select count(*) from public.calendar_items where lead_id = 99751 and cancelled_at is not null) = 4
  and (select is_done and cancelled_at is null from public.calendar_items where lead_id = 99751 and followup_step = 1),
  'lost cancels the four open ones');

-- 6. A later round: only its first follow-up, round 2; not while one is still open.
update public.leads set status = 'contacted' where id = 99751;
select pg_temp.ok(public.followup_make_round(99751, date '2026-12-20', true) = 1, 'a later round makes one');
select pg_temp.ok(
  (select followup_round = 2 and followup_step = 1 and item_date = date '2026-12-21' and assignee_id = 99702
   from public.calendar_items where lead_id = 99751 and cancelled_at is null and not is_done),
  'round 2, first step, the next day, for the PIC');
select pg_temp.ok(public.followup_make_round(99751, date '2026-12-20', true) = 0, 'not while one is open');

-- 6b. The parent asked again after 14 days of silence: round 3's first follow-up; not after 3 days; not when converted.
update public.calendar_items set is_done = true where lead_id = 99751 and not is_done and cancelled_at is null;
insert into public.lead_channels (lead_id, channel, chatwoot_contact_id, inbox_id, conversation_id)
values (99751, 'whatsapp', 997510, 1, 997510);
insert into public.inbox_messages (id, conversation_id, inbox_id, message_type, direction, sender_kind, content, created_at)
values (9975101, 997510, 1, 0, 'incoming', 'parent', 'Hi', now() - interval '20 days');
insert into public.inbox_messages (id, conversation_id, inbox_id, message_type, direction, sender_kind, content, created_at)
values (9975102, 997510, 1, 0, 'incoming', 'parent', 'Hello again', now());
select pg_temp.ok(
  (select count(*) from public.calendar_items where lead_id = 99751 and followup_round = 3 and followup_step = 1 and not is_done) = 1,
  'asking again after 20 days opens the next round');
update public.calendar_items set is_done = true where lead_id = 99751 and followup_round = 3;
insert into public.inbox_messages (id, conversation_id, inbox_id, message_type, direction, sender_kind, content, created_at)
values (9975103, 997510, 1, 0, 'incoming', 'parent', 'One more', now() + interval '1 minute');
select pg_temp.ok(not exists (select 1 from public.calendar_items where lead_id = 99751 and followup_round = 4),
  'a message a minute later is the same talk');
update public.leads set status = 'converted' where id = 99751;
insert into public.inbox_messages (id, conversation_id, inbox_id, message_type, direction, sender_kind, content, created_at)
values (9975104, 997510, 1, 0, 'incoming', 'parent', 'Thanks', now() + interval '30 days');
select pg_temp.ok(not exists (select 1 from public.calendar_items where lead_id = 99751 and followup_round = 4),
  'a converted family gets no new round');

-- 7. The bell: due an hour ago rings once for the person and the admin; due three days ago does not ring.
insert into public.leads (id, full_name, phone, status, pic_id) overriding system value
values (99755, 'FU Due', '60123479755', 'new', pg_temp.pic(99701));
update public.calendar_items
set item_date = ((now() - interval '1 hour') at time zone 'Asia/Kuala_Lumpur')::date,
    start_time = ((now() - interval '1 hour') at time zone 'Asia/Kuala_Lumpur')::time
where lead_id = 99755 and followup_step = 1;
update public.calendar_items
set item_date = ((now() - interval '3 days') at time zone 'Asia/Kuala_Lumpur')::date
where lead_id = 99755 and followup_step = 2;
-- (moving step 2 back moved the later ones back too; put them far ahead so they are not due)
update public.calendar_items set item_date = date '2099-01-01' where lead_id = 99755 and followup_step > 2;
select public.notify_due_followups();
select pg_temp.ok(
  (select count(*) from public.staff_notifications where lead_id = 99755 and teacher_id in (99701, 99703)) = 2
  and not exists (select 1 from public.staff_notifications where lead_id = 99755 and teacher_id = 99702),
  'rings for the person and the admin');
select public.notify_due_followups();
select pg_temp.ok((select count(*) from public.staff_notifications where lead_id = 99755 and teacher_id in (99701, 99703)) = 2,
  'rings only once');
select pg_temp.ok((select notified_at is null from public.calendar_items where lead_id = 99755 and followup_step = 2),
  'an old one does not ring');

-- 8. A removed lead (or one joined into another): what is left is cancelled.
delete from public.leads where id = 99755;
select pg_temp.ok(
  (select bool_and(cancelled_at is not null) from public.calendar_items c
   where c.lead_id is null and c.title like '% · FU Due' and not c.is_done),
  'a removed lead''s follow-ups are cancelled');

-- 9. Completion: cancelled ones are not counted.
select pg_temp.ok(
  (select sum(scheduled) from public.followup_completion where assignee_id = 99701)
    = (select count(*) from public.calendar_items where assignee_id = 99701 and followup_step is not null and cancelled_at is null),
  'completion counts only what was not cancelled');

-- 10. Only an admin changes the schedule, and only a valid one.
do $$
begin
  begin
    perform public.set_followup_schedule('{"enabled": true, "days": [1, 2], "time": "10:00", "round2_after_days": 14}');
    raise exception 'FAIL a non-admin changed the schedule';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;
select pg_temp.ok(true, 'only an admin changes the schedule');
select pg_temp.ok(
  public.followup_schedule() ->> 'time' = '10:00' and jsonb_array_length(public.followup_schedule() -> 'days') = 5,
  'the schedule reads with its defaults');

rollback;
