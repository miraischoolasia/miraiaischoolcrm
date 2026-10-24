-- Checks for 20261101400000_data_center_conversions.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/data_center_conversions.sql

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

-- 1 admin, 2 EC with the Data Center tick, 3 staff with nothing.
insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000006' || lpad(n::text, 2, '0'))::uuid, 'dc' || n || '@mirai.internal',
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 3) n;

insert into public.teachers (id, full_name, username, role, is_active, auth_user_id, permissions)
overriding system value
values
  (9601, 'DC Admin', 'dc_admin', 'admin', true, '00000000-0000-0000-0000-000000000601', '{}'),
  (9602, 'DC EC', 'dc_ec', 'staff', true, '00000000-0000-0000-0000-000000000602', '{"data_center": {"level": "view"}}'),
  (9603, 'DC None', 'dc_none', 'staff', true, '00000000-0000-0000-0000-000000000603', '{}');

create function pg_temp.as_user(p_n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000006' || lpad(p_n::text, 2, '0'), true);
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000006' || lpad(p_n::text, 2, '0'), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function pg_temp.as_user(int) to authenticated;
grant execute on function pg_temp.ok(boolean, text) to authenticated;
grant execute on function pg_temp.fails(text, text, text) to authenticated;

-- ---- The ticks ----
select pg_temp.ok(public.valid_account_permissions('{"data_center": {"level": "view"}, "ad_spend": {"level": "view"}}'), 'data_center and ad_spend are valid ticks');
select pg_temp.ok(not public.valid_account_permissions('{"data_center": {"level": "edit"}}'), 'data_center is seen-only');
select pg_temp.ok(not public.valid_account_permissions('{"ad_spend": {"level": "view", "scope": "own"}}'), 'ad_spend has no "whose" scope');
select pg_temp.ok(public.valid_account_permissions('{"quotations": {"level": "edit", "delete": true}, "quality": {"level": "view"}}'), 'the older ticks are still valid');
select pg_temp.ok(to_regprocedure('public.gallery_settings()') is null or public.valid_account_permissions('{"galleries": {"level": "edit"}}'), 'the Galleries tick (another department) is kept');

-- ---- The fixtures (as the database owner) ----
insert into public.program_levels (name, sort_order) values ('DC Level', 999), ('DC Odd Level', 1000);
insert into public.classrooms (id, name, age_group, program_level, teacher_id) overriding system value values
  (9681, 'DC Math', '9-11 Years Old', 'DC Level', 9601),
  (9682, 'DC Science', '9-11 Years Old', 'DC Level', 9601);
insert into public.lead_options (id, kind, label) overriding system value values (9690, 'source', 'DC Walk Source');

-- The rate the estimate should use: membership 26002, primary, standard, 2 subjects, monthly.
create temporary table dc_rate as
select r.amount from public.fee_rates r join public.fee_cohorts c on c.id = r.cohort_id
where c.membership_name = '26002' and r.level = 'primary' and r.track = 'standard' and r.subject_count = 2 and r.cycle_tier = 'monthly';
grant select on dc_rate to authenticated;
select pg_temp.ok((select count(*) = 1 and min(amount) > 0 from dc_rate), 'the seeded price table has a 26002 primary 2-subject monthly rate');

set local role authenticated;

-- ---- Settings ----
select pg_temp.as_user(2);
select pg_temp.ok((select jsonb_array_length(public.data_center_settings() -> 'buckets') = 4 and public.data_center_settings() ->> 'defaultBucket' = 'mkt'), 'four buckets, MKT by default');
select pg_temp.ok((select (public.data_center_settings() -> 'targets' ->> 'people')::int = 50 and (public.data_center_settings() -> 'targets' ->> 'subjects')::int = 100), 'targets 50 people / 100 subjects');
select pg_temp.fails($$select public.set_data_center('{"targets": {"people": 60, "subjects": 120}}')$$, 'only an admin', 'an EC cannot change the settings');
select pg_temp.fails($$select public.set_source_bucket(9690, 'walkin')$$, 'only an admin', 'an EC cannot change a source''s bucket');
select pg_temp.fails($$select public.set_program_level_fee_level('DC Level', 'primary')$$, 'only an admin', 'an EC cannot set a level''s fee level');

select pg_temp.as_user(1);
select public.set_data_center('{"targets": {"people": 60, "subjects": 120}}');
select pg_temp.ok((select (public.data_center_settings() -> 'targets' ->> 'people')::int = 60 and jsonb_array_length(public.data_center_settings() -> 'buckets') = 4), 'admin changes the targets, the buckets stay');
select pg_temp.fails($$select public.set_data_center('{"defaultBucket": "nope"}')$$, 'must be one of the buckets', 'the default bucket must exist');
select pg_temp.fails($$select public.set_data_center('{"buckets": [{"key": "a", "label": "A"}, {"key": "a", "label": "B"}], "defaultBucket": "a"}')$$, 'twice', 'no bucket twice');
select pg_temp.fails($$select public.set_data_center('{"colour": "red"}')$$, 'unknown setting', 'no unknown settings');
select pg_temp.fails($$select public.set_source_bucket(9690, 'nope')$$, 'no bucket', 'only a bucket that exists');
select public.set_source_bucket(9690, 'walkin');
select pg_temp.ok(public.lead_report_bucket(9690) = 'walkin', 'the source counts as Walk-in');
select pg_temp.ok(public.lead_report_bucket(null) = 'mkt', 'a lead with no source counts as MKT (the default)');
select public.set_program_level_fee_level('DC Level', 'primary');
select pg_temp.fails($$select public.set_program_level_fee_level('DC Level', 'college')$$, 'primary or secondary', 'only primary or secondary');

reset role;

-- ---- Conversions are written by the triggers ----
-- a) A trial (HOA) student tied to a lead is not a conversion; becoming regular is.
insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date,
  student_type, sales_person_id, membership, enrol_method)
