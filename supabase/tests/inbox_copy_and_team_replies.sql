-- Checks for 20261024800000_inbox_copy.sql and 20261024810000_team_reply_days.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/inbox_copy_and_team_replies.sql
-- Every check prints PASS; the first failure stops the run.
-- The people and channels are real (see pg_temp.as_person / pg_temp.show_only below).

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

-- A message as chat-activity sends it (copy.ts).
-- Real accounts and channels (this test runs on the full schema, where the permission functions read the
-- signed-in teacher): pg_temp.as_person('admin' | 'inbox' | 'team_replies' | 'none') signs one in, and
-- pg_temp.show_only('') / ('5') / ('6') makes the channels open, or leaves only that inbox open to staff.
update public.chat_webhook_settings set webhook_key = 'right-key-0123456789';

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000e001', 'test_copy_admin@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e002', 'test_copy_inbox@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e003', 'test_copy_none@example.test', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000e004', 'test_copy_replies@example.test', 'authenticated', 'authenticated');
insert into public.teachers (id, full_name, username, role, auth_user_id, is_active, permissions) overriding system value values
  (991201, 'Copy Admin', 'test_copy_admin', 'admin', '00000000-0000-0000-0000-00000000e001', true, '{}'),
  (991202, 'Copy Inbox', 'test_copy_inbox', 'staff', '00000000-0000-0000-0000-00000000e002', true, '{"inbox":{"level":"view"}}'),
  (991203, 'Copy None', 'test_copy_none', 'staff', '00000000-0000-0000-0000-00000000e003', true, '{}'),
  (991204, 'Copy Replies', 'test_copy_replies', 'staff', '00000000-0000-0000-0000-00000000e004', true, '{"team_replies":{"level":"view"}}');
insert into public.inbox_channels (chatwoot_inbox_id, kind, label, access, is_active) values
  (5, 'whatsapp', 'Test five', 'open', true), (6, 'whatsapp', 'Test six', 'open', true);

create function pg_temp.as_person(p_who text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u::text, true),
         set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
  from (select case p_who
          when 'admin' then '00000000-0000-0000-0000-00000000e001'
          when 'inbox' then '00000000-0000-0000-0000-00000000e002'
          when 'team_replies' then '00000000-0000-0000-0000-00000000e004'
          else '00000000-0000-0000-0000-00000000e003' end::uuid as u) x;
$$;

create function pg_temp.show_only(p_inbox text) returns void language sql security definer as $$
  update public.inbox_channels
  set access = case when p_inbox = '' or chatwoot_inbox_id::text = p_inbox then 'open' else 'limited' end
  where chatwoot_inbox_id in (5, 6);
$$;

create function pg_temp.msg(
  p_id bigint, p_chat bigint, p_type int, p_at timestamptz, p_kind text, p_staff bigint default null,
  p_content text default 'hi', p_extra jsonb default '{}'::jsonb
) returns jsonb language sql as $$
  select jsonb_build_object(
    'id', p_id, 'conversation_id', p_chat, 'inbox_id', 5, 'message_type', p_type,
    'direction', case p_type when 0 then 'incoming' when 1 then 'outgoing' end,
    'sender_kind', p_kind, 'staff_id', p_staff, 'content', p_content, 'attachments', '[]'::jsonb,
    'private', false, 'deleted', false, 'reply_to', null, 'created_at', p_at, 'updated_at', null
  ) || p_extra;
$$;

-- ---------------------------------------------------------------------------------------------
-- The copy: one row per message whatever arrives twice; edits, deletes, older reports.
-- ---------------------------------------------------------------------------------------------

select pg_temp.fails(
  $$select public.inbox_copy_from_webhook('wrong', 1, null, '[]'::jsonb)$$, 'key is not right', 'webhook needs the key');

select public.inbox_copy_from_webhook('right-key-0123456789', 1,
  '{"conversation_id": 10, "inbox_id": 5, "contact_name": "Puan Aminah", "contact_phone": "60123456789", "status": "open", "owner_id": 3, "unread_count": 1}'::jsonb,
  jsonb_build_array(pg_temp.msg(100, 10, 0, '2026-10-19 09:00:00+08', 'parent', null, '我想报名周六的课')));
select public.inbox_copy_from_webhook('right-key-0123456789', 1, null,
  jsonb_build_array(pg_temp.msg(100, 10, 0, '2026-10-19 09:00:00+08', 'parent', null, '我想报名周六的课')));
select pg_temp.ok((select count(*) from public.inbox_messages where id = 100) = 1, 'the same message twice is one row');
select pg_temp.ok(
  (select last_message_id = 100 and last_message_preview = '我想报名周六的课' and owner_id = 3 from public.inbox_chats where conversation_id = 10),
  'the chat knows its newest message and owner');

select public.inbox_copy_from_webhook('right-key-0123456789', 1, null, jsonb_build_array(
  pg_temp.msg(101, 10, 1, '2026-10-19 09:05:00+08', 'staff', 3, 'Boleh, kelas hari Sabtu pukul 10 pagi',
    '{"updated_at": "2026-10-19T01:05:00Z"}'::jsonb)));
