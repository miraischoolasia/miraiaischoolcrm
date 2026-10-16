-- The server-side first-message lead also covers a chat whose number WhatsApp hides.
--
-- 20261018060000 only made a lead for a real Malaysian / Singapore number, so a parent whose number is hidden
-- (all there is is an internal 13 to 15 digit ID and the name they show) still waited for someone to have the
-- inbox open: MANDY wrote at 08:19, became a lead at 09:54 (made by the browser) and was messaged at 09:58.
-- The browser keeps that ID where the phone number goes (it is how the automation sender finds the chat), so
-- this does the same, and uses the name the parent shows as the lead's name.

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
  hidden boolean := false;
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
  if digits ~ '^(60|65)[0-9]{8,10}$' then
    hidden := false;
  elsif digits ~ '^[0-9]{13,15}$' and regexp_replace(coalesce(p_name, ''), '[^[:alpha:]]', '', 'g') <> '' then
    -- WhatsApp hides the number: all there is is its internal ID and the name the parent shows. The browser
    -- keeps the ID where the number goes, and so does this (it is what the automation sender finds the chat by).
    hidden := true;
  else
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
    case
      when hidden then nullif(left(btrim(regexp_replace(coalesce(p_name, ''), '\s*\+[0-9]{10,12}$', '')), 200), '')
    end,
    '+' || digits,
    null,
    coalesce(source_found, other_source),
    null,
    tags_found,
    'new',
    '[]'::jsonb,
    'Added by itself from the first WhatsApp message ('
      || case when hidden then 'WhatsApp hides the number; ' else '' end
      || 'source keyword: "' || left(matched_phrase, 120) || '").',
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