overriding system value values
  (96001, 'DC Trial Kid', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'trial', 9602, '26002', '每月报名');
insert into public.leads (id, full_name, phone, status, source_id, converted_student_id) overriding system value
  values (96101, 'DC Parent A', '60123496101', 'new', 9690, 96001);
select pg_temp.ok((select count(*) = 0 from public.lead_conversions where lead_id = 96101), 'a trial student is not a conversion');
insert into public.student_classroom_periods (student_id, classroom_id, start_date) values
  (96001, 9681, current_date), (96001, 9682, current_date);
update public.students set student_type = 'regular' where id = 96001;
select pg_temp.ok((select count(*) = 1 and bool_and(how = 'upgrade') and bool_and(sales_person_id = 9602) and bool_and(not historical)
  from public.lead_conversions where lead_id = 96101), 'becoming regular is one conversion, closed by the student''s sales person');
update public.students set student_type = 'regular', full_name = 'DC Trial Kid' where id = 96001;
update public.leads set converted_student_id = 96001 where id = 96101;
select pg_temp.ok((select count(*) = 1 from public.lead_conversions where lead_id = 96101), 'saving again adds nothing');

-- b) A new regular student linked to a lead: a conversion today.
insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, student_type)
overriding system value values (96002, 'DC New Kid', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'regular');
insert into public.leads (id, full_name, phone, status) overriding system value values (96102, 'DC Parent B', '60123496102', 'new');
update public.leads set converted_student_id = 96002 where id = 96102;
select pg_temp.ok((select how = 'link' and not historical and converted_at > now() - interval '1 minute'
  from public.lead_conversions where lead_id = 96102), 'a new student linked: today, not guessed');

-- c) A long-standing student linked only now: not a sale today; historical (day unknown).
insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date,
  student_type, created_at)
