-- Checks for 20261102400000_meta_ads.sql (needs 20261102300000_chat_ad_referrals.sql and the Data Center ones).
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/meta_ads.sql

begin;

create function pg_temp.fails(p_sql text, p_pattern text, p_name text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then
      raise notice 'PASS % [%]', p_name, sqlerrm;
      return;
    end if;
    raise exception 'FAIL % (wrong error: %)', p_name, sqlerrm;
  end;
  raise exception 'FAIL % (no error)', p_name;
end;
$$;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000010' || lpad(n::text, 2, '0'))::uuid, 'mads' || n || '@mirai.internal',
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 3) n;

-- 1 admin, 2 EC with Data Center only, 3 marketing with Data Center + Ad Spend.
insert into public.teachers (id, full_name, username, role, is_active, auth_user_id, permissions)
overriding system value
values
  (91001, 'MA Admin', 'ma_admin', 'admin', true, '00000000-0000-0000-0000-000000001001', '{}'),
  (91002, 'MA Angel', 'ma_angel', 'staff', true, '00000000-0000-0000-0000-000000001002', '{"data_center": {"level": "view"}}'),
  (91003, 'MA Bob', 'ma_bob', 'staff', true, '00000000-0000-0000-0000-000000001003', '{"data_center": {"level": "view"}, "ad_spend": {"level": "view"}}');

create function pg_temp.as_user(p_n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000010' || lpad(p_n::text, 2, '0'), true);
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000010' || lpad(p_n::text, 2, '0'), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function pg_temp.as_user(int) to authenticated;
grant execute on function pg_temp.ok(boolean, text) to authenticated;
grant execute on function pg_temp.fails(text, text, text) to authenticated;

-- March 2020. Ad 111 (RM300, 30 chats) brought leads L1, L2, L3 (Angel 2, Bob 1); ad 222 (RM100) brought none;
-- L4 came from a post (no ad id). L1 enrolled, paid RM500.
insert into public.lead_options (kind, label, teacher_id)
select 'pic', v.label, v.t from (values ('MA Angel PIC', 91002::bigint), ('MA Bob PIC', 91003::bigint)) v(label, t)
where not exists (select 1 from public.lead_options o where o.kind = 'pic' and o.teacher_id = v.t);
insert into public.leads (id, full_name, phone, status, pic_id, added_date) overriding system value values
  (91101, 'MA L1', '60191091101', 'new', (select id from public.lead_options where kind = 'pic' and teacher_id = 91002), '2020-03-02'),
  (91102, 'MA L2', '60191091102', 'new', (select id from public.lead_options where kind = 'pic' and teacher_id = 91002), '2020-03-03'),
  (91103, 'MA L3', '60191091103', 'new', (select id from public.lead_options where kind = 'pic' and teacher_id = 91003), '2020-03-04'),
  (91104, 'MA L4', '60191091104', 'new', null, '2020-03-05'),
  (91105, 'MA L5', '60191091105', 'new', (select id from public.lead_options where kind = 'pic' and teacher_id = 91003), '2020-03-06');
insert into public.chat_ad_referrals (channel, via, external_id, lead_id, ad_id, post_id, campaign_id, campaign_name, title, source_type, clicked_at) values
  ('whatsapp', 'evolution', 'ma-1', 91101, '111', null, 'c9', 'Oct trial', 'Free trial', 'ad', '2020-03-02 02:00+00'),
  ('whatsapp', 'evolution', 'ma-2', 91102, '111', null, 'c9', 'Oct trial', 'Free trial', 'ad', '2020-03-03 02:00+00'),
  ('whatsapp', 'evolution', 'ma-3', 91103, '111', null, 'c9', 'Oct trial', 'Free trial', 'ad', '2020-03-04 02:00+00'),
  ('whatsapp', 'evolution', 'ma-4', 91104, null, 'p77', null, null, null, 'post', '2020-03-05 02:00+00'),
  -- GoHighLevel: paid, the campaign only (no ad id)
  ('messenger', 'ghl', 'ma-5', 91105, null, null, 'c9', 'Oct trial', null, 'ad', '2020-03-06 02:00+00');
insert into public.ad_spend_daily (ad_id, day, account_id, ad_name, campaign_id, campaign_name, spend, impressions, clicks, conversations) values
  ('111', '2020-03-02', 'act_1000', 'Ad 111', 'c9', 'Oct trial', 200, 5000, 100, 20),
  ('111', '2020-03-03', 'act_1000', 'Ad 111', 'c9', 'Oct trial', 100, 2500, 50, 10),
  ('222', '2020-03-03', 'act_1000', 'Ad 222', 'c9', 'Oct trial', 100, 3000, 60, 8),
  ('111', '2020-02-27', 'act_1000', 'Ad 111', 'c9', 'Oct trial', 999, 1, 1, 1);
insert into public.meta_ads (ad_id, account_id, name, title, campaign_id, campaign_name, thumbnail_url) values
  ('111', 'act_1000', 'Ad 111', 'P4 Math free trial', 'c9', 'Oct trial', 'https://x.example/t.jpg');
insert into public.meta_ad_accounts (account_id, name, currency, timezone) values ('act_1000', 'Test Ads', 'MYR', 'Asia/Kuala_Lumpur');
insert into public.meta_sync_runs (trigger, since, until, ok, rows_read, rows_written, finished_at) values ('schedule', '2020-03-01', '2020-03-03', true, 4, 4, now());
insert into public.meta_sync_runs (trigger, since, until, ok, error, started_at) values ('admin', '2020-03-01', '2020-03-03', false, 'act_1000: Invalid OAuth access token.', now() + interval '1 minute');

insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, student_type)
overriding system value values (91201, 'MA Kid', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'regular');
insert into public.lead_conversions (lead_id, student_id, converted_at, how, sales_person_id) values (91101, 91201, '2020-03-20 03:00+00', 'backfill', 91002);
insert into public.quotations (id, public_token, status, lead_id, student_id, child_name, cohort_id, level, region, enrol_method, rate_tier,
  months, start_date, subtotal, total, reference_no, paid_at, sales_person_id)
