-- The CRM's own copy of the inbox (Chatwoot): every chat and every message, so the CRM can read, count
-- and search them without asking Chatwoot each time. Team Replies counts from it now; the Inbox list,
-- search and live updates will read it later. Sending still goes through Chatwoot.
--
-- How it fills
--   * The chat-activity webhook writes each message Chatwoot reports (new, edited, deleted) and each chat
--     change (status, owner, unread). Chatwoot only reports the events ticked in its webhook settings.
--   * "Copy old chats" (Team Replies page, admin only) reads the history through the gateway and writes it
--     with the same rules. Writing the same message twice changes nothing: Chatwoot's message id is the key.
--   * Every night inbox_copy_check() marks chats whose newest message is missing from the copy; the next
--     "Copy old chats" reads those again.
--
-- Why not chat_activity: the automations ("parent has not replied", "parent is waiting") and the automatic
-- lead ("first message of a chat") read chat_activity. Filling it with hundreds of old chats would make
-- them look new to the automations. These tables are read by nobody but the copy's own readers.
--
-- Files are never copied, only their kind, address, name and size.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------------------------
-- The chats
-- ---------------------------------------------------------------------------------------------

create table public.inbox_chats (
  -- Chatwoot's conversation number (the one the CRM and Chatwoot's screens use).
  conversation_id bigint primary key,
  -- Chatwoot account: 1 for Mirai, 2 for EduHero (each school's database holds its own).
  account_id integer,
  -- The Chatwoot inbox: a WhatsApp number, a Facebook Page, ...
  inbox_id bigint,
  channel text,
  contact_id bigint,
  contact_name text check (contact_name is null or char_length(contact_name) <= 200),
  -- Digits of the number, when the chat shows one.
  contact_phone text check (contact_phone is null or char_length(contact_phone) <= 30),
  -- WhatsApp's address of the contact (may be a hidden id), Messenger's id, ...
  contact_identifier text,
  status text,
  -- Who the team gave the chat to (crm_owner_id).
  owner_id bigint,
  unread_count integer,
  waiting_since timestamptz,
  last_activity_at timestamptz,
  last_message_id bigint,
  last_message_at timestamptz,
  last_message_preview text,
  -- When "Copy old chats" last read this chat completely (null: never), and the newest message it had
  -- then: the next run reads back to that one only.
  copied_at timestamptz,
  copied_through_message_id bigint,
  -- The nightly check found the copy behind Chatwoot: read it again.
  needs_copy boolean not null default false,
  updated_at timestamptz not null default now()
);

