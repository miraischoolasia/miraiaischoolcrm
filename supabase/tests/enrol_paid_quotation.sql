-- Checks for 20261031200000_enrol_paid_quotation.sql: a paid quotation puts the child in the classes, once.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/enrol_paid_quotation.sql
-- The quotation tables come from the fee department's 20261031100000_quotations.sql.

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

create function pg_temp.fails(p_sql text, p_expected text, p_name text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_expected then
      raise notice 'PASS %', p_name;
      return;
    end if;
    raise exception 'FAIL % (wrong reason: %)', p_name, sqlerrm;
  end;
  raise exception 'FAIL % (nothing was refused)', p_name;
end;
$$;

-- People, classes, a price group.
insert into public.teachers (id, username, full_name, role) overriding system value values
  (99911, 'epq_ec', 'EPQ Sales', 'staff'),
  (99912, 'epq_lc', 'EPQ Consultant', 'staff'),
  (99913, 'epq_ec2', 'EPQ Other Sales', 'staff'),
  (99914, 'epq_teacher', 'EPQ Teacher', 'teacher');
insert into public.classrooms (id, name, age_group, program_level, teacher_id, status, category) overriding system value values
  (99921, 'EPQ HOA', '6-8 Years Old', 'Coder Foundation', 99914, 'active', 'trial'),
  (99922, 'EPQ Maths', '6-8 Years Old', 'Coder Foundation', 99914, 'active', 'regular'),
  (99923, 'EPQ Science', '6-8 Years Old', 'Coder Foundation', 99914, 'active', 'regular'),
  (99924, 'EPQ Old', '6-8 Years Old', 'Coder Foundation', 99914, 'archived', 'regular');
insert into public.student_field_options (field, name, sort_order) values
  ('membership', 'EPQ GOLD', 990), ('enrol_method', 'EPQ 3 months', 990), ('payment_mode', 'EPQ once', 990), ('region', 'EPQ West', 990)
on conflict do nothing;
insert into public.fee_cohorts (membership_name) values ('EPQ GOLD') on conflict do nothing;
insert into public.leads (id, full_name, phone, status, children) overriding system value values
  (99931, 'EPQ Parent One', '60123450931', 'new', '[]'),
  (99932, 'EPQ Parent Two', '60123450932', 'new', '[]'),
  (99933, 'EPQ Parent Three', '60123450933', 'new', '[]');

select (select id from public.fee_cohorts where membership_name = 'EPQ GOLD') as cohort \gset

-- The quotation columns that must be filled but do not matter here get defaults (inside this rolled-back test only).
alter table public.quotations alter column public_token set default md5(random()::text) || md5(random()::text);
alter table public.quotations alter column reference_no set default 'Q-' || upper(substr(md5(random()::text), 1, 12));
alter table public.quotations alter column level set default 'primary';
alter table public.quotations alter column region set default 'west_malaysia';
alter table public.quotations alter column rate_tier set default '3mo';
alter table public.quotations alter column subtotal set default 100;
alter table public.quotations alter column enrol_method set default 'EPQ 3 months';
alter table public.quotations alter column cohort_id set default :cohort;

-- A paid quotation for a new child: two classes, three months from the first of next month.
select (date_trunc('month', current_date) + interval '1 month')::date as first \gset
insert into public.quotations (id, status, lead_id, phone, child_name, child_age, cohort_id, enrol_method, payment_mode, region_option, fee_month,
  start_date, months, sales_person_id, consultant_id, paid_amount, total)
values ('00000000-0000-0000-0000-00000000e001', 'paid', 99931, '60123450931', 'EPQ Kid One', 9, :cohort, 'EPQ 3 months', 'EPQ once', 'EPQ West', 7,
  :'first', 3, 99911, 99912, 450, 450);
insert into public.quotation_classes (quotation_id, subject_code, classroom_id) values
  ('00000000-0000-0000-0000-00000000e001', 'MM', 99922), ('00000000-0000-0000-0000-00000000e001', 'SCI', 99923);

set local role service_role;
select (public.enrol_paid_quotation('00000000-0000-0000-0000-00000000e001') ->> 'student_id')::bigint as s1 \gset
reset role;

select pg_temp.ok((select student_type = 'regular' and is_active and classroom_id = 99922 and full_name = 'EPQ Kid One' from public.students where id = :s1),
  'a new child: a regular student, the first class is the main class');
select pg_temp.ok((select membership = 'EPQ GOLD' and enrol_method = 'EPQ 3 months' and payment_mode = 'EPQ once' and region = 'EPQ West' and fee_month = 7
    and sales_person_id = 99911 and consultant_id = 99912 from public.students where id = :s1), 'the roster fields are written');
select pg_temp.ok((select count(*) from public.student_classroom_periods where student_id = :s1 and end_date is null and start_date = :'first') = 2,
  'in both classes from the first day of the start month');
select pg_temp.ok((select count(*) from public.student_month_plans where student_id = :s1 and start_date = :'first' and months = 3
    and end_date = public.month_plan_end_date(:'first', 3)) = 2, 'a month plan for each class');
select pg_temp.ok((select converted_student_id = :s1 and status = 'converted' from public.leads where id = 99931), 'the lead is converted');
select pg_temp.ok((select student_id = :s1 from public.quotations where id = '00000000-0000-0000-0000-00000000e001'), 'the quotation carries the student');
select pg_temp.ok((select count(*) from public.staff_notifications where student_id = :s1) = 2, 'the sales person and the consultant are told on the bell');

-- Called again: nothing more happens.
set local role service_role;
select pg_temp.ok((public.enrol_paid_quotation('00000000-0000-0000-0000-00000000e001') ->> 'already')::boolean, 'the second call says it was already done');
reset role;
select pg_temp.ok((select count(*) from public.students where full_name = 'EPQ Kid One') = 1
  and (select count(*) from public.student_classroom_periods where student_id = :s1) = 2
  and (select count(*) from public.student_month_plans where student_id = :s1) = 2
  and (select count(*) from public.staff_notifications where student_id = :s1) = 2, 'called twice: one student, two periods, two plans, two notes');

-- An HOA student with the same name and phone becomes regular on the same row.
insert into public.students (id, full_name, phone, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, is_active, student_type)
overriding system value values (99941, 'EPQ Kid Two', '+60 12-345 0932', 0, current_date, current_date, current_date, true, 'trial');
insert into public.quotations (id, status, lead_id, phone, child_name, child_age, cohort_id, enrol_method, start_date, months, sales_person_id, consultant_id, total)
values ('00000000-0000-0000-0000-00000000e002', 'paid', 99932, '60123450932', 'epq kid  two', 8, :cohort, 'EPQ 3 months', :'first', 1, 99911, null, 150);
insert into public.quotation_classes (quotation_id, subject_code, classroom_id) values ('00000000-0000-0000-0000-00000000e002', 'MM', 99922);
set local role service_role;
select pg_temp.ok((public.enrol_paid_quotation('00000000-0000-0000-0000-00000000e002') ->> 'from_trial')::boolean, 'an HOA student is reported as converted');
reset role;
select pg_temp.ok((select student_type = 'regular' and classroom_id = 99922 and payment_mode = '一次性付款' from public.students where id = 99941)
  and (select count(*) from public.students where lower(full_name) like 'epq kid%two') = 1, 'the HOA student became regular on the same row, no second student');
select pg_temp.ok((select count(*) from public.staff_notifications where student_id = 99941) = 1, 'a missing consultant is simply not told');

-- A regular student is used again; the people already there stay, this enrolment's fields are written.
insert into public.quotations (id, status, lead_id, phone, child_name, cohort_id, enrol_method, start_date, months, sales_person_id, consultant_id, total)
values ('00000000-0000-0000-0000-00000000e003', 'paid', 99933, '60123450931', 'EPQ Kid One', :cohort, 'EPQ 3 months', :'first', 6, 99913, 99913, 900);
insert into public.quotation_classes (quotation_id, subject_code, classroom_id) values ('00000000-0000-0000-0000-00000000e003', 'MM', 99922);
set local role service_role;
select pg_temp.ok(not (public.enrol_paid_quotation('00000000-0000-0000-0000-00000000e003') ->> 'created')::boolean, 'a regular student is used again');
reset role;
select pg_temp.ok((select count(*) from public.students where full_name = 'EPQ Kid One') = 1
  and (select sales_person_id = 99911 and consultant_id = 99912 from public.students where id = :s1)
  and (select count(*) from public.student_classroom_periods where student_id = :s1) = 2
  and (select count(*) from public.student_month_plans where student_id = :s1) = 3, 'same student, the people stay, no second period, one more month plan');

-- Refusals: not paid, a class that no longer runs, an HOA class; and nothing is left behind.
insert into public.quotations (id, status, phone, child_name, start_date, months, total)
values ('00000000-0000-0000-0000-00000000e004', 'sent', '60123450934', 'EPQ Kid Four', :'first', 1, 100),
       ('00000000-0000-0000-0000-00000000e005', 'paid', '60123450935', 'EPQ Kid Five', :'first', 1, 100),
       ('00000000-0000-0000-0000-00000000e006', 'paid', '60123450936', 'EPQ Kid Six', :'first', 1, 100);
insert into public.quotation_classes (quotation_id, subject_code, classroom_id) values
  ('00000000-0000-0000-0000-00000000e004', 'MM', 99922), ('00000000-0000-0000-0000-00000000e005', 'MM', 99924), ('00000000-0000-0000-0000-00000000e006', 'MM', 99921);
select pg_temp.fails($$select public.enrol_paid_quotation('00000000-0000-0000-0000-00000000e004')$$, 'not paid yet', 'a quotation that is not paid is refused');
select pg_temp.fails($$select public.enrol_paid_quotation('00000000-0000-0000-0000-00000000e005')$$, 'not running any more', 'a class that no longer runs is refused');
select pg_temp.fails($$select public.enrol_paid_quotation('00000000-0000-0000-0000-00000000e006')$$, 'HOA class', 'an HOA class is refused');
select pg_temp.ok(not exists (select 1 from public.students where full_name in ('EPQ Kid Four', 'EPQ Kid Five', 'EPQ Kid Six'))
  and (select count(*) from public.quotations where student_id is not null and id::text like '00000000-0000-0000-0000-00000000e00%') = 3, 'a refused quotation leaves nothing behind');

-- Only the server may call it.
set local role authenticated;
select pg_temp.fails($$select public.enrol_paid_quotation('00000000-0000-0000-0000-00000000e001')$$, 'permission denied', 'a logged-in user cannot call it');
reset role;

rollback;
