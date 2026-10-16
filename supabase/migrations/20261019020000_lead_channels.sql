-- Messenger / Instagram people become leads, and a lead knows every channel it writes on.
--
-- A lead used to be "a phone number". A parent who first writes on Messenger has no number, so nobody
-- was made of them. Now every Messenger / Instagram chat makes a lead (no phone), and lead_channels lists,
-- for each lead, the chats it has: WhatsApp on number A, WhatsApp on number B, Messenger of Page X, ...
--
-- * One row per (Chatwoot contact, inbox): a person who writes on two WhatsApp numbers has two rows.
-- * channel is its own category, apart from the lead's Source ("how did they hear about us").
-- * The rows are made by the server: the chat-activity webhook (record_chat_channel) and, as a backfill
--   and a fallback, the inbox of whoever has it open (ensure_lead_channels).
-- * merge_leads(keep, remove) joins two leads that turned out to be one family. The lead with a phone
--   number is the main one; everything of the other lead moves over.

create table if not exists public.lead_channels (
  id bigint generated always as identity primary key,
  lead_id bigint not null references public.leads (id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'messenger', 'instagram')),
  -- The Chatwoot contact and inbox of the chat; with the inbox this is what makes a row unique.
  chatwoot_contact_id bigint not null,
  inbox_id bigint not null default 0,
  inbox_name text check (inbox_name is null or char_length(inbox_name) <= 200),
  conversation_id bigint,
  -- The name on that channel (the Messenger name; the WhatsApp profile name).
  display_name text check (display_name is null or char_length(display_name) <= 200),
  -- The Facebook Page they wrote to (Messenger / Instagram).
  page_name text check (page_name is null or char_length(page_name) <= 200),
  first_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (chatwoot_contact_id, inbox_id)
);

create index if not exists lead_channels_lead_idx on public.lead_channels (lead_id);
create index if not exists lead_channels_channel_idx on public.lead_channels (channel);

alter table public.lead_channels enable row level security;

create policy "lead_channels_select_permitted"
on public.lead_channels
for select to authenticated
using ((select public.has_permission('leads')));

