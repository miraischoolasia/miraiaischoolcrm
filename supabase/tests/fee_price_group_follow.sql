-- Checks for 20261101520000_fee_price_group_follow.sql (no prices are added by the migration).
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/fee_price_group_follow.sql

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
select ('00000000-0000-0000-0000-0000000011' || lpad(n::text, 2, '0'))::uuid, 'fpf' || n || '@mirai.internal',
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 2) n;
insert into public.teachers (id, full_name, username, role, is_active, auth_user_id, permissions)
overriding system value values
  (91101, 'FPF Editor', 'fpf_editor', 'staff', true, '00000000-0000-0000-0000-000000001101', '{"fee_calculator": {"level": "edit"}}'),
  (91102, 'FPF Viewer', 'fpf_viewer', 'staff', true, '00000000-0000-0000-0000-000000001102', '{"fee_calculator": {"level": "view"}}');

create function pg_temp.as_user(p_n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000011' || lpad(p_n::text, 2, '0'), true);
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000011' || lpad(p_n::text, 2, '0'), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function pg_temp.as_user(int) to authenticated;
grant execute on function pg_temp.ok(boolean, text) to authenticated;
grant execute on function pg_temp.fails(text, text, text) to authenticated;

-- Whatever groups the school has (two on a fresh database, eight on EduHero), a group never follows a follower.
select pg_temp.ok(not exists (select 1 from public.fee_cohorts c join public.fee_cohorts u on u.id = c.uses_cohort_id
  where u.uses_cohort_id is not null), 'one step only, in the groups that are there');

-- This test's own groups, on membership levels of its own (so it never meets a school's real groups):
-- two with prices (as 26002 / 26001 would be), and FPF Latest / FPF Normal with none.
insert into public.student_field_options (field, name, sort_order) values
  ('membership', 'FPF Source', 9991), ('membership', 'FPF Source 2', 9992),
  ('membership', 'FPF Latest', 9993), ('membership', 'FPF Normal', 9994);
insert into public.fee_cohorts (membership_name, sort_order, materials_included_in_tuition) values
  ('FPF Source', 9991, true), ('FPF Source 2', 9992, false), ('FPF Latest', 9993, false), ('FPF Normal', 9994, false);
insert into public.fee_rates (cohort_id, level, track, subject_count, cycle_tier, amount)
select c.id, 'primary', 'standard', n, t.tier, t.base * n
from public.fee_cohorts c
cross join generate_series(1, 2) n
cross join (values ('monthly', 68), ('3mo', 65), ('6mo_plus', 63)) t(tier, base)
where c.membership_name = 'FPF Source'
union all
select c.id, 'primary', 'standard', 1, t.tier, t.amount
from public.fee_cohorts c
cross join (values ('monthly', 59), ('3mo', 59), ('6mo_plus', 59)) t(tier, amount)
where c.membership_name = 'FPF Source 2';
create temporary table g as
select (select id from public.fee_cohorts where membership_name = 'FPF Source') as g26002,
       (select id from public.fee_cohorts where membership_name = 'FPF Source 2') as g26001,
       (select id from public.fee_cohorts where membership_name = 'FPF Latest') as latest,
       (select id from public.fee_cohorts where membership_name = 'FPF Normal') as normal;
grant select on g to authenticated;

set local role authenticated;

select pg_temp.as_user(2);
select pg_temp.fails($$select public.set_fee_cohort_follow((select latest from g), (select g26002 from g))$$, 'only someone who may change', 'the view tick cannot change price groups');

select pg_temp.as_user(1);
select public.set_fee_cohort_follow((select latest from g), (select g26002 from g));
select pg_temp.ok((select uses_cohort_id = (select g26002 from g) from public.fee_cohorts where id = (select latest from g)), 'FPF Latest follows FPF Source');
select pg_temp.ok(public.fee_cohort_price_source((select latest from g)) = (select g26002 from g), 'its prices come from FPF Source');
select pg_temp.fails($$select public.set_fee_cohort_follow((select latest from g), (select latest from g))$$, 'cannot follow itself', 'not itself');
select pg_temp.fails($$select public.set_fee_cohort_follow((select normal from g), (select latest from g))$$, 'own prices', 'one step only: cannot follow a group that follows');
select pg_temp.fails($$select public.set_fee_cohort_follow((select g26002 from g), (select g26001 from g))$$, 'other groups follow this one', 'a followed group cannot start following');

-- FPF Normal gets its own copy of FPF Source 2.
select pg_temp.ok((select public.copy_fee_cohort_rates((select normal from g), (select g26001 from g)) =
    (select count(*) from public.fee_rates where cohort_id = (select g26001 from g))), 'FPF Normal gets a copy of every FPF Source 2 price');
select pg_temp.ok((select count(*) = 0 from (
    select level, track, subject_count, cycle_tier, amount from public.fee_rates where cohort_id = (select g26001 from g)
    except
    select level, track, subject_count, cycle_tier, amount from public.fee_rates where cohort_id = (select normal from g)) d),
  'the copy is the same, price by price');
select pg_temp.fails($$select public.copy_fee_cohort_rates((select normal from g), (select normal from g))$$, 'another group', 'not from itself');

-- Copying into a follower makes it have its own prices again.
select public.copy_fee_cohort_rates((select latest from g), (select g26002 from g));
select pg_temp.ok((select uses_cohort_id is null from public.fee_cohorts where id = (select latest from g)), 'a copy ends following');
select public.set_fee_cohort_follow((select latest from g), (select g26002 from g));

reset role;

-- The Data Center estimate follows: an FPF Latest student is priced from FPF Source.
insert into public.program_levels (name, sort_order, fee_level) values ('FPF Level', 999, 'primary');
insert into public.classrooms (id, name, age_group, program_level) overriding system value values (91181, 'FPF Math', '9-11 Years Old', 'FPF Level');
insert into public.students (id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, student_type, membership, enrol_method)
overriding system value values (91201, 'FPF Kid', 0, '2099-12-31', '2099-12-31', '2099-12-31', 'regular', 'FPF Latest', '每月报名');
insert into public.student_classroom_periods (student_id, classroom_id, start_date) values (91201, 91181, current_date);
select pg_temp.ok((select e.amount = (select r.amount from public.fee_rates r where r.cohort_id = (select g26002 from g) and r.level = 'primary'
      and r.track = 'standard' and r.subject_count = 1 and r.cycle_tier = 'monthly')
  from public.estimate_student_fee(91201, current_date) e), 'an FPF Latest student''s estimate uses FPF Source''s price');

rollback;
