-- Checks for 20261030300000_fee_calculator.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/fee_calculator.sql

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

-- Accounts: 1 admin, 2 consultant (view), 3 price editor (edit), 4 staff with nothing.
insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000003' || lpad(n::text, 2, '0'))::uuid, 'fee' || n || '@mirai.internal',
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 4) n;

insert into public.teachers (id, full_name, username, role, is_active, auth_user_id, permissions)
overriding system value
values
  (9301, 'Fee Admin', 'fee_admin', 'admin', true, '00000000-0000-0000-0000-000000000301', '{}'),
  (9302, 'Fee Consultant', 'fee_consultant', 'staff', true, '00000000-0000-0000-0000-000000000302', '{"fee_calculator": {"level": "view"}}'),
  (9303, 'Fee Editor', 'fee_editor', 'staff', true, '00000000-0000-0000-0000-000000000303', '{"fee_calculator": {"level": "edit"}}'),
  (9304, 'Fee None', 'fee_none', 'staff', true, '00000000-0000-0000-0000-000000000304', '{}');

create function pg_temp.as_user(p_n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003' || lpad(p_n::text, 2, '0'), true);
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000003' || lpad(p_n::text, 2, '0'), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function pg_temp.as_user(int) to authenticated;
grant execute on function pg_temp.ok(boolean, text) to authenticated;
grant execute on function pg_temp.fails(text, text, text) to authenticated;

-- The tick.
select pg_temp.ok(public.valid_account_permissions('{"fee_calculator": {"level": "view"}}'), 'fee_calculator view is a valid tick');
select pg_temp.ok(public.valid_account_permissions('{"fee_calculator": {"level": "edit"}}'), 'fee_calculator edit is a valid tick');
select pg_temp.ok(not public.valid_account_permissions('{"fee_calculator": {"level": "edit", "scope": "own"}}'), 'fee_calculator has no "whose" scope');
select pg_temp.ok(public.valid_account_permissions('{"student_inbox": {"level": "view"}, "content_library": {"level": "view"}}'), 'the older ticks are still valid');

-- Starting data.
select pg_temp.ok((select value = '{"enabled": false}'::jsonb from public.app_settings where key = 'fee_calculator'), 'off until the school switches it on');
select pg_temp.ok((select count(*) = 2 from public.fee_cohorts), 'two price groups (26002, 26001)');
select pg_temp.ok((select materials_included_in_tuition from public.fee_cohorts where membership_name = '26002'), '26002 holds materials in the tuition');
select pg_temp.ok((select not materials_included_in_tuition from public.fee_cohorts where membership_name = '26001'), '26001 does not');
select pg_temp.ok((select count(*) = 126 from public.fee_rates), '126 prices (63 per group)');
select pg_temp.ok((select amount = 195 from public.fee_rates r join public.fee_cohorts c on c.id = r.cohort_id
  where c.membership_name = '26002' and level = 'primary' and track = 'standard' and subject_count = 3 and cycle_tier = 'monthly'), '26002 3 subjects monthly = 195');
select pg_temp.ok((select amount = 500 from public.fee_rates r join public.fee_cohorts c on c.id = r.cohort_id
  where c.membership_name = '26001' and level = 'secondary' and track = 'standard' and subject_count = 10 and cycle_tier = '6mo_plus'), '26001 10 subjects = 500');
select pg_temp.ok((select count(*) = 25 from public.fee_subjects), '25 subjects (8 + 14 + 3)');
select pg_temp.ok((select (value -> 'postage' -> 'east' -> '5_plus' ->> '3')::numeric = 40 from public.fee_settings where key = 'global_rates'), 'East Malaysia 5+ subjects, 3 months = 40');
select pg_temp.ok((select value ->> 'totalLine' = 'TOTAL RM{total}' from public.fee_settings where key = 'invoice_template'), 'the text template is there');

set local role authenticated;

-- Nobody without the tick reads or changes prices.
select pg_temp.as_user(4);
select pg_temp.ok((select count(*) = 0 from public.fee_rates), 'no tick: no prices');
select pg_temp.ok((select count(*) = 0 from public.fee_settings), 'no tick: no school-wide numbers');
select pg_temp.fails($$select public.save_fee_cohort(null, 'LATEST', null, null, null)$$, 'only someone', 'no tick: cannot add a group');
select pg_temp.fails($$insert into public.fee_subjects (level, code, label, kind) values ('primary', 'XX', 'X', 'core')$$, 'permission denied', 'no direct writes');

-- A consultant reads everything, changes nothing.
select pg_temp.as_user(2);
select pg_temp.ok((select count(*) = 126 from public.fee_rates), 'consultant reads the prices');
select pg_temp.ok((select count(*) = 2 from public.fee_settings), 'consultant reads the school-wide numbers and the text');
select pg_temp.fails($$select public.save_fee_cohort_rates((select id from public.fee_cohorts where membership_name = '26001'), false, '[]'::jsonb)$$, 'only someone', 'consultant cannot change prices');
select pg_temp.fails($$select public.save_fee_settings('global_rates', '{}'::jsonb)$$, 'only someone', 'consultant cannot change the numbers');

-- A price editor.
select pg_temp.as_user(3);
select pg_temp.ok((select (public.save_fee_cohort(null, 'LATEST', null, null, true)).membership_name = 'LATEST'), 'editor adds a group for a membership level');
select pg_temp.fails($$select public.save_fee_cohort(null, 'NOT A LEVEL', null, null, null)$$, 'pick one of the membership levels', 'a group needs a membership level');
select pg_temp.fails($$select public.save_fee_cohort(null, '26001', null, null, null)$$, 'already has a price group', 'one group per level');
select pg_temp.ok((select not (public.save_fee_cohort((select id from public.fee_cohorts where membership_name = 'LATEST'), null, null, false, null)).is_active), 'editor hides a group');
select pg_temp.ok((select count(*) = 3 from public.fee_cohorts), 'a hidden group is kept');

select public.save_fee_cohort_rates(
  (select id from public.fee_cohorts where membership_name = '26001'),
  true,
  '[{"level": "primary", "track": "standard", "subject_count": 1, "cycle_tier": "monthly", "amount": 61.5},
    {"level": "primary", "track": "standard", "subject_count": 1, "cycle_tier": "3mo", "amount": 60},
    {"level": "primary", "track": "standard", "subject_count": 1, "cycle_tier": "6mo_plus", "amount": 59}]'::jsonb
);
select pg_temp.ok((select count(*) = 3 from public.fee_rates r join public.fee_cohorts c on c.id = r.cohort_id where c.membership_name = '26001'), 'saving a table replaces the group''s prices');
select pg_temp.ok((select count(*) = 63 from public.fee_rates r join public.fee_cohorts c on c.id = r.cohort_id where c.membership_name = '26002'), 'other groups untouched');
select pg_temp.ok((select materials_included_in_tuition from public.fee_cohorts where membership_name = '26001'), 'and the materials tick with it');
select pg_temp.fails($$select public.save_fee_cohort_rates((select id from public.fee_cohorts where membership_name = '26001'), null,
  '[{"level": "primary", "track": "standard", "subject_count": 1, "cycle_tier": "monthly", "amount": -1}]'::jsonb)$$, '0 or more', 'no negative prices');
