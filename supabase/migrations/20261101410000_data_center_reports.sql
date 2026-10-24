-- Data Center, part 1: the whole-school overview and EC performance (boss 2026-10-23; plan: side notes
-- data-center-plan.md). Builds on 20261101400000_data_center_conversions.sql.
--
-- 1. data_center_targets: an EC's own monthly target (people / subjects); none = the school default in the
--    Data Center settings (50 / 100). Admin sets them.
-- 2. data_center_ec_report(from, to): one row per EC for a stretch of Malaysia days: leads (by bucket),
--    conversions (same stretch / earlier leads), subjects and weighted subjects, money (paid quotations in the
--    stretch = real; conversions without one = estimated), days to convert, the target of the stretch's month.
--    A lead counts for its PIC's staff account on its added day. Open ranking: everyone with the tick sees all.
-- 3. data_center_overview(month): six months up to that month (leads, trial lessons, conversions, real and estimated money,
--    students in class at the month's end), the month's leads / conversions by bucket, and how many old
--    conversions are historical (day unknown; boss: shown apart, never in a month or the EC ranking).
-- All sums are made here, so nothing is cut off at 1000 rows (EC's own system lost rows that way).

-- ---------------------------------------------------------------------------------------------------------
-- 1. Targets
-- ---------------------------------------------------------------------------------------------------------

create table public.data_center_targets (
  teacher_id bigint not null references public.teachers (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  people integer not null check (people between 0 and 100000),
  subjects integer not null check (subjects between 0 and 100000),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by bigint references public.teachers (id) on delete set null,
  primary key (teacher_id, month)
);

alter table public.data_center_targets enable row level security;
revoke all on public.data_center_targets from public, anon, authenticated;
grant select on public.data_center_targets to authenticated;
grant all on public.data_center_targets to service_role;

create policy data_center_targets_select on public.data_center_targets for select to authenticated
  using (public.has_permission('data_center', 'view'));

-- Sets an EC's target for a month; both null = back to the school default.
create or replace function public.set_data_center_target(p_teacher_id bigint, p_month date, p_people integer, p_subjects integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can set targets.' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'Pick a month.';
  end if;
  if p_people is null and p_subjects is null then
    delete from public.data_center_targets where teacher_id = p_teacher_id and month = p_month;
    return;
  end if;
  if p_people is null or p_subjects is null or p_people < 0 or p_subjects < 0 or p_people > 100000 or p_subjects > 100000 then
    raise exception 'Give both targets, as numbers from 0.';
  end if;
  insert into public.data_center_targets (teacher_id, month, people, subjects, updated_by)
  values (p_teacher_id, p_month, p_people, p_subjects, public.current_teacher_id())
  on conflict (teacher_id, month) do update
    set people = excluded.people, subjects = excluded.subjects, updated_by = excluded.updated_by,
        updated_at = timezone('utc', now());
end;
$$;

revoke all on function public.set_data_center_target(bigint, date, integer, integer) from public, anon;
grant execute on function public.set_data_center_target(bigint, date, integer, integer) to authenticated;

-- The subject weight for a stay of so many months (settings 'weights'; none matching = 1).
create or replace function public.data_center_weight(p_months integer, p_settings jsonb)
returns numeric
language sql
immutable
set search_path = public
as $$
  select coalesce((
    select (w ->> 'times')::numeric
    from jsonb_array_elements(coalesce(p_settings -> 'weights', '[]'::jsonb)) w
    where p_months >= (w ->> 'fromMonths')::numeric
      and (jsonb_typeof(w -> 'toMonths') <> 'number' or p_months <= (w ->> 'toMonths')::numeric)
    limit 1), 1);
$$;

revoke all on function public.data_center_weight(integer, jsonb) from public, anon;
grant execute on function public.data_center_weight(integer, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2. EC performance
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.data_center_ec_report(p_from date, p_to date)
returns table (
  ec_id bigint,
  ec_name text,
  leads integer,
  leads_by_bucket jsonb,
  conversions integer,
  same_period integer,
  cross_period integer,
  subjects integer,
  weighted_subjects numeric,
  revenue_actual numeric,
  paid_quotations integer,
  revenue_estimated numeric,
  unknown_amounts integer,
  avg_days numeric,
  median_days numeric,
  target_people integer,
  target_subjects integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_settings jsonb := public.data_center_settings();
  v_month date := date_trunc('month', p_from)::date;
begin
  if not public.has_permission('data_center', 'view') then
    raise exception 'You do not have the Data Center tick.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 3700 then
    raise exception 'Pick a stretch of days (up to about ten years).';
  end if;

  return query
  with conv as (
    select * from public.data_center_conversions(p_from, p_to)
  ),
  lead_rows as (
    select public.pic_staff_id(l.pic_id) as ec, public.lead_report_bucket(l.source_id) as bucket
    from public.leads l
    where l.added_date between p_from and p_to
  ),
  lead_buckets as (
    select lr.ec, lr.bucket, count(*)::integer as n from lead_rows lr group by lr.ec, lr.bucket
  ),
  lead_agg as (
    select lb.ec, sum(lb.n)::integer as n, jsonb_object_agg(lb.bucket, lb.n) as by_bucket
    from lead_buckets lb group by lb.ec
  ),
  conv_agg as (
    select c.sales_person_id as ec,
      count(*)::integer as n,
      (count(*) filter (where c.lead_created_on between p_from and p_to))::integer as same_n,
      (count(*) filter (where c.lead_created_on is null or c.lead_created_on not between p_from and p_to))::integer as cross_n,
      coalesce(sum(c.subjects), 0)::integer as subj,
      coalesce(sum(c.subjects * public.data_center_weight(c.months, v_settings)), 0) as weighted,
      coalesce(sum(c.amount) filter (where c.amount_kind = 'estimated'), 0) as est,
      (count(*) filter (where c.amount_kind = 'unknown'))::integer as unknown_n,
      round(avg(c.converted_on - c.lead_created_on) filter (where c.converted_on >= c.lead_created_on), 1) as avg_d,
      round((percentile_cont(0.5) within group (order by c.converted_on - c.lead_created_on))::numeric, 1) as median_d
    from conv c group by c.sales_person_id
  ),
  paid as (
    select q.sales_person_id as ec, sum(q.total) as total, count(*)::integer as n
    from public.quotations q
    where q.status = 'paid'
      and (q.paid_at at time zone 'Asia/Kuala_Lumpur')::date between p_from and p_to
    group by q.sales_person_id
  ),
  ecs as (
    select la.ec from lead_agg la union select ca.ec from conv_agg ca union select p.ec from paid p
  )
  select
    e.ec,
    coalesce(t.full_name, '(no EC)'),
    coalesce(la.n, 0),
    coalesce(la.by_bucket, '{}'::jsonb),
    coalesce(ca.n, 0),
    coalesce(ca.same_n, 0),
    coalesce(ca.cross_n, 0),
    coalesce(ca.subj, 0),
    round(coalesce(ca.weighted, 0), 1),
    coalesce(p.total, 0),
    coalesce(p.n, 0),
    coalesce(ca.est, 0),
    coalesce(ca.unknown_n, 0),
    ca.avg_d,
    ca.median_d,
    -- "(no EC)" has no target
    case when e.ec is null then 0 else coalesce(tg.people, (v_settings -> 'targets' ->> 'people')::numeric::integer) end,
    case when e.ec is null then 0 else coalesce(tg.subjects, (v_settings -> 'targets' ->> 'subjects')::numeric::integer) end
  from ecs e
  left join public.teachers t on t.id = e.ec
  left join lead_agg la on la.ec is not distinct from e.ec
  left join conv_agg ca on ca.ec is not distinct from e.ec
  left join paid p on p.ec is not distinct from e.ec
  left join public.data_center_targets tg on tg.teacher_id = e.ec and tg.month = v_month
  order by coalesce(p.total, 0) + coalesce(ca.est, 0) desc, coalesce(ca.n, 0) desc, coalesce(t.full_name, '~');
end;
$$;

revoke all on function public.data_center_ec_report(date, date) from public, anon;
grant execute on function public.data_center_ec_report(date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3. The whole-school overview
-- ---------------------------------------------------------------------------------------------------------


create or replace function public.data_center_overview(p_month date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_first date := (date_trunc('month', p_month) - interval '5 months')::date;
  v_last date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_today date := (timezone('utc', now()) at time zone 'Asia/Kuala_Lumpur')::date;
  v_result jsonb;
begin
  if not public.has_permission('data_center', 'view') then
    raise exception 'You do not have the Data Center tick.' using errcode = '42501';
  end if;
  if p_month is null then
    raise exception 'Pick a month.';
  end if;

  with conv as (
    select * from public.data_center_conversions(v_first, v_last)
  ),
  months as (
    select m::date as month, least((m + interval '1 month - 1 day')::date, v_today) as day_end,
      (m + interval '1 month - 1 day')::date as month_end
    from generate_series(v_first, v_month, interval '1 month') m
  ),
  buckets as (
    select x ->> 'key' as key, x ->> 'label' as label, ord
    from jsonb_array_elements(public.data_center_settings() -> 'buckets') with ordinality as t(x, ord)
  ),
  month_leads as (
    select date_trunc('month', l.added_date)::date as month, public.lead_report_bucket(l.source_id) as bucket
    from public.leads l
    where l.added_date between v_first and v_last
  )
  select jsonb_build_object(
    'months', (
      select jsonb_agg(jsonb_build_object(
          'month', to_char(m.month, 'YYYY-MM'),
          'leads', (select count(*) from month_leads ml where ml.month = m.month),
          -- trial lessons booked for a day in the month (HOA / trial classes)
          'trials', (select count(*) from public.trial_bookings tb where tb.booking_date between m.month and m.month_end),
          'conversions', (select count(*) from conv c where date_trunc('month', c.converted_on) = m.month),
          'revenueActual', (select coalesce(sum(q.total), 0) from public.quotations q
                            where q.status = 'paid'
                              and (q.paid_at at time zone 'Asia/Kuala_Lumpur')::date between m.month and m.month_end),
          'revenueEstimated', (select coalesce(sum(c.amount), 0) from conv c
                               where c.amount_kind = 'estimated' and c.revenue_on between m.month and m.month_end),
          'unknownAmounts', (select count(*) from conv c
                             where c.amount_kind = 'unknown' and date_trunc('month', c.converted_on) = m.month),
          'students', (select count(distinct p.student_id)
                       from public.student_classroom_periods p
                       join public.classrooms cl on cl.id = p.classroom_id and cl.category = 'regular'
                       join public.students s on s.id = p.student_id and s.student_type = 'regular'
                       where coalesce(p.start_date, '-infinity'::date) <= m.day_end
                         and coalesce(p.end_date, 'infinity'::date) >= m.day_end)
        ) order by m.month)
      from months m),
    'buckets', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'bucket', b.key,
          'label', b.label,
          'leads', (select count(*) from month_leads ml where ml.month = v_month and ml.bucket = b.key),
          'conversions', (select count(*) from conv c
                          where c.source_bucket = b.key and date_trunc('month', c.converted_on) = v_month)
        ) order by b.ord), '[]'::jsonb)
      from buckets b),
    -- Old conversions whose day is not known (boss: counted apart, never in a month or the ranking).
    'historicalConversions', (select count(*) from public.lead_conversions h where h.historical),
    'adSpendConnected', false
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.data_center_overview(date) from public, anon;
grant execute on function public.data_center_overview(date) to authenticated;
