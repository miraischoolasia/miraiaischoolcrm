-- Checks for 20261025300000_inbox_copy_live.sql (after 20261024800000 and 20261024810000).
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/inbox_copy_live.sql
-- test.admin / test.perms / test.inboxes are read by the stand-in permission functions of a bare scratch database.

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

create function pg_temp.msg(p_id bigint, p_chat bigint, p_type int, p_at timestamptz, p_content text, p_raw jsonb default null)
returns jsonb language sql as $$
  select jsonb_build_object(
    'id', p_id, 'conversation_id', p_chat, 'inbox_id', 5, 'message_type', p_type,
    'direction', case p_type when 0 then 'incoming' else 'outgoing' end,
    'sender_kind', case p_type when 0 then 'parent' else 'phone' end, 'staff_id', null, 'content', p_content,
    'attachments', '[]'::jsonb, 'private', false, 'deleted', false, 'reply_to', null, 'created_at', p_at,
    'updated_at', null,
    'raw', coalesce(p_raw, jsonb_build_object('id', p_id, 'content', p_content, 'message_type', p_type, 'status', 'sent'))
  );
$$;

-- ---------------------------------------------------------------------------------------------
-- raw is kept, and a chat's raw is never replaced by an older report.
-- ---------------------------------------------------------------------------------------------

select public.inbox_copy_from_webhook('right-key-0123456789', 1,
  '{"conversation_id": 50, "inbox_id": 5, "contact_name": "Puan Aminah", "status": "open",
    "raw": {"id": 50, "status": "open", "updated_at": 200.5, "meta": {"sender": {"id": 9, "name": "Puan Aminah"}}}}'::jsonb,
  jsonb_build_array(pg_temp.msg(500, 50, 0, '2026-10-19 09:00:00+08', 'Boleh daftar kelas Sabtu?')));
select pg_temp.ok((select raw ->> 'content' = 'Boleh daftar kelas Sabtu?' from public.inbox_messages where id = 500), 'a message keeps its raw');
select pg_temp.ok((select last_message_raw ->> 'id' = '500' from public.inbox_chats where conversation_id = 50), 'the chat keeps its newest message raw');

select public.inbox_copy_from_webhook('right-key-0123456789', 1,
  '{"conversation_id": 50, "status": "resolved", "raw": {"id": 50, "status": "resolved", "updated_at": 100}}'::jsonb, '[]'::jsonb);
select pg_temp.ok((select raw ->> 'status' = 'open' from public.inbox_chats where conversation_id = 50), 'an older chat report does not put back an older state');
select public.inbox_copy_from_webhook('right-key-0123456789', 1,
  '{"conversation_id": 50, "status": "resolved", "raw": {"id": 50, "status": "resolved", "updated_at": 300}}'::jsonb, '[]'::jsonb);
select pg_temp.ok((select raw ->> 'status' = 'resolved' from public.inbox_chats where conversation_id = 50), 'a newer chat report replaces it');

-- A message edited in Chatwoot: the raw follows.
select public.inbox_copy_from_webhook('right-key-0123456789', 1, null, jsonb_build_array(
  pg_temp.msg(500, 50, 0, '2026-10-19 09:00:00+08', 'Boleh daftar kelas Ahad?') || '{"updated_at": "2026-10-19T02:00:00Z"}'::jsonb));
select pg_temp.ok((select raw ->> 'content' = 'Boleh daftar kelas Ahad?' and edited from public.inbox_messages where id = 500), 'an edit updates the raw');

-- ---------------------------------------------------------------------------------------------
-- Filling in from the page.
-- ---------------------------------------------------------------------------------------------

set local role authenticated;
set local test.perms = 'leads';
set local test.inboxes = '';
select public.inbox_copy_fill(1, '{"conversation_id": 50, "inbox_id": 5}'::jsonb,
  jsonb_build_array(pg_temp.msg(501, 50, 1, '2026-10-19 09:05:00+08', 'Boleh, puan', '{"id": 501, "status": "read"}'::jsonb)));
select pg_temp.ok((select raw ->> 'status' = 'read' and source = 'copy' from public.inbox_messages where id = 501), 'a person who may read the chat fills in a missed message');
select pg_temp.fails($$select public.inbox_copy_fill(1, '{"conversation_id": 50, "inbox_id": 5}'::jsonb,
  jsonb_build_array(pg_temp.msg(502, 51, 1, now(), 'x')))$$, 'another chat', 'only messages of that chat');