overriding system value values (96003, 'DC Old Kid', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'regular', now() - interval '200 days');
insert into public.student_classroom_periods (student_id, classroom_id, start_date) values (96003, 9681, current_date - 150);
insert into public.leads (id, full_name, phone, status) overriding system value values (96103, 'DC Parent C', '60123496103', 'new');
update public.leads set converted_student_id = 96003 where id = 96103;
select pg_temp.ok((select historical from public.lead_conversions where lead_id = 96103), 'an old student linked now: historical');

-- d) Paid by quotation: counted as a quotation conversion.
insert into public.leads (id, full_name, phone, status) overriding system value values (96104, 'DC Parent D', '60123496104', 'new');
insert into public.quotations (id, public_token, status, lead_id, child_name, cohort_id, level, region, enrol_method, rate_tier,
  months, start_date, subtotal, total, reference_no, paid_at, sales_person_id)
values ('66666666-2222-3333-4444-555555555555', repeat('Q', 43), 'paid', 96104, 'DC Paid Kid',
  (select id from public.fee_cohorts where membership_name = '26002'), 'primary', 'west_malaysia', '每月报名', 'monthly', 3,
  date_trunc('month', current_date)::date, 333, 321.5, 'Q-666666662222', now(), 9602);
insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, student_type)
overriding system value values (96004, 'DC Paid Kid', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'regular');
update public.leads set converted_student_id = 96004, status = 'converted' where id = 96104;
select pg_temp.ok((select how = 'quotation' from public.lead_conversions where lead_id = 96104), 'paid by quotation: a quotation conversion');

-- e) A regular student with nothing to estimate from.
insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, student_type)
overriding system value values (96005, 'DC Bare Kid', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'regular');
insert into public.student_classroom_periods (student_id, classroom_id, start_date) values (96005, 9681, current_date);
insert into public.leads (id, full_name, phone, status, converted_student_id) overriding system value
  values (96105, 'DC Parent E', '60123496105', 'new', 96005);

-- ---- The money, and who may see it ----
set local role authenticated;
select pg_temp.as_user(3);
select pg_temp.fails($$select * from public.data_center_conversions(current_date - 365, current_date + 1)$$, 'data center tick', 'no tick: no conversions');
select pg_temp.ok((select count(*) = 0 from public.lead_conversions), 'no tick: the table shows nothing');
select pg_temp.fails($$select public.record_lead_conversion(96105, 96005, 'link')$$, 'permission denied', 'nobody writes conversions directly');
select pg_temp.fails($$select * from public.backfill_lead_conversions(false)$$, 'permission denied', 'staff cannot run the backfill');

select pg_temp.as_user(2);
select pg_temp.ok((select count(*) = 5 from public.lead_conversions where lead_id between 96101 and 96105), 'the EC (open ranking) sees every conversion');
select pg_temp.ok((select amount_kind = 'estimated' and amount = (select amount from dc_rate) and subjects = 2 and months = 1
    and source_bucket = 'walkin' and sales_person_name = 'DC EC' and revenue_on = converted_on
  from public.data_center_conversions(current_date - 365, current_date + 1) where lead_id = 96101),
  'no quotation: estimated from the price table (26002, 2 subjects, monthly), dated at the conversion');
select pg_temp.ok((select amount_kind = 'actual' and amount = 321.5 and months = 3 and quotation_id = '66666666-2222-3333-4444-555555555555'
  from public.data_center_conversions(current_date - 365, current_date + 1) where lead_id = 96104),
  'paid quotation: the real amount and its months');
select pg_temp.ok((select amount_kind = 'unknown' and amount is null and estimate_note = 'no_membership' and source_bucket = 'mkt'
  from public.data_center_conversions(current_date - 365, current_date + 1) where lead_id = 96105),
  'no membership: no amount, and says why');
select pg_temp.ok((select count(*) = 0 from public.data_center_conversions(current_date - 3650, current_date + 1) where lead_id = 96103),
  'a historical conversion is in no month');