values ('91919191-2222-3333-4444-555555555555', repeat('M', 43), 'paid', 91101, 91201, 'MA Kid',
  (select id from public.fee_cohorts limit 1), 'primary', 'west_malaysia', '每月报名', 'monthly', 1, '2020-03-01', 500, 500, 'Q-919191912222', '2020-03-20 04:00+00', 91002);

set local role authenticated;

-- ---- Who ----
select pg_temp.as_user(2);
select pg_temp.ok((select count(*) = 0 from public.ad_spend_daily), 'no Ad Spend tick: no spend rows');
select pg_temp.fails($$select * from public.data_center_ads('2020-03-01', '2020-03-31')$$, 'ad spend and data center ticks', 'no Ad Spend tick: no ads report');
select pg_temp.fails($$select public.meta_ads_status()$$, 'ad spend tick', 'no Ad Spend tick: no status');
select pg_temp.fails($$insert into public.ad_spend_daily (ad_id, day, account_id) values ('1', '2020-01-01', 'act_1000')$$, 'permission denied', 'nobody writes spend by hand');

select pg_temp.as_user(3);
create temporary table ma as select * from public.data_center_ads('2020-03-01', '2020-03-31');

select pg_temp.ok((select spend = 300 and conversations = 30 and leads = 3 and conversions = 1 and revenue_actual = 500
    and title = 'P4 Math free trial' and thumbnail_url = 'https://x.example/t.jpg'
  from ma where ad_id = '111'), 'ad 111: March spend only (not February), 3 leads, 1 enrolled, RM500 paid, its words and picture');
select pg_temp.ok((select spend = 100 and leads = 0 from ma where ad_id = '222'), 'ad 222: spend with no leads still shows');
select pg_temp.ok((select leads = 1 and spend = 0 from ma where ad_id is null and campaign_id is null), 'a post click: one "no ad id" line');
select pg_temp.ok((select leads = 1 and campaign_name = 'Oct trial' from ma where ad_id is null and campaign_id = 'c9'),
  'a GoHighLevel click with the campaign only: its own line, in its campaign');

create temporary table mae as select * from public.data_center_ec_ads('2020-03-01', '2020-03-31');
-- campaign c9 spent RM400 in March (ad 111 RM300 + ad 222 RM100) and brought 4 leads: Angel 2, Bob 2 (one campaign-only)
select pg_temp.ok((select ad_leads = 2 and conversions = 1 and revenue_actual = 500 and spend_share = 200 from mae where ec_id = 91002),
  'Angel: 2 of campaign c9''s 4 leads, so half of RM400 = RM200');
select pg_temp.ok((select ad_leads = 2 and spend_share = 200 from mae where ec_id = 91003), 'Bob: 2 of 4 (one with the campaign only) = RM200');
select pg_temp.ok((select ad_leads = 1 and spend_share = 0 from mae where ec_id is null), 'the post lead: no EC, no spend to share');

create temporary table mam as select public.data_center_ad_months('2020-03-01') as m;
select pg_temp.ok((select (m -> 'months' -> 5 ->> 'spend')::numeric = 400 and (m -> 'months' -> 5 ->> 'adLeads')::int = 5
    and (m -> 'months' -> 5 ->> 'adConversions')::int = 1 and (m -> 'months' -> 5 ->> 'adRevenueActual')::numeric = 500
    and (m -> 'months' -> 4 ->> 'spend')::numeric = 999 and m ->> 'connected' = 'true' from mam),
  'six months: March RM400, 5 ad leads, 1 enrolled, RM500; February its own spend');

select pg_temp.ok((select (public.meta_ads_status() -> 'lastRun' ->> 'ok') = 'false'
    and public.meta_ads_status() -> 'lastRun' ->> 'error' like '%Invalid OAuth%'
    and public.meta_ads_status() ->> 'lastGoodAt' is not null
    and public.meta_ads_status() -> 'accounts' -> 0 ->> 'currency' = 'MYR'), 'status: the last run failed (red line), the last good one is kept, the account');

reset role;
rollback;
