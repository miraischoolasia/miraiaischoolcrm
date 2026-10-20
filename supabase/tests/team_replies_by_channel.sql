-- Checks for 20261026900000_team_replies_by_channel.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -U supabase_admin -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/team_replies_by_channel.sql
-- Every check prints PASS; the first failure stops the run.

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

-- A Malaysian moment of the day three days ago (a finished day that can be kept).
create function pg_temp.at(p_time text) returns timestamptz language sql as $$
  select ((((now() at time zone 'Asia/Kuala_Lumpur')::date - 3) + p_time::time)::timestamp at time zone 'Asia/Kuala_Lumpur');
$$;

create function pg_temp.msg(p_id bigint, p_chat bigint, p_inbox bigint, p_type int, p_kind text, p_staff bigint, p_at timestamptz)
returns void language sql as $$
  insert into public.inbox_messages (id, conversation_id, inbox_id, message_type, sender_kind, staff_id, content, created_at)
  values (p_id, p_chat, p_inbox, p_type::smallint, p_kind, p_staff, 'x', p_at);
$$;

-- Accounts: 1 admin, 2 Amin (sees everybody's Team Replies), 3 Bella (sees only her own).
insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000002' || lpad(n::text, 2, '0'))::uuid, 'tc' || n || '@mirai.internal',
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 3) n;

insert into public.teachers (id, full_name, username, role, is_active, auth_user_id, permissions)
overriding system value
values
  (9201, 'TC Admin', 'tc_admin', 'admin', true, '00000000-0000-0000-0000-000000000201', '{}'),
  (9202, 'Amin', 'tc_amin', 'staff', true, '00000000-0000-0000-0000-000000000202', '{"team_replies": {"level": "view"}}'),
  (9203, 'Bella', 'tc_bella', 'staff', true, '00000000-0000-0000-0000-000000000203', '{"team_replies": {"level": "view", "scope": "own"}}');