grant select on public.lead_channels to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- The one place a chat is tied to a lead.
-- ---------------------------------------------------------------------------------------------------
-- messenger / instagram: the chat's person gets a lead (once), then the chat is listed on it.
-- whatsapp: only listed on a lead the school already has for that contact or number; WhatsApp leads
-- are still made by auto_lead_from_chat (a source keyword) or by a person.
create or replace function public.lead_channel_for_chat(
  p_channel text,
  p_contact_id bigint,
  p_conversation_id bigint,
  p_inbox_id bigint,
  p_inbox_name text,
  p_name text,
  p_phone text,
  p_page_name text,
  p_at timestamptz,
  p_text text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_lead bigint;
  digits text;
  clean_name text;
  message_text text;
  rule_row record;
  matched_source bigint;
  matched_tags bigint[] := '{}';
  matched_rule bigint;
  source_found bigint;
  other_source bigint;
  tags_found bigint[];
  made_note text := 'Added by itself from a Messenger / Instagram chat.';
begin
  if p_channel not in ('whatsapp', 'messenger', 'instagram') or p_contact_id is null or p_contact_id <= 0 then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext('lead_channel:' || p_contact_id::text));

  clean_name := nullif(btrim(left(coalesce(p_name, ''), 200)), '');

  -- This person's chat is already on a lead (on this or another inbox of theirs).
  select lc.lead_id into found_lead
  from public.lead_channels lc
  where lc.chatwoot_contact_id = p_contact_id
  order by lc.id
  limit 1;

  -- Or the family table already ties this contact to a lead.
  if found_lead is null then
    select pe.lead_id into found_lead
    from public.people pe
    where pe.chatwoot_contact_id = p_contact_id and pe.lead_id is not null
    limit 1;
  end if;

  if found_lead is null and p_channel = 'whatsapp' then
    digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
    if digits ~ '^(60|65)[0-9]{8,10}$' then
      select l.id into found_lead
      from public.leads l
      where public.people_digits(l.phone) = digits
         or exists (
           select 1 from jsonb_array_elements(coalesce(l.children, '[]'::jsonb)) c
           where public.people_digits(c ->> 'phone') = digits
         )
      order by l.id
      limit 1;
    end if;
  end if;

  if found_lead is null and p_channel in ('messenger', 'instagram') then
    -- The same keyword rules as a WhatsApp lead: they decide the source and tags when the text matches.
    message_text := btrim(regexp_replace(lower(coalesce(p_text, '')), '[^[:alnum:]]+', ' ', 'g'));
    if message_text <> '' then
      for rule_row in
        select r.id, r.source_id, r.tag_ids,
               btrim(regexp_replace(lower(r.phrase), '[^[:alnum:]]+', ' ', 'g')) as phrase_key
        from public.lead_source_rules r
        where r.is_active
        order by char_length(btrim(regexp_replace(lower(r.phrase), '[^[:alnum:]]+', ' ', 'g'))) desc, r.id
      loop
        if rule_row.phrase_key = '' or position(rule_row.phrase_key in message_text) = 0 then
          continue;
        end if;
        if matched_rule is null then
          matched_rule := rule_row.id;
        end if;
        if matched_source is null and rule_row.source_id is not null then
          matched_source := rule_row.source_id;
        end if;
        matched_tags := matched_tags || rule_row.tag_ids;
      end loop;
    end if;

    select o.id into source_found from public.lead_options o
    where o.id = matched_source and o.kind = 'source' and o.is_active;
    select o.id into other_source from public.lead_options o
    where o.kind = 'source' and o.legacy_key = 'other' limit 1;
    select coalesce(array_agg(distinct o.id), '{}') into tags_found from public.lead_options o
    where o.kind = 'tag' and o.is_active and o.id = any (matched_tags);

    if p_channel = 'instagram' then
      made_note := 'Added by itself from an Instagram chat.';
    else
      made_note := 'Added by itself from a Messenger chat' ||
        case when nullif(btrim(coalesce(p_page_name, '')), '') is null then '.'
             else ' (Page: ' || left(btrim(p_page_name), 120) || ').' end;
    end if;

    insert into public.leads (
      full_name, phone, state, source_id, pic_id, tag_ids, status, children, notes, added_date, source_rule_id
    )
    values (
      clean_name,
      null,
      null,
      coalesce(source_found, other_source),
      null,
      coalesce(tags_found, '{}'),
      'new',
      '[]'::jsonb,
      made_note,
      (coalesce(p_at, now()) at time zone 'Asia/Kuala_Lumpur')::date,
      matched_rule
    )
    returning id into found_lead;
  end if;

  if found_lead is null then
    return null;
  end if;

  insert into public.lead_channels (
    lead_id, channel, chatwoot_contact_id, inbox_id, inbox_name, conversation_id, display_name, page_name, first_seen_at
  )
  values (
    found_lead,
    p_channel,
    p_contact_id,
    coalesce(p_inbox_id, 0),
    nullif(btrim(left(coalesce(p_inbox_name, ''), 200)), ''),
    p_conversation_id,
    clean_name,
    nullif(btrim(left(coalesce(p_page_name, ''), 200)), ''),
    coalesce(p_at, now())
  )
  on conflict (chatwoot_contact_id, inbox_id) do update
  set inbox_name = coalesce(excluded.inbox_name, public.lead_channels.inbox_name),
      conversation_id = coalesce(public.lead_channels.conversation_id, excluded.conversation_id),
      display_name = coalesce(excluded.display_name, public.lead_channels.display_name),
      page_name = coalesce(excluded.page_name, public.lead_channels.page_name);

  return found_lead;
end;
$$;

revoke all on function public.lead_channel_for_chat(text, bigint, bigint, bigint, text, text, text, text, timestamptz, text)
from public, anon, authenticated;

-- The chat-activity webhook: every message, either direction.
create or replace function public.record_chat_channel(
  p_key text,
  p_channel text,
  p_contact_id bigint,
  p_conversation_id bigint,
  p_inbox_id bigint,
  p_inbox_name text,
  p_name text,
  p_phone text,
  p_page_name text,
  p_at timestamptz,
  p_text text
)
returns bigint
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
  return public.lead_channel_for_chat(
    p_channel, p_contact_id, p_conversation_id, p_inbox_id, p_inbox_name, p_name, p_phone, p_page_name, p_at, p_text
  );
