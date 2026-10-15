-- A lead moves from "New" to "Contacted" by itself, the moment the school writes to the parent.
--
-- A lead made from a first message, a form or an advert starts as "new". As soon as anything goes out in
-- that parent's WhatsApp chat (a person replying in the inbox, an automation, or a message sent from the
-- phone) the lead has been contacted, so nobody has to drag it to the next column.
--
-- Only "new" moves, and only to "contacted". A lead already further on (trial scheduled, converted, lost)
-- is never moved back, and a lead somebody put in "contacted" by hand stays as it is.
--
-- It is called by the chat-activity webhook for every message the school sends, with the same key the
-- webhook already uses; nothing in the browser can call it.

create or replace function public.mark_lead_contacted_from_chat(
  p_key text,
  p_contact_id bigint,
  p_phone text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_key text;
  digits text;
  lead_found bigint;
begin
  select webhook_key into stored_key from public.chat_webhook_settings limit 1;
  if p_key is null or stored_key is null or p_key <> stored_key then
    raise exception 'The key is not right.' using errcode = '28000';
  end if;

  -- The lead the chat's contact is already tied to.
  if p_contact_id is not null then
    select pe.lead_id into lead_found
    from public.people pe
    where pe.chatwoot_contact_id = p_contact_id and pe.lead_id is not null
    limit 1;
  end if;

  -- Otherwise the lead that owns the chat's real number (its own, or a child's).
  if lead_found is null then
    digits := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
    if digits ~ '^(60|65)[0-9]{8,10}$' then
      select l.id into lead_found
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

  if lead_found is null then
    return null;
  end if;

  update public.leads set status = 'contacted' where id = lead_found and status = 'new';
  if not found then
    return null;
  end if;
  return lead_found;
end;
$$;

revoke all on function public.mark_lead_contacted_from_chat(text, bigint, text) from public, anon, authenticated;
grant execute on function public.mark_lead_contacted_from_chat(text, bigint, text) to service_role;
