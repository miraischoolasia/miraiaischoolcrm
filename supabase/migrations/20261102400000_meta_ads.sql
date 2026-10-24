-- Data Center part 3: Facebook ads (boss 2026-10-23; plan: side notes data-center-ads-plan.md). Comes after
-- department 5's 20261102300000_chat_ad_referrals.sql: a lead's first advert is its view lead_first_ads.
--
-- The edge function meta-ads-sync reads Meta's Marketing API with the school's own key (Supabase secrets
-- META_ADS_ACCESS_TOKEN + META_AD_ACCOUNT_IDS; the key never reaches the database or the browser) and writes:
--   meta_ad_accounts  each ad account: name, money, time zone, when last read
--   ad_spend_daily    per ad per day: spend, impressions, clicks, conversations started, Meta lead forms
--   meta_ads          each ad: name, state, campaign, its words and picture
--   meta_sync_runs    each run: days, rows, error (the Data Center shows a red line when the last one failed)
-- Reading needs the Ad Spend tick (money); writing is the edge function's only (service role).
--
-- Reports (sums made here):
--   data_center_ads(from, to)       per ad: spend, conversations, the CRM leads whose first advert it was (clicked in
--                                   those days), their trials, conversions and money (real + estimated)
--   data_center_ec_ads(from, to)    per EC: their leads from ads, conversions, money, and their share of the spend
--                                   (each campaign's spend split by how many of its leads each EC got; by
--                                   campaign, not ad, because GoHighLevel sometimes gives the campaign only)
--   data_center_ad_months(month)    six months: spend, conversations, leads from ads, their conversions and money
--   meta_ads_status()               the accounts and the last run, for the status line and the red line
-- Ads reports need both ticks: Ad Spend (money) and Data Center (conversions).