create function pg_temp.as_user(p_n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000002' || lpad(p_n::text, 2, '0'), true);
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000002' || lpad(p_n::text, 2, '0'), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function pg_temp.as_user(int) to authenticated;
grant execute on function pg_temp.ok(boolean, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- The day: inbox 5 (a WhatsApp number) and inbox 7 (a Messenger Page).
-- ---------------------------------------------------------------------------------------------------------

insert into public.inbox_chats (conversation_id, inbox_id, status, last_activity_at)
values (90101, 5, 'open', now()), (90102, 5, 'open', now()), (90103, 5, 'open', now()), (90201, 7, 'open', now());

-- Chat 90101: Amin answers after 11 min, the phone after 30 min, the parent's 20:00 message is left.
select pg_temp.msg(9010101, 90101, 5, 0, 'parent', null, pg_temp.at('09:00'));
select pg_temp.msg(9010102, 90101, 5, 0, 'parent', null, pg_temp.at('09:01'));
select pg_temp.msg(9010103, 90101, 5, 1, 'staff', 9202, pg_temp.at('09:11'));
select pg_temp.msg(9010104, 90101, 5, 0, 'parent', null, pg_temp.at('10:00'));
select pg_temp.msg(9010105, 90101, 5, 1, 'phone', null, pg_temp.at('10:30'));
select pg_temp.msg(9010106, 90101, 5, 0, 'parent', null, pg_temp.at('20:00'));
-- A private note and a deleted parent message never count.
insert into public.inbox_messages (id, conversation_id, inbox_id, message_type, sender_kind, content, created_at, private)
values (9010107, 90101, 5, 1, 'staff', 'note', pg_temp.at('20:05'), true);
insert into public.inbox_messages (id, conversation_id, inbox_id, message_type, sender_kind, content, created_at, deleted)
values (9010108, 90101, 5, 0, 'parent', 'gone', pg_temp.at('20:06'), true);
-- Chat 90102: Bella answers after 5 min and marks it Done.
select pg_temp.msg(9010201, 90102, 5, 0, 'parent', null, pg_temp.at('11:00'));
select pg_temp.msg(9010202, 90102, 5, 1, 'staff', 9203, pg_temp.at('11:05'));
insert into public.inbox_chat_done (conversation_id, inbox_id, done_at, source) values (90102, 5, pg_temp.at('11:06'), 'live');
-- Chat 90103: Amin writes first (nobody waiting); Done at 14:00, and again at 15:00 (counts once).
select pg_temp.msg(9010301, 90103, 5, 1, 'staff', 9202, pg_temp.at('13:00'));
insert into public.inbox_chat_done (conversation_id, inbox_id, done_at, source)
values (90103, 5, pg_temp.at('14:00'), 'live'), (90103, 5, pg_temp.at('15:00'), 'live');
-- Chat 90201 (Messenger): the automation answers after 30 s.
select pg_temp.msg(9020101, 90201, 7, 0, 'parent', null, pg_temp.at('12:00'));
select pg_temp.msg(9020102, 90201, 7, 1, 'automation', null, pg_temp.at('12:00:30'));

select public.team_reply_compute_day((now() at time zone 'Asia/Kuala_Lumpur')::date - 3, 'manual');

select pg_temp.ok(
  (select incoming_messages = 5 and incoming_chat_ids = '{90101,90102}' and replied_chat_ids = '{90102}'
     and done_chat_ids = '{90102,90103}' and first_waits = '{300,660}' and duty_first_waits = '{300,660}'
   from public.team_channel_days where inbox_id = 5),
  'WhatsApp inbox 5: 5 messages in 2 chats, 1 answered, 2 Done, first waits 5 and 11 min'
);
select pg_temp.ok(
  (select incoming_messages = 1 and incoming_chat_ids = '{90201}' and replied_chat_ids = '{90201}'
     and done_chat_ids = '{}' and first_waits = '{30}'
   from public.team_channel_days where inbox_id = 7),
  'Messenger inbox 7 is counted on its own'
);
select pg_temp.ok((select count(*) = 2 from public.team_channel_days), 'one row per channel and day');

select pg_temp.ok(
  (select replies = 2 and chat_ids = '{90101,90103}' and waits = '{660}' and done_chat_ids = '{90103}'
   from public.team_reply_days where replier = 'staff:9202' and inbox_id = 5),
  'Amin: 2 replies in inbox 5, one wait, Done of 90103 is his (last message before Done)'
);
select pg_temp.ok(
  (select replies = 1 and waits = '{300}' and done_chat_ids = '{90102}'
   from public.team_reply_days where replier = 'staff:9203' and inbox_id = 5),
  'Bella: Done of 90102 is hers'
);
select pg_temp.ok(
  (select replies = 1 and waits = '{1800}' and within_target = 1 from public.team_reply_days where replier = 'phone' and inbox_id = 5),
  'the phone''s reply waits 30 min (within target)'
);
select pg_temp.ok(
  (select replies = 1 and waits = '{30}' from public.team_reply_days where replier = 'automation' and inbox_id = 7),
  'the automation''s reply is in inbox 7'
);
select pg_temp.ok(
  (select replies = 5 and chats_read = 4 from public.team_reply_day_runs where day = (now() at time zone 'Asia/Kuala_Lumpur')::date - 3),
  'the day run still adds every channel together'
);

-- Working it out again gives the same rows.
select public.team_reply_compute_day((now() at time zone 'Asia/Kuala_Lumpur')::date - 3, 'manual');
select pg_temp.ok((select count(*) = 4 from public.team_reply_days) and (select count(*) = 2 from public.team_channel_days),
  'working a day out twice changes nothing');

-- ---------------------------------------------------------------------------------------------------------
-- Done is written down as the copy sees it.
-- ---------------------------------------------------------------------------------------------------------

update public.inbox_chats set status = 'resolved' where conversation_id = 90101;
select pg_temp.ok(
  (select count(*) = 1 and min(source) = 'live' and min(done_at) > now() - interval '1 minute'
   from public.inbox_chat_done where conversation_id = 90101),
  'a chat turning Done is written down now'
);
update public.inbox_chats set status = 'resolved', unread_count = 2 where conversation_id = 90101;
select pg_temp.ok((select count(*) = 1 from public.inbox_chat_done where conversation_id = 90101), 'staying Done is not a new Done');
update public.inbox_chats set status = 'open' where conversation_id = 90101;
update public.inbox_chats set status = 'resolved' where conversation_id = 90101;
select pg_temp.ok((select count(*) = 2 from public.inbox_chat_done where conversation_id = 90101), 'Done again after reopening is written down');
insert into public.inbox_chats (conversation_id, inbox_id, status, last_activity_at) values (90104, 5, 'resolved', pg_temp.at('16:00'));
select pg_temp.ok(
  (select source = 'copy' and done_at = pg_temp.at('16:00') from public.inbox_chat_done where conversation_id = 90104),
  'a chat copied in already Done counts at its last message'
);

-- ---------------------------------------------------------------------------------------------------------
-- Who sees what.
-- ---------------------------------------------------------------------------------------------------------

-- Today: a parent writes to inbox 5 and Bella answers.
select pg_temp.msg(9010501, 90105, 5, 0, 'parent', null, now() - interval '20 minutes');
select pg_temp.msg(9010502, 90105, 5, 1, 'staff', 9203, now() - interval '10 minutes');

select pg_temp.as_user(1);
set local role authenticated;
select pg_temp.ok((select count(*) = 2 from public.team_channel_days), 'admin reads the channel days');
select pg_temp.ok(
  (select incoming_messages = 1 and replied_chat_ids = '{90105}' and first_waits = '{600}' from public.team_channel_today() where inbox_id = 5),
  'admin: today''s channel numbers'
);
select pg_temp.ok(
  (select inbox_id = 5 and replies = 1 from public.team_reply_today() where replier = 'staff:9203'),
  'today''s staff rows carry the channel'
);
reset role;

select pg_temp.as_user(2);
set local role authenticated;
select pg_temp.ok((select count(*) = 2 from public.team_channel_days), 'Amin (everybody) reads the channel days');
select pg_temp.ok((select count(*) = 1 from public.team_channel_today()), 'Amin (everybody) reads today''s channel numbers');
reset role;

select pg_temp.as_user(3);
set local role authenticated;
select pg_temp.ok((select count(*) = 0 from public.team_channel_days), 'Bella (own rows) does not read the whole channel days');
select pg_temp.ok((select count(*) = 0 from public.team_channel_today()), 'Bella (own rows) gets no channel numbers today');
select pg_temp.ok(
  (select count(*) = 1 and bool_and(replier = 'staff:9203') from public.team_reply_days),
  'Bella still reads her own rows, split by channel'
);
select pg_temp.ok(
  not exists (select 1 from information_schema.role_table_grants where table_name = 'inbox_chat_done' and grantee = 'authenticated'),
  'nobody signed in reads inbox_chat_done directly'
);
reset role;

rollback;
