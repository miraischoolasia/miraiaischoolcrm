-- EduHero's roster table (boss 2026-10-22): the columns of the primary and secondary master lists.
--
-- Eight more things on a student, each switched on per school (app_settings 'student_fields', Class Settings > Student
-- fields; all off unless switched on, as at Mirai):
--   students.sales_person_id  the Education Consultant who closed the sale (a staff member). Set from the lead's PIC the
--                             moment the lead becomes this student, and editable afterwards.
--   students.membership       the "PRICE" column of the lists: a membership level (26001, LATEST, GOLD ...), not an amount.
--   students.fb_name          the parent's Facebook name.
--   students.region           West / East Malaysia (西马 / 东马).
--   students.enrol_method     monthly, or 3 / 6 / 12 months at once.
--   students.payment_mode     one payment or instalments.
--   students.hero_member      the yearly membership (英雄会员).
--   students.fee_month        the month (1-12) the fee is paid.
-- The five lists of choices live in student_field_options (added, renamed, ordered and hidden by an admin; renaming one
-- renames it on every student). "Number of subjects / stopped / added" are not stored: the page works them out from
-- the class history (student_classroom_periods).
--
-- Also: with the sales person switched on, the lead's PIC is the Education Consultant and the student's consultant is
-- the Learning Consultant, so students_auto_pic (a consultant becoming the PIC of a lead without one) stands aside.

alter table public.students
  add column if not exists sales_person_id bigint references public.teachers (id) on delete set null,
  add column if not exists membership text,
  add column if not exists fb_name text
    check (fb_name is null or char_length(btrim(fb_name)) between 1 and 80),
  add column if not exists region text,
  add column if not exists enrol_method text,
  add column if not exists payment_mode text,
  add column if not exists hero_member text,
  add column if not exists fee_month smallint
    check (fee_month is null or fee_month between 1 and 12);

create index if not exists students_sales_person_idx on public.students (sales_person_id) where sales_person_id is not null;

create table public.student_field_options (
  field text not null check (field in ('membership', 'region', 'enrol_method', 'payment_mode', 'hero_member')),
  name text not null check (char_length(btrim(name)) between 1 and 60 and name = btrim(name)),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (field, name)
);

create trigger set_student_field_options_updated_at
  before update on public.student_field_options
  for each row execute function public.set_current_timestamp_updated_at();

-- The values the master lists use today.
insert into public.student_field_options (field, name, sort_order) values
  ('membership', '26001', 10),
  ('membership', '26002', 20),
  ('membership', 'LATEST', 30),
  ('membership', '2026 LATEST', 40),
  ('membership', 'NORMAL', 50),
  ('membership', 'GOLD', 60),
  ('membership', 'SILVER', 70),
  ('membership', 'VVIP蓝色学费 (SS)', 80),
  ('membership', 'VIP粉色学费', 90),
  ('membership', 'TAMPIN学费 (SS)', 100),
  ('region', '西马', 10),
  ('region', '东马', 20),
  ('enrol_method', '每月报名', 10),
  ('enrol_method', '3个月一次性报名', 20),
  ('enrol_method', '6个月一次性报名', 30),
  ('enrol_method', '12个月一次性报名', 40),
  ('payment_mode', '一次性付款', 10),
  ('payment_mode', '分期', 20),
  ('hero_member', '每年', 10),
  ('hero_member', '一次性', 20);

alter table public.student_field_options enable row level security;
revoke all on public.student_field_options from public, anon, authenticated;
grant select on public.student_field_options to authenticated;
grant all on public.student_field_options to service_role;

create policy student_field_options_select_staff
  on public.student_field_options for select to authenticated
  using ((select public.current_teacher_id()) is not null);

