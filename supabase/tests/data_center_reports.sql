-- Checks for 20261101410000_data_center_reports.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/data_center_reports.sql

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

-- 1 admin, 2 EC Amy (tick), 3 EC Ben (tick), 4 nothing.
insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000007' || lpad(n::text, 2, '0'))::uuid, 'dcr' || n || '@mirai.internal',
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 4) n;

insert into public.teachers (id, full_name, username, role, is_active, auth_user_id, permissions)
overriding system value
values
  (9701, 'DCR Admin', 'dcr_admin', 'admin', true, '00000000-0000-0000-0000-000000000701', '{}'),
  (9702, 'DCR Amy', 'dcr_amy', 'staff', true, '00000000-0000-0000-0000-000000000702', '{"data_center": {"level": "view"}}'),
  (9703, 'DCR Ben', 'dcr_ben', 'staff', true, '00000000-0000-0000-0000-000000000703', '{"data_center": {"level": "view"}}'),
  (9704, 'DCR None', 'dcr_none', 'staff', true, '00000000-0000-0000-0000-000000000704', '{}');

create function pg_temp.as_user(p_n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000007' || lpad(p_n::text, 2, '0'), true);
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000007' || lpad(p_n::text, 2, '0'), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function pg_temp.as_user(int) to authenticated;
grant execute on function pg_temp.ok(boolean, text) to authenticated;
grant execute on function pg_temp.fails(text, text, text) to authenticated;

-- A fixed month far back, so the seeded school's own rows do not mix in: March 2020 (and February before it).
-- (staff may get their PIC automatically from 20261101300000_staff_pic_sync; made here only when not)
insert into public.lead_options (kind, label, teacher_id)
select 'pic', v.label, v.teacher_id from (values ('DCR Amy PIC', 9702::bigint), ('DCR Ben PIC', 9703::bigint)) v(label, teacher_id)
where not exists (select 1 from public.lead_options o where o.kind = 'pic' and o.teacher_id = v.teacher_id);
create temporary table dcr_pic as
select (select id from public.lead_options where kind = 'pic' and teacher_id = 9702) as amy,
       (select id from public.lead_options where kind = 'pic' and teacher_id = 9703) as ben;
insert into public.lead_options (id, kind, label, teacher_id) overriding system value values (9792, 'source', 'DCR Walk', null);
update public.lead_options set report_bucket = 'walkin' where id = 9792;
insert into public.program_levels (name, sort_order, fee_level) values ('DCR Level', 999, 'primary');
insert into public.classrooms (id, name, age_group, program_level, teacher_id) overriding system value values
  (9781, 'DCR Math', '9-11 Years Old', 'DCR Level', 9701), (9782, 'DCR Sci', '9-11 Years Old', 'DCR Level', 9701);

-- Leads: Amy 3 in March (1 walk-in), 1 in February; Ben 1 in March; 1 without a PIC in March.
insert into public.leads (id, full_name, phone, status, pic_id, source_id, added_date) overriding system value values
  (97101, 'DCR L1', '60197097101', 'new', (select amy from dcr_pic), 9792, '2020-03-02'),
  (97102, 'DCR L2', '60197097102', 'new', (select amy from dcr_pic), null, '2020-03-03'),
  (97103, 'DCR L3', '60197097103', 'new', (select amy from dcr_pic), null, '2020-03-04'),
  (97104, 'DCR L4', '60197097104', 'new', (select amy from dcr_pic), null, '2020-02-10'),
  (97105, 'DCR L5', '60197097105', 'new', (select ben from dcr_pic), null, '2020-03-05'),
  (97106, 'DCR L6', '60197097106', 'new', null, null, '2020-03-06');

-- Conversions (written straight in as the backfill would): Amy converts L1 (March lead, 12 months, estimated)
-- and L4 (February lead -> cross); Ben converts L5 (paid by quotation in March).
insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date,
  student_type, membership, enrol_method)
overriding system value values
  (97201, 'DCR K1', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'regular', '26002', '12个月一次性报名'),
  (97204, 'DCR K4', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'regular', '26002', '每月报名'),
  (97205, 'DCR K5', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'regular', null, null);
insert into public.student_classroom_periods (student_id, classroom_id, start_date, end_date) values
  (97201, 9781, '2020-03-10', '2021-03-31'), (97201, 9782, '2020-03-10', '2021-03-31'),
  (97204, 9781, '2020-03-12', '2020-12-31'),
  (97205, 9781, '2020-03-15', null);
insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, student_type)
overriding system value values (97203, 'DCR K3', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'regular');
insert into public.lead_conversions (lead_id, student_id, converted_at, historical, how, sales_person_id) values
  (97101, 97201, '2020-03-10 03:00+00', false, 'backfill', 9702),
  (97104, 97204, '2020-03-12 03:00+00', false, 'backfill', 9702),
  (97105, 97205, '2020-03-15 03:00+00', false, 'backfill', 9703),
  -- historical (day unknown): never in a month or the ranking
  (97103, 97203, '2020-03-20 03:00+00', true, 'backfill', 9702);
insert into public.quotations (id, public_token, status, lead_id, student_id, child_name, cohort_id, level, region, enrol_method, rate_tier,
  months, start_date, subtotal, total, reference_no, paid_at, sales_person_id)