set local test.inboxes = '{6}';
select pg_temp.fails($$select public.inbox_copy_fill(1, '{"conversation_id": 50, "inbox_id": 5}'::jsonb, '[]'::jsonb)$$,
  'Not allowed', 'not for a chat on a number the person may not see');
set local test.perms = '';
set local test.inboxes = '';
select pg_temp.fails($$select public.inbox_copy_fill(1, '{"conversation_id": 50, "inbox_id": 5}'::jsonb, '[]'::jsonb)$$,
  'Not allowed', 'not without the Leads tick');

-- ---------------------------------------------------------------------------------------------
-- Search, as the person asking.
-- ---------------------------------------------------------------------------------------------

reset role;
select public.inbox_copy_from_webhook('right-key-0123456789', 1,
  '{"conversation_id": 60, "inbox_id": 6, "contact_name": "陈太太", "contact_phone": "60198765432", "raw": {"id": 60, "updated_at": 1}}'::jsonb,
  jsonb_build_array(
    pg_temp.msg(600, 60, 0, '2026-10-19 10:00:00+08', '请问周六的编程课还有位吗？') || '{"inbox_id": 6}'::jsonb,
    pg_temp.msg(601, 60, 1, '2026-10-19 10:05:00+08', 'Ada, 50% off untuk kelas pertama') || '{"inbox_id": 6}'::jsonb));

set local role authenticated;
set local test.perms = 'leads';
select pg_temp.ok((select array_agg(message_id order by message_id) from public.inbox_search('周六的编程') where kind = 'message') = '{600}', 'search: Chinese inside a sentence');
select pg_temp.ok((select array_agg(message_id order by message_id) from public.inbox_search('DAFTAR') where kind = 'message') = '{500}', 'search: Malay, any case');
select pg_temp.ok((select array_agg(conversation_id) from public.inbox_search('陈太') where kind = 'chat') = '{60}', 'search: a name');
select pg_temp.ok((select array_agg(conversation_id) from public.inbox_search('98765') where kind = 'chat') = '{60}', 'search: part of a number');
select pg_temp.ok((select array_agg(message_id) from public.inbox_search('50%') where kind = 'message') = '{601}', 'search: a % is looked for as it is');
select pg_temp.ok((select count(*) from public.inbox_search('a')) = 0, 'search: one letter finds nothing');
select pg_temp.ok((select chat ->> 'id' = '60' from public.inbox_search('编程') limit 1), 'search: each result carries its chat');
set local test.inboxes = '{5}';
select pg_temp.ok((select count(*) from public.inbox_search('编程')) = 0, 'search: a chat on a number the person may not see is not found');
set local test.perms = '';
set local test.inboxes = '';
select pg_temp.ok((select count(*) from public.inbox_search('daftar')) = 0, 'search: nothing without the Leads tick');
reset role;

-- ---------------------------------------------------------------------------------------------
-- The newest messages of many chats at once (opening a chat then shows them at once).
-- ---------------------------------------------------------------------------------------------

set local role authenticated;
set local test.perms = 'leads';
set local test.inboxes = '';
select pg_temp.ok(
  (select array_agg((raw ->> 'id')::bigint order by (raw ->> 'id')::bigint) from public.inbox_recent_messages(array[50, 60]::bigint[], 1))
    = '{501,601}', 'recent messages: the newest of each chat');
set local test.inboxes = '{5}';
select pg_temp.ok(
  (select array_agg(conversation_id) from public.inbox_recent_messages(array[50, 60]::bigint[], 5)) <@ array[50]::bigint[],
  'recent messages: not of a chat on a number the person may not see');
reset role;
set local test.inboxes = '';

-- ---------------------------------------------------------------------------------------------
-- Copied before raw existed: read again by the next "Carry on copying".
-- ---------------------------------------------------------------------------------------------

insert into public.inbox_chats (conversation_id, account_id, copied_at) values (70, 1, now());
update public.inbox_chats set needs_copy = true where raw is null and needs_copy = false;
select pg_temp.ok((select needs_copy from public.inbox_chats where conversation_id = 70), 'a chat with no raw is marked to be read again');

rollback;
