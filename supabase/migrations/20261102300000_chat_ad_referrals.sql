-- Which advert a parent came from (boss 2026-10-23: "三条路一起做"; plan: side notes chat-ad-source-plan.md).
--
-- One table for the three roads an advert click reaches us by:
--   evolution     WhatsApp Click-to-WhatsApp: the first message carries contextInfo.externalAdReply (title, body,
--                 picture, ad id, View ad link). The WhatsApp server's wa-ads reads it from Evolution.
--   meta_webhook  Mirai's own Messenger (Meta app + Chatwoot): the referral Meta sends with a message from an advert
--                 (ad_id, ads_context_data.ad_title / photo_url / post_id). The server's meta-tee copies it.
--   ghl           EduHero's Messenger / Instagram through GoHighLevel: the contact's attributionSource (adId, postId,
--                 campaign, the advert's picture or video). The GoHighLevel bridge sends it.
-- Each road writes through the edge function ad-referral-intake (service role), which keeps the picture in the
-- public bucket chat-ad-thumbnails and calls record_chat_ad_referral() with the reporter key (as wa-watch does).
--
-- The CRM only reads: the card above a chat (newest click of the conversation, the first one marked), the lead's
-- first advert (view lead_first_ads), later the Data Center (adverts and EC results by ad id).
-- One database is one school, so there is no school column.

-- ---------------------------------------------------------------------------------------------------------
-- The reporters' key (one key for the three roads; the server keeps it, nobody else sees it).
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.chat_ad_reporter (
  id boolean primary key default true check (id),
  reporter_key text not null
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
insert into public.chat_ad_reporter (id) values (true) on conflict (id) do nothing;
alter table public.chat_ad_reporter enable row level security;
revoke all on public.chat_ad_reporter from public, anon, authenticated;

-- ad-referral-intake asks this before it keeps any picture (so nobody without the key can fill the bucket).
create or replace function public.chat_ad_reporter_ok(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_key is not null and exists (select 1 from public.chat_ad_reporter r where r.reporter_key = p_key);
$$;
revoke all on function public.chat_ad_reporter_ok(text) from public, anon, authenticated;
grant execute on function public.chat_ad_reporter_ok(text) to service_role;

-- ---------------------------------------------------------------------------------------------------------
-- The clicks
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.chat_ad_referrals (
  id bigint generated always as identity primary key,
  channel text not null check (channel in ('whatsapp', 'messenger', 'instagram')),
  via text not null check (via in ('evolution', 'meta_webhook', 'ghl')),
  -- What makes a click unique on its road: the WhatsApp message id, Meta's message id (or ref:<sender>:<time>),
  -- ghl:<contact>:<ad>:first|last. The same click sent twice is one row.
  external_id text not null check (char_length(external_id) between 1 and 200),
  -- The Chatwoot chat it belongs to (the card is found by conversation_id).
  inbox_id bigint not null default 0,
  conversation_id bigint,
  chatwoot_contact_id bigint,
  -- The lead of that chat, filled when known (now or when the lead is made later; see lead_channels trigger).
  lead_id bigint references public.leads (id) on delete set null,
  ad_id text check (ad_id is null or char_length(ad_id) <= 100),
  post_id text check (post_id is null or char_length(post_id) <= 200),
  campaign_id text check (campaign_id is null or char_length(campaign_id) <= 100),
  campaign_name text check (campaign_name is null or char_length(campaign_name) <= 200),
  adset_id text check (adset_id is null or char_length(adset_id) <= 100),
  -- The advert's words as the parent saw them (GoHighLevel gives none: the card shows campaign_name then; the
  -- Data Center's ad names fill it in later by ad_id).
  title text check (title is null or char_length(title) <= 200),
  body text check (body is null or char_length(body) <= 500),
  media_type text not null default 'none' check (media_type in ('image', 'video', 'none')),
  -- Path in the public bucket chat-ad-thumbnails (one file per picture: ads/<sha256 16>.jpg).
  thumbnail_path text check (thumbnail_path is null or thumbnail_path ~ '^ads/[a-f0-9]{16}\.(jpg|png|webp)$'),
  -- "View ad": fb.me / instagram.com from WhatsApp, https://www.facebook.com/<post_id> otherwise.
  view_url text check (view_url is null or (view_url ~ '^https://' and char_length(view_url) <= 500)),
  source_app text check (source_app is null or source_app in ('facebook', 'instagram')),
  -- ad, or post (a boosted / plain post); only an ad counts in the advert results.
  source_type text check (source_type is null or source_type in ('ad', 'post')),
  -- WhatsApp's click id (for telling Meta about a conversion later). Not shown.
  ctwa_clid text check (ctwa_clid is null or char_length(ctwa_clid) <= 300),
  clicked_at timestamptz not null,
  -- The first click of this chat (true) or a later one (false). Set by record_chat_ad_referral().
  is_first boolean not null default true,
  created_at timestamptz not null default now(),
  unique (via, external_id)
);

create index if not exists chat_ad_referrals_conversation on public.chat_ad_referrals (conversation_id, clicked_at);
create index if not exists chat_ad_referrals_contact on public.chat_ad_referrals (chatwoot_contact_id, inbox_id);
create index if not exists chat_ad_referrals_lead on public.chat_ad_referrals (lead_id, clicked_at) where lead_id is not null;
create index if not exists chat_ad_referrals_ad on public.chat_ad_referrals (ad_id) where ad_id is not null;

alter table public.chat_ad_referrals enable row level security;
revoke all on public.chat_ad_referrals from public, anon, authenticated;
grant select on public.chat_ad_referrals to authenticated;

-- Seen by whoever sees chats or leads (or the Data Center), never for a number hidden from them (the Inbox rule).
drop policy if exists chat_ad_referrals_read on public.chat_ad_referrals;
create policy chat_ad_referrals_read on public.chat_ad_referrals
  for select to authenticated
  using (
    (
      (select public.has_permission('inbox', 'view'))
      or (select public.has_permission('leads', 'view'))
      or (select public.has_permission('student_inbox', 'view'))
      or (select public.has_permission('data_center', 'view'))
    )
    and inbox_id <> all (coalesce((select public.my_hidden_inbox_ids())::bigint[], '{}'::bigint[]))
  );

-- ---------------------------------------------------------------------------------------------------------
-- Which clicks are first, and their lead
-- ---------------------------------------------------------------------------------------------------------

-- The chat's first click is the earliest one (an older click found later, e.g. by a backfill, becomes the first).
create or replace function public.chat_ad_mark_first(p_conversation_id bigint, p_contact_id bigint, p_inbox_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  with chat as (
    select r.id, row_number() over (order by r.clicked_at, r.id) as n
    from public.chat_ad_referrals r
    where (p_conversation_id is not null and r.conversation_id = p_conversation_id)
       or (p_conversation_id is null and r.conversation_id is null
           and r.chatwoot_contact_id = p_contact_id and r.inbox_id = p_inbox_id)
  )
  update public.chat_ad_referrals r
  set is_first = (chat.n = 1)
  from chat
  where r.id = chat.id and r.is_first is distinct from (chat.n = 1);
$$;
revoke all on function public.chat_ad_mark_first(bigint, bigint, bigint) from public, anon, authenticated;

-- Gives a lead's chats' clicks their lead (by conversation, else by the Chatwoot contact on that number / Page).
create or replace function public.chat_ad_link_lead(p_lead_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.chat_ad_referrals r
  set lead_id = p_lead_id
  from public.lead_channels c
  where c.lead_id = p_lead_id
    and r.lead_id is distinct from p_lead_id
    and (
      (c.conversation_id is not null and r.conversation_id = c.conversation_id)
      or (r.chatwoot_contact_id = c.chatwoot_contact_id and r.inbox_id = c.inbox_id)
    );
$$;
revoke all on function public.chat_ad_link_lead(bigint) from public, anon, authenticated;

-- A chat that becomes a lead's (a new lead, a merge, a chat added) brings its clicks along.
create or replace function public.lead_channels_link_ads()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.chat_ad_link_lead(new.lead_id);
  return new;
end;
$$;

drop trigger if exists lead_channels_link_ads on public.lead_channels;
create trigger lead_channels_link_ads
  after insert or update of lead_id, conversation_id on public.lead_channels
  for each row execute function public.lead_channels_link_ads();

-- The chat of a message, from the CRM's copy of the inbox (inbox_messages keeps Chatwoot's source_id: "WAID:<id>"
-- for WhatsApp, Meta's message id "m_..." for Messenger); looked for within a day of the click, so the created_at
-- index is used. Clicks without a message of their own (a Messenger referral event) have none: null.
create or replace function public.chat_ad_conversation_of(p_via text, p_external_id text, p_at timestamptz)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select m.conversation_id
  from public.inbox_messages m
  where p_via in ('evolution', 'meta_webhook')
    and p_external_id !~ '^ref:'
    and m.created_at between p_at - interval '1 day' and p_at + interval '1 day'
    and m.raw ->> 'source_id' = case p_via when 'evolution' then 'WAID:' || p_external_id else p_external_id end
  order by m.id
  limit 1;
$$;
revoke all on function public.chat_ad_conversation_of(text, text, timestamptz) from public, anon, authenticated;

-- The CRM's copy may get a message a little after the server read it: every 10 minutes the recent clicks still
-- without a chat look again, and then find their first click and their lead.
create or replace function public.chat_ad_fill_conversations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  click record;
  filled integer := 0;
  found_conversation bigint;
  found_lead bigint;
begin
  for click in
    select r.id, r.via, r.external_id, r.clicked_at, r.chatwoot_contact_id, r.inbox_id
    from public.chat_ad_referrals r
    where r.via in ('evolution', 'meta_webhook') and r.conversation_id is null and r.created_at > now() - interval '3 days'
  loop
    found_conversation := public.chat_ad_conversation_of(click.via, click.external_id, click.clicked_at);
    continue when found_conversation is null;
    select c.lead_id into found_lead from public.lead_channels c where c.conversation_id = found_conversation order by c.id limit 1;
    update public.chat_ad_referrals
    set conversation_id = found_conversation, lead_id = coalesce(lead_id, found_lead)
    where id = click.id;
    perform public.chat_ad_mark_first(found_conversation, click.chatwoot_contact_id, click.inbox_id);
    filled := filled + 1;
  end loop;
  return filled;
end;
$$;
revoke all on function public.chat_ad_fill_conversations() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'chat-ad-fill-conversations') then
    perform cron.unschedule('chat-ad-fill-conversations');
  end if;
  perform cron.schedule('chat-ad-fill-conversations', '*/10 * * * *', 'select public.chat_ad_fill_conversations()');
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Writing one click (only ad-referral-intake calls this, with the reporter key)
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.record_chat_ad_referral(p_key text, p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored text;
  saved public.chat_ad_referrals;
  found_lead bigint;
  clean text;
begin
  select r.reporter_key into stored from public.chat_ad_reporter r limit 1;
  if p_key is null or stored is null or p_key <> stored then
    raise exception 'not allowed' using errcode = '28000';
  end if;
  if jsonb_typeof(p_item) is distinct from 'object' then
    raise exception 'bad item';
  end if;

  insert into public.chat_ad_referrals as r (
    channel, via, external_id, inbox_id, conversation_id, chatwoot_contact_id, ad_id, post_id, campaign_id,
    campaign_name, adset_id, title, body, media_type, thumbnail_path, view_url, source_app, source_type, ctwa_clid,
    clicked_at
  )
  values (
    p_item->>'channel',
    p_item->>'via',
    left(p_item->>'external_id', 200),
    coalesce((p_item->>'inbox_id')::bigint, 0),
    (p_item->>'conversation_id')::bigint,
    (p_item->>'chatwoot_contact_id')::bigint,
    nullif(left(btrim(p_item->>'ad_id'), 100), ''),
    nullif(left(btrim(p_item->>'post_id'), 200), ''),
    nullif(left(btrim(p_item->>'campaign_id'), 100), ''),
    nullif(left(btrim(p_item->>'campaign_name'), 200), ''),
    nullif(left(btrim(p_item->>'adset_id'), 100), ''),
    nullif(left(btrim(p_item->>'title'), 200), ''),
    nullif(left(btrim(p_item->>'body'), 500), ''),
    coalesce(nullif(p_item->>'media_type', ''), 'none'),
    nullif(p_item->>'thumbnail_path', ''),
    nullif(p_item->>'view_url', ''),
    nullif(p_item->>'source_app', ''),
    nullif(p_item->>'source_type', ''),
    nullif(left(p_item->>'ctwa_clid', 300), ''),
    (p_item->>'clicked_at')::timestamptz
  )
  on conflict (via, external_id) do update
    -- Sent again (a retry, a backfill after the live copy): fill what was missing, never wipe.
    set conversation_id = coalesce(excluded.conversation_id, r.conversation_id),
        chatwoot_contact_id = coalesce(excluded.chatwoot_contact_id, r.chatwoot_contact_id),
        inbox_id = case when r.inbox_id = 0 then excluded.inbox_id else r.inbox_id end,
        ad_id = coalesce(excluded.ad_id, r.ad_id),
        post_id = coalesce(excluded.post_id, r.post_id),
        campaign_id = coalesce(excluded.campaign_id, r.campaign_id),
        campaign_name = coalesce(excluded.campaign_name, r.campaign_name),
        adset_id = coalesce(excluded.adset_id, r.adset_id),
        title = coalesce(excluded.title, r.title),
        body = coalesce(excluded.body, r.body),
        media_type = case when excluded.media_type = 'none' then r.media_type else excluded.media_type end,
        thumbnail_path = coalesce(r.thumbnail_path, excluded.thumbnail_path),
        view_url = coalesce(excluded.view_url, r.view_url),
        source_app = coalesce(excluded.source_app, r.source_app),
        source_type = coalesce(excluded.source_type, r.source_type),
        ctwa_clid = coalesce(excluded.ctwa_clid, r.ctwa_clid)
  returning * into saved;

  -- A click whose chat the server could not name: the CRM's own copy of the chat knows its message.
  if saved.conversation_id is null then
    update public.chat_ad_referrals r
    set conversation_id = public.chat_ad_conversation_of(r.via, r.external_id, r.clicked_at)
    where r.id = saved.id
    returning r.conversation_id into saved.conversation_id;
  end if;

  perform public.chat_ad_mark_first(saved.conversation_id, saved.chatwoot_contact_id, saved.inbox_id);

  if saved.lead_id is null then
    select c.lead_id into found_lead
    from public.lead_channels c
    where (saved.conversation_id is not null and c.conversation_id = saved.conversation_id)
       or (saved.chatwoot_contact_id is not null and c.chatwoot_contact_id = saved.chatwoot_contact_id
           and c.inbox_id = saved.inbox_id)
    order by (c.conversation_id = saved.conversation_id) desc nulls last, c.id
    limit 1;
    if found_lead is not null then
      update public.chat_ad_referrals set lead_id = found_lead where id = saved.id;
      saved.lead_id := found_lead;
    end if;
  end if;

  select r.is_first into saved.is_first from public.chat_ad_referrals r where r.id = saved.id;
  return jsonb_build_object('id', saved.id, 'is_first', saved.is_first, 'lead_id', saved.lead_id);
end;
$$;
revoke all on function public.record_chat_ad_referral(text, jsonb) from public, anon, authenticated;
grant execute on function public.record_chat_ad_referral(text, jsonb) to service_role;

-- ---------------------------------------------------------------------------------------------------------
-- A lead's first advert (earliest click of an ad, else of a post). A view, not a column on leads: nothing on
-- leads is written (its updated_at stays), and a merge or a backfill is right at once.
-- ---------------------------------------------------------------------------------------------------------
create or replace view public.lead_first_ads
with (security_invoker = true)
as
select distinct on (r.lead_id)
  r.lead_id,
  r.id as referral_id,
  r.channel, r.via, r.ad_id, r.post_id, r.campaign_id, r.campaign_name, r.title, r.body, r.media_type,
  r.thumbnail_path, r.view_url, r.source_app, r.source_type, r.clicked_at, r.conversation_id, r.inbox_id
from public.chat_ad_referrals r
where r.lead_id is not null
order by r.lead_id, (r.source_type is distinct from 'post') desc, r.clicked_at, r.id;

grant select on public.lead_first_ads to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- The pictures (the adverts' own pictures, public on Facebook already). Only the service role writes.
-- ---------------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-ad-thumbnails', 'chat-ad-thumbnails', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