create table public.meta_ad_accounts (
  account_id text primary key check (account_id ~ '^act_\d{3,25}$'),
  name text check (name is null or char_length(name) <= 200),
  currency text check (currency is null or char_length(currency) <= 10),
  timezone text check (timezone is null or char_length(timezone) <= 60),
  status integer,
  last_pulled_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.ad_spend_daily (
  ad_id text not null check (ad_id ~ '^\d{1,30}$'),
  day date not null,
  account_id text not null check (account_id ~ '^act_\d{3,25}$'),
  ad_name text check (ad_name is null or char_length(ad_name) <= 300),
  adset_id text check (adset_id is null or char_length(adset_id) <= 40),
  adset_name text check (adset_name is null or char_length(adset_name) <= 300),
  campaign_id text check (campaign_id is null or char_length(campaign_id) <= 40),
  campaign_name text check (campaign_name is null or char_length(campaign_name) <= 300),
  spend numeric(12, 2) not null default 0 check (spend >= 0),
  impressions bigint not null default 0 check (impressions >= 0),
  clicks bigint not null default 0 check (clicks >= 0),
  link_clicks bigint not null default 0 check (link_clicks >= 0),
  conversations integer not null default 0 check (conversations >= 0),
  meta_leads integer not null default 0 check (meta_leads >= 0),
  pulled_at timestamptz not null default timezone('utc', now()),
  primary key (ad_id, day)
);

create index ad_spend_daily_day_idx on public.ad_spend_daily (day);

create table public.meta_ads (
  ad_id text primary key check (ad_id ~ '^\d{1,30}$'),
  account_id text not null check (account_id ~ '^act_\d{3,25}$'),
  name text check (name is null or char_length(name) <= 300),
  status text check (status is null or char_length(status) <= 40),
  adset_name text check (adset_name is null or char_length(adset_name) <= 300),
  campaign_id text check (campaign_id is null or char_length(campaign_id) <= 40),
  campaign_name text check (campaign_name is null or char_length(campaign_name) <= 300),
  title text check (title is null or char_length(title) <= 300),
  body text check (body is null or char_length(body) <= 1000),
  thumbnail_url text check (thumbnail_url is null or (thumbnail_url ~ '^https://' and char_length(thumbnail_url) <= 1000)),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.meta_sync_runs (
  id bigint generated always as identity primary key,
  started_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz,
  trigger text not null check (trigger in ('schedule', 'admin')),
  dry_run boolean not null default false,
  since date,
  until date,
  rows_read integer not null default 0,
  rows_written integer not null default 0,
  ok boolean,
  -- cleaned of links and keys by the edge function before it is written
  error text check (error is null or char_length(error) <= 1000),
  warnings text[] not null default '{}'
);

create index meta_sync_runs_started_idx on public.meta_sync_runs (started_at desc);

alter table public.meta_ad_accounts enable row level security;
alter table public.ad_spend_daily enable row level security;
alter table public.meta_ads enable row level security;
alter table public.meta_sync_runs enable row level security;
revoke all on public.meta_ad_accounts, public.ad_spend_daily, public.meta_ads, public.meta_sync_runs from public, anon, authenticated;
grant select on public.meta_ad_accounts, public.ad_spend_daily, public.meta_ads, public.meta_sync_runs to authenticated;
grant all on public.meta_ad_accounts, public.ad_spend_daily, public.meta_ads, public.meta_sync_runs to service_role;

create policy meta_ad_accounts_select on public.meta_ad_accounts for select to authenticated using (public.has_permission('ad_spend', 'view'));
create policy ad_spend_daily_select on public.ad_spend_daily for select to authenticated using (public.has_permission('ad_spend', 'view'));
create policy meta_ads_select on public.meta_ads for select to authenticated using (public.has_permission('ad_spend', 'view'));
create policy meta_sync_runs_select on public.meta_sync_runs for select to authenticated using (public.has_permission('ad_spend', 'view'));

-- ---------------------------------------------------------------------------------------------------------
-- Status
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.meta_ads_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('ad_spend', 'view') then
    raise exception 'You do not have the Ad Spend tick.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(jsonb_build_object(
        'accountId', a.account_id, 'name', a.name, 'currency', a.currency, 'timezone', a.timezone, 'lastPulledAt', a.last_pulled_at)
        order by a.account_id) from public.meta_ad_accounts a), '[]'::jsonb),
    'lastRun', (select jsonb_build_object('startedAt', r.started_at, 'finishedAt', r.finished_at, 'trigger', r.trigger, 'dryRun', r.dry_run,
        'since', r.since, 'until', r.until, 'rowsRead', r.rows_read, 'rowsWritten', r.rows_written, 'ok', r.ok, 'error', r.error, 'warnings', r.warnings)
      from public.meta_sync_runs r where not r.dry_run order by r.started_at desc limit 1),
    'lastGoodAt', (select max(r.finished_at) from public.meta_sync_runs r where r.ok and not r.dry_run)
  );
end;
$$;

revoke all on function public.meta_ads_status() from public, anon;
grant execute on function public.meta_ads_status() to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Per ad
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.data_center_ads(p_from date, p_to date)
returns table (
  ad_id text,
  ad_name text,
  title text,
  campaign_id text,
  campaign_name text,
  thumbnail_url text,
  status text,
  spend numeric,
  impressions bigint,
  clicks bigint,
  conversations integer,
  meta_leads integer,
  leads integer,
  trials integer,
  conversions integer,
  revenue_actual numeric,
  revenue_estimated numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('utc', now()) at time zone 'Asia/Kuala_Lumpur')::date;
