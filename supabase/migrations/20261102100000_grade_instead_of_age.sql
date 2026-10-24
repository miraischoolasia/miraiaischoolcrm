-- A school can show a child's school grade (Year 1-6 / Form 1-5) instead of an age.
--
-- Owner decision 2026-10-23: EduHero shows grade, stored directly, and it goes up by one every 1 January by itself.
-- Mirai keeps age. A school chooses with the setting `age_display` (app_settings): {"mode": "age"} (default) or
-- {"mode": "grade"}.
--
-- A grade is stored as a number and the year it was true: 1-6 = Year 1-6, 7-11 = Form 1-5, 12 = left school.
-- What it is today is worked out when it is read (grade_now): the stored number plus the January 1sts since that
-- year, at most 12. Nothing runs on 1 January, so nothing can be missed. The old `age` columns are not touched.
--   * students.grade_level / grade_year
--   * a lead's child (leads.children, jsonb): the keys gradeLevel / gradeYear are written next to name/age/phone
--     by the app; no column change.

alter table public.students
  add column if not exists grade_level smallint,
  add column if not exists grade_year smallint;

alter table public.students drop constraint if exists students_grade_check;
alter table public.students
  add constraint students_grade_check check (
    (grade_level is null and grade_year is null)
    or (grade_level is not null and grade_year is not null and grade_level between 1 and 12 and grade_year between 2000 and 2200)
  );

-- The grade a stored grade has reached on a day (Malaysia time), or null when there is none.
create or replace function public.grade_now(
  p_level smallint,
  p_year smallint,
  p_on date default (timezone('Asia/Kuala_Lumpur', now()))::date
)
returns smallint
language sql
immutable
set search_path = public
as $$
  select case
    when p_level is null or p_year is null then null
    else least(p_level + greatest(extract(year from p_on)::integer - p_year, 0), 12)::smallint
  end;
$$;

grant execute on function public.grade_now(smallint, smallint, date) to authenticated, service_role;

-- The school's choice. Everybody signed in can read the row (like the other settings); only an admin changes it.
insert into public.app_settings (key, value)
values ('age_display', '{"mode": "age"}'::jsonb)
on conflict (key) do nothing;

create or replace function public.set_age_display(p_mode text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can change how ages are shown.';
  end if;
  if p_mode is null or p_mode not in ('age', 'grade') then
    raise exception 'Choose age or grade.';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('age_display', jsonb_build_object('mode', p_mode), timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_age_display(text) from public, anon;
grant execute on function public.set_age_display(text) to authenticated;

-- A trial booking keeps the child's grade as well (like the child on the lead), so the calendar and the booked list can
-- show it. The booking keeps its usual age too.
alter table public.trial_bookings
  add column if not exists grade_level smallint,
  add column if not exists grade_year smallint;

alter table public.trial_bookings drop constraint if exists trial_bookings_grade_check;
alter table public.trial_bookings
  add constraint trial_bookings_grade_check check (
    (grade_level is null and grade_year is null)
    or (grade_level is not null and grade_year is not null and grade_level between 1 and 12 and grade_year between 2000 and 2200)
  );

-- Written right after book_trial_slot (which only takes an age); whoever can book a trial can set it.
create or replace function public.set_trial_booking_grade(p_booking_id bigint, p_level smallint, p_year smallint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can book a trial class.';
  end if;
  if p_level is not null and (p_year is null or p_level not between 1 and 12) then
    raise exception 'A grade is 1 to 12 and needs its year.';
  end if;
  update public.trial_bookings
  set grade_level = p_level,
      grade_year = case when p_level is null then null else p_year end
  where id = p_booking_id;
end;
$$;

revoke all on function public.set_trial_booking_grade(bigint, smallint, smallint) from public, anon;
grant execute on function public.set_trial_booking_grade(bigint, smallint, smallint) to authenticated;
