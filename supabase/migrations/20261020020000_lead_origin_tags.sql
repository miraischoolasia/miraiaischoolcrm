-- Where a GoHighLevel person came from, written on the lead made from their chat - now with their tags too.
--
-- Same as 20261020010000, plus p_tags: the tags GoHighLevel has on the contact become CRM tags (made when missing) and
-- are added to the lead. The old six-argument function is dropped.
--
-- The bridge (ghl_bridge.py) puts what GoHighLevel knows about a contact on the Chatwoot contact: whether they came
-- from a paid advert, GoHighLevel's source text, the advert campaign, and when GoHighLevel first met them. The
-- chat-activity webhook hands that to record_lead_origin, which gives the lead made from the chat:
--   * the source: Advertisement for a paid advert, Social Media for anything else from Facebook / Instagram;
--   * the date it came in: the day GoHighLevel first met the person (never later than it already is);
--   * a note line with the campaign and GoHighLevel's source text.
--
-- It only touches a lead nobody has edited: still "Added by itself ..." and still on the source "Other". Once the
-- team changes the source, or the lead has been given one, it is left alone. It can be called any number of times.

drop function if exists public.record_lead_origin(text, bigint, boolean, text, text, timestamptz);

create or replace function public.record_lead_origin(
  p_key text,
  p_contact_id bigint,
  p_paid boolean,
  p_source text,
  p_campaign text,
  p_first_seen timestamptz,
  p_tags text[] default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_key text;
  found_lead public.leads%rowtype;
  other_id bigint;
  wanted_key text;
  wanted_id bigint;
  extra text := '';
  new_notes text;
  tag_labels text[];
  tag_ids_found bigint[];
begin
  select webhook_key into stored_key from public.chat_webhook_settings limit 1;
  if p_key is null or stored_key is null or p_key <> stored_key then
    raise exception 'The key is not right.' using errcode = '28000';
  end if;
  if p_contact_id is null then
    return null;
  end if;

  select l.* into found_lead
  from public.leads l
  join public.lead_channels c on c.lead_id = l.id
  where c.chatwoot_contact_id = p_contact_id
  order by l.id
  limit 1
  for update of l;
  if found_lead.id is null then
    return null;
  end if;

  select o.id into other_id from public.lead_options o where o.kind = 'source' and o.legacy_key = 'other' limit 1;
  if found_lead.source_id is distinct from other_id or coalesce(found_lead.notes, '') not like 'Added by itself%' then
    return null;
  end if;

  wanted_key := case when coalesce(p_paid, false) then 'advertisement' else 'social_media' end;
  select o.id into wanted_id
  from public.lead_options o
  where o.kind = 'source' and o.legacy_key = wanted_key and o.is_active
  limit 1;
  if wanted_id is null then
    return null;
  end if;

  if nullif(btrim(coalesce(p_campaign, '')), '') is not null then
    extra := extra || E'\nCampaign: ' || left(btrim(p_campaign), 200);
  end if;
  if nullif(btrim(coalesce(p_source, '')), '') is not null then
    extra := extra || E'\nGoHighLevel source: ' || left(btrim(p_source), 200);
  end if;
  new_notes := coalesce(found_lead.notes, '') || extra;

  -- GoHighLevel's tags: at most 20, each 1-60 characters; the channel tag is not wanted on a lead.
  select coalesce(array_agg(distinct btrim(t)), '{}') into tag_labels
  from unnest((coalesce(p_tags, '{}'::text[]))[1:20]) t
  where char_length(btrim(t)) between 1 and 60 and lower(btrim(t)) <> 'platform_facebook';
  if array_length(tag_labels, 1) > 0 then
    insert into public.lead_options (kind, label)
    select 'tag', t from unnest(tag_labels) t
    on conflict do nothing;
    select coalesce(array_agg(o.id), '{}') into tag_ids_found
    from public.lead_options o
    where o.kind = 'tag' and lower(btrim(o.label)) = any (select lower(t) from unnest(tag_labels) t);
  else
    tag_ids_found := '{}';
  end if;

  update public.leads
  set source_id = wanted_id,
      source = wanted_key,
      notes = new_notes,
      tag_ids = (select coalesce(array_agg(distinct x), '{}') from unnest(tag_ids || tag_ids_found) x),
      created_at = case when p_first_seen is not null and p_first_seen < created_at then p_first_seen else created_at end,
      added_date = case
        when p_first_seen is not null and (p_first_seen at time zone 'Asia/Kuala_Lumpur')::date < added_date
        then (p_first_seen at time zone 'Asia/Kuala_Lumpur')::date
        else added_date
      end
  where id = found_lead.id;

  return found_lead.id;
end;
$$;

revoke all on function public.record_lead_origin(text, bigint, boolean, text, text, timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.record_lead_origin(text, bigint, boolean, text, text, timestamptz, text[]) to service_role;