select public.inbox_copy_from_webhook('right-key-0123456789', 1, null, jsonb_build_array(
  pg_temp.msg(101, 10, 1, '2026-10-19 09:05:00+08', 'staff', 3, 'Boleh, kelas hari Sabtu pukul 11 pagi',
    '{"updated_at": "2026-10-19T01:06:00Z"}'::jsonb)));
select pg_temp.ok((select edited and content like '%11 pagi' from public.inbox_messages where id = 101), 'changed text is an edit');

select public.inbox_copy_from_webhook('right-key-0123456789', 1, null, jsonb_build_array(
  pg_temp.msg(101, 10, 1, '2026-10-19 09:05:00+08', 'staff', 3, 'Boleh, kelas hari Sabtu pukul 10 pagi',
    '{"updated_at": "2026-10-19T01:05:30Z"}'::jsonb)));
select pg_temp.ok((select content like '%11 pagi' from public.inbox_messages where id = 101), 'an older report does not undo a newer one');

select public.inbox_copy_from_webhook('right-key-0123456789', 1, null, jsonb_build_array(
  pg_temp.msg(101, 10, 1, '2026-10-19 09:05:00+08', 'staff', 3, 'This message was deleted',
    '{"updated_at": "2026-10-19T01:07:00Z", "deleted": true}'::jsonb)));
select pg_temp.ok((select deleted from public.inbox_messages where id = 101), 'a deleted message is marked');

-- ---------------------------------------------------------------------------------------------
-- Search: any part of a word, in Chinese, Malay and English.
-- ---------------------------------------------------------------------------------------------

select public.inbox_copy_from_webhook('right-key-0123456789', 1, null, jsonb_build_array(
  pg_temp.msg(102, 11, 0, '2026-10-19 10:00:00+08', 'parent', null, 'Can I join the Saturday coding class?'),
  pg_temp.msg(103, 11, 0, '2026-10-19 10:01:00+08', 'parent', null, 'Anak saya berumur 9 tahun, boleh daftar?'),
  pg_temp.msg(104, 12, 0, '2026-10-19 10:02:00+08', 'parent', null, '请问HOA课程几点开始？')));

select pg_temp.ok((select array_agg(id order by id) from public.inbox_messages where content ilike '%报名%') = '{100}', 'Chinese, 2 characters');
select pg_temp.ok((select array_agg(id order by id) from public.inbox_messages where content ilike '%周六的课%') = '{100}', 'Chinese, inside a sentence');
select pg_temp.ok((select array_agg(id order by id) from public.inbox_messages where content ilike '%hoa课程%') = '{104}', 'Chinese mixed with English, any case');
select pg_temp.ok((select array_agg(id order by id) from public.inbox_messages where content ilike '%daftar%') = '{103}', 'Malay');
select pg_temp.ok((select array_agg(id order by id) from public.inbox_messages where content ilike '%umur%') = '{103}', 'Malay, part of a word');
select pg_temp.ok((select array_agg(id order by id) from public.inbox_messages where content ilike '%SATURDAY COD%') = '{102}', 'English, any case, across words');
select pg_temp.ok((select count(*) from public.inbox_chats where (coalesce(contact_name, '') || ' ' || coalesce(contact_phone, '')) ilike '%aminah%') = 1, 'chat by name');
select pg_temp.ok((select count(*) from public.inbox_chats where (coalesce(contact_name, '') || ' ' || coalesce(contact_phone, '')) ilike '%3456789%') = 1, 'chat by part of the number');

-- ---------------------------------------------------------------------------------------------
-- Who may read it.
-- ---------------------------------------------------------------------------------------------

select public.inbox_copy_from_webhook('right-key-0123456789', 1, '{"conversation_id": 20, "inbox_id": 6}'::jsonb,
  jsonb_build_array(pg_temp.msg(200, 20, 0, '2026-10-19 11:00:00+08', 'parent') || '{"inbox_id": 6}'::jsonb));
select public.inbox_copy_from_webhook('right-key-0123456789', 1, '{"conversation_id": 21, "inbox_id": 9}'::jsonb,
  jsonb_build_array(pg_temp.msg(210, 21, 0, '2026-10-19 11:00:00+08', 'parent') || '{"inbox_id": 9}'::jsonb));

set local role authenticated;
select pg_temp.as_person('none');
select pg_temp.ok((select count(*) from public.inbox_messages) = 0, 'no Inbox tick: nothing');
select pg_temp.as_person('inbox');
select pg_temp.ok((select count(*) from public.inbox_messages where id in (100, 200, 210)) = 3, 'Inbox tick: every chat');
select pg_temp.show_only('5');
select pg_temp.ok(
  (select array_agg(id order by id) from public.inbox_messages where id in (100, 200, 210)) = '{100,210}',
  'kept to number 5: not number 6, but the Messenger-like inbox 9 stays');
select pg_temp.fails($$insert into public.inbox_messages (id, conversation_id, message_type, sender_kind, created_at) values (1, 1, 0, 'parent', now())$$,
  'permission denied', 'nobody writes the copy directly');