end;
$$;

revoke all on function public.record_chat_channel(text, text, bigint, bigint, bigint, text, text, text, text, timestamptz, text)
from public, anon, authenticated;
grant execute on function public.record_chat_channel(text, text, bigint, bigint, bigint, text, text, text, text, timestamptz, text)
to service_role;

-- The inbox of whoever has it open: chats that were there before this existed (a backfill, once) and any
-- the webhook missed. p_rows: [{channel, contact_id, conversation_id, inbox_id, inbox_name, name, phone,
-- page_name, at, text}]. Returns {"<contact id>": <lead id>} for the chats that now sit on a lead.
create or replace function public.ensure_lead_channels(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  lead_found bigint;
  result jsonb := '{}'::jsonb;
  counted integer := 0;
begin
  if not (select public.has_permission('leads', 'edit')) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return result;
  end if;

  for item in select value from jsonb_array_elements(p_rows) loop
    counted := counted + 1;
    exit when counted > 100;
    lead_found := public.lead_channel_for_chat(
      item ->> 'channel',
      nullif(item ->> 'contact_id', '')::bigint,
      nullif(item ->> 'conversation_id', '')::bigint,
      nullif(item ->> 'inbox_id', '')::bigint,
      item ->> 'inbox_name',
      item ->> 'name',
      item ->> 'phone',
      item ->> 'page_name',
      coalesce(nullif(item ->> 'at', '')::timestamptz, now()),
      item ->> 'text'
    );
    if lead_found is not null then
      result := result || jsonb_build_object(item ->> 'contact_id', lead_found);
    end if;
  end loop;
  return result;
end;
$$;

revoke all on function public.ensure_lead_channels(jsonb) from public, anon;
grant execute on function public.ensure_lead_channels(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- Two leads that are one family.
-- ---------------------------------------------------------------------------------------------------
create or replace function public.merge_leads(p_keep bigint, p_remove bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.leads%rowtype;
  b public.leads%rowtype;
  main public.leads%rowtype;
  other public.leads%rowtype;
  rank_main integer;
  rank_other integer;
  merged_children jsonb;
  merged_checks jsonb;
  merged_notes text;
  main_parent bigint;
  other_parent record;
begin
  if not (select public.has_permission('leads', 'edit')) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if p_keep is null or p_remove is null or p_keep = p_remove then
    raise exception 'Pick two different leads.';
  end if;

  -- Always lock in the same order.
  select * into a from public.leads where id = least(p_keep, p_remove) for update;
  select * into b from public.leads where id = greatest(p_keep, p_remove) for update;
  if a.id is null or b.id is null then
    raise exception 'A lead was not found.';
  end if;

  -- The lead with a phone number is the main one; with no difference, the one the caller kept, or the earlier.
  if (a.phone is null or btrim(a.phone) = '') <> (b.phone is null or btrim(b.phone) = '') then
    if a.phone is not null and btrim(a.phone) <> '' then
      main := a; other := b;
    else
      main := b; other := a;
    end if;
  elsif p_keep = a.id then
    main := a; other := b;
  else
    main := b; other := a;
  end if;

  -- Children: the main lead's, then the other's that are not already there (same name and age).
  select coalesce(jsonb_agg(c order by ord), '[]'::jsonb) into merged_children
  from (
    select c, ord from (
      select c, row_number() over () as ord
      from jsonb_array_elements(coalesce(main.children, '[]'::jsonb)) c
    ) first_list
    union all
    select c, ord + 1000 from (
      select c, row_number() over () as ord
      from jsonb_array_elements(coalesce(other.children, '[]'::jsonb)) c
    ) second_list
    where not exists (
      select 1 from jsonb_array_elements(coalesce(main.children, '[]'::jsonb)) m
      where lower(btrim(coalesce(m ->> 'name', ''))) = lower(btrim(coalesce(c ->> 'name', '')))
        and coalesce(m ->> 'age', '') = coalesce(c ->> 'age', '')
    )
  ) joined;

  if jsonb_typeof(main.checks) = 'object' and jsonb_typeof(other.checks) = 'object' then
    merged_checks := other.checks || main.checks;
  else
    merged_checks := main.checks;
  end if;

  merged_notes := nullif(btrim(coalesce(main.notes, '')), '');
  if nullif(btrim(coalesce(other.notes, '')), '') is not null then
    merged_notes := coalesce(merged_notes || E'\n\n', '') ||
      '(Joined with lead #' || other.id || ') ' || btrim(other.notes);
  end if;

  rank_main := array_position(array['lost', 'new', 'contacted', 'trial_scheduled', 'trial_completed', 'converted'], main.status);
  rank_other := array_position(array['lost', 'new', 'contacted', 'trial_scheduled', 'trial_completed', 'converted'], other.status);

  -- Everything that points at the other lead now points at the main one.
  update public.lead_channels set lead_id = main.id where lead_id = other.id;
  update public.trial_bookings set lead_id = main.id where lead_id = other.id;
  update public.form_submissions set lead_id = main.id where lead_id = other.id;
  update public.lead_receipts set lead_id = main.id where lead_id = other.id;
  update public.lead_zoom_meetings set lead_id = main.id where lead_id = other.id;
  update public.automation_queue set lead_id = main.id where lead_id = other.id;
  update public.automation_flow_log set lead_id = main.id where lead_id = other.id;
  update public.calendar_items set lead_id = main.id where lead_id = other.id;

  -- The family table: one parent row per lead. The other lead's parent row folds into the main one's.
  select id into main_parent from public.people
  where lead_id = main.id and kind = 'parent' order by id limit 1;
  for other_parent in
    select id, kind, chatwoot_contact_id from public.people where lead_id = other.id order by id
  loop
    if other_parent.kind = 'parent' and main_parent is not null then
      update public.people set parent_id = main_parent where parent_id = other_parent.id;
      if other_parent.chatwoot_contact_id is not null then
        update public.people
        set chatwoot_contact_id = other_parent.chatwoot_contact_id
        where id = main_parent and chatwoot_contact_id is null
          and not exists (
            select 1 from public.people o
            where o.chatwoot_contact_id = other_parent.chatwoot_contact_id and o.id <> other_parent.id
          );
        -- the unique contact id has to be free before it can move
        update public.people set chatwoot_contact_id = null where id = other_parent.id;
        update public.people
        set chatwoot_contact_id = other_parent.chatwoot_contact_id
        where id = main_parent and chatwoot_contact_id is null;
      end if;
      delete from public.people where id = other_parent.id;
    else
      update public.people set lead_id = main.id where id = other_parent.id;
      if other_parent.kind = 'parent' then
        main_parent := other_parent.id;
      end if;
    end if;
  end loop;

  -- The other lead goes first: its phone number may not exist twice while the main lead takes it.
  delete from public.leads where id = other.id;

  update public.leads
  set full_name = coalesce(nullif(btrim(coalesce(main.full_name, '')), ''), other.full_name),
      phone = coalesce(nullif(btrim(coalesce(main.phone, '')), ''), other.phone),
      state = coalesce(main.state, other.state),
      source_id = coalesce(main.source_id, other.source_id),
      source_rule_id = coalesce(main.source_rule_id, other.source_rule_id),
      pic_id = coalesce(main.pic_id, other.pic_id),
      status = case when coalesce(rank_other, 0) > coalesce(rank_main, 0) then other.status else main.status end,
      converted_student_id = coalesce(main.converted_student_id, other.converted_student_id),
      children = merged_children,
      checks = merged_checks,
      notes = merged_notes,
      tag_ids = (
        select coalesce(array_agg(distinct t), '{}') from unnest(main.tag_ids || other.tag_ids) t
      ),
      follow_ups = coalesce(main.follow_ups, '[]'::jsonb) || coalesce(other.follow_ups, '[]'::jsonb),
      tasks = coalesce(main.tasks, '[]'::jsonb) || coalesce(other.tasks, '[]'::jsonb),
      added_date = least(main.added_date, other.added_date)
  where id = main.id;

  return main.id;
end;
$$;

revoke all on function public.merge_leads(bigint, bigint) from public, anon;
grant execute on function public.merge_leads(bigint, bigint) to authenticated;