begin
  if not (public.has_permission('ad_spend', 'view') and public.has_permission('data_center', 'view')) then
    raise exception 'The ads report needs the Ad Spend and Data Center ticks.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 3700 then
    raise exception 'Pick a stretch of days (up to about ten years).';
  end if;

  return query
  with spent as (
    select s.ad_id, sum(s.spend) as spend, sum(s.impressions)::bigint as impressions, sum(s.clicks)::bigint as clicks,
      sum(s.conversations)::integer as conversations, sum(s.meta_leads)::integer as meta_leads,
      max(s.ad_name) as ad_name, max(s.campaign_id) as campaign_id, max(s.campaign_name) as campaign_name
    from public.ad_spend_daily s
    where s.day between p_from and p_to
    group by s.ad_id
  ),
  ad_leads as (
    -- a lead whose first advert was clicked in these days. No ad id: a campaign only (GoHighLevel sometimes gives
    -- just the campaign) gets a line of its own; a post or unknown has neither and shares one line.
    select f.lead_id, f.ad_id, case when f.ad_id is null then f.campaign_id end as camp_only, f.campaign_id, f.campaign_name, f.title
    from public.lead_first_ads f
    where (f.clicked_at at time zone 'Asia/Kuala_Lumpur')::date between p_from and p_to
  ),
  conv as (
    select c.lead_id, count(*)::integer as n,
      coalesce(sum(c.amount) filter (where c.amount_kind = 'actual'), 0) as actual,
      coalesce(sum(c.amount) filter (where c.amount_kind = 'estimated'), 0) as est
    from public.data_center_conversions(p_from, greatest(p_to, v_today)) c
    where c.lead_id in (select al.lead_id from ad_leads al)
    group by c.lead_id
  ),
  per_ad as (
    select al.ad_id, al.camp_only, count(*)::integer as leads,
      (count(*) filter (where exists (select 1 from public.trial_bookings tb where tb.lead_id = al.lead_id)))::integer as trials,
      coalesce(sum(cv.n), 0)::integer as conversions,
      coalesce(sum(cv.actual), 0) as actual,
      coalesce(sum(cv.est), 0) as est,
      max(al.title) as title, max(al.campaign_id) as campaign_id, max(al.campaign_name) as campaign_name
    from ad_leads al
    left join conv cv on cv.lead_id = al.lead_id
    group by al.ad_id, al.camp_only
  ),
  ids as (
    select sp.ad_id, null::text as camp_only from spent sp union select pa.ad_id, pa.camp_only from per_ad pa
  )
  select
    i.ad_id,
    coalesce(ma.name, sp.ad_name),
    coalesce(ma.title, pa.title),
    coalesce(ma.campaign_id, sp.campaign_id, pa.campaign_id, i.camp_only),
    coalesce(ma.campaign_name, sp.campaign_name, pa.campaign_name),
    ma.thumbnail_url,
    ma.status,
    coalesce(sp.spend, 0),
    coalesce(sp.impressions, 0),
    coalesce(sp.clicks, 0),
    coalesce(sp.conversations, 0),
    coalesce(sp.meta_leads, 0),
    coalesce(pa.leads, 0),
    coalesce(pa.trials, 0),
    coalesce(pa.conversions, 0),
    coalesce(pa.actual, 0),
    coalesce(pa.est, 0)
  from ids i
  left join spent sp on sp.ad_id = i.ad_id
  left join per_ad pa on pa.ad_id is not distinct from i.ad_id and pa.camp_only is not distinct from i.camp_only
  left join public.meta_ads ma on ma.ad_id = i.ad_id
  order by (i.ad_id is null), (i.camp_only is null), coalesce(sp.spend, 0) desc, coalesce(pa.leads, 0) desc;
end;
$$;

