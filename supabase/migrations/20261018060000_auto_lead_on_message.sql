-- A new lead from a parent's first WhatsApp message, made by the server the moment the message arrives.
--
-- Until now a chat became a lead by itself only in the browser of someone who had the WhatsApp inbox open
-- (useAutoLeads). A parent who wrote at 09:12 while nobody had the inbox open became a lead at 09:59, and
-- every automation that starts from "a new lead" started 47 minutes late. This does the same thing in the
-- database, from the chat-activity webhook, so it no longer depends on a screen being open.
--
-- The rules are the browser's rules, on purpose, so the two never disagree:
--   * only the FIRST message of a chat counts, and it has to come from the parent (a chat the school
--     started, or one this webhook has already seen a message of, is left alone);
--   * the message has to contain the phrase of an active source rule (the longest phrase decides the
--     source; tags of every matching rule are added);
--   * the chat needs a real Malaysian / Singapore number (WhatsApp's hidden IDs are left to the browser);
--   * a number that already belongs to a lead (its own or a child's) or to an enrolled student is left alone.
-- The lead goes in exactly as the browser would have made it. The family table follows by itself (the lead
-- trigger makes the parent row; the chat joins it when the inbox shows the contact).

create or replace function public.auto_lead_from_chat(
  p_key text,
  p_conversation_id bigint,
  p_contact_id bigint,
  p_at timestamptz,
  p_name text,
  p_phone text,
  p_text text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_key text;
  digits text;
  message_text text;
  rule_row record;
  matched_source bigint;
  matched_tags bigint[] := '{}';
  matched_rule bigint;
  matched_phrase text;
  source_found bigint;
  other_source bigint;
  tags_found bigint[];
  new_id bigint;
begin
  select webhook_key into stored_key from public.chat_webhook_settings limit 1;
  if p_key is null or stored_key is null or p_key <> stored_key then
    raise exception 'The key is not right.' using errcode = '28000';
  end if;

  if p_conversation_id is null or p_conversation_id <= 0 or btrim(coalesce(p_text, '')) = '' then
    return null;
  end if;

  -- Only a chat this webhook has not seen a message of: the parent's very first message.
  if exists (select 1 from public.chat_activity where conversation_id = p_conversation_id) then
    return null;
  end if;

  -- A real number only. WhatsApp's hidden IDs are long and do not start with 60 / 65.
  digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  if digits !~ '^(60|65)[0-9]{8,10}$' then
    return null;
  end if;

  message_text := btrim(regexp_replace(lower(p_text), '[^[:alnum:]]+', ' ', 'g'));
  if message_text = '' then
    return null;
  end if;

  -- The same "contains the phrase" match the browser does, longest phrase first.
  for rule_row in
    select r.id, r.phrase, r.source_id, r.tag_ids,
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
      matched_phrase := rule_row.phrase;
    end if;
    if matched_source is null and rule_row.source_id is not null then
      matched_source := rule_row.source_id;
    end if;
    matched_tags := matched_tags || rule_row.tag_ids;
  end loop;

  if matched_rule is null then
    return null;
  end if;

  -- Only a source / tag that is still switched on counts, as in the browser.
  select o.id into source_found from public.lead_options o
  where o.id = matched_source and o.kind = 'source' and o.is_active;
  select o.id into other_source from public.lead_options o
  where o.kind = 'source' and o.legacy_key = 'other' limit 1;
  select coalesce(array_agg(distinct o.id), '{}') into tags_found from public.lead_options o
  where o.kind = 'tag' and o.is_active and o.id = any (matched_tags);

  -- Two messages at once for one number must not make two leads.
  perform pg_advisory_xact_lock(hashtext('auto_lead:' || digits));

  if exists (
    select 1 from public.leads l
    where public.people_digits(l.phone) = digits
       or exists (
         select 1 from jsonb_array_elements(coalesce(l.children, '[]'::jsonb)) c
         where public.people_digits(c ->> 'phone') = digits
       )
  ) then
    return null;
  end if;
  if exists (select 1 from public.students s where public.people_digits(s.phone) = digits) then
    return null;
  end if;
  if p_contact_id is not null and exists (
    select 1 from public.people pe where pe.chatwoot_contact_id = p_contact_id and pe.lead_id is not null
  ) then
    return null;
  end if;

  insert into public.leads (
    full_name, phone, state, source_id, pic_id, tag_ids, status, children, notes, added_date, source_rule_id
  )
  values (
    null,
    '+' || digits,
    null,
    coalesce(source_found, other_source),
    null,
    tags_found,
    'new',
    '[]'::jsonb,
    'Added by itself from the first WhatsApp message (source keyword: "' || left(matched_phrase, 120) || '").',
    (coalesce(p_at, now()) at time zone 'Asia/Kuala_Lumpur')::date,
    matched_rule
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.auto_lead_from_chat(text, bigint, bigint, timestamptz, text, text, text)
from public, anon, authenticated;
grant execute on function public.auto_lead_from_chat(text, bigint, bigint, timestamptz, text, text, text)
to service_role;
