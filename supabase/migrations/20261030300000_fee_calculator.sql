-- The Fee Calculator (学费小助理), moved from the EC system (boss 2026-10-22). Consultants pick a membership level, primary
-- or secondary, West / East Malaysia, the months and the subjects; the page works out tuition, materials, postage and the
-- yearly registration fee and writes the text to send the parent. The maths is EC's, unchanged (src/lib/feeCalculator/,
-- docs/eduhero-fee-logic.md). This migration keeps the prices, which an admin changes on the page.
--
--   fee_cohorts   one price group per membership level (student_field_options, field 'membership', of
--                 20261030100000_student_roster_fields.sql), so there is one list of membership levels: renaming a
--                 level there renames its price group too. Hidden, never deleted.
--   fee_rates     the per-month price for a group, level, track (standard / BIO-CHE-PHY / Sejarah alone /
--                 Cambridge English), number of subjects and price column (monthly / 3 months / 6 months+).
--   fee_subjects  the subjects to tick, per primary / secondary / BIO-CHE-PHY. Hidden, never deleted. SEJ, BIP and BIK
--                 keep their codes and kinds: the maths finds them by code.
--   fee_settings  'global_rates' (materials, postage, registration fee, SEJ surcharge) and 'invoice_template' (the
--                 text lines), the same shapes as EC's cms_settings.
--   app_settings  'fee_calculator' {"enabled": false}: each school switches the page on (EduHero) or leaves it off
--                 (Mirai). Apart from brand.usesFees, which it neither reads nor changes.
--
-- A new tick, fee_calculator (Students group): view = use the calculator, edit = change prices, subjects and text.
-- Nobody gets it on the day this goes live except admins (who have every tick); an admin ticks it for consultants.
-- Students and parents never read the prices.
--
-- Starting prices: EC's code of 2026-08-17 (boss's choice), 26002 and 26001; the same numbers as
-- src/lib/feeCalculator/seed.ts (feeCalculator.test.ts checks that they agree).

-- ---------------------------------------------------------------------------------------------------------
-- 1. Tables.
-- ---------------------------------------------------------------------------------------------------------

create table public.fee_cohorts (
  id bigint generated always as identity primary key,
  membership_field text not null default 'membership' check (membership_field = 'membership'),
  membership_name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  materials_included_in_tuition boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by bigint references public.teachers (id) on delete set null,
  foreign key (membership_field, membership_name)
    references public.student_field_options (field, name) on update cascade
);

create trigger set_fee_cohorts_updated_at
  before update on public.fee_cohorts
  for each row execute function public.set_current_timestamp_updated_at();

create table public.fee_rates (
  cohort_id bigint not null references public.fee_cohorts (id) on delete cascade,
  level text not null check (level in ('primary', 'secondary')),
  track text not null check (track in ('standard', 'bio_che_phy', 'sejarah_standalone', 'cambridge_english')),
  subject_count smallint not null check (subject_count between 1 and 30),
  cycle_tier text not null check (cycle_tier in ('monthly', '3mo', '6mo_plus')),
  amount numeric(10, 2) not null check (amount >= 0),
  primary key (cohort_id, level, track, subject_count, cycle_tier)
);