-- A student's value must be one of the school's choices for that field.
create or replace function public.students_check_roster_options()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  for v in
    select * from (values
      ('membership', new.membership, case when tg_op = 'UPDATE' then old.membership end),
      ('region', new.region, case when tg_op = 'UPDATE' then old.region end),
      ('enrol_method', new.enrol_method, case when tg_op = 'UPDATE' then old.enrol_method end),
      ('payment_mode', new.payment_mode, case when tg_op = 'UPDATE' then old.payment_mode end),
      ('hero_member', new.hero_member, case when tg_op = 'UPDATE' then old.hero_member end)
    ) as t(field, val, old_val)
  loop
    if v.val is not null and v.val is distinct from v.old_val
       and not exists (select 1 from public.student_field_options o where o.field = v.field and o.name = v.val) then
      raise exception '"%" is not one of the choices for %.', v.val, v.field using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.students_check_roster_options() from public, anon, authenticated;

create trigger students_check_roster_options
  before insert or update of membership, region, enrol_method, payment_mode, hero_member on public.students
  for each row execute function public.students_check_roster_options();

-- The sales person is an active staff member, admin or teacher of the school (a teacher can be the one a parent comes to).
create or replace function public.ensure_student_sales_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sales_person_id is not null and new.sales_person_id is distinct from (case when tg_op = 'UPDATE' then old.sales_person_id end)
     and not exists (select 1 from public.teachers t where t.id = new.sales_person_id and t.role in ('staff', 'admin', 'teacher') and t.is_active) then
    raise exception 'The sales person must be an active staff member or teacher.';
  end if;
  return new;
end;
$$;

revoke all on function public.ensure_student_sales_person() from public, anon, authenticated;

create trigger students_ensure_sales_person
  before insert or update of sales_person_id on public.students
  for each row execute function public.ensure_student_sales_person();