select pg_temp.fails($$select public.inbox_copy_import(1, null, '[]'::jsonb)$$, 'Only an admin', 'only an admin copies old chats');
select pg_temp.ok((select count(*) from public.team_reply_days) = 0, 'no Team Replies tick: no kept days');
reset role;
select pg_temp.show_only('');

-- ---------------------------------------------------------------------------------------------
-- Team replies, worked out from the copy.
-- ---------------------------------------------------------------------------------------------

delete from public.inbox_messages;
-- Chat 30: the parent writes at 23:50 on the 17th (twice), staff 3 answers at 00:10 on the 18th (20 min,
-- counted on the 18th), then a second message of staff 3 (a reply, no new wait).
-- Chat 31: the parent at 09:00, the automatic sender at 09:01 (1 min), the phone at 09:30 (no wait),
-- parent at 10:00, staff 4 at 11:00 (60 min), a private note and a deleted message that never count.
select public.inbox_copy_from_webhook('right-key-0123456789', 1, null, jsonb_build_array(
  pg_temp.msg(300, 30, 0, '2026-10-17 23:50:00+08', 'parent'),
  pg_temp.msg(301, 30, 0, '2026-10-17 23:55:00+08', 'parent'),
  pg_temp.msg(302, 30, 1, '2026-10-18 00:10:00+08', 'staff', 3),
  pg_temp.msg(303, 30, 1, '2026-10-18 00:12:00+08', 'staff', 3),
  pg_temp.msg(310, 31, 0, '2026-10-18 09:00:00+08', 'parent'),
  pg_temp.msg(311, 31, 1, '2026-10-18 09:01:00+08', 'automation'),
  pg_temp.msg(312, 31, 1, '2026-10-18 09:30:00+08', 'phone'),
  pg_temp.msg(313, 31, 0, '2026-10-18 10:00:00+08', 'parent'),
  pg_temp.msg(314, 31, 1, '2026-10-18 10:30:00+08', 'staff', 4, 'note', '{"private": true}'::jsonb),
  pg_temp.msg(315, 31, 1, '2026-10-18 10:40:00+08', 'staff', 4, 'gone', '{"deleted": true}'::jsonb),
  pg_temp.msg(316, 31, 1, '2026-10-18 11:00:00+08', 'staff', 4)));

select public.team_reply_compute_day('2026-10-18', 'manual');
select public.team_reply_compute_day('2026-10-18', 'manual');
select pg_temp.ok(
  (select jsonb_agg(jsonb_build_array(replier, staff_id, replies, chat_ids, waits, within_target, slowest) order by replier)
   from public.team_reply_days where day = '2026-10-18')
  = '[["automation", null, 1, [31], [60], 1, 60],
      ["phone", null, 1, [31], [], 0, null],
      ["staff:3", 3, 2, [30], [1200], 1, 1200],
      ["staff:4", 4, 1, [31], [3600], 0, 3600]]'::jsonb,
  'a day: waits from the first unanswered message, across midnight, notes and deleted ones left out');
select pg_temp.ok((select count(*) from public.team_reply_days where day = '2026-10-18') = 4, 'working a day out twice gives the same rows');
select pg_temp.ok((select chats_read = 2 and replies = 5 from public.team_reply_day_runs where day = '2026-10-18'), 'the day is marked done');
select pg_temp.ok((select count(*) from public.team_reply_days where day = '2026-10-17') = 0, 'nothing on the parent''s day');

select pg_temp.fails($$select public.team_reply_compute_day((now() at time zone 'Asia/Kuala_Lumpur')::date)$$, 'finished day', 'today is never kept');

set local role authenticated;
select pg_temp.as_person('inbox');
select pg_temp.fails($$select public.team_reply_compute_range('2026-10-01', '2026-10-18')$$, 'Only an admin', 'only an admin works out the days');
select pg_temp.as_person('team_replies');
select pg_temp.ok((select count(*) from public.team_reply_days where day = '2026-10-18') = 4, 'the Team Replies tick reads the kept days');
select pg_temp.as_person('admin');
select pg_temp.ok(public.team_reply_compute_range('2026-10-17', '2026-10-18') = 2, 'an admin works out a range of days');
select pg_temp.fails($$select public.team_reply_compute_range('2026-01-01', '2026-10-18')$$, 'At most 62', 'at most 62 days a call');
reset role;

-- ---------------------------------------------------------------------------------------------
-- The nightly check marks a chat whose newest message is missing.
-- ---------------------------------------------------------------------------------------------

select public.inbox_copy_from_webhook('right-key-0123456789', 1,
  jsonb_build_object('conversation_id', 31, 'last_activity_at', now() - interval '1 hour'), '[]'::jsonb);
select pg_temp.ok(public.inbox_copy_check() >= 1, 'a chat behind Chatwoot is found');
select pg_temp.ok((select needs_copy from public.inbox_chats where conversation_id = 31), 'and marked to be read again');
select pg_temp.as_person('admin');
select public.inbox_copy_import(1, '{"conversation_id": 31}'::jsonb, '[]'::jsonb, true);
select pg_temp.ok((select not needs_copy and copied_at is not null from public.inbox_chats where conversation_id = 31), 'reading it again clears the mark');

rollback;