values
  ('77777777-2222-3333-4444-555555555555', repeat('R', 43), 'paid', 97105, 97205, 'DCR K5',
   (select id from public.fee_cohorts where membership_name = '26002'), 'primary', 'west_malaysia', '每月报名', 'monthly', 3,
   '2020-03-01', 500, 450, 'Q-777777772222', '2020-03-15 04:00+00', 9703),
  -- A renewal Amy sold in March (no conversion): counts as her real money.
  ('77777777-2222-3333-4444-666666666666', repeat('S', 43), 'paid', 97104, 97204, 'DCR K4',
   (select id from public.fee_cohorts where membership_name = '26002'), 'primary', 'west_malaysia', '每月报名', 'monthly', 1,
   '2020-04-01', 200, 200, 'Q-777777773333', '2020-03-28 04:00+00', 9702);

create temporary table dcr_rate as
select
  (select r.amount from public.fee_rates r join public.fee_cohorts c on c.id = r.cohort_id
   where c.membership_name = '26002' and r.level = 'primary' and r.track = 'standard' and r.subject_count = 2 and r.cycle_tier = '6mo_plus') as two_long,
  (select r.amount from public.fee_rates r join public.fee_cohorts c on c.id = r.cohort_id
   where c.membership_name = '26002' and r.level = 'primary' and r.track = 'standard' and r.subject_count = 1 and r.cycle_tier = 'monthly') as one_monthly;
grant select on dcr_rate to authenticated;

set local role authenticated;

-- ---- Who ----
select pg_temp.as_user(4);
select pg_temp.fails($$select * from public.data_center_ec_report('2020-03-01', '2020-03-31')$$, 'data center tick', 'no tick: no EC report');
select pg_temp.fails($$select public.data_center_overview('2020-03-01')$$, 'data center tick', 'no tick: no overview');
select pg_temp.fails($$select public.set_data_center_target(9702, '2020-03-01', 10, 20)$$, 'only an admin', 'only an admin sets targets');

-- ---- Targets ----
select pg_temp.as_user(1);
select public.set_data_center_target(9702, '2020-03-01', 10, 20);
select pg_temp.fails($$select public.set_data_center_target(9702, '2020-03-05', 10, 20)$$, 'pick a month', 'a target is for a whole month');
select pg_temp.fails($$select public.set_data_center_target(9702, '2020-03-01', 10, null)$$, 'both targets', 'both numbers or neither');

-- ---- EC report (Ben, not Amy: open ranking) ----
select pg_temp.as_user(3);
create temporary table dcr_rows as select * from public.data_center_ec_report('2020-03-01', '2020-03-31');

select pg_temp.ok((select leads = 3 and leads_by_bucket = '{"walkin": 1, "mkt": 2}'::jsonb and conversions = 2
    and same_period = 1 and cross_period = 1 and subjects = 3
    and weighted_subjects = round(2 * 1.3 + 1 * 1.0, 1)
    and revenue_actual = 200 and paid_quotations = 1
    and revenue_estimated = (select two_long * 12 from dcr_rate)
    and target_people = 10 and target_subjects = 20
  from dcr_rows where ec_id = 9702), 'Amy: 3 March leads by bucket, 2 conversions (1 earlier lead), weighted subjects (a quotation with no classes counts the student''s classes), K4''s quotation is real money, K1 estimated, her own target');
select pg_temp.ok((select leads = 1 and conversions = 1 and revenue_actual = 450 and revenue_estimated = 0
    and target_people = 50 and target_subjects = 100 and avg_days = 10
  from dcr_rows where ec_id = 9703), 'Ben: the paid quotation is real money, the school target, 10 days to convert');
select pg_temp.ok((select leads = 1 and ec_name = '(no EC)' and target_people = 0 and target_subjects = 0 from dcr_rows where ec_id is null and leads_by_bucket ? 'mkt'), 'a lead without a PIC is "(no EC)", with no target');
select pg_temp.ok((select ec_id = 9703 from dcr_rows where ec_id in (9702, 9703) order by revenue_actual + revenue_estimated desc limit 1)
  = ((select revenue_actual + revenue_estimated from dcr_rows where ec_id = 9703) > (select revenue_actual + revenue_estimated from dcr_rows where ec_id = 9702)),
  'ranked by money');
select pg_temp.ok((select count(*) = 0 from public.data_center_ec_report('2020-02-01', '2020-02-29') where ec_id = 9702 and conversions > 0),
  'February: Amy''s lead, no conversions yet');

-- ---- Overview ----
create temporary table dcr_over as select public.data_center_overview('2020-03-15') as o;
select pg_temp.ok((select jsonb_array_length(o -> 'months') = 6 and o -> 'months' -> 5 ->> 'month' = '2020-03'
  and o -> 'months' -> 0 ->> 'month' = '2019-10' from dcr_over), 'six months, ending with the month asked');
select pg_temp.ok((select (o -> 'months' -> 5 ->> 'leads')::int >= 5 and (o -> 'months' -> 5 ->> 'conversions')::int >= 3
    and (o -> 'months' -> 5 ->> 'revenueActual')::numeric >= 650 and (o -> 'months' -> 4 ->> 'leads')::int >= 1
  from dcr_over), 'March: the leads, the conversions, the paid money; February its lead');
select pg_temp.ok((select (o -> 'months' -> 5 ->> 'students')::int >= 3 from dcr_over), 'students in class at the month''s end');
select pg_temp.ok((select (b ->> 'leads')::int >= 1 and (b ->> 'conversions')::int >= 1
  from dcr_over, jsonb_array_elements(o -> 'buckets') b where b ->> 'bucket' = 'walkin'), 'the walk-in bucket: its lead and its conversion');
select pg_temp.ok((select o ->> 'adSpendConnected' = 'false' from dcr_over), 'ads not connected yet');
select pg_temp.ok((select (o ->> 'historicalConversions')::int >= 1 from dcr_over), 'historical conversions are counted apart');

reset role;
rollback;