select pg_temp.ok((select count(*) = 0 from public.data_center_conversions(current_date - 200, current_date - 100) where lead_id <> 96103 and lead_id between 96101 and 96105),
  'the stretch of days is kept to');
select pg_temp.fails($$select * from public.data_center_conversions(current_date, current_date - 1)$$, 'stretch of days', 'the end cannot be before the start');

reset role;

-- ---- The estimate's other reasons ----
-- a membership level of this test's own with no price group (a real level such as GOLD may have one: EduHero)
insert into public.student_field_options (field, name, sort_order) values ('membership', 'DC No Group', 9999) on conflict do nothing;
update public.students set membership = 'DC No Group' where id = 96005;
select pg_temp.ok((select note = 'no_price_group' from public.estimate_student_fee(96005, current_date)), 'a membership with no price group: says so (not "no membership")');
update public.students set membership = '26002' where id = 96005;
update public.classrooms set program_level = 'DC Odd Level' where id = 9681;
select pg_temp.ok((select note = 'no_level' from public.estimate_student_fee(96005, current_date)), 'a level with no primary/secondary: no estimate');
update public.classrooms set program_level = 'DC Level' where id = 9681;
select pg_temp.ok((select note is null and amount > 0 and subjects = 1 from public.estimate_student_fee(96005, current_date)), 'with membership and level: an estimate');
select pg_temp.ok((select note = 'no_classes' from public.estimate_student_fee(96005, current_date - 400)), 'no classes then: no estimate');
update public.students set enrol_method = '3个月一次性报名' where id = 96005;
select pg_temp.ok((select months = 3 from public.estimate_student_fee(96005, current_date)), 'the enrol method gives the months');

-- ---- Backfill: leads converted before this ----
create temporary table dc_base as select * from public.backfill_lead_conversions(true);
grant select on dc_base to service_role;
alter table public.leads disable trigger leads_record_conversion;
insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, student_type, created_at)
overriding system value values
  (96006, 'DC Logged Kid', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'regular', now() - interval '90 days'),
  (96007, 'DC Unlogged Kid', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'regular', now() - interval '80 days'),
  (96008, 'DC Still Trial', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'trial', now() - interval '80 days');
insert into public.leads (id, full_name, phone, status, converted_student_id) overriding system value values
  (96106, 'DC Parent F', '60123496106', 'converted', 96006),
  (96107, 'DC Parent G', '60123496107', 'converted', 96007),
  (96108, 'DC Parent H', '60123496108', 'converted', 96008);
alter table public.leads enable trigger leads_record_conversion;
insert into public.admin_activity_logs (actor_teacher_id, action_type, entity_type, entity_id, entity_label, details, created_at)
values (9601, 'lead_stage_changed', 'lead', 96106, 'DC Parent F', '{"status": "converted"}', now() - interval '60 days');

set local role service_role;
-- (the seeded school may have its own; counted on top of what was there)
select pg_temp.ok((select f.would_add - b.would_add = 2 and f.dated - b.dated = 1 and f.historical - b.historical = 1
  from public.backfill_lead_conversions(true) f, dc_base b), 'dry run: 2 to add (1 dated by the log, 1 historical), the trial left out');
select pg_temp.ok((select count(*) = 0 from public.lead_conversions where lead_id in (96106, 96107)), 'a dry run writes nothing');
select pg_temp.ok((select f.would_add - b.would_add = 2 from public.backfill_lead_conversions(false) f, dc_base b), 'the real run adds 2');
select pg_temp.ok((select would_add = 0 from public.backfill_lead_conversions(false)), 'running it again adds nothing');
reset role;
select pg_temp.ok((select not historical and how = 'backfill' and converted_at::date = (now() - interval '60 days')::date
  from public.lead_conversions where lead_id = 96106), 'dated from the activity log, not guessed');
select pg_temp.ok((select historical from public.lead_conversions where lead_id = 96107), 'no log: historical (count from go-live, boss 2026-10-23)');

rollback;
