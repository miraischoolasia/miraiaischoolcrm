-- Checks for 20261029300000_student_inbox (docs/student-inbox-spec.md).
-- Run on a scratch database that has every migration (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/student_inbox.sql
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

-- Accounts: 1 admin, 2 Sara (Student Inbox edit), 3 Mark (Inbox edit), 4 Bo (both, view), 5 Nia (Student Inbox
-- edit, but the locked students number is not given to her).
insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000002' || lpad(n::text, 2, '0'))::uuid, 'si' || n || '@mirai.internal',
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 5) n;

insert into public.teachers (id, full_name, username, role, is_active, auth_user_id, permissions)
overriding system value
values
  (9201, 'SI Admin', 'si_admin', 'admin', true, '00000000-0000-0000-0000-000000000201', '{}'),
  (9202, 'Sara', 'si_sara', 'staff', true, '00000000-0000-0000-0000-000000000202', '{"student_inbox": {"level": "edit"}}'),
  (9203, 'Mark', 'si_mark', 'staff', true, '00000000-0000-0000-0000-000000000203', '{"inbox": {"level": "edit"}}'),
  (9204, 'Bo', 'si_bo', 'staff', true, '00000000-0000-0000-0000-000000000204',
    '{"inbox": {"level": "view"}, "student_inbox": {"level": "view"}}'),
  (9205, 'Nia', 'si_nia', 'staff', true, '00000000-0000-0000-0000-000000000205', '{"student_inbox": {"level": "edit"}}');

