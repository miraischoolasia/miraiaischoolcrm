-- The inbox copy (20261024800000) becomes what the Inbox page reads: chat contents, the Done list, search across
-- every message, and live updates. Sending, marking read, owners and every other change still go to Chatwoot.
--
--   1. raw: each message and chat as Chatwoot's own API shows it, so the page shows a copied message exactly like
--      one read from Chatwoot (sending ticks, quotes, files, who sent it). Files are still only their address.
--   2. inbox_copy_fill: a signed-in person who may read a chat writes what they just read from Chatwoot into the
--      copy, so a message the webhook missed is filled in by whoever opens that chat.
--   3. inbox_search: names, numbers and the words of every message (any language), newest first.
--   4. Realtime: the page hears about a new or changed message the moment the copy has it.
--
-- Chatwoot does not report "read" (agent_last_seen_at is written without an event), so unread numbers keep
-- coming from Chatwoot's list, as before; the copy is not the place to count them.

alter table public.inbox_messages add column if not exists raw jsonb;
alter table public.inbox_chats add column if not exists raw jsonb;
alter table public.inbox_chats add column if not exists last_message_raw jsonb;

create index if not exists inbox_chats_contact_idx on public.inbox_chats (contact_id);
create index if not exists inbox_chats_status_activity_idx on public.inbox_chats (status, last_activity_at desc, conversation_id desc);
create index if not exists inbox_chats_identifier_trgm_idx on public.inbox_chats
  using gin (coalesce(contact_identifier, '') extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------------------------
-- Writing, now with raw. Same rules as before; a chat's raw is only replaced by a report at least as new
-- (Chatwoot's updated_at), so a late webhook never puts an older state back.
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
      status, owner_id, unread_count, waiting_since, last_activity_at, raw
    )
    select
      r.conversation_id, p_account, r.inbox_id, left(r.channel, 60), r.contact_id, left(r.contact_name, 200),
      left(r.contact_phone, 30), left(r.contact_identifier, 200), left(r.status, 20), r.owner_id, r.unread_count,
      r.waiting_since, r.last_activity_at, r.raw
    from jsonb_to_record(p_chat) as r(
      conversation_id bigint, inbox_id bigint, channel text, contact_id bigint, contact_name text,
      contact_phone text, contact_identifier text, status text, owner_id bigint, unread_count integer,
      waiting_since timestamptz, last_activity_at timestamptz, raw jsonb
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
        owner_id = excluded.owner_id,
        unread_count = coalesce(excluded.unread_count, c.unread_count),
        waiting_since = excluded.waiting_since,
        last_activity_at = greatest(c.last_activity_at, excluded.last_activity_at),
        raw = case
          when excluded.raw is null then c.raw
          when c.raw is null then excluded.raw
          when coalesce((excluded.raw ->> 'updated_at')::numeric, 0) >= coalesce((c.raw ->> 'updated_at')::numeric, 0) then excluded.raw
          else c.raw
        end,
        updated_at = now();
  end if;

  if p_messages is not null and jsonb_typeof(p_messages) = 'array' and jsonb_array_length(p_messages) > 0 then
    insert into public.inbox_messages as m (
      id, account_id, conversation_id, inbox_id, message_type, direction, sender_kind, staff_id, content,
      attachments, private, deleted, reply_to, created_at, updated_at, source, raw
    )
    select
      r.id, p_account, r.conversation_id, r.inbox_id, r.message_type, r.direction, r.sender_kind, r.staff_id,
      r.content, coalesce(r.attachments, '[]'::jsonb), coalesce(r.private, false), coalesce(r.deleted, false),
      r.reply_to, r.created_at, r.updated_at, p_source, r.raw
    from jsonb_to_recordset(p_messages) as r(
      id bigint, conversation_id bigint, inbox_id bigint, message_type smallint, direction text, sender_kind text,
      staff_id bigint, content text, attachments jsonb, private boolean, deleted boolean, reply_to bigint,
      created_at timestamptz, updated_at timestamptz, raw jsonb
    )
    where r.id is not null and r.conversation_id is not null and r.created_at is not null
    on conflict (id) do update
    set content = excluded.content,
        attachments = excluded.attachments,
        private = excluded.private,
        deleted = m.deleted or excluded.deleted,
        edited = m.edited or (not excluded.deleted and not m.deleted and m.content is distinct from excluded.content),
        sender_kind = excluded.sender_kind,
        staff_id = excluded.staff_id,
        reply_to = coalesce(excluded.reply_to, m.reply_to),
        inbox_id = coalesce(excluded.inbox_id, m.inbox_id),
        updated_at = coalesce(excluded.updated_at, m.updated_at),
        raw = coalesce(excluded.raw, m.raw)
    where excluded.updated_at is null or m.updated_at is null or excluded.updated_at >= m.updated_at;
    get diagnostics v_count = row_count;

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
          last_message_raw = newest.raw,
          last_activity_at = greatest(c.last_activity_at, newest.created_at),
          needs_copy = case when c.needs_copy and newest.created_at >= c.last_activity_at then false else c.needs_copy end,
          updated_at = now()
      from (
        select im.id, im.created_at, im.content, im.attachments, im.raw
        from public.inbox_messages im
        where im.conversation_id = v_chat and not im.private and im.message_type in (0, 1, 3)
        order by im.created_at desc, im.id desc
        limit 1
      ) newest
      where c.conversation_id = v_chat
        and (c.last_message_id is distinct from newest.id or c.last_message_raw is distinct from newest.raw);
    end loop;
  end if;

  return v_count;
end;
$$;

revoke all on function public.inbox_copy_apply(integer, jsonb, jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Filling in from the page: what a person just read from Chatwoot for a chat they may see.
-- ---------------------------------------------------------------------------------------------

create or replace function public.inbox_copy_fill(p_account integer, p_chat jsonb, p_messages jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chat bigint := (p_chat ->> 'conversation_id')::bigint;
  v_inbox bigint := (p_chat ->> 'inbox_id')::bigint;
begin
  if v_chat is null then
    raise exception 'The chat is missing.' using errcode = '22023';
  end if;
  if not (select public.can_read_inbox(coalesce(v_inbox, (select c.inbox_id from public.inbox_chats c where c.conversation_id = v_chat)))) then
    raise exception 'Not allowed to read this chat.' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p_messages, '[]'::jsonb)) > 200 then
    raise exception 'At most 200 messages at a time.' using errcode = '22023';
  end if;
  -- Only messages of that chat.
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_messages, '[]'::jsonb)) e
    where (e ->> 'conversation_id')::bigint is distinct from v_chat
  ) then
    raise exception 'Messages of another chat.' using errcode = '22023';
  end if;
  return public.inbox_copy_apply(p_account, p_chat, p_messages, 'copy');