-- Add (p_name null) or change one choice (p_name = its current name). Admin only. Renaming renames it on every student.
create or replace function public.save_student_field_option(
  p_field text,
  p_name text,
  p_new_name text,
  p_sort_order integer,
  p_is_active boolean
)
returns public.student_field_options
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.student_field_options%rowtype;
  v_new text := nullif(btrim(coalesce(p_new_name, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the choices of a student field.';
  end if;
  if p_field not in ('membership', 'region', 'enrol_method', 'payment_mode', 'hero_member') then
    raise exception 'Unknown student field.';
  end if;

  if p_name is null then
    if v_new is null then
      raise exception 'Give the new choice a name.';
    end if;
    insert into public.student_field_options (field, name, sort_order, is_active)
    values (
      p_field,
      v_new,
      coalesce(p_sort_order, (select coalesce(max(sort_order), 0) + 10 from public.student_field_options where field = p_field)),
      coalesce(p_is_active, true)
    )
    returning * into v_row;
  else
    update public.student_field_options
    set name = coalesce(v_new, name),
        sort_order = coalesce(p_sort_order, sort_order),
        is_active = coalesce(p_is_active, is_active)
    where field = p_field and name = p_name
    returning * into v_row;
    if v_row.name is null then
      raise exception 'Choice not found.';
    end if;
    if v_row.name <> p_name then
      execute format('update public.students set %1$I = $1 where %1$I = $2', p_field) using v_row.name, p_name;
    end if;
  end if;
  return v_row;
exception
  when unique_violation then
    raise exception '"%" is already a choice.', v_new;
end;
$$;

revoke all on function public.save_student_field_option(text, text, text, integer, boolean) from public, anon;
grant execute on function public.save_student_field_option(text, text, text, integer, boolean) to authenticated;

-- Which student fields the school shows (the four of 20261027400000 and these eight), plus the roster table.
create or replace function public.set_student_fields(p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value jsonb;
  v_key text;
begin
  if not public.is_admin() then
    raise exception 'Only admin can choose which student fields are shown.';
  end if;

  v_value := '{}'::jsonb;
  foreach v_key in array array[
    'name_zh', 'student_kind', 'consultant', 'second_parent_phone',
    'sales_person', 'membership', 'fb_name', 'region', 'enrol_method', 'payment_mode', 'hero_member', 'fee_month',
    'roster_table'
  ] loop
    v_value := v_value || jsonb_build_object(v_key, coalesce((p_value ->> v_key)::boolean, false));
  end loop;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('student_fields', v_value, timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  perform public.record_admin_activity('student_fields_changed', 'student', null, 'Student fields', v_value);
end;
$$;

revoke all on function public.set_student_fields(jsonb) from public, anon;
grant execute on function public.set_student_fields(jsonb) to authenticated;

-- How the roster table counts subjects: which class categories count (none ticked = every regular category), and from
-- which day class changes are counted for "stopped" and "added" (none = 1 January of this year).
create or replace function public.set_student_roster_counts(p_categories text[], p_changes_from date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admin can change how subjects are counted.';
  end if;

  v_value := jsonb_build_object(
    'count_categories', to_jsonb(coalesce(p_categories, array[]::text[])),
    'changes_from', p_changes_from
  );

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('student_roster', v_value, timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  perform public.record_admin_activity('student_roster_changed', 'student', null, 'Roster table', v_value);
end;
$$;

revoke all on function public.set_student_roster_counts(text[], date) from public, anon;
grant execute on function public.set_student_roster_counts(text[], date) to authenticated;

-- The staff member a lead's PIC stands for: the PIC's own account, else the one active staff member or admin with the
-- same name (the PIC list says Angel小老师 where the staff list says Angel老师, so the 小 and spaces are left out).
create or replace function public.pic_staff_id(p_pic_id bigint)
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_option public.lead_options%rowtype;
  v_id bigint;
begin
  select * into v_option from public.lead_options where id = p_pic_id and kind = 'pic';
  if not found then
    return null;
  end if;
  if v_option.teacher_id is not null then
    select t.id into v_id from public.teachers t
    where t.id = v_option.teacher_id and t.role in ('staff', 'admin') and t.is_active;
    return v_id;
  end if;
  select t.id into v_id from public.teachers t
  where t.role in ('staff', 'admin') and t.is_active
    and lower(regexp_replace(t.full_name, '[小[:space:]]', '', 'g')) = lower(regexp_replace(v_option.label, '[小[:space:]]', '', 'g'))
  limit 2;
  if (select count(*) from public.teachers t
      where t.role in ('staff', 'admin') and t.is_active
        and lower(regexp_replace(t.full_name, '[小[:space:]]', '', 'g')) = lower(regexp_replace(v_option.label, '[小[:space:]]', '', 'g'))) <> 1 then
    return null;
  end if;
  return v_id;
end;
$$;

revoke all on function public.pic_staff_id(bigint) from public, anon, authenticated;

-- The moment a lead becomes a student, the lead's PIC (the Education Consultant) is written as the student's sales person
-- (when the school shows that field and the student has none yet). One trigger on leads.converted_student_id covers every
-- way a lead is converted, like the tags and the optional fields.
create or replace function public.lead_sales_person_to_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff bigint;
begin
  if new.converted_student_id is null or new.pic_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.converted_student_id is not distinct from new.converted_student_id then
    return null;
  end if;
  if not coalesce((select (value ->> 'sales_person')::boolean from public.app_settings where key = 'student_fields'), false) then
    return null;
  end if;
  v_staff := public.pic_staff_id(new.pic_id);
  if v_staff is null then
    return null;
  end if;
  update public.students set sales_person_id = v_staff
  where id = new.converted_student_id and sales_person_id is null;
  return null;
end;
$$;

revoke all on function public.lead_sales_person_to_student() from public, anon, authenticated;

drop trigger if exists leads_sales_person_to_student on public.leads;
create trigger leads_sales_person_to_student
after insert or update of converted_student_id on public.leads
for each row execute function public.lead_sales_person_to_student();

-- students_auto_pic (20261028300000) stands aside when the school keeps a sales person on the student: the PIC is the
-- Education Consultant then, and the student's consultant is someone else (the Learning Consultant).
create or replace function public.students_auto_pic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pic bigint;
begin
  if coalesce((select (value ->> 'sales_person')::boolean from public.app_settings where key = 'student_fields'), false) then
    return null;
  end if;
  if new.consultant_id is null then
    return null;
  end if;
  if not exists (select 1 from public.leads where converted_student_id = new.id and pic_id is null) then
    return null;
  end if;
  v_pic := public.ensure_staff_pic(new.consultant_id);
  if v_pic is not null then
    update public.leads set pic_id = v_pic where converted_student_id = new.id and pic_id is null;
  end if;
  return null;
end;
$$;

revoke all on function public.students_auto_pic() from public, anon, authenticated;