create index inbox_chats_activity_idx on public.inbox_chats (last_activity_at desc nulls last);
create index inbox_chats_needs_copy_idx on public.inbox_chats (conversation_id) where needs_copy;
create index inbox_chats_name_trgm_idx on public.inbox_chats
  using gin ((coalesce(contact_name, '') || ' ' || coalesce(contact_phone, '')) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------------------------
-- The messages
-- ---------------------------------------------------------------------------------------------

create table public.inbox_messages (
  -- Chatwoot's message id: the same message arriving twice (webhook resent, copied again) is one row.
  id bigint primary key,
  account_id integer,
  conversation_id bigint not null,
  inbox_id bigint,
  -- 0 from the parent, 1 from us, 2 activity line, 3 template.
  message_type smallint not null check (message_type between 0 and 3),
  direction text check (direction in ('incoming', 'outgoing')),
  -- parent; staff (sent from the CRM, staff_id says who); automation (the automatic sender);
  -- phone (ours, typed on the school's phone); system (Chatwoot's own lines).
  sender_kind text not null check (sender_kind in ('parent', 'staff', 'automation', 'phone', 'system')),
  staff_id bigint,
  content text,
  -- [{ "type": "image", "url": "...", "name": "...", "size": 12345 }]: what the file is, never the file.
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array'),
  private boolean not null default false,
  deleted boolean not null default false,
  edited boolean not null default false,
  -- The message this one answers (quoted).
  reply_to bigint,
  created_at timestamptz not null,
  updated_at timestamptz,
  -- 'webhook' or 'copy' (read by "Copy old chats").
  source text not null default 'webhook' check (source in ('webhook', 'copy')),
  copied_into_at timestamptz not null default now()
);

create index inbox_messages_chat_idx on public.inbox_messages (conversation_id, created_at desc, id desc);
create index inbox_messages_created_idx on public.inbox_messages (created_at);
-- Any part of a word in any language (中文, Bahasa, English): trigram search with ILIKE '%...%'.
create index inbox_messages_content_trgm_idx on public.inbox_messages using gin (content extensions.gin_trgm_ops);

comment on table public.inbox_messages is
  'Copy of every Chatwoot message (text, who sent it, what files were attached). Written by chat-activity and "Copy old chats".';
comment on table public.inbox_chats is
  'Copy of every Chatwoot chat (contact, status, owner, newest message). Written by chat-activity and "Copy old chats".';

-- ---------------------------------------------------------------------------------------------
-- Who reads it: whoever answers the chats (Leads). Someone kept to some WhatsApp numbers sees only
-- those numbers' chats; chats of other inboxes (Messenger, Instagram) follow Leads alone.
-- ---------------------------------------------------------------------------------------------

create or replace function public.can_read_inbox(p_inbox_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('leads', 'view')
    and (
      p_inbox_id is null
      or public.my_whatsapp_inbox_ids() is null
      or p_inbox_id = any(public.my_whatsapp_inbox_ids())
      or not exists (select 1 from public.whatsapp_numbers n where n.chatwoot_inbox_id = p_inbox_id)
    );
$$;

revoke all on function public.can_read_inbox(bigint) from public, anon;
grant execute on function public.can_read_inbox(bigint) to authenticated;

alter table public.inbox_chats enable row level security;
alter table public.inbox_messages enable row level security;

create policy "Leads tick reads the chats it may see"
  on public.inbox_chats for select to authenticated
  using ((select public.can_read_inbox(inbox_id)));

create policy "Leads tick reads the messages it may see"
  on public.inbox_messages for select to authenticated
  using ((select public.can_read_inbox(inbox_id)));

revoke all on public.inbox_chats, public.inbox_messages from anon;
revoke insert, update, delete on public.inbox_chats, public.inbox_messages from authenticated;

-- ---------------------------------------------------------------------------------------------
-- Writing: one function for the webhook and for "Copy old chats".
--   p_chat:     { conversation_id, inbox_id, channel, contact_id, contact_name, contact_phone,
--                 contact_identifier, status, owner_id, unread_count, waiting_since, last_activity_at }
--   p_messages: [{ id, conversation_id, inbox_id, message_type, direction, sender_kind, staff_id, content,
--                  attachments, private, deleted, reply_to, created_at, updated_at }]
-- ---------------------------------------------------------------------------------------------

create or replace function public.inbox_copy_apply(
  p_account integer,
  p_chat jsonb,
  p_messages jsonb,
  p_source text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  v_chat bigint;
begin
  if p_source not in ('webhook', 'copy') then
    raise exception 'Unknown source.' using errcode = '22023';
  end if;

  if p_chat is not null and jsonb_typeof(p_chat) = 'object' and (p_chat ->> 'conversation_id') is not null then
    insert into public.inbox_chats as c (
      conversation_id, account_id, inbox_id, channel, contact_id, contact_name, contact_phone, contact_identifier,
      status, owner_id, unread_count, waiting_since, last_activity_at
    )
    select
      r.conversation_id, p_account, r.inbox_id, left(r.channel, 60), r.contact_id, left(r.contact_name, 200),
      left(r.contact_phone, 30), left(r.contact_identifier, 200), left(r.status, 20), r.owner_id, r.unread_count,
      r.waiting_since, r.last_activity_at
    from jsonb_to_record(p_chat) as r(
      conversation_id bigint, inbox_id bigint, channel text, contact_id bigint, contact_name text,
      contact_phone text, contact_identifier text, status text, owner_id bigint, unread_count integer,
      waiting_since timestamptz, last_activity_at timestamptz
    )
    on conflict (conversation_id) do update
    set account_id = coalesce(excluded.account_id, c.account_id),
        inbox_id = coalesce(excluded.inbox_id, c.inbox_id),
        channel = coalesce(excluded.channel, c.channel),
        contact_id = coalesce(excluded.contact_id, c.contact_id),
        contact_name = coalesce(excluded.contact_name, c.contact_name),
        contact_phone = coalesce(excluded.contact_phone, c.contact_phone),
        contact_identifier = coalesce(excluded.contact_identifier, c.contact_identifier),
        status = coalesce(excluded.status, c.status),
        -- An owner taken off the chat is a change too: the newest report says who owns it.
        owner_id = excluded.owner_id,
        unread_count = coalesce(excluded.unread_count, c.unread_count),
        waiting_since = excluded.waiting_since,
        last_activity_at = greatest(c.last_activity_at, excluded.last_activity_at),
        updated_at = now();
  end if;

  if p_messages is not null and jsonb_typeof(p_messages) = 'array' and jsonb_array_length(p_messages) > 0 then
    insert into public.inbox_messages as m (
      id, account_id, conversation_id, inbox_id, message_type, direction, sender_kind, staff_id, content,
      attachments, private, deleted, reply_to, created_at, updated_at, source
    )
    select
      r.id, p_account, r.conversation_id, r.inbox_id, r.message_type, r.direction, r.sender_kind, r.staff_id,
      r.content, coalesce(r.attachments, '[]'::jsonb), coalesce(r.private, false), coalesce(r.deleted, false),
      r.reply_to, r.created_at, r.updated_at, p_source
    from jsonb_to_recordset(p_messages) as r(
      id bigint, conversation_id bigint, inbox_id bigint, message_type smallint, direction text, sender_kind text,
      staff_id bigint, content text, attachments jsonb, private boolean, deleted boolean, reply_to bigint,
      created_at timestamptz, updated_at timestamptz
    )
    where r.id is not null and r.conversation_id is not null and r.created_at is not null
    on conflict (id) do update
    set content = excluded.content,
        attachments = excluded.attachments,
        private = excluded.private,
        deleted = m.deleted or excluded.deleted,
        -- Changed text on a message that is still there means it was edited.
        edited = m.edited or (not excluded.deleted and not m.deleted and m.content is distinct from excluded.content),
        sender_kind = excluded.sender_kind,
        staff_id = excluded.staff_id,
        reply_to = coalesce(excluded.reply_to, m.reply_to),
        inbox_id = coalesce(excluded.inbox_id, m.inbox_id),
        updated_at = coalesce(excluded.updated_at, m.updated_at)
    -- An older report never undoes a newer one (a resent "created" after an "updated").
    where excluded.updated_at is null or m.updated_at is null or excluded.updated_at >= m.updated_at;
    get diagnostics v_count = row_count;

    -- Each chat touched: make sure it exists and knows its newest message.
    for v_chat in
      select distinct (value ->> 'conversation_id')::bigint from jsonb_array_elements(p_messages)
      where value ->> 'conversation_id' is not null
    loop
      insert into public.inbox_chats (conversation_id, account_id)
      values (v_chat, p_account)
      on conflict (conversation_id) do nothing;

      update public.inbox_chats c
      set last_message_id = newest.id,
          last_message_at = newest.created_at,
          last_message_preview = left(coalesce(nullif(btrim(newest.content), ''), newest.attachments -> 0 ->> 'type'), 200),
          last_activity_at = greatest(c.last_activity_at, newest.created_at),
          needs_copy = case when c.needs_copy and newest.created_at >= c.last_activity_at then false else c.needs_copy end,
          updated_at = now()
      from (
        select im.id, im.created_at, im.content, im.attachments
        from public.inbox_messages im
        where im.conversation_id = v_chat and not im.private and im.message_type in (0, 1, 3)
        order by im.created_at desc, im.id desc
        limit 1
      ) newest
      where c.conversation_id = v_chat
        and c.last_message_id is distinct from newest.id;
    end loop;
  end if;

  return v_count;
end;
$$;

revoke all on function public.inbox_copy_apply(integer, jsonb, jsonb, text) from public, anon, authenticated;

-- The webhook (chat-activity, with the key Chatwoot calls it with).
create or replace function public.inbox_copy_from_webhook(p_key text, p_account integer, p_chat jsonb, p_messages jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_key text;
begin
  select webhook_key into stored_key from public.chat_webhook_settings limit 1;
  if p_key is null or stored_key is null or p_key <> stored_key then
    raise exception 'The key is not right.' using errcode = '28000';
  end if;
  return public.inbox_copy_apply(p_account, p_chat, p_messages, 'webhook');
end;
$$;

revoke all on function public.inbox_copy_from_webhook(text, integer, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.inbox_copy_from_webhook(text, integer, jsonb, jsonb) to service_role;

-- "Copy old chats" in the browser: an admin only. p_done marks the chat as completely read.
create or replace function public.inbox_copy_import(p_account integer, p_chat jsonb, p_messages jsonb, p_done boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not (select public.is_admin()) then
    raise exception 'Only an admin can copy the old chats.' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p_messages, '[]'::jsonb)) > 1000 then
    raise exception 'At most 1000 messages at a time.' using errcode = '22023';
  end if;
  v_count := public.inbox_copy_apply(p_account, p_chat, p_messages, 'copy');
  if p_done and (p_chat ->> 'conversation_id') is not null then
    update public.inbox_chats c
    set copied_at = now(),
        needs_copy = false,
        copied_through_message_id = (
          select max(m.id) from public.inbox_messages m where m.conversation_id = c.conversation_id
        ),
        updated_at = now()
    where c.conversation_id = (p_chat ->> 'conversation_id')::bigint;
  end if;
  return v_count;
end;
$$;

revoke all on function public.inbox_copy_import(integer, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.inbox_copy_import(integer, jsonb, jsonb, boolean) to authenticated;

-- What "Copy old chats" needs to know to carry on where it stopped: each chat already read completely,
-- the newest message it had then, and whether the nightly check wants it read again.
create or replace function public.inbox_copy_state()
returns table (conversation_id bigint, copied_at timestamptz, needs_copy boolean, newest_message_id bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.conversation_id, c.copied_at, c.needs_copy, c.copied_through_message_id
  from public.inbox_chats c
  where (select public.is_admin());
$$;

revoke all on function public.inbox_copy_state() from public, anon;
grant execute on function public.inbox_copy_state() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The nightly check. The database cannot ask Chatwoot itself (it has no key for it), so it compares
-- what Chatwoot last said about each chat (its newest message and last activity, from the chat events)
-- with the messages in the copy, and marks the chats that are behind. "Copy old chats" reads those again.
-- ---------------------------------------------------------------------------------------------

create or replace function public.inbox_copy_check()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.inbox_chats c
  set needs_copy = true, updated_at = now()
  where not c.needs_copy
    and c.last_activity_at is not null
    and c.last_activity_at < now() - interval '10 minutes'
    and c.last_activity_at > coalesce(
      (select max(m.created_at) from public.inbox_messages m where m.conversation_id = c.conversation_id),
      '-infinity'::timestamptz
    ) + interval '2 minutes';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.inbox_copy_check() from public, anon, authenticated;

-- How full the copy is, for the Team Replies page.
create or replace function public.inbox_copy_summary()
returns table (chats integer, messages bigint, copied_chats integer, chats_to_copy integer, first_message_at timestamptz, last_message_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::integer from public.inbox_chats),
    (select count(*) from public.inbox_messages),
    (select count(*)::integer from public.inbox_chats where copied_at is not null),
    (select count(*)::integer from public.inbox_chats where needs_copy),
    (select min(created_at) from public.inbox_messages),
    (select max(created_at) from public.inbox_messages)
  where (select public.has_permission('team_replies', 'view')) or (select public.has_permission('leads', 'view'));
$$;

revoke all on function public.inbox_copy_summary() from public, anon;
grant execute on function public.inbox_copy_summary() to authenticated;