end;
$$;

revoke all on function public.inbox_copy_fill(integer, jsonb, jsonb) from public, anon;
grant execute on function public.inbox_copy_fill(integer, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Search: people (name, number, WhatsApp address) and the words of every message, newest first. Runs as
-- the person asking, so they only find the chats they may read.
-- ---------------------------------------------------------------------------------------------

create or replace function public.inbox_search(p_query text, p_limit integer default 40)
returns table (
  kind text,
  conversation_id bigint,
  message_id bigint,
  created_at timestamptz,
  snippet text,
  chat jsonb,
  last_message jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern,
      least(greatest(coalesce(p_limit, 40), 1), 100) as max_rows
    where char_length(btrim(coalesce(p_query, ''))) >= 2
  ),
  people as (
    select 'chat'::text as kind, c.conversation_id, null::bigint as message_id, c.last_activity_at as created_at,
      c.contact_name as snippet, c.raw as chat, c.last_message_raw as last_message
    from public.inbox_chats c, q
    where c.raw is not null
      and (c.contact_name ilike q.pattern or c.contact_phone ilike q.pattern or c.contact_identifier ilike q.pattern)
    order by c.last_activity_at desc nulls last
    limit (select max_rows from q)
  ),
  words as (
    select 'message'::text as kind, m.conversation_id, m.id as message_id, m.created_at,
      left(m.content, 300) as snippet, c.raw as chat, c.last_message_raw as last_message
    from public.inbox_messages m
    join public.inbox_chats c on c.conversation_id = m.conversation_id, q
    where not m.deleted and m.content ilike q.pattern
    order by m.created_at desc
    limit (select max_rows from q)
  )
  select * from people
  union all
  select * from words;
$$;

revoke all on function public.inbox_search(text, integer) from public, anon;
grant execute on function public.inbox_search(text, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Live: the page hears about changes in the copy (Realtime follows the same "who may read" rule).
-- ---------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['inbox_chats', 'inbox_messages'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- What was copied before this had no raw: those chats are read again by the next "Carry on copying"
-- (an admin presses it once). Until then the page reads those chats from Chatwoot, as before.
update public.inbox_chats set needs_copy = true where raw is null and needs_copy = false;

-- ---------------------------------------------------------------------------------------------
-- Faster "who may read": the rule was worked out again for every row (a search over 10,000 messages took
-- 8 seconds). The person's ticks and numbers are now looked up once per query.
-- ---------------------------------------------------------------------------------------------

drop policy if exists "Leads tick reads the chats it may see" on public.inbox_chats;
drop policy if exists "Leads tick reads the messages it may see" on public.inbox_messages;

create policy "Leads tick reads the chats it may see"
  on public.inbox_chats for select to authenticated
  using (
    (select public.has_permission('leads', 'view'))
    and (
      inbox_id is null
      or (select public.my_whatsapp_inbox_ids()) is null
      or inbox_id = any ((select public.my_whatsapp_inbox_ids())::bigint[])
      or inbox_id <> all (array(select n.chatwoot_inbox_id::bigint from public.whatsapp_numbers n where n.chatwoot_inbox_id is not null))
    )
  );

create policy "Leads tick reads the messages it may see"
  on public.inbox_messages for select to authenticated
  using (
    (select public.has_permission('leads', 'view'))
    and (
      inbox_id is null
      or (select public.my_whatsapp_inbox_ids()) is null
      or inbox_id = any ((select public.my_whatsapp_inbox_ids())::bigint[])
      or inbox_id <> all (array(select n.chatwoot_inbox_id::bigint from public.whatsapp_numbers n where n.chatwoot_inbox_id is not null))
    )
  );

-- ---------------------------------------------------------------------------------------------
-- The newest messages of many chats at once, so the page has them before a chat is opened (it then opens at once).
-- ---------------------------------------------------------------------------------------------

create or replace function public.inbox_recent_messages(p_conversation_ids bigint[], p_per_chat integer default 20)
returns table (conversation_id bigint, raw jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.conversation_id, m.raw
  from unnest(p_conversation_ids[1:60]) as chat(id)
  cross join lateral (
    select im.conversation_id, im.raw
    from public.inbox_messages im
    where im.conversation_id = chat.id and im.raw is not null
    order by im.id desc
    limit least(greatest(coalesce(p_per_chat, 20), 1), 50)
  ) m;
$$;

revoke all on function public.inbox_recent_messages(bigint[], integer) from public, anon;
grant execute on function public.inbox_recent_messages(bigint[], integer) to authenticated;