select pg_temp.fails($$select public.save_fee_cohort_rates((select id from public.fee_cohorts where membership_name = '26001'), null,
  '[{"level": "primary", "track": "standard", "subject_count": 1, "cycle_tier": "monthly", "amount": 1},
    {"level": "primary", "track": "standard", "subject_count": 1, "cycle_tier": "monthly", "amount": 2}]'::jsonb)$$, 'listed twice', 'no price twice');
select pg_temp.ok((select count(*) = 3 from public.fee_rates r join public.fee_cohorts c on c.id = r.cohort_id where c.membership_name = '26001'), 'a refused save changes nothing');

select pg_temp.ok((select (public.save_fee_subject(null, 'primary', 'pjk', 'PJK 体育', null, null, null)).code = 'PJK'), 'editor adds a subject (code in capitals)');
select pg_temp.ok((select (public.save_fee_subject((select id from public.fee_subjects where level = 'primary' and code = 'PJK'), null, null, null, null, null, false)).is_active = false), 'editor hides a subject');
select pg_temp.ok((select (public.save_fee_subject((select id from public.fee_subjects where level = 'primary' and code = 'SEJ'), null, null, 'Sejarah 历史 (new name)', null, null, null)).label = 'Sejarah 历史 (new name)'), 'SEJ may be renamed');
select pg_temp.fails($$select public.save_fee_subject((select id from public.fee_subjects where level = 'primary' and code = 'SEJ'), null, 'HIS', null, null, null, null)$$, 'keeps its code', 'SEJ keeps its code');
select pg_temp.fails($$select public.save_fee_subject((select id from public.fee_subjects where level = 'secondary' and code = 'BIP'), null, null, null, 'core', null, null)$$, 'keeps its code', 'BIP keeps its kind');
select pg_temp.fails($$select public.save_fee_subject(null, 'primary', 'XYZ', 'X', 'sej', null, null)$$, 'SEJ, BIP and BIK go with', 'only SEJ is of kind sej');

select public.save_fee_settings('global_rates',
  '{"materialsFeePerSubjectPerMonth": 6, "registrationFeeAmount": 25, "sejSurchargePerMonth": 10, "extra": 1,
    "postage": {"west": 12, "east": {"1_2": {"1_2": 20, "3": 20}, "3_4": {"1_2": 25, "3": 30}, "5_plus": {"1_2": 30, "3": 45}}}}'::jsonb);
select pg_temp.ok((select (value ->> 'materialsFeePerSubjectPerMonth')::numeric = 6 and not value ? 'extra' from public.fee_settings where key = 'global_rates'), 'editor changes the school-wide numbers (unknown keys dropped)');
select pg_temp.fails($$select public.save_fee_settings('global_rates', '{"materialsFeePerSubjectPerMonth": 5, "registrationFeeAmount": 20, "sejSurchargePerMonth": 10, "postage": {"west": 10, "east": {}}}'::jsonb)$$, '0 or more', 'every East Malaysia price is needed');
select pg_temp.fails($$select public.save_fee_settings('invoice_template', '{"totalLine": "TOTAL"}'::jsonb)$$, 'every line', 'every text line is needed');
select pg_temp.fails($$select public.set_fee_calculator_enabled(true)$$, 'only admin', 'editor cannot switch the page on');

-- The admin.
select pg_temp.as_user(1);
select public.set_fee_calculator_enabled(true);
select pg_temp.ok((select value = '{"enabled": true}'::jsonb from public.app_settings where key = 'fee_calculator'), 'admin switches it on');
-- Renaming a membership level (Student fields) renames its price group.
select public.save_student_field_option('membership', '26002', '26002 NEW', null, null);
select pg_temp.ok((select count(*) = 1 from public.fee_cohorts where membership_name = '26002 NEW'), 'a renamed membership level keeps its prices');
select pg_temp.ok((select count(*) = 63 from public.fee_rates r join public.fee_cohorts c on c.id = r.cohort_id where c.membership_name = '26002 NEW'), '... all 63 of them');

rollback;