revoke all on function public.data_center_ads(date, date) from public, anon;
grant execute on function public.data_center_ads(date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Per EC: their leads from ads and their share of the spend
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.data_center_ec_ads(p_from date, p_to date)
returns table (
  ec_id bigint,
  ec_name text,
  ad_leads integer,
  conversions integer,
  revenue_actual numeric,
  revenue_estimated numeric,
  spend_share numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (timezone('utc', now()) at time zone 'Asia/Kuala_Lumpur')::date;
begin
  if not (public.has_permission('ad_spend', 'view') and public.has_permission('data_center', 'view')) then
    raise exception 'The ads report needs the Ad Spend and Data Center ticks.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 3700 then
    raise exception 'Pick a stretch of days (up to about ten years).';
  end if;

  return query
  with ad_leads as (
    -- the lead's campaign: as clicked, else the campaign its ad belongs to
    select f.lead_id, public.pic_staff_id(l.pic_id) as ec,
      coalesce(f.campaign_id,
               (select m.campaign_id from public.meta_ads m where m.ad_id = f.ad_id),
               (select max(s.campaign_id) from public.ad_spend_daily s where s.ad_id = f.ad_id)) as campaign
    from public.lead_first_ads f
    join public.leads l on l.id = f.lead_id
    where (f.clicked_at at time zone 'Asia/Kuala_Lumpur')::date between p_from and p_to
  ),
  -- each campaign's spend is split over the campaign's leads (its ads with no leads still count in it)
  spent as (
    select s.campaign_id as campaign, sum(s.spend) as spend from public.ad_spend_daily s
    where s.day between p_from and p_to and s.campaign_id is not null group by s.campaign_id
  ),
  ad_counts as (
    select al.campaign, count(*) as n from ad_leads al where al.campaign is not null group by al.campaign
  ),
  conv as (
    select c.lead_id, count(*)::integer as n,
      coalesce(sum(c.amount) filter (where c.amount_kind = 'actual'), 0) as actual,
      coalesce(sum(c.amount) filter (where c.amount_kind = 'estimated'), 0) as est
    from public.data_center_conversions(p_from, greatest(p_to, v_today)) c
    where c.lead_id in (select al.lead_id from ad_leads al)
    group by c.lead_id
  )
  select
    al.ec,
    coalesce(t.full_name, '(no EC)'),
    count(*)::integer,
    coalesce(sum(cv.n), 0)::integer,
    coalesce(sum(cv.actual), 0),
    coalesce(sum(cv.est), 0),
    round(coalesce(sum(sp.spend / nullif(ac.n, 0)), 0), 2)
  from ad_leads al
  left join public.teachers t on t.id = al.ec
  left join conv cv on cv.lead_id = al.lead_id
  left join ad_counts ac on ac.campaign = al.campaign
  left join spent sp on sp.campaign = al.campaign
  group by al.ec, t.full_name
  order by count(*) desc, coalesce(t.full_name, '~');
end;
$$;

revoke all on function public.data_center_ec_ads(date, date) from public, anon;
grant execute on function public.data_center_ec_ads(date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- Six months, for the overview
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.data_center_ad_months(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_first date := (date_trunc('month', p_month) - interval '5 months')::date;
  v_last date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_result jsonb;
begin
  if not (public.has_permission('ad_spend', 'view') and public.has_permission('data_center', 'view')) then
    raise exception 'The ads report needs the Ad Spend and Data Center ticks.' using errcode = '42501';
  end if;
  if p_month is null then
    raise exception 'Pick a month.';
  end if;

  with months as (
    select m::date as month, (m + interval '1 month - 1 day')::date as month_end
    from generate_series(v_first, date_trunc('month', p_month)::date, interval '1 month') m
  ),
  ad_lead_ids as (
    select f.lead_id, (f.clicked_at at time zone 'Asia/Kuala_Lumpur')::date as day from public.lead_first_ads f
  ),
  conv as (
    select c.* from public.data_center_conversions(v_first, v_last) c
    where c.lead_id in (select a.lead_id from ad_lead_ids a)
  )
  select jsonb_build_object(
    'months', (select jsonb_agg(jsonb_build_object(
        'month', to_char(m.month, 'YYYY-MM'),
        'spend', (select coalesce(sum(s.spend), 0) from public.ad_spend_daily s where s.day between m.month and m.month_end),
        'conversations', (select coalesce(sum(s.conversations), 0) from public.ad_spend_daily s where s.day between m.month and m.month_end),
        'adLeads', (select count(*) from ad_lead_ids a where a.day between m.month and m.month_end),
        'adConversions', (select count(*) from conv c where c.converted_on between m.month and m.month_end),
        'adRevenueActual', (select coalesce(sum(c.amount), 0) from conv c where c.amount_kind = 'actual' and c.revenue_on between m.month and m.month_end),
        'adRevenueEstimated', (select coalesce(sum(c.amount), 0) from conv c where c.amount_kind = 'estimated' and c.revenue_on between m.month and m.month_end)
      ) order by m.month) from months m),
    'connected', exists (select 1 from public.meta_ad_accounts)
  ) into v_result;
  return v_result;
end;
$$;

revoke all on function public.data_center_ad_months(date) from public, anon;
grant execute on function public.data_center_ad_months(date) to authenticated;