create table public.fee_subjects (
  id bigint generated always as identity primary key,
  level text not null check (level in ('primary', 'secondary', 'bio_che_phy')),
  code text not null check (code ~ '^[A-Z0-9]{1,12}$'),
  label text not null check (char_length(btrim(label)) between 1 and 80 and label = btrim(label)),
  kind text not null check (kind in ('core', 'sej', 'bip', 'bik')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (level, code),
  -- The maths finds SEJ, BIP and BIK by code; their kinds go with them.
  check ((code = 'SEJ') = (kind = 'sej') and (code = 'BIP') = (kind = 'bip') and (code = 'BIK') = (kind = 'bik'))
);

create trigger set_fee_subjects_updated_at
  before update on public.fee_subjects
  for each row execute function public.set_current_timestamp_updated_at();

create table public.fee_settings (
  key text primary key check (key in ('global_rates', 'invoice_template')),
  value jsonb not null,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by bigint references public.teachers (id) on delete set null
);

-- ---------------------------------------------------------------------------------------------------------
-- 2. The new tick. Same as 20261029300000_student_inbox.sql (the latest valid_account_permissions) plus
--    'fee_calculator' (view / edit, no "whose" scope).
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.valid_account_permissions(p jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(p) = 'object' and not exists (
    select 1
    from jsonb_each(p) as e(module, value)
    where e.module not in (
        'calendar', 'classrooms', 'students', 'leads', 'forms', 'activity', 'team_replies',
        'inbox', 'automations', 'ai_knowledge', 'videos', 'questions', 'app_logins', 'packages',
        'class_settings', 'staff_hours', 'content_studio', 'content_library', 'student_inbox',
        'fee_calculator'
      )
      or jsonb_typeof(e.value) <> 'object'
      or coalesce(e.value ->> 'level', '') not in ('view', 'edit')
      or (e.value ? 'delete' and jsonb_typeof(e.value -> 'delete') <> 'boolean')
      or (e.value -> 'delete' = 'true'::jsonb and e.value ->> 'level' <> 'edit')
      -- Seen, never changed (Content Library: seeing it is what lets a person claim a post).
      or (e.module in ('activity', 'team_replies', 'staff_hours', 'content_library')
          and (e.value ->> 'level' <> 'view' or e.value -> 'delete' = 'true'::jsonb))
      -- Whose rows: only where the page has rows that belong to someone.
      or (e.value ? 'scope' and (
        jsonb_typeof(e.value -> 'scope') <> 'string'
        or case
          when e.module in ('leads', 'inbox') then e.value ->> 'scope' not in ('all', 'own_unassigned', 'own')
          when e.module = 'team_replies' then e.value ->> 'scope' not in ('all', 'own')
          else e.value ->> 'scope' <> 'all'
        end
      ))
      -- Only these keys.
      or exists (select 1 from jsonb_object_keys(e.value) k where k not in ('level', 'delete', 'scope'))
  );
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Who reads: the Fee Calculator tick (admins have every tick). Nobody writes the tables directly.
-- ---------------------------------------------------------------------------------------------------------

alter table public.fee_cohorts enable row level security;
alter table public.fee_rates enable row level security;
alter table public.fee_subjects enable row level security;
alter table public.fee_settings enable row level security;

revoke all on public.fee_cohorts, public.fee_rates, public.fee_subjects, public.fee_settings from public, anon, authenticated;
grant select on public.fee_cohorts, public.fee_rates, public.fee_subjects, public.fee_settings to authenticated;
grant all on public.fee_cohorts, public.fee_rates, public.fee_subjects, public.fee_settings to service_role;

create policy fee_cohorts_select on public.fee_cohorts for select to authenticated
  using ((select public.has_permission('fee_calculator')));
create policy fee_rates_select on public.fee_rates for select to authenticated
  using ((select public.has_permission('fee_calculator')));
create policy fee_subjects_select on public.fee_subjects for select to authenticated
  using ((select public.has_permission('fee_calculator')));
create policy fee_settings_select on public.fee_settings for select to authenticated
  using ((select public.has_permission('fee_calculator')));

-- ---------------------------------------------------------------------------------------------------------
-- 4. Changing them (the Price settings tab): the Fee Calculator tick with edit.
-- ---------------------------------------------------------------------------------------------------------

-- Adds a price group for a membership level (p_id null) or changes one: its order, hidden or shown, and whether its
-- tuition already holds the materials fee. (Renaming is renaming the membership level: save_student_field_option.)
create or replace function public.save_fee_cohort(
  p_id bigint,
  p_membership_name text,
  p_sort_order integer,
  p_is_active boolean,
  p_materials_included boolean
)
returns public.fee_cohorts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.fee_cohorts%rowtype;
begin
  if not public.has_permission('fee_calculator', 'edit') then
    raise exception 'Only someone who may change the Fee Calculator can change price groups.';
  end if;

  if p_id is null then
    if not exists (select 1 from public.student_field_options where field = 'membership' and name = p_membership_name) then
      raise exception 'Pick one of the membership levels.';
    end if;
    insert into public.fee_cohorts (membership_name, sort_order, is_active, materials_included_in_tuition, updated_by)
    values (
      p_membership_name,
      coalesce(p_sort_order, (select coalesce(max(sort_order), 0) + 10 from public.fee_cohorts)),
      coalesce(p_is_active, true),
      coalesce(p_materials_included, false),
      public.current_teacher_id()
    )
    returning * into v_row;
  else
    update public.fee_cohorts
    set sort_order = coalesce(p_sort_order, sort_order),
        is_active = coalesce(p_is_active, is_active),
        materials_included_in_tuition = coalesce(p_materials_included, materials_included_in_tuition),
        updated_by = public.current_teacher_id()
    where id = p_id
    returning * into v_row;
    if v_row.id is null then
      raise exception 'Price group not found.';
    end if;
  end if;
  return v_row;
exception
  when unique_violation then
    raise exception '"%" already has a price group.', p_membership_name;
end;
$$;

revoke all on function public.save_fee_cohort(bigint, text, integer, boolean, boolean) from public, anon;
grant execute on function public.save_fee_cohort(bigint, text, integer, boolean, boolean) to authenticated;

-- One group's whole price table at once, as EC saves it: every row of the group is replaced by p_rates
-- ([{level, track, subject_count, cycle_tier, amount}, ...]) in one go, together with the "materials included" tick.
create or replace function public.save_fee_cohort_rates(p_cohort_id bigint, p_materials_included boolean, p_rates jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_permission('fee_calculator', 'edit') then
    raise exception 'Only someone who may change the Fee Calculator can change prices.';
  end if;
  if not exists (select 1 from public.fee_cohorts where id = p_cohort_id) then
    raise exception 'Price group not found.';
  end if;
  if jsonb_typeof(p_rates) is distinct from 'array' then
    raise exception 'The prices must be a list.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_rates) r
    where jsonb_typeof(r -> 'amount') is distinct from 'number' or (r ->> 'amount')::numeric < 0
      or jsonb_typeof(r -> 'subject_count') is distinct from 'number'
  ) then
    raise exception 'Every price must be a number of 0 or more.';
  end if;

  update public.fee_cohorts
  set materials_included_in_tuition = coalesce(p_materials_included, materials_included_in_tuition),
      updated_by = public.current_teacher_id()
  where id = p_cohort_id;

  delete from public.fee_rates where cohort_id = p_cohort_id;
  insert into public.fee_rates (cohort_id, level, track, subject_count, cycle_tier, amount)
  select p_cohort_id, r ->> 'level', r ->> 'track', (r ->> 'subject_count')::smallint, r ->> 'cycle_tier',
    round((r ->> 'amount')::numeric, 2)
  from jsonb_array_elements(p_rates) r;
exception
  when unique_violation then
    raise exception 'The same price is listed twice.';
end;
$$;

revoke all on function public.save_fee_cohort_rates(bigint, boolean, jsonb) from public, anon;
grant execute on function public.save_fee_cohort_rates(bigint, boolean, jsonb) to authenticated;

-- Adds a subject (p_id null) or changes one. SEJ, BIP and BIK keep their code and kind.
create or replace function public.save_fee_subject(
  p_id bigint,
  p_level text,
  p_code text,
  p_label text,
  p_kind text,
  p_sort_order integer,
  p_is_active boolean
)
returns public.fee_subjects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.fee_subjects%rowtype;
  v_old public.fee_subjects%rowtype;
  v_code text := nullif(upper(btrim(coalesce(p_code, ''))), '');
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
begin
  if not public.has_permission('fee_calculator', 'edit') then
    raise exception 'Only someone who may change the Fee Calculator can change subjects.';
  end if;

  if p_id is null then
    if v_code is null or v_label is null then
      raise exception 'Give the subject a code and a name.';
    end if;
    insert into public.fee_subjects (level, code, label, kind, sort_order, is_active)
    values (
      p_level,
      v_code,
      v_label,
      coalesce(p_kind, 'core'),
      coalesce(p_sort_order, (select coalesce(max(sort_order), 0) + 10 from public.fee_subjects where level = p_level)),
      coalesce(p_is_active, true)
    )
    returning * into v_row;
  else
    select * into v_old from public.fee_subjects where id = p_id;
    if v_old.id is null then
      raise exception 'Subject not found.';
    end if;
    if v_old.code in ('SEJ', 'BIP', 'BIK') and (coalesce(v_code, v_old.code) <> v_old.code or coalesce(p_kind, v_old.kind) <> v_old.kind) then
      raise exception '% keeps its code and kind: the Fee Calculator finds it by them.', v_old.code;
    end if;
    update public.fee_subjects
    set code = coalesce(v_code, code),
        label = coalesce(v_label, label),
        kind = coalesce(p_kind, kind),
        sort_order = coalesce(p_sort_order, sort_order),
        is_active = coalesce(p_is_active, is_active)
    where id = p_id
    returning * into v_row;
  end if;
  return v_row;
exception
  when unique_violation then
    raise exception '% is already a subject there.', v_code;
  when check_violation then
    raise exception 'A code is capital letters and numbers (up to 12); SEJ, BIP and BIK go with their own kinds.';
end;
$$;

revoke all on function public.save_fee_subject(bigint, text, text, text, text, integer, boolean) from public, anon;
grant execute on function public.save_fee_subject(bigint, text, text, text, text, integer, boolean) to authenticated;

-- The school-wide numbers or the text lines. Only the keys EC has are kept; each must be there with the right type.
create or replace function public.save_fee_settings(p_key text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value jsonb;
  v_key text;
  v_band text;
  v_months text;
  v_east jsonb := '{}'::jsonb;
begin
  if not public.has_permission('fee_calculator', 'edit') then
    raise exception 'Only someone who may change the Fee Calculator can change these.';
  end if;

  if p_key = 'global_rates' then
    foreach v_key in array array['materialsFeePerSubjectPerMonth', 'registrationFeeAmount', 'sejSurchargePerMonth'] loop
      if jsonb_typeof(p_value -> v_key) is distinct from 'number' or (p_value ->> v_key)::numeric < 0 then
        raise exception 'Every number must be 0 or more.';
      end if;
    end loop;
    if jsonb_typeof(p_value -> 'postage' -> 'west') is distinct from 'number' or (p_value -> 'postage' ->> 'west')::numeric < 0 then
      raise exception 'Every number must be 0 or more.';
    end if;
    foreach v_band in array array['1_2', '3_4', '5_plus'] loop
      foreach v_months in array array['1_2', '3'] loop
        if jsonb_typeof(p_value -> 'postage' -> 'east' -> v_band -> v_months) is distinct from 'number'
           or (p_value -> 'postage' -> 'east' -> v_band ->> v_months)::numeric < 0 then
          raise exception 'Every number must be 0 or more.';
        end if;
      end loop;
      v_east := v_east || jsonb_build_object(v_band, jsonb_build_object(
        '1_2', p_value -> 'postage' -> 'east' -> v_band -> '1_2',
        '3', p_value -> 'postage' -> 'east' -> v_band -> '3'));
    end loop;
    v_value := jsonb_build_object(
      'materialsFeePerSubjectPerMonth', p_value -> 'materialsFeePerSubjectPerMonth',
      'registrationFeeAmount', p_value -> 'registrationFeeAmount',
      'sejSurchargePerMonth', p_value -> 'sejSurchargePerMonth',
      'postage', jsonb_build_object('west', p_value -> 'postage' -> 'west', 'east', v_east));
  elsif p_key = 'invoice_template' then
    v_value := '{}'::jsonb;
    foreach v_key in array array['tuitionSingleMonth', 'tuitionMultiMonth', 'materialsLine', 'postageLine',
                                 'registrationLine', 'totalLine', 'nextMonthLine', 'nextMonthReason'] loop
      if jsonb_typeof(p_value -> v_key) is distinct from 'string' or char_length(p_value ->> v_key) > 200 then
        raise exception 'Every line must be text of up to 200 characters.';
      end if;
      v_value := v_value || jsonb_build_object(v_key, p_value -> v_key);
    end loop;
  else
    raise exception 'Unknown Fee Calculator setting.';
  end if;

  insert into public.fee_settings (key, value, updated_at, updated_by)
  values (p_key, v_value, timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
  set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.save_fee_settings(text, jsonb) from public, anon;
grant execute on function public.save_fee_settings(text, jsonb) to authenticated;

-- The school's switch: admin only.
create or replace function public.set_fee_calculator_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can switch the Fee Calculator on or off.';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('fee_calculator', jsonb_build_object('enabled', coalesce(p_enabled, false)), timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
  set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_fee_calculator_enabled(boolean) from public, anon;
grant execute on function public.set_fee_calculator_enabled(boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 5. Starting data (EC's code of 2026-08-17). Off at every school until switched on.
-- ---------------------------------------------------------------------------------------------------------

insert into public.app_settings (key, value) values ('fee_calculator', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

insert into public.fee_settings (key, value) values
  ('global_rates', '{"materialsFeePerSubjectPerMonth":5,"postage":{"west":10,"east":{"1_2":{"3":20,"1_2":20},"3_4":{"3":30,"1_2":25},"5_plus":{"3":40,"1_2":30}}},"registrationFeeAmount":20,"sejSurchargePerMonth":10}'::jsonb),
  ('invoice_template', '{"tuitionSingleMonth":"学费：RM{amount}","tuitionMultiMonth":"学费：RM{perMonth} X {months} = RM{total}","materialsLine":"{monthsLabel}资料费 = RM{amount}","postageLine":"{region}邮费 RM{amount}","registrationLine":"每年报名手续费 RM{amount}","totalLine":"TOTAL RM{total}","nextMonthLine":"下个月只需付 RM{amount}/月","nextMonthReason":"因为{items}已经付了，不需要每个月再收。"}'::jsonb);

-- A group for each membership level that is there (both are, from 20261030100000).
insert into public.fee_cohorts (membership_name, sort_order, materials_included_in_tuition)
select o.name, v.sort_order, v.materials_included
from (values ('26002', 10, true), ('26001', 20, false)) as v(name, sort_order, materials_included)
join public.student_field_options o on o.field = 'membership' and o.name = v.name;

-- seed: fee_rates (membership level, level, track, number of subjects, price column, per month)
insert into public.fee_rates (cohort_id, level, track, subject_count, cycle_tier, amount)
select c.id, v.level, v.track, v.subject_count, v.cycle_tier, v.amount
from (values
  ('26002', 'primary', 'standard', 1, 'monthly', 68),
  ('26002', 'primary', 'standard', 1, '3mo', 65),
  ('26002', 'primary', 'standard', 1, '6mo_plus', 63),
  ('26002', 'primary', 'standard', 2, 'monthly', 130),
  ('26002', 'primary', 'standard', 2, '3mo', 124),
  ('26002', 'primary', 'standard', 2, '6mo_plus', 120),
  ('26002', 'primary', 'standard', 3, 'monthly', 195),
  ('26002', 'primary', 'standard', 3, '3mo', 186),
  ('26002', 'primary', 'standard', 3, '6mo_plus', 180),
  ('26002', 'primary', 'standard', 4, 'monthly', 244),
  ('26002', 'primary', 'standard', 4, '3mo', 232),
  ('26002', 'primary', 'standard', 4, '6mo_plus', 224),
  ('26002', 'primary', 'standard', 5, 'monthly', 305),
  ('26002', 'primary', 'standard', 5, '3mo', 290),
  ('26002', 'primary', 'standard', 5, '6mo_plus', 280),
  ('26002', 'primary', 'standard', 6, 'monthly', 366),
  ('26002', 'primary', 'standard', 6, '3mo', 348),
  ('26002', 'primary', 'standard', 6, '6mo_plus', 336),
  ('26002', 'primary', 'standard', 7, 'monthly', 406),
  ('26002', 'primary', 'standard', 7, '3mo', 385),
  ('26002', 'primary', 'standard', 7, '6mo_plus', 371),
  ('26002', 'primary', 'standard', 8, 'monthly', 456),
  ('26002', 'primary', 'standard', 8, '3mo', 432),
  ('26002', 'primary', 'standard', 8, '6mo_plus', 416),
  ('26002', 'secondary', 'standard', 1, 'monthly', 68),
  ('26002', 'secondary', 'standard', 1, '3mo', 65),
  ('26002', 'secondary', 'standard', 1, '6mo_plus', 63),
  ('26002', 'secondary', 'standard', 2, 'monthly', 130),
  ('26002', 'secondary', 'standard', 2, '3mo', 124),
  ('26002', 'secondary', 'standard', 2, '6mo_plus', 120),
  ('26002', 'secondary', 'standard', 3, 'monthly', 195),
  ('26002', 'secondary', 'standard', 3, '3mo', 186),
  ('26002', 'secondary', 'standard', 3, '6mo_plus', 180),
  ('26002', 'secondary', 'standard', 4, 'monthly', 244),
  ('26002', 'secondary', 'standard', 4, '3mo', 232),
  ('26002', 'secondary', 'standard', 4, '6mo_plus', 224),
  ('26002', 'secondary', 'standard', 5, 'monthly', 305),
  ('26002', 'secondary', 'standard', 5, '3mo', 290),
  ('26002', 'secondary', 'standard', 5, '6mo_plus', 280),
  ('26002', 'secondary', 'standard', 6, 'monthly', 366),
  ('26002', 'secondary', 'standard', 6, '3mo', 348),
  ('26002', 'secondary', 'standard', 6, '6mo_plus', 336),
  ('26002', 'secondary', 'standard', 7, 'monthly', 406),
  ('26002', 'secondary', 'standard', 7, '3mo', 385),
  ('26002', 'secondary', 'standard', 7, '6mo_plus', 371),
  ('26002', 'secondary', 'standard', 8, 'monthly', 456),
  ('26002', 'secondary', 'standard', 8, '3mo', 432),
  ('26002', 'secondary', 'standard', 8, '6mo_plus', 416),
  ('26002', 'secondary', 'standard', 9, 'monthly', 513),
  ('26002', 'secondary', 'standard', 9, '3mo', 486),
  ('26002', 'secondary', 'standard', 9, '6mo_plus', 468),
  ('26002', 'secondary', 'standard', 10, 'monthly', 550),
  ('26002', 'secondary', 'standard', 10, '3mo', 520),
  ('26002', 'secondary', 'standard', 10, '6mo_plus', 500),
  ('26002', 'secondary', 'bio_che_phy', 1, 'monthly', 70),
  ('26002', 'secondary', 'bio_che_phy', 1, '3mo', 67),
  ('26002', 'secondary', 'bio_che_phy', 1, '6mo_plus', 65),
  ('26002', 'secondary', 'bio_che_phy', 2, 'monthly', 135),
  ('26002', 'secondary', 'bio_che_phy', 2, '3mo', 129),
  ('26002', 'secondary', 'bio_che_phy', 2, '6mo_plus', 125),
  ('26002', 'secondary', 'bio_che_phy', 3, 'monthly', 195),
  ('26002', 'secondary', 'bio_che_phy', 3, '3mo', 186),
  ('26002', 'secondary', 'bio_che_phy', 3, '6mo_plus', 180),
  ('26001', 'primary', 'standard', 1, 'monthly', 59),
  ('26001', 'primary', 'standard', 1, '3mo', 59),
  ('26001', 'primary', 'standard', 1, '6mo_plus', 59),
  ('26001', 'primary', 'standard', 2, 'monthly', 114),
  ('26001', 'primary', 'standard', 2, '3mo', 114),
  ('26001', 'primary', 'standard', 2, '6mo_plus', 114),
  ('26001', 'primary', 'standard', 3, 'monthly', 169),
  ('26001', 'primary', 'standard', 3, '3mo', 169),
  ('26001', 'primary', 'standard', 3, '6mo_plus', 169),
  ('26001', 'primary', 'standard', 4, 'monthly', 219),
  ('26001', 'primary', 'standard', 4, '3mo', 219),
  ('26001', 'primary', 'standard', 4, '6mo_plus', 219),
  ('26001', 'primary', 'standard', 5, 'monthly', 270),
  ('26001', 'primary', 'standard', 5, '3mo', 270),
  ('26001', 'primary', 'standard', 5, '6mo_plus', 270),
  ('26001', 'primary', 'standard', 6, 'monthly', 318),
  ('26001', 'primary', 'standard', 6, '3mo', 318),
  ('26001', 'primary', 'standard', 6, '6mo_plus', 318),
  ('26001', 'primary', 'standard', 7, 'monthly', 371),
  ('26001', 'primary', 'standard', 7, '3mo', 371),
  ('26001', 'primary', 'standard', 7, '6mo_plus', 371),
  ('26001', 'primary', 'standard', 8, 'monthly', 416),
  ('26001', 'primary', 'standard', 8, '3mo', 416),
  ('26001', 'primary', 'standard', 8, '6mo_plus', 416),
  ('26001', 'secondary', 'standard', 1, 'monthly', 59),
  ('26001', 'secondary', 'standard', 1, '3mo', 59),
  ('26001', 'secondary', 'standard', 1, '6mo_plus', 59),
  ('26001', 'secondary', 'standard', 2, 'monthly', 114),
  ('26001', 'secondary', 'standard', 2, '3mo', 114),
  ('26001', 'secondary', 'standard', 2, '6mo_plus', 114),
  ('26001', 'secondary', 'standard', 3, 'monthly', 169),
  ('26001', 'secondary', 'standard', 3, '3mo', 169),
  ('26001', 'secondary', 'standard', 3, '6mo_plus', 169),
  ('26001', 'secondary', 'standard', 4, 'monthly', 219),
  ('26001', 'secondary', 'standard', 4, '3mo', 219),
  ('26001', 'secondary', 'standard', 4, '6mo_plus', 219),
  ('26001', 'secondary', 'standard', 5, 'monthly', 270),
  ('26001', 'secondary', 'standard', 5, '3mo', 270),
  ('26001', 'secondary', 'standard', 5, '6mo_plus', 270),
  ('26001', 'secondary', 'standard', 6, 'monthly', 318),
  ('26001', 'secondary', 'standard', 6, '3mo', 318),
  ('26001', 'secondary', 'standard', 6, '6mo_plus', 318),
  ('26001', 'secondary', 'standard', 7, 'monthly', 371),
  ('26001', 'secondary', 'standard', 7, '3mo', 371),
  ('26001', 'secondary', 'standard', 7, '6mo_plus', 371),
  ('26001', 'secondary', 'standard', 8, 'monthly', 416),
  ('26001', 'secondary', 'standard', 8, '3mo', 416),
  ('26001', 'secondary', 'standard', 8, '6mo_plus', 416),
  ('26001', 'secondary', 'standard', 9, 'monthly', 468),
  ('26001', 'secondary', 'standard', 9, '3mo', 468),
  ('26001', 'secondary', 'standard', 9, '6mo_plus', 468),
  ('26001', 'secondary', 'standard', 10, 'monthly', 500),
  ('26001', 'secondary', 'standard', 10, '3mo', 500),
  ('26001', 'secondary', 'standard', 10, '6mo_plus', 500),
  ('26001', 'secondary', 'bio_che_phy', 1, 'monthly', 65),
  ('26001', 'secondary', 'bio_che_phy', 1, '3mo', 65),
  ('26001', 'secondary', 'bio_che_phy', 1, '6mo_plus', 65),
  ('26001', 'secondary', 'bio_che_phy', 2, 'monthly', 125),
  ('26001', 'secondary', 'bio_che_phy', 2, '3mo', 125),
  ('26001', 'secondary', 'bio_che_phy', 2, '6mo_plus', 125),
  ('26001', 'secondary', 'bio_che_phy', 3, 'monthly', 180),
  ('26001', 'secondary', 'bio_che_phy', 3, '3mo', 180),
  ('26001', 'secondary', 'bio_che_phy', 3, '6mo_plus', 180)
) as v(membership_name, level, track, subject_count, cycle_tier, amount)
join public.fee_cohorts c on c.membership_name = v.membership_name;
-- end seed: fee_rates

insert into public.fee_subjects (level, code, label, kind, sort_order) values
  ('primary', 'BMP', 'Bahasa Melayu Pemahaman 国文理解', 'core', 10),
  ('primary', 'BMK', 'Bahasa Melayu Karangan 国文作文', 'core', 20),
  ('primary', 'BC', 'Bahasa Cina 华文', 'core', 30),
  ('primary', 'MM', 'Mathematics 数学', 'core', 40),
  ('primary', 'SCI', 'Science 科学', 'core', 50),
  ('primary', 'SEJ', 'Sejarah 历史', 'sej', 60),
  ('primary', 'BIP', 'English Reading 英文理解', 'bip', 70),
  ('primary', 'BIK', 'English Writing 英文写作', 'bik', 80),
  ('secondary', 'BMP', 'Bahasa Melayu Pemahaman 国文理解', 'core', 10),
  ('secondary', 'BMK', 'Bahasa Melayu Karangan 国文作文', 'core', 20),
  ('secondary', 'BC', 'Bahasa Cina 华文', 'core', 30),
  ('secondary', 'MM', 'Mathematics 数学', 'core', 40),
  ('secondary', 'SCI', 'Science 科学', 'core', 50),
  ('secondary', 'RBT', 'RBT 设计与工艺', 'core', 60),
  ('secondary', 'SEJ', 'Sejarah 历史（额外加收 RM10/月）', 'sej', 70),
  ('secondary', 'GEO', 'Geografi 地理', 'core', 80),
  ('secondary', 'AM', 'A. Mathematics 高数', 'core', 90),
  ('secondary', 'ACC', 'Account 会计', 'core', 100),
  ('secondary', 'EKO', 'Ekonomi 经济学', 'core', 110),
  ('secondary', 'PERN', 'Perniagaan 商业学', 'core', 120),
  ('secondary', 'BIP', 'English Reading 英文理解', 'bip', 130),
  ('secondary', 'BIK', 'English Writing 英文写作', 'bik', 140),
  ('bio_che_phy', 'BIO', 'Biology 生物', 'core', 10),
  ('bio_che_phy', 'CHE', 'Chemistry 化学', 'core', 20),
  ('bio_che_phy', 'PHY', 'Physics 物理', 'core', 30);
