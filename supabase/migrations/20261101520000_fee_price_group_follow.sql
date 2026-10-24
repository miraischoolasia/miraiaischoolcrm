-- Price groups that follow another (boss 2026-10-23: EduHero's LATEST / 2026 LATEST / NORMAL membership levels take
-- the EC system's prices). Puts in no prices: a school picks, in Fee Calculator > Price settings, either
--   follow  : this group uses another group's price table (and changes with it), or
--   copy    : this group gets its own copy of another group's table, to change on its own.
-- fee_cohorts.uses_cohort_id = the group whose prices are used; one step only (a group that follows cannot be
-- followed). The readers (the Fee Calculator page, the quotation functions, the Data Center estimate) use the
-- followed group's rows and its "materials in tuition"; the follower's own rows are kept but unused.

alter table public.fee_cohorts add column if not exists uses_cohort_id bigint
  references public.fee_cohorts (id) on delete set null;
alter table public.fee_cohorts drop constraint if exists fee_cohorts_not_self;
alter table public.fee_cohorts add constraint fee_cohorts_not_self check (uses_cohort_id is null or uses_cohort_id <> id);

-- The group whose prices count for a group.
create or replace function public.fee_cohort_price_source(p_cohort_id bigint)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(c.uses_cohort_id, c.id) from public.fee_cohorts c where c.id = p_cohort_id;
$$;

revoke all on function public.fee_cohort_price_source(bigint) from public, anon;
grant execute on function public.fee_cohort_price_source(bigint) to authenticated;

-- Follow another group's prices (p_uses null: back to its own).
create or replace function public.set_fee_cohort_follow(p_cohort_id bigint, p_uses_cohort_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('fee_calculator', 'edit') then
    raise exception 'Only someone who may change the Fee Calculator can change price groups.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.fee_cohorts where id = p_cohort_id) then
    raise exception 'Price group not found.';
  end if;
  if p_uses_cohort_id is not null then
    if p_uses_cohort_id = p_cohort_id then
      raise exception 'A group cannot follow itself.';
    end if;
    if not exists (select 1 from public.fee_cohorts where id = p_uses_cohort_id and uses_cohort_id is null) then
      raise exception 'Pick a group that has its own prices.';
    end if;
    if exists (select 1 from public.fee_cohorts where uses_cohort_id = p_cohort_id) then
      raise exception 'Other groups follow this one; change them first.';
    end if;
  end if;
  update public.fee_cohorts set uses_cohort_id = p_uses_cohort_id, updated_by = public.current_teacher_id() where id = p_cohort_id;
end;
$$;

revoke all on function public.set_fee_cohort_follow(bigint, bigint) from public, anon;
grant execute on function public.set_fee_cohort_follow(bigint, bigint) to authenticated;

-- Copy another group's whole price table (and its "materials in tuition") into this group; it then has its own.
create or replace function public.copy_fee_cohort_rates(p_cohort_id bigint, p_from_cohort_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source bigint;
  v_count integer;
begin
  if not public.has_permission('fee_calculator', 'edit') then
    raise exception 'Only someone who may change the Fee Calculator can change price groups.' using errcode = '42501';
  end if;
  if p_cohort_id = p_from_cohort_id then
    raise exception 'Pick another group to copy from.';
  end if;
  if not exists (select 1 from public.fee_cohorts where id = p_cohort_id) then
    raise exception 'Price group not found.';
  end if;
  v_source := public.fee_cohort_price_source(p_from_cohort_id);
  if v_source is null then
    raise exception 'The group to copy from is not there.';
  end if;
  if exists (select 1 from public.fee_cohorts where uses_cohort_id = p_cohort_id) then
    raise exception 'Other groups follow this one; change them first.';
  end if;

  delete from public.fee_rates where cohort_id = p_cohort_id;
  insert into public.fee_rates (cohort_id, level, track, subject_count, cycle_tier, amount)
  select p_cohort_id, r.level, r.track, r.subject_count, r.cycle_tier, r.amount
  from public.fee_rates r where r.cohort_id = v_source;
  get diagnostics v_count = row_count;

  update public.fee_cohorts
  set uses_cohort_id = null,
      materials_included_in_tuition = (select s.materials_included_in_tuition from public.fee_cohorts s where s.id = v_source),
      updated_by = public.current_teacher_id()
  where id = p_cohort_id;
  return v_count;
end;
$$;

revoke all on function public.copy_fee_cohort_rates(bigint, bigint) from public, anon;
grant execute on function public.copy_fee_cohort_rates(bigint, bigint) to authenticated;

-- The Data Center's estimate (20261101400000) reads the followed group's prices.
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

  select coalesce(uses_cohort_id, id) into v_cohort from public.fee_cohorts where membership_name = v_student.membership and is_active;

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
