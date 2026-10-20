-- Two things for a school like EduHero (decided 2026-10-19):
--
-- 1. Student code: the school's own number for a child (EduHero's student ID),
--    on students.student_code. Each school switches the field on or off in
--    app_settings 'student_code' {"enabled": ...}; off unless switched on (Mirai).
--    Codes are unique within the school, ignoring case and spaces at the ends.
--
-- 2. Months per subject: a school that charges by the month records, for each
--    class (subject) a child studies, the first day and how many months are paid.
--    The end date is worked out here: the day before the same date that many
--    months later (1 Nov + 3 months -> 31 Jan). Each class keeps its own dates, so
--    Maths and Science can start and end on different days. A renewal is a new
--    row; a row entered by mistake is hidden, never deleted.

-- ---------------------------------------------------------------------------
-- 1. Student code

alter table public.students
  add column if not exists student_code text
  check (student_code is null or char_length(btrim(student_code)) between 1 and 40);

create unique index if not exists students_student_code_key
  on public.students (lower(btrim(student_code)))
  where student_code is not null;

insert into public.app_settings (key, value)
values ('student_code', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

create or replace function public.set_student_code_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can switch the student code on or off.';
  end if;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('student_code', jsonb_build_object('enabled', coalesce(p_enabled, false)), timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  perform public.record_admin_activity(
    case when p_enabled then 'student_code_on' else 'student_code_off' end,
    'student', null, 'Student code', '{}'::jsonb
  );
end;
$$;

revoke all on function public.set_student_code_enabled(boolean) from public, anon;
grant execute on function public.set_student_code_enabled(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Months per subject

create table public.student_month_plans (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students (id) on delete cascade,
  classroom_id bigint not null references public.classrooms (id) on delete cascade,
  start_date date not null,
  months integer not null check (months between 1 and 60),
  end_date date not null,
  remark text check (remark is null or char_length(remark) <= 500),
  is_active boolean not null default true,
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  check (end_date >= start_date)
);

create index student_month_plans_student_idx on public.student_month_plans (student_id, classroom_id) where is_active;

alter table public.student_month_plans enable row level security;
revoke all on public.student_month_plans from public, anon, authenticated;
grant select on public.student_month_plans to authenticated;
grant all on public.student_month_plans to service_role;

-- Whoever may see the student sees their months.
create policy student_month_plans_select_scoped
  on public.student_month_plans for select to authenticated
  using (exists (select 1 from public.students st where st.id = student_month_plans.student_id));

-- The last day paid for: the day before the same date p_months later.
create or replace function public.month_plan_end_date(p_start date, p_months integer)
returns date
language sql
immutable
as $$
  select ((p_start + make_interval(months => p_months)) - interval '1 day')::date;
$$;

grant execute on function public.month_plan_end_date(date, integer) to authenticated;

-- Add months for one class of a student. Students edit.
create or replace function public.add_student_month_plan(
  p_student_id bigint,
  p_classroom_id bigint,
  p_start_date date,
  p_months integer,
  p_remark text default null
)
returns public.student_month_plans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.student_month_plans%rowtype;
  v_name text;
begin
  if not public.has_permission('students', 'edit') then
    raise exception 'Only staff who may edit students can add months.';
  end if;
  select full_name into v_name from public.students where id = p_student_id;
  if v_name is null then
    raise exception 'Student not found.';
  end if;
  if not exists (select 1 from public.classrooms where id = p_classroom_id) then
    raise exception 'Class not found.';
  end if;
  if p_start_date is null then
    raise exception 'Pick the first day.';
  end if;
  if p_months is null or p_months < 1 or p_months > 60 then
    raise exception 'Months must be from 1 to 60.';
  end if;

  insert into public.student_month_plans (student_id, classroom_id, start_date, months, end_date, remark, created_by)
  values (
    p_student_id,
    p_classroom_id,
    p_start_date,
    p_months,
    public.month_plan_end_date(p_start_date, p_months),
    nullif(btrim(coalesce(p_remark, '')), ''),
    public.current_teacher_id()
  )
  returning * into v_row;

  perform public.record_admin_activity(
    'student_months_added', 'student', p_student_id, v_name,
    jsonb_build_object('classroom_id', p_classroom_id, 'start_date', v_row.start_date, 'months', v_row.months, 'end_date', v_row.end_date)
  );
  return v_row;
end;
$$;

revoke all on function public.add_student_month_plan(bigint, bigint, date, integer, text) from public, anon;
grant execute on function public.add_student_month_plan(bigint, bigint, date, integer, text) to authenticated;

-- Hide months entered by mistake (kept, not deleted). Students edit.
create or replace function public.hide_student_month_plan(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.student_month_plans%rowtype;
begin
  if not public.has_permission('students', 'edit') then
    raise exception 'Only staff who may edit students can remove months.';
  end if;
  update public.student_month_plans set is_active = false where id = p_id and is_active returning * into v_row;
  if v_row.id is null then
    raise exception 'Months not found.';
  end if;
  perform public.record_admin_activity(
    'student_months_removed', 'student', v_row.student_id,
    (select full_name from public.students where id = v_row.student_id),
    jsonb_build_object('classroom_id', v_row.classroom_id, 'start_date', v_row.start_date, 'months', v_row.months)
  );
end;
$$;

revoke all on function public.hide_student_month_plan(bigint) from public, anon;
grant execute on function public.hide_student_month_plan(bigint) to authenticated;
