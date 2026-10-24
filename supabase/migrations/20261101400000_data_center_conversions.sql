-- Data Center, part 0: the ground the numbers stand on (boss 2026-10-23; plan: side notes data-center-plan.md).
--
-- 1. Settings (app_settings 'data_center'): the source buckets (EC's Walk-in / MKT / Rearm / Cold List, renamable),
--    the bucket a source with none falls into, the subject weights by months (EC: 3-5 ×1.1, 6-11 ×1.2, 12+ ×1.3)
--    and the default monthly target per EC (50 people / 100 subjects). Admin changes them.
-- 2. lead_options.report_bucket: which bucket a lead source counts in (guessed from the name once, admin changes it).
-- 3. program_levels.fee_level: primary / secondary, for estimating a fee from the price tables (guessed once).
-- 4. lead_conversions: when a lead became a regular student, and who closed it. Written by triggers whenever a
--    student linked to a lead becomes regular (paid quotation, HOA converted, new regular student, link). A trial,
--    HOA, camp or book buyer is not a conversion (EC counted a booked trial as one; we do not).
-- 5. data_center_conversions(from, to): the conversions with their money. Real money = the first paid quotation
--    (counted in the month it was paid). Without one: estimated from the price tables (standard tuition for the
--    subjects × the enrol method's months), marked estimated; no estimate when the student lacks what it needs.
-- 6. backfill_lead_conversions(dry_run): one-off for leads converted before this. Not run here: release runs it
--    (dry run first) after the migration. Boss 2026-10-23, "count from the day it goes live": a conversion whose
--    day the activity log gives keeps that day; every other old one is historical (day unknown): kept and counted
--    apart, never in a month, a chart or the EC ranking. (EduHero's class records were made on the import day, so
--    a first class says nothing about when they joined.)
-- 7. Two new ticks: data_center (seen; everyone with it sees every EC — boss: open ranking) and ad_spend (seen;
--    the Meta ad money, for part 3).
--
-- Times: a conversion's day is its Malaysia day (EC counted midnight-8am as the day before).

-- ---------------------------------------------------------------------------------------------------------
-- 1. Settings
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.data_center_defaults()
returns jsonb
language sql
immutable
set search_path = public
as $$
  select '{
    "buckets": [
      {"key": "walkin", "label": "Walk-in"},
      {"key": "mkt", "label": "MKT"},
      {"key": "rearm", "label": "Rearm"},
      {"key": "cold", "label": "Cold List"}
    ],
    "defaultBucket": "mkt",
    "weights": [
      {"fromMonths": 3, "toMonths": 5, "times": 1.1},
      {"fromMonths": 6, "toMonths": 11, "times": 1.2},
      {"fromMonths": 12, "toMonths": null, "times": 1.3}
    ],
    "targets": {"people": 50, "subjects": 100}
  }'::jsonb;
$$;

create or replace function public.data_center_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.data_center_defaults() || coalesce((select value from public.app_settings where key = 'data_center'), '{}'::jsonb);
$$;

revoke all on function public.data_center_defaults() from public, anon;
revoke all on function public.data_center_settings() from public, anon;
grant execute on function public.data_center_defaults() to authenticated;
grant execute on function public.data_center_settings() to authenticated;

-- Changes some settings (only the keys given, each replaced whole). Admin only.
create or replace function public.set_data_center(p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := coalesce((select value from public.app_settings where key = 'data_center'), '{}'::jsonb);
  v_merged jsonb;
  k text;
  b jsonb;
  w jsonb;
  v_keys text[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change the Data Center settings.' using errcode = '42501';
  end if;
  if p_value is null or jsonb_typeof(p_value) <> 'object' then
    raise exception 'The settings are not valid.';
  end if;
  for k in select jsonb_object_keys(p_value) loop
    if k not in (select jsonb_object_keys(public.data_center_defaults())) then
      raise exception 'Unknown setting %.', k;
    end if;
  end loop;

  v_merged := public.data_center_defaults() || v_old || p_value;

  if jsonb_typeof(v_merged -> 'buckets') <> 'array' or jsonb_array_length(v_merged -> 'buckets') not between 1 and 12 then
    raise exception 'Give between 1 and 12 buckets.';
  end if;
  for b in select * from jsonb_array_elements(v_merged -> 'buckets') loop
    if jsonb_typeof(b) <> 'object' or coalesce(b ->> 'key', '') !~ '^[a-z0-9_]{1,30}$'
       or char_length(btrim(coalesce(b ->> 'label', ''))) not between 1 and 40 then
      raise exception 'Each bucket needs a key (a-z, 0-9, _) and a name of up to 40 characters.';
    end if;
    if (b ->> 'key') = any (v_keys) then
      raise exception 'Bucket % is there twice.', b ->> 'key';
    end if;
    v_keys := v_keys || (b ->> 'key');
  end loop;
  if not ((v_merged ->> 'defaultBucket') = any (v_keys)) then
    raise exception 'The default bucket must be one of the buckets.';
  end if;

  if jsonb_typeof(v_merged -> 'weights') <> 'array' or jsonb_array_length(v_merged -> 'weights') > 12 then
    raise exception 'The weights are not valid.';
  end if;
  for w in select * from jsonb_array_elements(v_merged -> 'weights') loop
    if jsonb_typeof(w -> 'fromMonths') <> 'number' or (w ->> 'fromMonths')::numeric not between 1 and 60
       or (jsonb_typeof(w -> 'toMonths') <> 'null' and (jsonb_typeof(w -> 'toMonths') <> 'number'
           or (w ->> 'toMonths')::numeric < (w ->> 'fromMonths')::numeric))
       or jsonb_typeof(w -> 'times') <> 'number' or (w ->> 'times')::numeric not between 0.1 and 10 then
      raise exception 'Each weight needs from-months (1-60), to-months (or none) and a multiplier (0.1-10).';
    end if;
  end loop;

  if jsonb_typeof(v_merged -> 'targets') <> 'object'
     or jsonb_typeof(v_merged -> 'targets' -> 'people') <> 'number'
     or jsonb_typeof(v_merged -> 'targets' -> 'subjects') <> 'number'
     or (v_merged -> 'targets' ->> 'people')::numeric not between 0 and 100000
     or (v_merged -> 'targets' ->> 'subjects')::numeric not between 0 and 100000 then
    raise exception 'The targets must be numbers from 0.';
  end if;

  insert into public.app_settings (key, value, updated_by)
  values ('data_center', v_old || p_value, public.current_teacher_id())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by,
    updated_at = timezone('utc', now());
  return public.data_center_settings();
end;
$$;

revoke all on function public.set_data_center(jsonb) from public, anon;
grant execute on function public.set_data_center(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2. Which bucket a lead source counts in
-- ---------------------------------------------------------------------------------------------------------

alter table public.lead_options add column if not exists report_bucket text
  check (report_bucket is null or report_bucket ~ '^[a-z0-9_]{1,30}$');

update public.lead_options
set report_bucket = case
    when label ~* 'walk\s*-?\s*in' then 'walkin'
    when label ~* 're-?arm' then 'rearm'
    when label ~* 'cold' then 'cold'
  end
where kind = 'source' and report_bucket is null;

create or replace function public.set_source_bucket(p_option_id bigint, p_bucket text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change which bucket a source counts in.' using errcode = '42501';
  end if;
  if p_bucket is not null and not exists (
    select 1 from jsonb_array_elements(public.data_center_settings() -> 'buckets') b where b ->> 'key' = p_bucket
  ) then
    raise exception 'There is no bucket %.', p_bucket;
  end if;
  update public.lead_options set report_bucket = p_bucket where id = p_option_id and kind = 'source';
  if not found then
    raise exception 'That source is not there.';
  end if;
end;
$$;

revoke all on function public.set_source_bucket(bigint, text) from public, anon;
grant execute on function public.set_source_bucket(bigint, text) to authenticated;

-- The bucket a lead counts in: its source's bucket, else the default one.
create or replace function public.lead_report_bucket(p_source_id bigint)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select o.report_bucket from public.lead_options o
     where o.id = p_source_id and o.kind = 'source'
       and exists (select 1 from jsonb_array_elements(public.data_center_settings() -> 'buckets') b
                   where b ->> 'key' = o.report_bucket)),
    public.data_center_settings() ->> 'defaultBucket');
$$;

revoke all on function public.lead_report_bucket(bigint) from public, anon;
grant execute on function public.lead_report_bucket(bigint) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Primary or secondary, for the price tables
-- ---------------------------------------------------------------------------------------------------------

alter table public.program_levels add column if not exists fee_level text
  check (fee_level is null or fee_level in ('primary', 'secondary'));

update public.program_levels
set fee_level = case
    when name ~* '^\s*(p|y|std|year|primary|darjah)\s*[0-9]' or name ~* '(小学|primary)' or name ~ '^[一二三四五六]年级' then 'primary'
    when name ~* '^\s*(f|s|form|tingkatan|secondary)\s*[0-9]' or name ~* '(中学|secondary|初中|高中|spm|pt3)' then 'secondary'
  end
where fee_level is null;

create or replace function public.set_program_level_fee_level(p_name text, p_fee_level text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change this.' using errcode = '42501';
  end if;
  if p_fee_level is not null and p_fee_level not in ('primary', 'secondary') then
    raise exception 'Pick primary or secondary.';
  end if;
  update public.program_levels set fee_level = p_fee_level where name = p_name;
  if not found then
    raise exception 'That level is not there.';
  end if;
end;
$$;

revoke all on function public.set_program_level_fee_level(text, text) from public, anon;
grant execute on function public.set_program_level_fee_level(text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 4. The conversions
-- ---------------------------------------------------------------------------------------------------------

create table public.lead_conversions (
  id bigint generated always as identity primary key,
  lead_id bigint not null references public.leads (id) on delete cascade,
  student_id bigint not null references public.students (id) on delete cascade,
  converted_at timestamptz not null,
  -- true: the day is not known (an old conversion without an activity log entry, or a student who was already
  -- here before being tied to a lead). Counted apart, never in a month or the EC ranking.
  historical boolean not null default false,
  how text not null check (how in ('quotation', 'upgrade', 'new_student', 'link', 'backfill')),
  -- who closed it (the EC): the student's sales person, else the lead's PIC's staff account, as it was then
  sales_person_id bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (lead_id, student_id)
);

create index lead_conversions_converted_at_idx on public.lead_conversions (converted_at);
create index lead_conversions_student_idx on public.lead_conversions (student_id);

alter table public.lead_conversions enable row level security;
revoke all on public.lead_conversions from public, anon, authenticated;
grant select on public.lead_conversions to authenticated;
grant all on public.lead_conversions to service_role;

create policy lead_conversions_select on public.lead_conversions for select to authenticated
  using (public.has_permission('data_center', 'view'));

-- One conversion per lead and student; nothing when the student is not regular or it is already there.
create or replace function public.record_lead_conversion(p_lead_id bigint, p_student_id bigint, p_how text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_lead public.leads%rowtype;
  v_at timestamptz := timezone('utc', now());
  v_historical boolean := false;
  v_how text := p_how;
begin
  select * into v_student from public.students where id = p_student_id;
  select * into v_lead from public.leads where id = p_lead_id;
  if v_student.id is null or v_lead.id is null or v_student.student_type <> 'regular' then
    return;
  end if;
  if exists (select 1 from public.lead_conversions where lead_id = p_lead_id and student_id = p_student_id) then
    return;
  end if;

  if exists (
    select 1 from public.quotations q
    where (q.student_id = p_student_id or q.lead_id = p_lead_id)
      and q.status = 'paid' and q.paid_at > v_at - interval '1 day'
  ) then
    v_how := 'quotation';
  end if;

  -- A student who was already here (made more than a day ago, imported or enrolled before) and is tied to a lead
  -- only now: not a sale today, and the day it was is not known.
  if v_how = 'link' and v_student.created_at < v_at - interval '1 day' then
    v_historical := true;
  end if;

  insert into public.lead_conversions (lead_id, student_id, converted_at, historical, how, sales_person_id)
  values (p_lead_id, p_student_id, v_at, v_historical, v_how,
          coalesce(v_student.sales_person_id, public.pic_staff_id(v_lead.pic_id)))
  on conflict (lead_id, student_id) do nothing;
end;
$$;

revoke all on function public.record_lead_conversion(bigint, bigint, text) from public, anon, authenticated;

-- A student becomes regular (made regular, or an HOA / trial student upgraded): every lead tied to them converts.
create or replace function public.students_record_conversion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  l record;
begin
  if new.student_type = 'regular' and (tg_op = 'INSERT' or old.student_type is distinct from 'regular') then
    for l in select id from public.leads where converted_student_id = new.id loop
      perform public.record_lead_conversion(l.id, new.id,
        case when tg_op = 'INSERT' then 'new_student' else 'upgrade' end);
    end loop;
  end if;
  return null;
end;
$$;

revoke all on function public.students_record_conversion() from public, anon, authenticated;

create trigger students_record_conversion
  after insert or update of student_type on public.students
  for each row execute function public.students_record_conversion();

-- A lead is tied to a student who is already regular.
create or replace function public.leads_record_conversion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.converted_student_id is not null
     and (tg_op = 'INSERT' or old.converted_student_id is distinct from new.converted_student_id) then
    perform public.record_lead_conversion(new.id, new.converted_student_id, 'link');
  end if;
  return null;
end;
$$;

revoke all on function public.leads_record_conversion() from public, anon, authenticated;

create trigger leads_record_conversion
  after insert or update of converted_student_id on public.leads
  for each row execute function public.leads_record_conversion();

-- ---------------------------------------------------------------------------------------------------------
-- 5. The money
-- ---------------------------------------------------------------------------------------------------------

-- An estimate of a regular student's first payment from the price tables, as of a day: standard tuition for the
-- regular classes they had in the two weeks from that day, at their membership's rate and enrol method.
-- Leaves out materials, postage, registration and the other tracks. note says why there is no amount.
create or replace function public.estimate_student_fee(p_student_id bigint, p_on date)
returns table (amount numeric, subjects integer, months integer, note text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_student public.students%rowtype;
  v_level text;
  v_cohort bigint;
  v_tier text := 'monthly';
  v_months integer := 1;
  v_method jsonb;
  v_rate numeric;
begin
  select * into v_student from public.students where id = p_student_id;

  select count(distinct p.classroom_id)::integer,
         mode() within group (order by pl.fee_level)
  into subjects, v_level
  from public.student_classroom_periods p
  join public.classrooms c on c.id = p.classroom_id and c.category = 'regular'
  left join public.program_levels pl on pl.name = c.program_level
  where p.student_id = p_student_id
    and coalesce(p.start_date, '-infinity'::date) <= p_on + 14
    and coalesce(p.end_date, 'infinity'::date) >= p_on;

  select m into v_method
  from jsonb_array_elements(coalesce(
    (select value -> 'enrolMethods' from public.app_settings where key = 'quotations'),
    '[{"name": "每月报名", "rateTier": "monthly", "months": 1},
      {"name": "3个月一次性报名", "rateTier": "3mo", "months": 3},
      {"name": "6个月一次性报名", "rateTier": "6mo_plus", "months": 6},
      {"name": "12个月一次性报名", "rateTier": "6mo_plus", "months": 12}]'::jsonb)) m
  where m ->> 'name' = v_student.enrol_method
  limit 1;
  if v_method is not null and v_method ->> 'rateTier' in ('monthly', '3mo', '6mo_plus') then
    v_tier := v_method ->> 'rateTier';
    v_months := greatest(1, coalesce((v_method ->> 'months')::integer, 1));
  end if;
  months := v_months;

  select id into v_cohort from public.fee_cohorts where membership_name = v_student.membership and is_active;

  if coalesce(subjects, 0) = 0 then
    note := 'no_classes';
  elsif v_student.membership is null then
    note := 'no_membership';
  elsif v_cohort is null then
    note := 'no_price_group';
  elsif v_level is null then
    note := 'no_level';
  else
    select r.amount into v_rate from public.fee_rates r
    where r.cohort_id = v_cohort and r.level = v_level and r.track = 'standard'
      and r.subject_count = subjects and r.cycle_tier = v_tier;
    if v_rate is null then
      note := 'no_rate';
    else
      amount := round(v_rate * v_months, 2);
    end if;
  end if;
  subjects := coalesce(subjects, 0);
  return next;
end;
$$;

revoke all on function public.estimate_student_fee(bigint, date) from public, anon, authenticated;

-- The conversions in a stretch of Malaysia days, with their money. Whoever has the Data Center tick.
create or replace function public.data_center_conversions(p_from date, p_to date)
returns table (
  conversion_id bigint,
  lead_id bigint,
  lead_name text,
  lead_created_on date,
  source_bucket text,
  student_id bigint,
  student_name text,
  converted_on date,
  how text,
  sales_person_id bigint,
  sales_person_name text,
  subjects integer,
  months integer,
  amount numeric,
  amount_kind text,
  revenue_on date,
  quotation_id uuid,
  estimate_note text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('data_center', 'view') then
    raise exception 'You do not have the Data Center tick.' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 3700 then
    raise exception 'Pick a stretch of days (up to about ten years).';
  end if;

  return query
  select
    c.id,
    l.id,
    l.full_name,
    l.added_date,
    public.lead_report_bucket(l.source_id),
    s.id,
    s.full_name,
    (c.converted_at at time zone 'Asia/Kuala_Lumpur')::date,
    c.how,
    c.sales_person_id,
    t.full_name,
    case when q.id is not null then coalesce(q.subject_count, e.subjects) else e.subjects end,
    case when q.id is not null then coalesce(q.months, e.months) else e.months end,
    coalesce(q.total, e.amount),
    case when q.id is not null then 'actual' when e.amount is not null then 'estimated' else 'unknown' end,
    case when q.id is not null then (q.paid_at at time zone 'Asia/Kuala_Lumpur')::date
         else (c.converted_at at time zone 'Asia/Kuala_Lumpur')::date end,
    q.id,
    case when q.id is null then e.note end
  from public.lead_conversions c
  join public.leads l on l.id = c.lead_id
  join public.students s on s.id = c.student_id
  left join public.teachers t on t.id = c.sales_person_id
  left join lateral (
    select qq.id, qq.total, qq.paid_at, qq.months::integer as months,
           (select nullif(count(*), 0)::integer from public.quotation_classes qc where qc.quotation_id = qq.id) as subject_count
    from public.quotations qq
    where (qq.student_id = c.student_id or qq.lead_id = c.lead_id)
      and qq.status = 'paid' and qq.paid_at >= c.converted_at - interval '14 days'
    order by qq.paid_at
    limit 1
  ) q on true
  left join lateral public.estimate_student_fee(c.student_id, (c.converted_at at time zone 'Asia/Kuala_Lumpur')::date) e on true
  where not c.historical
    and (c.converted_at at time zone 'Asia/Kuala_Lumpur')::date between p_from and p_to
  order by c.converted_at, c.id;
end;
$$;

revoke all on function public.data_center_conversions(date, date) from public, anon;
grant execute on function public.data_center_conversions(date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 6. Leads converted before this (run once by release, dry run first)
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.backfill_lead_conversions(p_dry_run boolean default true)
returns table (would_add integer, dated integer, historical integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  drop table if exists pg_temp.backfill_rows;
  create temporary table backfill_rows on commit drop as
  select
    l.id as lead_id,
    s.id as student_id,
    lg.at as log_at,
    s.created_at as student_at,
    coalesce(s.sales_person_id, public.pic_staff_id(l.pic_id)) as sales_person_id
  from public.leads l
  join public.students s on s.id = l.converted_student_id and s.student_type = 'regular'
  left join lateral (
    select min(a.created_at) as at from public.admin_activity_logs a
    where a.entity_type = 'lead' and a.entity_id = l.id
      and (a.action_type = 'lead_converted' or a.details ->> 'status' = 'converted')
  ) lg on true
  where not exists (select 1 from public.lead_conversions x where x.lead_id = l.id and x.student_id = s.id);

  would_add := (select count(*) from backfill_rows);
  dated := (select count(*) from backfill_rows where log_at is not null);
  historical := (select count(*) from backfill_rows where log_at is null);

  if not p_dry_run then
    -- A historical one keeps the student's record day only so the column is filled; it is never shown as a day.
    insert into public.lead_conversions (lead_id, student_id, converted_at, historical, how, sales_person_id)
    select lead_id, student_id, coalesce(log_at, student_at), log_at is null, 'backfill', sales_person_id
    from backfill_rows
    on conflict (lead_id, student_id) do nothing;
  end if;
  return next;
end;
$$;

revoke all on function public.backfill_lead_conversions(boolean) from public, anon, authenticated;
grant execute on function public.backfill_lead_conversions(boolean) to service_role;


-- ---------------------------------------------------------------------------------------------------------
-- 7. The new ticks, data_center and ad_spend, both seen-only. Patched into the latest valid_account_permissions
--    (as 20261101210000_galleries.sql does), so it does not matter which of the two runs first.
-- ---------------------------------------------------------------------------------------------------------

create or replace function pg_temp.dc_patch(p_fn regprocedure, p_label text, p_from text, p_to text)
returns void
language plpgsql
as $$
declare
  v_def text := replace(pg_get_functiondef(p_fn), chr(13), '');
begin
  if position(p_to in v_def) > 0 then
    raise notice '%: already there', p_label;
    return;
  end if;
  if position(p_from in v_def) = 0 then
    raise exception '%: the text to change was not found', p_label;
  end if;
  execute replace(v_def, p_from, p_to);
end;
$$;

select pg_temp.dc_patch(
  'public.valid_account_permissions(jsonb)'::regprocedure,
  'valid_account_permissions: data_center + ad_spend',
  $x$'progress_cards', 'quotations'$x$,
  $x$'progress_cards', 'quotations', 'data_center', 'ad_spend'$x$
);

select pg_temp.dc_patch(
  'public.valid_account_permissions(jsonb)'::regprocedure,
  'valid_account_permissions: data_center + ad_spend seen-only',
  $x$'staff_hours', 'content_library')$x$,
  $x$'staff_hours', 'content_library', 'data_center', 'ad_spend')$x$
);