create function pg_temp.as_user(p_n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000002' || lpad(p_n::text, 2, '0'), true);
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000002' || lpad(p_n::text, 2, '0'), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function pg_temp.as_user(int) to authenticated;
grant execute on function pg_temp.ok(boolean, text) to authenticated;
grant execute on function pg_temp.fails(text, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- The tick and the zones.
-- ---------------------------------------------------------------------------------------------------------

select pg_temp.ok(public.valid_account_permissions('{"student_inbox": {"level": "edit", "delete": true}}'), 'student_inbox tick is valid');
select pg_temp.ok(not public.valid_account_permissions('{"student_inbox": {"level": "view", "scope": "own"}}'), 'student_inbox has no own scope');
select pg_temp.ok((select (effective_permissions -> 'student_inbox' ->> 'level') = 'edit' from public.teachers where id = 9202), 'Sara has the tick');

select pg_temp.ok(not exists (select 1 from public.inbox_channels where zone <> 'marketing'), 'every channel that existed is marketing');
select pg_temp.ok(not exists (select 1 from public.whatsapp_numbers where zone <> 'marketing'), 'every number that existed is marketing');

insert into public.whatsapp_numbers (id, label, chatwoot_inbox_id, evolution_instance, zone)
overriding system value
values (9250, 'Student line', 950, 'eduhero-9', 'students'),
       (9251, 'Sales line', 951, 'eduhero-8', 'marketing');

select pg_temp.ok((select zone = 'students' and access = 'limited' from public.inbox_channels where chatwoot_inbox_id = 950),
  'a new students number becomes a locked students channel');
select pg_temp.ok((select zone = 'marketing' from public.inbox_channels where chatwoot_inbox_id = 951), 'a marketing number stays marketing');

update public.whatsapp_numbers set zone = 'students' where id = 9251;
select pg_temp.ok((select zone = 'students' from public.inbox_channels where chatwoot_inbox_id = 951), 'changing the zone follows onto the channel');
update public.whatsapp_numbers set zone = 'marketing' where id = 9251;
select pg_temp.ok((select zone = 'marketing' from public.inbox_channels where chatwoot_inbox_id = 951), 'and back');

select pg_temp.fails(
  $$insert into public.inbox_channels (chatwoot_inbox_id, kind, label, zone) values (952, 'messenger', 'Page', 'students')$$,
  'inbox_channels_zone_check', 'only a WhatsApp channel can be a students channel'
);
select pg_temp.fails(
  $$update public.whatsapp_numbers set zone = 'teachers' where id = 9250$$,
  'whatsapp_numbers_zone_check', 'unknown zone refused'
);

-- Who works the two numbers.
insert into public.inbox_channel_access (chatwoot_inbox_id, teacher_id, level) values
  (950, 9202, 'reply'), (950, 9204, 'view'),
  (951, 9203, 'reply'), (951, 9204, 'view');

-- One chat on each number.
insert into public.inbox_chats (conversation_id, inbox_id, channel, contact_id, contact_name, status, last_activity_at)
values (97001, 950, 'whatsapp', 98001, 'Student parent', 'open', now()),
       (97002, 951, 'whatsapp', 98002, 'New lead', 'open', now());
insert into public.inbox_messages (id, conversation_id, inbox_id, message_type, sender_kind, content, created_at)
values (99001, 97001, 950, 0, 'parent', 'Is there class tomorrow?', now()),
       (99002, 97002, 951, 0, 'parent', 'How much is the trial?', now());

-- ---------------------------------------------------------------------------------------------------------
-- What each person sees and may do.
-- ---------------------------------------------------------------------------------------------------------

set local role authenticated;

select pg_temp.as_user(2);
select pg_temp.ok((select array_agg(conversation_id order by conversation_id) = array[97001]::bigint[] from public.inbox_chats where conversation_id in (97001, 97002)),
  'Sara (Student Inbox) sees the students chat only');
select pg_temp.ok((select array_agg(id order by id) = array[99001]::bigint[] from public.inbox_messages where id in (99001, 99002)),
  'Sara sees the students messages only');
select pg_temp.ok(public.inbox_conversation_access(97001) = 'reply', 'Sara may reply in the students chat');
select pg_temp.ok(public.inbox_conversation_access(97002) = 'none', 'Sara may not touch the marketing chat');
select pg_temp.ok(public.can_read_inbox(950) and not public.can_read_inbox(951), 'can_read_inbox follows the zone for Sara');
select pg_temp.ok(public.chat_may_schedule(950) and not public.chat_may_schedule(951), 'Sara may set Follow up on the students number only');
select pg_temp.ok(950 = any (public.student_zone_inbox_ids()), 'the page learns which channels are students ones');
select pg_temp.ok(exists (select 1 from public.whatsapp_numbers where id = 9250), 'Sara reads the numbers list');
select pg_temp.ok(exists (select 1 from public.inbox_channels where chatwoot_inbox_id = 950), 'Sara reads the channels list');
insert into public.quick_replies (title, messages) values ('Class reminder', array['See you tomorrow']);
select pg_temp.ok(exists (select 1 from public.quick_replies where title = 'Class reminder'), 'Sara may write a school quick reply');

select pg_temp.as_user(3);
select pg_temp.ok((select array_agg(conversation_id order by conversation_id) = array[97002]::bigint[] from public.inbox_chats where conversation_id in (97001, 97002)),
  'Mark (Inbox) sees the marketing chat only');
select pg_temp.ok(not exists (select 1 from public.inbox_messages where id = 99001), 'Mark does not see the students messages');
select pg_temp.ok(public.inbox_conversation_access(97001) = 'none', 'Mark may not touch the students chat');
select pg_temp.ok(public.inbox_conversation_access(97002) = 'reply', 'Mark still replies in the marketing chat');
select pg_temp.ok(950 = any (public.my_hidden_inbox_ids()), 'the students number is hidden from Mark');
select pg_temp.ok(not public.chat_may_schedule(950), 'Mark may not set Follow up on the students number');

select pg_temp.as_user(4);
select pg_temp.ok((select count(*) = 2 from public.inbox_chats where conversation_id in (97001, 97002)), 'Bo (both ticks) sees both chats');
select pg_temp.ok(public.inbox_conversation_access(97001) = 'view' and public.inbox_conversation_access(97002) = 'view', 'Bo may only look');

select pg_temp.as_user(5);
select pg_temp.ok(not exists (select 1 from public.inbox_chats where conversation_id in (97001, 97002)), 'Nia: the locked students number is not given to her');
select pg_temp.ok(public.inbox_conversation_access(97001) = 'none', 'Nia may not reply in it');

select pg_temp.as_user(1);
select pg_temp.ok((select count(*) = 2 from public.inbox_chats where conversation_id in (97001, 97002)), 'the admin sees both');
select pg_temp.ok(public.inbox_conversation_access(97001) = 'reply', 'the admin replies everywhere');

reset role;

-- ---------------------------------------------------------------------------------------------------------
-- chat-activity: family, never a lead; no enrolment automations.
-- ---------------------------------------------------------------------------------------------------------

select webhook_key as key from public.chat_webhook_settings limit 1 \gset

insert into public.students (id, full_name, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, phone, second_parent_phone, is_active)
overriding system value
values (9291, 'Ali SI', current_date + 30, current_date + 30, current_date + 30, '0123450001', null, true),
       (9292, 'Mei SI', current_date + 30, current_date + 30, current_date + 30, '0123450002', '0198880003', true);

select count(*) as leads_before from public.leads \gset

select pg_temp.fails(
  $$select public.student_chat_from_webhook('wrong-key-0000000000', 950, 1, null, null)$$,
  'key is not right', 'a wrong key is refused'
);

select pg_temp.ok(public.student_chat_from_webhook(:'key', 951, 98002, '+60 12-345 0009', 'New lead') = 'marketing',
  'a marketing number answers marketing');
select pg_temp.ok(not exists (select 1 from public.people where chatwoot_contact_id = 98002), 'nothing is done for a marketing chat');
select pg_temp.ok(public.student_chat_from_webhook(:'key', null, 98003, null, null) = 'marketing', 'no inbox = marketing');

select pg_temp.ok(public.student_chat_from_webhook(:'key', 950, 98001, '+60 12-345 0001', 'Ali mum') = 'students',
  'a students number answers students');
select pg_temp.ok(exists (
  select 1 from public.people p
  where p.chatwoot_contact_id = 98001 and p.kind in ('parent', 'student')
    and (p.student_id = 9291 or exists (select 1 from public.people c where c.parent_id = p.id and c.student_id = 9291))
), 'the chat is tied to the family of the student with that phone');

select pg_temp.ok(public.student_chat_from_webhook(:'key', 950, 98004, '60198880003', 'Mei dad') = 'students',
  'second parent chat answers students');
select pg_temp.ok((select kind = 'parent' from public.people where chatwoot_contact_id = 98004), 'the second parent''s phone makes a parent');

select pg_temp.ok(public.student_chat_from_webhook(:'key', 950, 98005, '60177777777', 'Stranger') = 'students', 'unknown number on a students number');
select pg_temp.ok((select kind = 'contact' from public.people where chatwoot_contact_id = 98005), 'an unknown number stays a plain contact');

select pg_temp.ok(public.student_chat_from_webhook(:'key', 950, 98001, '+60 12-345 0001', 'Ali mum') = 'students', 'asking again changes nothing');
select pg_temp.ok((select count(*) from public.leads) = :leads_before, 'no lead was made');

-- A parent message on the students number is not kept for the automations (record_chat_message keeps them only
-- while a flow waits or listens for a keyword, so the rows are written here directly); the chat's times still are.
select public.record_chat_message(:'key', 97001, 98001, 'incoming', now(), 'Ali mum', '60123450001', false, 'Is there class tomorrow?');
insert into public.chat_messages (conversation_id, contact_id, at, body, channel)
values (97001, 98001, now(), 'Is there class tomorrow?', 'whatsapp'),
       (97002, 98002, now(), 'How much is the trial?', 'whatsapp');
select pg_temp.ok(not exists (select 1 from public.chat_messages where conversation_id = 97001), 'students chat messages do not reach the automations');
select pg_temp.ok(exists (select 1 from public.chat_messages where conversation_id = 97002), 'marketing chat messages still do');
select pg_temp.ok(exists (select 1 from public.chat_activity where conversation_id = 97001 and last_direction = 'incoming'),
  'the students chat still records when the parent wrote (Follow up cancels on reply)');

rollback;
