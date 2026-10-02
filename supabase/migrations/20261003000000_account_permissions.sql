-- Per-account permissions.
--
-- Admin ticks, for each account, what it may do in each module:
--   calendar, classrooms, students, leads, forms  -> none / view / edit, plus "can delete"
--   activity                                      -> none / view
-- Stored on teachers.permissions as {"leads": {"level": "edit", "delete": true}, ...};
-- a missing module means no access. Admins always have full access.
--
-- A new role 'staff' is for people who do not teach: they only get what is
-- ticked. Teachers keep seeing their own classes and can be ticked extra
-- modules on top. A staff account can never be assigned to teach.
--
-- The checks live here, in RLS and in the security-definer RPCs, so hiding a
-- button in the app is never the only thing stopping a change.

alter table public.teachers drop constraint teachers_role_check;
alter table public.teachers
  add constraint teachers_role_check check (role in ('admin', 'teacher', 'staff'));

create or replace function public.valid_account_permissions(p jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(p) = 'object' and not exists (
    select 1
    from jsonb_each(p) as e(module, value)
    where e.module not in ('calendar', 'classrooms', 'students', 'leads', 'forms', 'activity')
      or jsonb_typeof(e.value) <> 'object'
      or coalesce(e.value ->> 'level', '') not in ('view', 'edit')
      or (e.value ? 'delete' and jsonb_typeof(e.value -> 'delete') <> 'boolean')
      or (e.value -> 'delete' = 'true'::jsonb and e.value ->> 'level' <> 'edit')
      or (e.module = 'activity' and (e.value ->> 'level' <> 'view' or e.value -> 'delete' = 'true'::jsonb))
  );
$$;

alter table public.teachers
  add column permissions jsonb not null default '{}'::jsonb
  constraint teachers_permissions_valid check (public.valid_account_permissions(permissions));

-- p_action: 'view', 'edit' or 'delete'. Edit includes view; delete needs edit.
create or replace function public.has_permission(p_module text, p_action text default 'view')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teachers t
    where t.auth_user_id = auth.uid()
      and t.is_active = true
      and (
        t.role = 'admin'
        or coalesce(case p_action
          when 'view' then t.permissions -> p_module ->> 'level' in ('view', 'edit')
          when 'edit' then t.permissions -> p_module ->> 'level' = 'edit'
          when 'delete' then t.permissions -> p_module ->> 'level' = 'edit'
            and t.permissions -> p_module -> 'delete' = 'true'::jsonb
        end, false)
      )
  );
$$;

-- Calendar, Classrooms and Students all show classes, rosters and attendance,
-- so any of them lets the account read that data.
create or replace function public.can_view_classes()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('calendar')
    or public.has_permission('classrooms')
    or public.has_permission('students');
$$;

create or replace function public.can_edit_classes()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('calendar', 'edit')
    or public.has_permission('classrooms', 'edit')
    or public.has_permission('students', 'edit');
$$;

-- Admin, or any account ticked to edit something. Used for the activity log.
create or replace function public.has_any_edit_permission()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teachers t
    where t.auth_user_id = auth.uid()
      and t.is_active = true
      and (
        t.role = 'admin'
        or exists (
          select 1 from jsonb_each(t.permissions) as e(module, value)
          where e.value ->> 'level' = 'edit'
        )
      )
  );
$$;

-- Admin, or any account with at least one module ticked.
create or replace function public.has_any_permission()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teachers t
    where t.auth_user_id = auth.uid()
      and t.is_active = true
      and (t.role = 'admin' or t.permissions <> '{}'::jsonb)
  );
$$;

revoke all on function public.valid_account_permissions(jsonb) from public, anon;
revoke all on function public.has_permission(text, text) from public, anon;
revoke all on function public.can_view_classes() from public, anon;
revoke all on function public.can_edit_classes() from public, anon;
revoke all on function public.has_any_edit_permission() from public, anon;
revoke all on function public.has_any_permission() from public, anon;
grant execute on function public.valid_account_permissions(jsonb) to authenticated;
grant execute on function public.has_permission(text, text) to authenticated;
grant execute on function public.can_view_classes() to authenticated;
grant execute on function public.can_edit_classes() to authenticated;
grant execute on function public.has_any_edit_permission() to authenticated;
grant execute on function public.has_any_permission() to authenticated;

-- ---------------------------------------------------------------------------
-- Guards that RLS alone cannot express.

-- Staff accounts do not teach.
create or replace function public.ensure_teaching_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.teacher_id is not null and exists (
    select 1 from public.teachers where id = new.teacher_id and role = 'staff'
  ) then
    raise exception 'A staff account cannot be assigned to teach classes.';
  end if;
  return new;
end;
$$;

create trigger classrooms_ensure_teaching_account
before insert or update of teacher_id on public.classrooms
for each row execute function public.ensure_teaching_account();

create trigger schedules_ensure_teaching_account
before insert or update of teacher_id on public.schedules
for each row execute function public.ensure_teaching_account();

create trigger students_ensure_teaching_account
before insert or update of teacher_id on public.students
for each row execute function public.ensure_teaching_account();

-- Deactivating a student, archiving a classroom and cancelling a whole
-- schedule count as deleting, so they need the "can delete" tick.
create or replace function public.guard_delete_permission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'students' then
    if old.is_active and not new.is_active and not public.has_permission('students', 'delete') then
      raise exception 'Your account is not allowed to deactivate students.';
    end if;
  elsif tg_table_name = 'classrooms' then
    if new.status is distinct from old.status and not public.has_permission('classrooms', 'delete') then
      raise exception 'Your account is not allowed to archive or restore classrooms.';
    end if;
  elsif tg_table_name = 'schedules' then
    if old.status = 'active' and new.status = 'cancelled'
      and not public.has_permission('calendar', 'delete')
      and not public.has_permission('classrooms', 'delete') then
      raise exception 'Your account is not allowed to cancel schedules.';
    end if;
  end if;
  return new;
end;
$$;

create trigger students_guard_delete_permission
before update of is_active on public.students
for each row execute function public.guard_delete_permission();

create trigger classrooms_guard_delete_permission
before update of status on public.classrooms
for each row execute function public.guard_delete_permission();

create trigger schedules_guard_delete_permission
before update of status on public.schedules
for each row execute function public.guard_delete_permission();

revoke all on function public.ensure_teaching_account() from public, anon, authenticated;
revoke all on function public.guard_delete_permission() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS: replace the admin-only checks with permission checks.

drop policy admin_activity_logs_select_admin on public.admin_activity_logs;
create policy admin_activity_logs_select_permitted on public.admin_activity_logs
for select to authenticated using ((select public.has_permission('activity')));

drop policy classrooms_select_scoped on public.classrooms;
create policy classrooms_select_scoped on public.classrooms
for select to authenticated
using (teacher_id = (select public.current_teacher_id()) or (select public.can_view_classes()));

drop policy classrooms_insert_admin on public.classrooms;
create policy classrooms_insert_permitted on public.classrooms
for insert to authenticated with check ((select public.has_permission('classrooms', 'edit')));

drop policy classrooms_update_admin on public.classrooms;
create policy classrooms_update_permitted on public.classrooms
for update to authenticated
using ((select public.has_permission('classrooms', 'edit')))
with check ((select public.has_permission('classrooms', 'edit')));

drop policy schedules_select_scoped on public.schedules;
create policy schedules_select_scoped on public.schedules
for select to authenticated
using (teacher_id = (select public.current_teacher_id()) or (select public.can_view_classes()));

drop policy schedules_insert_admin on public.schedules;
create policy schedules_insert_permitted on public.schedules
for insert to authenticated with check ((select public.can_edit_classes()));

drop policy schedules_update_admin on public.schedules;
create policy schedules_update_permitted on public.schedules
for update to authenticated
using ((select public.can_edit_classes()))
with check ((select public.can_edit_classes()));

drop policy schedule_students_select_scoped on public.schedule_students;
create policy schedule_students_select_scoped on public.schedule_students
for select to authenticated
using (
  (select public.can_view_classes())
  or exists (
    select 1 from public.schedules s
    where s.id = schedule_students.schedule_id
      and s.teacher_id = (select public.current_teacher_id())
  )
);

drop policy schedule_students_insert_admin on public.schedule_students;
create policy schedule_students_insert_permitted on public.schedule_students
for insert to authenticated with check ((select public.can_edit_classes()));

drop policy schedule_students_update_admin on public.schedule_students;
create policy schedule_students_update_permitted on public.schedule_students
for update to authenticated
using ((select public.can_edit_classes()))
with check ((select public.can_edit_classes()));

drop policy schedule_exceptions_select_scoped on public.schedule_exceptions;
create policy schedule_exceptions_select_scoped on public.schedule_exceptions
for select to authenticated
using (
  (select public.can_view_classes())
  or exists (
    select 1 from public.schedules s
    where s.id = schedule_exceptions.schedule_id
      and s.teacher_id = (select public.current_teacher_id())
  )
);

drop policy trial_bookings_select_scoped on public.trial_bookings;
create policy trial_bookings_select_scoped on public.trial_bookings
for select to authenticated
using (
  (select public.can_view_classes())
  or exists (
    select 1 from public.schedules s
    where s.id = trial_bookings.schedule_id
      and s.teacher_id = (select public.current_teacher_id())
  )
);

drop policy makeup_plans_select_scoped on public.makeup_plans;
create policy makeup_plans_select_scoped on public.makeup_plans
for select to authenticated
using (
  (select public.can_view_classes())
  or exists (
    select 1 from public.schedules s
    where s.classroom_id = makeup_plans.classroom_id
      and s.teacher_id = (select public.current_teacher_id())
  )
);

drop policy lesson_logs_select_scoped on public.lesson_logs;
create policy lesson_logs_select_scoped on public.lesson_logs
for select to authenticated
using (teacher_id = (select public.current_teacher_id()) or (select public.can_view_classes()));

drop policy lesson_log_students_select_scoped on public.lesson_log_students;
create policy lesson_log_students_select_scoped on public.lesson_log_students
for select to authenticated
using (
  (select public.can_view_classes())
  or exists (
    select 1 from public.lesson_logs l
    where l.id = lesson_log_students.lesson_log_id
      and l.teacher_id = (select public.current_teacher_id())
  )
);

drop policy lesson_log_student_reviews_select_scoped on public.lesson_log_student_reviews;
create policy lesson_log_student_reviews_select_scoped on public.lesson_log_student_reviews
for select to authenticated
using (
  (select public.can_view_classes())
  or exists (
    select 1 from public.lesson_logs l
    where l.id = lesson_log_student_reviews.lesson_log_id
      and l.teacher_id = (select public.current_teacher_id())
  )
);

drop policy student_lesson_ledger_select_scoped on public.student_lesson_ledger;
create policy student_lesson_ledger_select_scoped on public.student_lesson_ledger
for select to authenticated
using (
  (select public.can_view_classes())
  or exists (
    select 1 from public.lesson_logs l
    where l.id = student_lesson_ledger.lesson_log_id
      and l.teacher_id = (select public.current_teacher_id())
  )
);

drop policy student_admin_ledger_select_scoped on public.student_admin_ledger;
create policy student_admin_ledger_select_scoped on public.student_admin_ledger
for select to authenticated
using (
  (select public.can_view_classes())
  or exists (
    select 1 from public.students st
    where st.id = student_admin_ledger.student_id
      and (
        st.teacher_id = (select public.current_teacher_id())
        or st.classroom_id in (
          select c.id from public.classrooms c
          where c.teacher_id = (select public.current_teacher_id())
        )
      )
  )
);

drop policy students_select_scoped on public.students;
create policy students_select_scoped on public.students
for select to authenticated
using (
  (select public.can_view_classes())
  or teacher_id = (select public.current_teacher_id())
  or classroom_id in (
    select c.id from public.classrooms c
    where c.teacher_id = (select public.current_teacher_id())
  )
);

drop policy students_update_admin on public.students;
create policy students_update_permitted on public.students
for update to authenticated
using ((select public.has_permission('students', 'edit')))
with check ((select public.has_permission('students', 'edit')));

-- Anyone with a ticked module may read the account list (calendar teacher
-- names, activity log actors). Plain teachers still see only themselves.
drop policy teachers_select_own_or_admin on public.teachers;
create policy teachers_select_own_or_permitted on public.teachers
for select to authenticated
using (auth_user_id = (select auth.uid()) or (select public.has_any_permission()));

drop policy leads_select_admin on public.leads;
create policy leads_select_permitted on public.leads
for select to authenticated using ((select public.has_permission('leads')));

drop policy leads_insert_admin on public.leads;
create policy leads_insert_permitted on public.leads
for insert to authenticated with check ((select public.has_permission('leads', 'edit')));

drop policy leads_update_admin on public.leads;
create policy leads_update_permitted on public.leads
for update to authenticated
using ((select public.has_permission('leads', 'edit')))
with check ((select public.has_permission('leads', 'edit')));

drop policy leads_delete_admin on public.leads;
create policy leads_delete_permitted on public.leads
for delete to authenticated using ((select public.has_permission('leads', 'delete')));

drop policy lead_options_select_admin on public.lead_options;
create policy lead_options_select_permitted on public.lead_options
for select to authenticated using ((select public.has_permission('leads')));

drop policy lead_options_insert_admin on public.lead_options;
create policy lead_options_insert_permitted on public.lead_options
for insert to authenticated with check ((select public.has_permission('leads', 'edit')));

drop policy lead_options_update_admin on public.lead_options;
create policy lead_options_update_permitted on public.lead_options
for update to authenticated
using ((select public.has_permission('leads', 'edit')))
with check ((select public.has_permission('leads', 'edit')));

-- Leads shows the form answers a lead gave, so Leads access can read forms too.
drop policy forms_select_admin on public.forms;
create policy forms_select_permitted on public.forms
for select to authenticated
using ((select public.has_permission('forms')) or (select public.has_permission('leads')));

drop policy forms_insert_admin on public.forms;
create policy forms_insert_permitted on public.forms
for insert to authenticated with check ((select public.has_permission('forms', 'edit')));

drop policy forms_update_admin on public.forms;
create policy forms_update_permitted on public.forms
for update to authenticated
using ((select public.has_permission('forms', 'edit')))
with check ((select public.has_permission('forms', 'edit')));

drop policy forms_delete_admin on public.forms;
create policy forms_delete_permitted on public.forms
for delete to authenticated using ((select public.has_permission('forms', 'delete')));

drop policy form_submissions_select_admin on public.form_submissions;
create policy form_submissions_select_permitted on public.form_submissions
for select to authenticated
using ((select public.has_permission('forms')) or (select public.has_permission('leads')));

drop policy form_submissions_delete_admin on public.form_submissions;
create policy form_submissions_delete_permitted on public.form_submissions
for delete to authenticated using ((select public.has_permission('forms', 'delete')));

-- Form images: replacing an image removes the old file, so editing a form
-- needs delete on storage too.
drop policy form_images_insert_admin on storage.objects;
create policy form_images_insert_permitted on storage.objects
for insert to authenticated
with check (bucket_id = 'form-images' and (select public.has_permission('forms', 'edit')));

drop policy form_images_update_admin on storage.objects;
create policy form_images_update_permitted on storage.objects
for update to authenticated
using (bucket_id = 'form-images' and (select public.has_permission('forms', 'edit')))
with check (bucket_id = 'form-images' and (select public.has_permission('forms', 'edit')));

drop policy form_images_delete_admin on storage.objects;
create policy form_images_delete_permitted on storage.objects
for delete to authenticated
using (bucket_id = 'form-images' and (select public.has_permission('forms', 'edit')));

-- ---------------------------------------------------------------------------
-- Setting an account's permissions (admin only).

create or replace function public.set_account_permissions(p_teacher_id bigint, p_permissions jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.teachers%rowtype;
  v_permissions jsonb := coalesce(p_permissions, '{}'::jsonb);
begin
  if not public.is_admin() then
    raise exception 'Only admins can change account permissions.';
  end if;

  select * into v_account
  from public.teachers
  where id = p_teacher_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Account not found.';
  end if;

  if not public.valid_account_permissions(v_permissions) then
    raise exception 'These permissions are not valid.';
  end if;

  if v_account.permissions = v_permissions then
    return;
  end if;

  update public.teachers
  set permissions = v_permissions
  where id = p_teacher_id;

  perform public.record_admin_activity(
    'permissions_updated',
    'teacher',
    p_teacher_id,
    v_account.full_name,
    jsonb_build_object('previous', v_account.permissions, 'new', v_permissions)
  );
end;
$$;

revoke all on function public.set_account_permissions(bigint, jsonb) from public, anon;
grant execute on function public.set_account_permissions(bigint, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs: same bodies as before; only the admin-only gate changes.

CREATE OR REPLACE FUNCTION public.archive_classroom(p_classroom_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_classroom public.classrooms%rowtype;
begin
  if not public.has_permission('classrooms', 'delete') then
    raise exception 'Your account is not allowed to archive classrooms.';
  end if;

  select * into v_classroom
  from public.classrooms
  where id = p_classroom_id
  for update;

  if not found then
    raise exception 'Classroom not found.';
  end if;

  update public.schedules
  set status = 'cancelled'
  where classroom_id = p_classroom_id
    and status = 'active';

  update public.classrooms
  set status = 'archived', archived_at = timezone('utc', now())
  where id = p_classroom_id;

  perform public.record_admin_activity(
    'classroom_archived',
    'classroom',
    p_classroom_id,
    v_classroom.name,
    jsonb_build_object(
      'age_group', v_classroom.age_group,
      'program_level', v_classroom.program_level,
      'teacher_id', v_classroom.teacher_id
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.restore_classroom(p_classroom_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_classroom public.classrooms%rowtype;
begin
  if not public.has_permission('classrooms', 'delete') then
    raise exception 'Your account is not allowed to restore classrooms.';
  end if;

  select * into v_classroom
  from public.classrooms
  where id = p_classroom_id
    and status = 'archived'
  for update;

  if not found then
    raise exception 'Archived classroom not found.';
  end if;

  update public.classrooms
  set status = 'active', archived_at = null
  where id = p_classroom_id;

  perform public.record_admin_activity(
    'classroom_restored',
    'classroom',
    p_classroom_id,
    v_classroom.name,
    '{}'::jsonb
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.reassign_classroom_teacher(p_classroom_id bigint, p_new_teacher_id bigint, p_effective_date date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_classroom public.classrooms%rowtype;
  v_new_teacher public.teachers%rowtype;
  v_effective date := coalesce(
    p_effective_date,
    (timezone('Asia/Kuala_Lumpur', now()))::date
  );
  v_last_logged date;
  v_schedule public.schedules%rowtype;
  v_new_schedule_id bigint;
begin
  if not public.has_permission('classrooms', 'edit') then
    raise exception 'Your account is not allowed to change a classroom teacher.';
  end if;

  select * into v_classroom
  from public.classrooms
  where id = p_classroom_id
  for update;

  if not found then
    raise exception 'Classroom not found.';
  end if;

  select * into v_new_teacher
  from public.teachers
  where id = p_new_teacher_id;

  if not found or not v_new_teacher.is_active or v_new_teacher.role <> 'teacher' then
    raise exception 'The new teacher must be an active teacher account.';
  end if;

  if v_classroom.teacher_id is not distinct from p_new_teacher_id then
    return;
  end if;

  -- A class already logged on or after the effective date belongs to the
  -- old teacher's series; moving it would orphan that attendance record.
  select max(ll.lesson_date) into v_last_logged
  from public.lesson_logs ll
  join public.schedules s on s.id = ll.schedule_id
  where s.classroom_id = p_classroom_id
    and s.event_type = 'regular';

  if v_last_logged is not null and v_last_logged >= v_effective then
    raise exception 'Attendance was already taken on %, so the change must start after that date.', v_last_logged;
  end if;

  update public.classrooms
  set teacher_id = p_new_teacher_id
  where id = p_classroom_id;

  update public.students
  set teacher_id = p_new_teacher_id
  where classroom_id = p_classroom_id;

  for v_schedule in
    select * from public.schedules
    where classroom_id = p_classroom_id
      and event_type = 'regular'
      and status = 'active'
    for update
  loop
    if v_schedule.end_recur is not null and v_schedule.end_recur < v_effective then
      -- Already ended before the change: history only, leave it alone.
      continue;
    end if;

    if v_schedule.start_recur >= v_effective then
      -- Hasn't started yet: nothing to split.
      update public.schedules
      set teacher_id = p_new_teacher_id
      where id = v_schedule.id;

      update public.students st
      set teacher_id = p_new_teacher_id
      from public.trial_bookings tb
      where tb.schedule_id = v_schedule.id
        and tb.student_id = st.id;

      continue;
    end if;

    insert into public.schedules (
      teacher_id, student_id, classroom_id, title, event_type, recurrence_type,
      day_of_week, scheduled_date, start_time, end_time, start_recur, end_recur,
      status, notes
    )
    values (
      p_new_teacher_id, v_schedule.student_id, v_schedule.classroom_id,
      v_schedule.title, v_schedule.event_type, v_schedule.recurrence_type,
      v_schedule.day_of_week, v_schedule.scheduled_date, v_schedule.start_time,
      v_schedule.end_time, v_effective, v_schedule.end_recur,
      'active', v_schedule.notes
    )
    returning id into v_new_schedule_id;

    update public.schedules
    set end_recur = v_effective - 1
    where id = v_schedule.id;

    update public.schedule_exceptions
    set schedule_id = v_new_schedule_id
    where schedule_id = v_schedule.id
      and exception_date >= v_effective;

    -- Upcoming trial bookings (and their placeholder students) move to the
    -- new series and teacher.
    update public.students st
    set teacher_id = p_new_teacher_id
    from public.trial_bookings tb
    where tb.schedule_id = v_schedule.id
      and tb.booking_date >= v_effective
      and tb.student_id = st.id;

    update public.trial_bookings
    set schedule_id = v_new_schedule_id
    where schedule_id = v_schedule.id
      and booking_date >= v_effective;
  end loop;

  perform public.record_admin_activity(
    'classroom_teacher_changed',
    'classroom',
    p_classroom_id,
    v_classroom.name,
    jsonb_build_object(
      'from_teacher_id', v_classroom.teacher_id,
      'to_teacher_id', p_new_teacher_id,
      'effective_date', v_effective
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.book_trial_slot(p_schedule_id bigint, p_booking_date date, p_child_name text, p_child_age integer DEFAULT NULL::integer, p_phone text DEFAULT NULL::text, p_lead_id bigint DEFAULT NULL::bigint, p_notes text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_schedule public.schedules%rowtype;
  v_classroom public.classrooms%rowtype;
  v_lead public.leads%rowtype;
  v_child_name text := trim(coalesce(p_child_name, ''));
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
  v_lead_id bigint;
  v_children jsonb;
  v_student_id bigint;
  v_booking_id bigint;
begin
  if not public.has_permission('calendar', 'edit') then
    raise exception 'Your account is not allowed to book a trial class.';
  end if;

  if v_child_name = '' then
    raise exception 'Child name is required.';
  end if;

  if p_child_age is not null and (p_child_age < 1 or p_child_age > 25) then
    raise exception 'Child age must be between 1 and 25.';
  end if;

  -- FOR SHARE serialises with cancel_schedule_occurrence (FOR UPDATE), so a
  -- day cannot be cancelled and booked at the same moment.
  select * into v_schedule
  from public.schedules
  where id = p_schedule_id
  for share;

  if not found then
    raise exception 'Schedule not found.';
  end if;

  if v_schedule.status <> 'active' or v_schedule.event_type <> 'regular' then
    raise exception 'This is not an active weekly trial slot.';
  end if;

  select * into v_classroom
  from public.classrooms
  where id = v_schedule.classroom_id;

  if not found or v_classroom.category <> 'trial' or v_classroom.status <> 'active' then
    raise exception 'This schedule is not an active trial classroom slot.';
  end if;

  if p_booking_date is null
    or extract(dow from p_booking_date)::int <> v_schedule.day_of_week
    or p_booking_date < v_schedule.start_recur
    or (v_schedule.end_recur is not null and p_booking_date > v_schedule.end_recur) then
    raise exception 'This trial slot does not run on that date.';
  end if;

  if exists (
    select 1 from public.schedule_exceptions
    where schedule_id = p_schedule_id
      and exception_date = p_booking_date
  ) then
    raise exception 'This trial slot is cancelled on that date.';
  end if;

  if exists (
    select 1 from public.trial_bookings
    where schedule_id = p_schedule_id
      and booking_date = p_booking_date
      and lower(child_name) = lower(v_child_name)
      and coalesce(phone, '') = coalesce(v_phone, '')
  ) then
    raise exception 'This child is already booked for that trial slot.';
  end if;

  if p_lead_id is not null then
    select * into v_lead
    from public.leads
    where id = p_lead_id
    for update;

    if not found then
      raise exception 'Lead not found.';
    end if;

    v_lead_id := v_lead.id;
    v_children := v_lead.children;

    -- Attach the child to the lead when it is not on it yet (a lead holds at
    -- most 3 children, and a child needs an age to be stored on a lead).
    if p_child_age is not null
      and jsonb_array_length(v_children) < 3
      and not exists (
        select 1 from jsonb_array_elements(v_children) child
        where lower(trim(coalesce(child ->> 'name', ''))) = lower(v_child_name)
      ) then
      v_children := v_children || jsonb_build_array(
        jsonb_build_object('name', v_child_name, 'age', p_child_age, 'phone', v_phone)
      );
    end if;

    update public.leads
    set
      children = v_children,
      phone = coalesce(phone, v_phone),
      status = case when status in ('new', 'contacted') then 'trial_scheduled' else status end
    where id = v_lead.id;
  else
    -- Not in Leads yet: booking creates the lead so the pipeline stays in sync.
    if p_child_age is null then
      raise exception 'Child age is required to add a new lead.';
    end if;

    insert into public.leads (full_name, phone, source, status, children, notes, added_date)
    values (
      null,
      v_phone,
      'other',
      'trial_scheduled',
      jsonb_build_array(
        jsonb_build_object('name', v_child_name, 'age', p_child_age, 'phone', v_phone)
      ),
      v_notes,
      (timezone('Asia/Kuala_Lumpur', now()))::date
    )
    returning id into v_lead_id;

    perform public.record_admin_activity(
      'lead_created',
      'lead',
      v_lead_id,
      v_child_name,
      jsonb_build_object('source', 'trial_booking')
    );
  end if;

  insert into public.students (
    teacher_id, classroom_id, full_name, phone, age, remaining_hours,
    lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date,
    notes, is_active, student_type
  )
  values (
    v_schedule.teacher_id, null, v_child_name, v_phone, p_child_age, 0,
    current_date, current_date, current_date,
    v_notes, true, 'trial'
  )
  returning id into v_student_id;

  insert into public.trial_bookings (
    schedule_id, booking_date, lead_id, child_name, child_age, phone, notes, created_by, student_id
  )
  values (
    p_schedule_id,
    p_booking_date,
    v_lead_id,
    v_child_name,
    p_child_age,
    v_phone,
    v_notes,
    public.current_teacher_id(),
    v_student_id
  )
  returning id into v_booking_id;

  perform public.record_admin_activity(
    'trial_booked',
    'schedule',
    p_schedule_id,
    v_classroom.name,
    jsonb_build_object(
      'booking_date', p_booking_date,
      'child_name', v_child_name,
      'lead_id', v_lead_id,
      'student_id', v_student_id
    )
  );

  return v_booking_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_schedule_occurrence(p_schedule_id bigint, p_occurrence_date date, p_reason text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_schedule public.schedules%rowtype;
  v_exception_id bigint;
begin
  if not public.has_permission('calendar', 'edit') then
    raise exception 'Your account is not allowed to cancel a class occurrence.';
  end if;

  -- Lock the schedule first so a concurrent attendance insert (which takes a
  -- FOR SHARE lock on this row in its trigger) is serialised with this call.
  select * into v_schedule
  from public.schedules
  where id = p_schedule_id
  for update;

  if not found then
    raise exception 'Schedule not found.';
  end if;

  if v_schedule.event_type <> 'regular' then
    raise exception 'Only regular weekly classes can skip a single day. Cancel the replacement class instead.';
  end if;

  if v_schedule.status <> 'active' then
    raise exception 'This schedule is already cancelled.';
  end if;

  if extract(dow from p_occurrence_date)::int <> v_schedule.day_of_week
    or p_occurrence_date < v_schedule.start_recur
    or (v_schedule.end_recur is not null and p_occurrence_date > v_schedule.end_recur) then
    raise exception 'This schedule does not run on that date.';
  end if;

  if exists (
    select 1 from public.lesson_logs
    where schedule_id = p_schedule_id
      and lesson_date = p_occurrence_date
  ) then
    raise exception 'Attendance was already submitted for this day, so it cannot be cancelled.';
  end if;

  insert into public.schedule_exceptions (schedule_id, exception_date, reason, created_by)
  values (
    p_schedule_id,
    p_occurrence_date,
    nullif(trim(coalesce(p_reason, '')), ''),
    public.current_teacher_id()
  )
  on conflict (schedule_id, exception_date) do nothing
  returning id into v_exception_id;

  if v_exception_id is not null then
    perform public.record_admin_activity(
      'schedule_occurrence_cancelled',
      'schedule',
      p_schedule_id,
      v_schedule.title,
      jsonb_build_object('occurrence_date', p_occurrence_date)
    );
  end if;

  return v_exception_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.restore_schedule_occurrence(p_schedule_id bigint, p_occurrence_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_schedule public.schedules%rowtype;
  v_exception public.schedule_exceptions%rowtype;
begin
  if not public.has_permission('calendar', 'edit') then
    raise exception 'Your account is not allowed to restore a class occurrence.';
  end if;

  select * into v_schedule from public.schedules where id = p_schedule_id;

  if not found then
    raise exception 'Schedule not found.';
  end if;

  if v_schedule.classroom_id is not null and exists (
    select 1 from public.makeup_plans
    where classroom_id = v_schedule.classroom_id
      and missed_date = p_occurrence_date
      and student_id is null
  ) then
    raise exception 'This day has a make-up plan. Delete the make-up plan first, then restore the class.';
  end if;

  select * into v_exception
  from public.schedule_exceptions
  where schedule_id = p_schedule_id
    and exception_date = p_occurrence_date;

  if not found then
    return;
  end if;

  if v_exception.moved_to_schedule_id is not null then
    if exists (
      select 1 from public.lesson_logs
      where schedule_id = v_exception.moved_to_schedule_id
    ) then
      raise exception 'The moved class already has attendance, so this day cannot be restored.';
    end if;

    delete from public.schedules where id = v_exception.moved_to_schedule_id;
  end if;

  delete from public.schedule_exceptions where id = v_exception.id;

  perform public.record_admin_activity(
    'schedule_occurrence_restored',
    'schedule',
    p_schedule_id,
    v_schedule.title,
    jsonb_build_object(
      'occurrence_date', p_occurrence_date,
      'removed_replacement_schedule_id', v_exception.moved_to_schedule_id
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.move_class_occurrence(p_schedule_id bigint, p_from_date date, p_to_date date, p_start_time time without time zone, p_end_time time without time zone, p_reason text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_schedule public.schedules%rowtype;
  v_classroom public.classrooms%rowtype;
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_student_ids bigint[];
  v_new_id bigint;
begin
  if not public.has_permission('calendar', 'edit') then
    raise exception 'Your account is not allowed to move a class.';
  end if;

  if p_to_date is null or p_to_date <= v_today then
    raise exception 'A class can only be moved to a date after today.';
  end if;

  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'The class must end after it starts.';
  end if;

  -- FOR UPDATE serialises with attendance submission (FOR SHARE in its
  -- trigger) and with cancelling/booking on this schedule.
  select * into v_schedule
  from public.schedules
  where id = p_schedule_id
  for update;

  if not found then
    raise exception 'Schedule not found.';
  end if;

  if v_schedule.status <> 'active' then
    raise exception 'This class is cancelled.';
  end if;

  if exists (
    select 1 from public.lesson_logs
    where schedule_id = p_schedule_id
      and lesson_date = p_from_date
  ) then
    raise exception 'Attendance was already taken for this class, so it cannot be moved.';
  end if;

  if v_schedule.event_type = 'replacement' then
    if p_from_date is distinct from v_schedule.scheduled_date then
      raise exception 'This class does not run on that date.';
    end if;

    update public.schedules
    set scheduled_date = p_to_date,
        start_time = p_start_time,
        end_time = p_end_time
    where id = p_schedule_id;

    perform public.record_admin_activity(
      'schedule_moved',
      'schedule',
      p_schedule_id,
      v_schedule.title,
      jsonb_build_object('from_date', p_from_date, 'to_date', p_to_date)
    );

    return p_schedule_id;
  end if;

  select * into v_classroom
  from public.classrooms
  where id = v_schedule.classroom_id;

  if not found or v_classroom.status <> 'active' then
    raise exception 'This classroom is not active.';
  end if;

  if v_classroom.category = 'trial' then
    raise exception 'Trial slots move with their bookings. Drag a booked trial onto another trial slot.';
  end if;

  -- Same meeting-day rule the calendar and attendance use: weekday, date
  -- range, never the 29th-31st, and not already cancelled.
  if p_from_date is null
    or extract(dow from p_from_date)::int <> v_schedule.day_of_week
    or p_from_date < v_schedule.start_recur
    or (v_schedule.end_recur is not null and p_from_date > v_schedule.end_recur)
    or extract(day from p_from_date)::int >= 29 then
    raise exception 'This class does not run on that date.';
  end if;

  if exists (
    select 1 from public.schedule_exceptions
    where schedule_id = p_schedule_id
      and exception_date = p_from_date
  ) then
    raise exception 'This class is already cancelled on that date.';
  end if;

  if exists (
    select 1
    from public.makeup_sessions ms
    join public.makeup_plans mp on mp.id = ms.plan_id
    where mp.classroom_id = v_classroom.id
      and ms.session_date = p_from_date
  ) then
    raise exception 'This class carries make-up minutes that day. Change the make-up plan first, then move the class.';
  end if;

  select coalesce(array_agg(id order by full_name), '{}'::bigint[])
  into v_student_ids
  from public.students
  where classroom_id = v_classroom.id
    and is_active;

  if cardinality(v_student_ids) = 0 then
    raise exception 'This class has no active students to move.';
  end if;

  insert into public.schedules (
    teacher_id, student_id, classroom_id, title, event_type, recurrence_type,
    day_of_week, scheduled_date, start_time, end_time, start_recur, end_recur,
    status, notes
  )
  values (
    v_schedule.teacher_id,
    v_student_ids[1],
    null,
    v_classroom.name,
    'replacement',
    'none',
    null,
    p_to_date,
    p_start_time,
    p_end_time,
    null,
    null,
    'active',
    'Moved from ' || to_char(p_from_date, 'DD Mon YYYY') || '.'
      || coalesce(' ' || v_reason, '')
  )
  returning id into v_new_id;

  insert into public.schedule_students (schedule_id, student_id)
  select v_new_id, unnest(v_student_ids);

  insert into public.schedule_exceptions (
    schedule_id, exception_date, reason, created_by, moved_to_schedule_id
  )
  values (
    p_schedule_id,
    p_from_date,
    'Moved to ' || to_char(p_to_date, 'DD Mon YYYY') || coalesce(' - ' || v_reason, ''),
    public.current_teacher_id(),
    v_new_id
  );

  perform public.record_admin_activity(
    'schedule_moved',
    'schedule',
    p_schedule_id,
    v_classroom.name,
    jsonb_build_object(
      'from_date', p_from_date,
      'to_date', p_to_date,
      'replacement_schedule_id', v_new_id
    )
  );

  return v_new_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.move_trial_bookings(p_from_schedule_id bigint, p_from_date date, p_to_schedule_id bigint, p_to_date date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_to public.schedules%rowtype;
  v_to_classroom public.classrooms%rowtype;
  v_from_label text;
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_moved integer;
begin
  if not public.has_permission('calendar', 'edit') then
    raise exception 'Your account is not allowed to move a trial booking.';
  end if;

  if p_to_date is null or p_to_date <= v_today then
    raise exception 'A trial can only be moved to a date after today.';
  end if;

  if p_from_schedule_id = p_to_schedule_id and p_from_date = p_to_date then
    raise exception 'The trial is already on that slot.';
  end if;

  -- Lock both slots in id order so two opposite moves cannot deadlock.
  perform 1 from public.schedules
  where id in (p_from_schedule_id, p_to_schedule_id)
  order by id
  for update;

  select c.name into v_from_label
  from public.schedules s
  join public.classrooms c on c.id = s.classroom_id
  where s.id = p_from_schedule_id
    and c.category = 'trial';

  if not found then
    raise exception 'This is not a trial slot.';
  end if;

  if not exists (
    select 1 from public.trial_bookings
    where schedule_id = p_from_schedule_id
      and booking_date = p_from_date
  ) then
    raise exception 'Nobody is booked on this trial slot.';
  end if;

  if exists (
    select 1 from public.lesson_logs
    where schedule_id = p_from_schedule_id
      and lesson_date = p_from_date
  ) then
    raise exception 'Attendance was already taken for this trial, so it cannot be moved.';
  end if;

  select * into v_to from public.schedules where id = p_to_schedule_id;

  if not found or v_to.status <> 'active' or v_to.event_type <> 'regular' then
    raise exception 'The target is not an active trial slot.';
  end if;

  select * into v_to_classroom from public.classrooms where id = v_to.classroom_id;

  if not found or v_to_classroom.category <> 'trial' or v_to_classroom.status <> 'active' then
    raise exception 'The target is not an active trial slot.';
  end if;

  if extract(dow from p_to_date)::int <> v_to.day_of_week
    or p_to_date < v_to.start_recur
    or (v_to.end_recur is not null and p_to_date > v_to.end_recur) then
    raise exception 'That trial slot does not run on that date.';
  end if;

  if exists (
    select 1 from public.schedule_exceptions
    where schedule_id = p_to_schedule_id
      and exception_date = p_to_date
  ) then
    raise exception 'That trial slot is cancelled on that date.';
  end if;

  if exists (
    select 1
    from public.trial_bookings moving
    join public.trial_bookings existing
      on existing.schedule_id = p_to_schedule_id
     and existing.booking_date = p_to_date
     and lower(existing.child_name) = lower(moving.child_name)
     and coalesce(existing.phone, '') = coalesce(moving.phone, '')
    where moving.schedule_id = p_from_schedule_id
      and moving.booking_date = p_from_date
  ) then
    raise exception 'A child being moved is already booked on that slot.';
  end if;

  -- The trial student follows the slot's teacher so it shows in their roster.
  update public.students
  set teacher_id = v_to.teacher_id
  where id in (
    select student_id from public.trial_bookings
    where schedule_id = p_from_schedule_id
      and booking_date = p_from_date
      and student_id is not null
  );

  update public.trial_bookings
  set schedule_id = p_to_schedule_id,
      booking_date = p_to_date
  where schedule_id = p_from_schedule_id
    and booking_date = p_from_date;

  get diagnostics v_moved = row_count;

  perform public.record_admin_activity(
    'trial_moved',
    'schedule',
    p_to_schedule_id,
    v_to_classroom.name,
    jsonb_build_object(
      'from_schedule_id', p_from_schedule_id,
      'from_date', p_from_date,
      'to_date', p_to_date,
      'children', v_moved
    )
  );

  return v_moved;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reschedule_trial_bookings(p_from_schedule_id bigint, p_from_date date, p_to_date date, p_start_time time without time zone, p_end_time time without time zone)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_from public.schedules%rowtype;
  v_classroom public.classrooms%rowtype;
  v_today date := (timezone('Asia/Kuala_Lumpur', now()))::date;
  v_to_id bigint;
  v_moved integer;
begin
  if not public.has_permission('calendar', 'edit') then
    raise exception 'Your account is not allowed to move a trial booking.';
  end if;

  if p_to_date is null or p_to_date <= v_today then
    raise exception 'A trial can only be moved to a date after today.';
  end if;

  if p_start_time is null or p_end_time is null or p_end_time <= p_start_time then
    raise exception 'The trial must end after it starts.';
  end if;

  select * into v_from
  from public.schedules
  where id = p_from_schedule_id
  for update;

  if not found then
    raise exception 'Schedule not found.';
  end if;

  select * into v_classroom from public.classrooms where id = v_from.classroom_id;

  if not found or v_classroom.category <> 'trial' then
    raise exception 'This is not a trial slot.';
  end if;

  if v_classroom.status <> 'active' then
    raise exception 'This trial classroom is not active.';
  end if;

  if not exists (
    select 1 from public.trial_bookings
    where schedule_id = p_from_schedule_id
      and booking_date = p_from_date
  ) then
    raise exception 'Nobody is booked on this trial slot.';
  end if;

  if exists (
    select 1 from public.lesson_logs
    where schedule_id = p_from_schedule_id
      and lesson_date = p_from_date
  ) then
    raise exception 'Attendance was already taken for this trial, so it cannot be moved.';
  end if;

  -- An existing slot of this trial classroom at exactly that time, if any;
  -- the slot's own teacher first.
  select s.id into v_to_id
  from public.schedules s
  where s.classroom_id = v_classroom.id
    and s.status = 'active'
    and s.event_type = 'regular'
    and s.start_time = p_start_time
    and s.end_time = p_end_time
    and s.day_of_week = extract(dow from p_to_date)::int
    and p_to_date >= s.start_recur
    and (s.end_recur is null or p_to_date <= s.end_recur)
    and not exists (
      select 1 from public.schedule_exceptions e
      where e.schedule_id = s.id
        and e.exception_date = p_to_date
    )
  order by (s.teacher_id = v_from.teacher_id) desc, s.id
  limit 1
  for update;

  if v_to_id = p_from_schedule_id and p_to_date = p_from_date then
    raise exception 'The trial is already at that time.';
  end if;

  if v_to_id is not null and exists (
    select 1
    from public.trial_bookings moving
    join public.trial_bookings existing
      on existing.schedule_id = v_to_id
     and existing.booking_date = p_to_date
     and lower(existing.child_name) = lower(moving.child_name)
     and coalesce(existing.phone, '') = coalesce(moving.phone, '')
    where moving.schedule_id = p_from_schedule_id
      and moving.booking_date = p_from_date
  ) then
    raise exception 'A child being moved is already booked at that time.';
  end if;

  if v_to_id is null then
    insert into public.schedules (
      teacher_id, student_id, classroom_id, title, event_type, recurrence_type,
      day_of_week, scheduled_date, start_time, end_time, start_recur, end_recur,
      status, notes
    )
    values (
      v_from.teacher_id,
      null,
      v_classroom.id,
      v_classroom.name,
      'regular',
      'weekly',
      extract(dow from p_to_date)::int,
      null,
      p_start_time,
      p_end_time,
      p_to_date,
      p_to_date,
      'active',
      'One-off trial slot.'
    )
    returning id into v_to_id;
  end if;

  -- The trial students follow the slot's teacher so they show in its roster.
  update public.students
  set teacher_id = (select teacher_id from public.schedules where id = v_to_id)
  where id in (
    select student_id from public.trial_bookings
    where schedule_id = p_from_schedule_id
      and booking_date = p_from_date
      and student_id is not null
  );

  update public.trial_bookings
  set schedule_id = v_to_id,
      booking_date = p_to_date
  where schedule_id = p_from_schedule_id
    and booking_date = p_from_date;

  get diagnostics v_moved = row_count;

  -- A one-off slot that is now empty has nothing left to show.
  if v_from.start_recur = v_from.end_recur
    and v_from.id <> v_to_id
    and not exists (select 1 from public.trial_bookings where schedule_id = v_from.id)
    and not exists (select 1 from public.lesson_logs where schedule_id = v_from.id) then
    delete from public.schedules where id = v_from.id;
  end if;

  perform public.record_admin_activity(
    'trial_moved',
    'schedule',
    v_to_id,
    v_classroom.name,
    jsonb_build_object(
      'from_schedule_id', p_from_schedule_id,
      'from_date', p_from_date,
      'to_date', p_to_date,
      'start_time', p_start_time,
      'children', v_moved
    )
  );

  return v_to_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_makeup_plan(p_plan_id bigint, p_classroom_id bigint, p_missed_date date, p_student_id bigint, p_missed_minutes integer, p_notes text, p_sessions jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_classroom public.classrooms%rowtype;
  v_student_name text;
  v_plan public.makeup_plans%rowtype;
  v_plan_id bigint;
  v_item jsonb;
  v_date date;
  v_minutes integer;
  v_total integer := 0;
  v_count integer := 0;
begin
  if not public.has_permission('calendar', 'edit') then
    raise exception 'Your account is not allowed to arrange make-up classes.';
  end if;

  select * into v_classroom
  from public.classrooms
  where id = p_classroom_id;

  if not found or v_classroom.status <> 'active' or v_classroom.category <> 'regular' then
    raise exception 'Make-ups can only be arranged for an active regular classroom.';
  end if;

  if p_missed_date is null then
    raise exception 'Pick the date being made up.';
  end if;

  if p_missed_minutes is null or p_missed_minutes not between 1 and 600 then
    raise exception 'Minutes to make up must be between 1 and 600.';
  end if;

  if p_student_id is not null then
    select full_name into v_student_name
    from public.students
    where id = p_student_id
      and classroom_id = p_classroom_id;

    if not found then
      raise exception 'That student is not in this classroom.';
    end if;
  end if;

  if jsonb_typeof(p_sessions) <> 'array' or jsonb_array_length(p_sessions) = 0 then
    raise exception 'Add at least one make-up session.';
  end if;

  if p_plan_id is null then
    insert into public.makeup_plans (
      classroom_id, missed_date, student_id, missed_minutes, notes, created_by
    )
    values (
      p_classroom_id, p_missed_date, p_student_id, p_missed_minutes,
      nullif(trim(coalesce(p_notes, '')), ''), public.current_teacher_id()
    )
    returning id into v_plan_id;
  else
    select * into v_plan
    from public.makeup_plans
    where id = p_plan_id
    for update;

    if not found then
      raise exception 'Make-up plan not found.';
    end if;

    if v_plan.classroom_id <> p_classroom_id then
      raise exception 'A make-up plan cannot move to another classroom.';
    end if;

    update public.makeup_plans
    set missed_date = p_missed_date,
        student_id = p_student_id,
        missed_minutes = p_missed_minutes,
        notes = nullif(trim(coalesce(p_notes, '')), '')
    where id = p_plan_id;

    delete from public.makeup_sessions where plan_id = p_plan_id;
    v_plan_id := p_plan_id;
  end if;

  for v_item in select value from jsonb_array_elements(p_sessions)
  loop
    v_date := (v_item ->> 'session_date')::date;
    v_minutes := (v_item ->> 'extra_minutes')::integer;

    if v_date is null then
      raise exception 'Every make-up session needs a date.';
    end if;

    if v_minutes is null or v_minutes not between 1 and 600 then
      raise exception 'Extra minutes must be between 1 and 600 (on %).', v_date;
    end if;

    if not exists (
      select 1 from public.schedules s
      where s.classroom_id = p_classroom_id
        and s.event_type = 'regular'
        and s.status = 'active'
        and s.day_of_week = extract(dow from v_date)::int
        and v_date >= s.start_recur
        and (s.end_recur is null or v_date <= s.end_recur)
        and not exists (
          select 1 from public.schedule_exceptions e
          where e.schedule_id = s.id
            and e.exception_date = v_date
        )
    ) then
      raise exception 'This class does not run on % (or that day is cancelled).', v_date;
    end if;

    begin
      insert into public.makeup_sessions (plan_id, session_date, extra_minutes)
      values (v_plan_id, v_date, v_minutes);
    exception
      when unique_violation then
        raise exception 'The date % is listed twice.', v_date;
    end;

    v_total := v_total + v_minutes;
    v_count := v_count + 1;
  end loop;

  perform public.record_admin_activity(
    case when p_plan_id is null then 'makeup_planned' else 'makeup_updated' end,
    'classroom',
    p_classroom_id,
    v_classroom.name,
    jsonb_build_object(
      'plan_id', v_plan_id,
      'missed_date', p_missed_date,
      'student_id', p_student_id,
      'student_name', v_student_name,
      'missed_minutes', p_missed_minutes,
      'planned_minutes', v_total,
      'sessions', v_count
    )
  );

  return v_plan_id;
exception
  when unique_violation then
    raise exception 'A make-up plan for % already exists for this %. Edit that one instead.',
      p_missed_date,
      case when p_student_id is null then 'class' else 'student' end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_trial_booking(p_booking_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_booking public.trial_bookings%rowtype;
  v_label text;
  v_has_attendance boolean;
begin
  if not public.has_permission('calendar', 'delete') then
    raise exception 'Your account is not allowed to cancel a trial booking.';
  end if;

  select * into v_booking
  from public.trial_bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Trial booking not found.';
  end if;

  if v_booking.student_id is not null then
    select exists (
      select 1 from public.lesson_log_students where student_id = v_booking.student_id
    ) into v_has_attendance;

    if v_has_attendance then
      raise exception 'Attendance was already recorded for this trial booking, so it cannot be removed.';
    end if;
  end if;

  select c.name into v_label
  from public.schedules s
  left join public.classrooms c on c.id = s.classroom_id
  where s.id = v_booking.schedule_id;

  delete from public.trial_bookings where id = p_booking_id;

  if v_booking.student_id is not null then
    -- Only reachable when the guard above found no attendance, so this never
    -- hits the lesson_log_students "on delete restrict" FK.
    delete from public.students where id = v_booking.student_id;
  end if;

  perform public.record_admin_activity(
    'trial_booking_cancelled',
    'schedule',
    v_booking.schedule_id,
    coalesce(v_label, 'Trial slot'),
    jsonb_build_object(
      'booking_date', v_booking.booking_date,
      'child_name', v_booking.child_name,
      'lead_id', v_booking.lead_id
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_makeup_plan(p_plan_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_plan public.makeup_plans%rowtype;
  v_classroom_name text;
begin
  if not public.has_permission('calendar', 'delete') then
    raise exception 'Your account is not allowed to delete make-up plans.';
  end if;

  select * into v_plan
  from public.makeup_plans
  where id = p_plan_id;

  if not found then
    raise exception 'Make-up plan not found.';
  end if;

  select name into v_classroom_name
  from public.classrooms
  where id = v_plan.classroom_id;

  delete from public.makeup_plans where id = p_plan_id;

  perform public.record_admin_activity(
    'makeup_deleted',
    'classroom',
    v_plan.classroom_id,
    coalesce(v_classroom_name, 'Classroom'),
    jsonb_build_object(
      'plan_id', p_plan_id,
      'missed_date', v_plan.missed_date,
      'student_id', v_plan.student_id
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_student_record(p_full_name text, p_teacher_id bigint, p_initial_hours integer, p_lesson_expiry_date date, p_account_fee_expiry_date date, p_mirai_club_expiry_date date, p_notes text, p_student_type text DEFAULT 'regular'::text, p_phone text DEFAULT NULL::text, p_classroom_id bigint DEFAULT NULL::bigint, p_lead_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(student_id bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student_id bigint;
  v_initial_hours integer := greatest(coalesce(p_initial_hours, 0), 0);
  v_student_type text := coalesce(nullif(trim(p_student_type), ''), 'regular');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_full_name text := trim(coalesce(p_full_name, ''));
  v_actor_teacher_id bigint := public.current_teacher_id();
  v_classroom public.classrooms%rowtype;
  v_classroom_id bigint;
  v_teacher_id bigint := p_teacher_id;
  v_lead public.leads%rowtype;
begin
  if not public.has_permission('students', 'edit') then
    raise exception 'Your account is not allowed to create student records.';
  end if;

  if v_full_name = '' then
    raise exception 'Student full name is required.';
  end if;

  if v_student_type not in ('trial', 'preview', 'regular') then
    raise exception 'Invalid student type.';
  end if;

  if v_student_type = 'preview' and v_phone is null then
    raise exception 'Phone number is required for preview students.';
  end if;

  -- A preview student never sits in a classroom.
  if p_classroom_id is not null and v_student_type <> 'preview' then
    select * into v_classroom
    from public.classrooms
    where id = p_classroom_id;

    if not found or v_classroom.status <> 'active' then
      raise exception 'Classroom not found or archived.';
    end if;

    v_classroom_id := v_classroom.id;
    v_teacher_id := v_classroom.teacher_id;
  end if;

  if v_teacher_id is not null and not exists (
    select 1
    from public.teachers
    where id = v_teacher_id
  ) then
    raise exception 'Assigned teacher not found.';
  end if;

  if p_lead_id is not null then
    select * into v_lead
    from public.leads
    where id = p_lead_id
    for update;

    if not found then
      raise exception 'Lead not found.';
    end if;

    if v_lead.converted_student_id is not null then
      raise exception 'This lead was already converted to a student.';
    end if;
  end if;

  insert into public.students (
    teacher_id,
    classroom_id,
    full_name,
    phone,
    remaining_hours,
    lesson_expiry_date,
    account_fee_expiry_date,
    mirai_club_expiry_date,
    notes,
    is_active,
    student_type
  )
  values (
    case when v_student_type = 'preview' then null else v_teacher_id end,
    v_classroom_id,
    v_full_name,
    v_phone,
    case when v_student_type = 'preview' then 0 else v_initial_hours end,
    coalesce(p_lesson_expiry_date, current_date),
    coalesce(p_account_fee_expiry_date, current_date),
    coalesce(p_mirai_club_expiry_date, current_date),
    case
      when v_student_type = 'preview' then null
      else nullif(trim(coalesce(p_notes, '')), '')
    end,
    true,
    v_student_type
  )
  returning id into v_student_id;

  insert into public.student_admin_ledger (
    student_id,
    action_type,
    delta_hours,
    remark,
    actor_teacher_id
  )
  values (
    v_student_id,
    'student_created',
    case when v_student_type = 'preview' then 0 else v_initial_hours end,
    case
      when v_student_type = 'preview' then 'Preview student record created.'
      else coalesce(nullif(trim(coalesce(p_notes, '')), ''), 'Initial student record created.')
    end,
    v_actor_teacher_id
  );

  if v_student_type <> 'preview' then
    insert into public.student_admin_ledger (
      student_id,
      action_type,
      old_date,
      new_date,
      remark,
      actor_teacher_id
    )
    values
      (
        v_student_id,
        'lesson_expiry_updated',
        null,
        p_lesson_expiry_date,
        'Initial lesson expiry set.',
        v_actor_teacher_id
      ),
      (
        v_student_id,
        'account_fee_expiry_updated',
        null,
        p_account_fee_expiry_date,
        'Initial account fee expiry set.',
        v_actor_teacher_id
      ),
      (
        v_student_id,
        'mirai_club_expiry_updated',
        null,
        p_mirai_club_expiry_date,
        'Initial Mirai Club expiry set.',
        v_actor_teacher_id
      );
  end if;

  perform public.record_admin_activity(
    'student_created',
    'student',
    v_student_id,
    v_full_name,
    jsonb_build_object('classroom_id', v_classroom_id, 'student_type', v_student_type)
  );

  if p_lead_id is not null then
    -- The lead keeps its trial_bookings (lead_id), so the new student's
    -- trial history is reachable through leads.converted_student_id.
    update public.leads
    set status = 'converted', converted_student_id = v_student_id
    where id = p_lead_id;

    perform public.record_admin_activity(
      'lead_converted',
      'lead',
      p_lead_id,
      v_full_name,
      jsonb_build_object('student_id', v_student_id)
    );
  end if;

  return query
  select v_student_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_preview_student_records(p_students jsonb)
 RETURNS TABLE(student_id bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_item jsonb;
  v_full_name text;
  v_phone text;
  v_student_id bigint;
  v_actor_teacher_id bigint := public.current_teacher_id();
begin
  if not public.has_permission('students', 'edit') then
    raise exception 'Your account is not allowed to create preview student records.';
  end if;

  if jsonb_typeof(p_students) <> 'array' then
    raise exception 'Preview students payload must be an array.';
  end if;

  if jsonb_array_length(p_students) = 0 then
    raise exception 'Preview students payload cannot be empty.';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_students)
  loop
    v_full_name := trim(coalesce(v_item ->> 'full_name', ''));
    v_phone := trim(coalesce(v_item ->> 'phone', ''));

    if v_full_name = '' then
      raise exception 'Student full name is required.';
    end if;

    if v_phone = '' then
      raise exception 'Phone number is required for preview students.';
    end if;

    insert into public.students (
      teacher_id,
      classroom_id,
      full_name,
      phone,
      remaining_hours,
      lesson_expiry_date,
      account_fee_expiry_date,
      mirai_club_expiry_date,
      notes,
      is_active,
      student_type
    )
    values (
      null,
      null,
      v_full_name,
      v_phone,
      0,
      current_date,
      current_date,
      current_date,
      null,
      true,
      'preview'
    )
    returning id into v_student_id;

    insert into public.student_admin_ledger (
      student_id,
      action_type,
      delta_hours,
      remark,
      actor_teacher_id
    )
    values (
      v_student_id,
      'student_created',
      0,
      'Preview student record created.',
      v_actor_teacher_id
    );

    student_id := v_student_id;
    return next;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_student_record(p_student_id bigint, p_full_name text, p_teacher_id bigint, p_classroom_id bigint, p_notes text, p_student_type text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_previous public.students%rowtype;
  v_classroom_teacher_id bigint;
  v_student_type text;
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
  if not public.has_permission('students', 'edit') then
    raise exception 'Your account is not allowed to update student records.';
  end if;

  select * into v_previous
  from public.students
  where id = p_student_id
  for update;

  if not found then
    raise exception 'Student record not found.';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Student full name is required.';
  end if;

  v_student_type := coalesce(nullif(trim(p_student_type), ''), v_previous.student_type);

  if v_student_type not in ('trial', 'preview', 'regular') then
    raise exception 'Invalid student type.';
  end if;

  if v_student_type = 'preview' and v_phone is null then
    raise exception 'Phone number is required for preview students.';
  end if;

  if v_student_type <> 'preview' and p_classroom_id is not null then
    select teacher_id into v_classroom_teacher_id
    from public.classrooms
    where id = p_classroom_id
      and status = 'active';

    if not found then
      raise exception 'Selected classroom is not active.';
    end if;
  end if;

  update public.students
  set
    full_name = trim(p_full_name),
    phone = v_phone,
    classroom_id = case when v_student_type = 'preview' then null else p_classroom_id end,
    teacher_id = case
      when v_student_type = 'preview' then null
      else coalesce(v_classroom_teacher_id, p_teacher_id)
    end,
    notes = case
      when v_student_type = 'preview' then null
      else nullif(trim(coalesce(p_notes, '')), '')
    end,
    student_type = v_student_type
  where id = p_student_id;

  perform public.record_admin_activity(
    'student_updated',
    'student',
    p_student_id,
    trim(p_full_name),
    jsonb_build_object(
      'previous_classroom_id', v_previous.classroom_id,
      'new_classroom_id', case when v_student_type = 'preview' then null else p_classroom_id end,
      'previous_teacher_id', v_previous.teacher_id,
      'new_teacher_id', case
        when v_student_type = 'preview' then null
        else coalesce(v_classroom_teacher_id, p_teacher_id)
      end,
      'previous_student_type', v_previous.student_type,
      'new_student_type', v_student_type
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.renew_student_record(p_student_id bigint, p_add_hours integer, p_new_lesson_expiry_date date, p_new_account_fee_expiry_date date, p_new_mirai_club_expiry_date date, p_remark text)
 RETURNS TABLE(student_id bigint, remaining_hours integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_student public.students%rowtype;
  v_add_hours integer := greatest(coalesce(p_add_hours, 0), 0);
  v_next_lesson_expiry date;
  v_next_account_fee_expiry date;
  v_next_mirai_club_expiry date;
  v_next_remaining_hours integer;
  v_remark text := nullif(trim(coalesce(p_remark, '')), '');
  v_actor_teacher_id bigint := public.current_teacher_id();
begin
  if not public.has_permission('students', 'edit') then
    raise exception 'Your account is not allowed to renew student records.';
  end if;

  select *
  into v_student
  from public.students
  where id = p_student_id;

  if not found then
    raise exception 'Student not found.';
  end if;

  v_next_lesson_expiry := coalesce(p_new_lesson_expiry_date, v_student.lesson_expiry_date);
  v_next_account_fee_expiry := coalesce(p_new_account_fee_expiry_date, v_student.account_fee_expiry_date);
  v_next_mirai_club_expiry := coalesce(p_new_mirai_club_expiry_date, v_student.mirai_club_expiry_date);
  v_next_remaining_hours := v_student.remaining_hours + v_add_hours;

  if v_add_hours = 0
    and v_next_lesson_expiry = v_student.lesson_expiry_date
    and v_next_account_fee_expiry = v_student.account_fee_expiry_date
    and v_next_mirai_club_expiry = v_student.mirai_club_expiry_date then
    raise exception 'No renewal changes were submitted.';
  end if;

  update public.students
  set
    remaining_hours = v_next_remaining_hours,
    lesson_expiry_date = v_next_lesson_expiry,
    account_fee_expiry_date = v_next_account_fee_expiry,
    mirai_club_expiry_date = v_next_mirai_club_expiry
  where id = p_student_id;

  if v_add_hours > 0 then
    insert into public.student_admin_ledger (
      student_id,
      action_type,
      delta_hours,
      remark,
      actor_teacher_id
    )
    values (
      p_student_id,
      'hours_added',
      v_add_hours,
      coalesce(v_remark, 'Hours renewed by admin.'),
      v_actor_teacher_id
    );
  end if;

  if v_next_lesson_expiry <> v_student.lesson_expiry_date then
    insert into public.student_admin_ledger (
      student_id,
      action_type,
      old_date,
      new_date,
      remark,
      actor_teacher_id
    )
    values (
      p_student_id,
      'lesson_expiry_updated',
      v_student.lesson_expiry_date,
      v_next_lesson_expiry,
      coalesce(v_remark, 'Lesson expiry renewed by admin.'),
      v_actor_teacher_id
    );
  end if;

  if v_next_account_fee_expiry <> v_student.account_fee_expiry_date then
    insert into public.student_admin_ledger (
      student_id,
      action_type,
      old_date,
      new_date,
      remark,
      actor_teacher_id
    )
    values (
      p_student_id,
      'account_fee_expiry_updated',
      v_student.account_fee_expiry_date,
      v_next_account_fee_expiry,
      coalesce(v_remark, 'Account fee expiry renewed by admin.'),
      v_actor_teacher_id
    );
  end if;

  if v_next_mirai_club_expiry <> v_student.mirai_club_expiry_date then
    insert into public.student_admin_ledger (
      student_id,
      action_type,
      old_date,
      new_date,
      remark,
      actor_teacher_id
    )
    values (
      p_student_id,
      'mirai_club_expiry_updated',
      v_student.mirai_club_expiry_date,
      v_next_mirai_club_expiry,
      coalesce(v_remark, 'Mirai Club expiry renewed by admin.'),
      v_actor_teacher_id
    );
  end if;

  return query
  select p_student_id, v_next_remaining_hours;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_admin_activity(p_action_type text, p_entity_type text, p_entity_id bigint, p_entity_label text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_log_id bigint;
begin
  if not public.has_any_edit_permission() then
    raise exception 'Your account is not allowed to record admin activity.';
  end if;

  if p_entity_type not in ('student', 'teacher', 'classroom', 'schedule', 'lead') then
    raise exception 'Unsupported activity entity type.';
  end if;

  insert into public.admin_activity_logs (
    actor_teacher_id,
    action_type,
    entity_type,
    entity_id,
    entity_label,
    details
  ) values (
    public.current_teacher_id(),
    trim(p_action_type),
    p_entity_type,
    p_entity_id,
    trim(p_entity_label),
    coalesce(p_details, '{}'::jsonb)
  )
  returning id into v_log_id;

  return v_log_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_teacher_record(p_username text, p_full_name text, p_email text, p_phone text, p_role text DEFAULT 'teacher'::text)
 RETURNS TABLE(teacher_id bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_teacher_id bigint;
  v_role text := coalesce(nullif(trim(p_role), ''), 'teacher');
begin
  if not public.is_admin() then
    raise exception 'Only admins can create teacher records.';
  end if;

  if coalesce(trim(p_username), '') = '' then
    raise exception 'Username is required.';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Teacher full name is required.';
  end if;

  if v_role not in ('admin', 'teacher', 'staff') then
    raise exception 'Role must be admin, teacher or staff.';
  end if;

  insert into public.teachers (
    username,
    full_name,
    email,
    phone,
    role,
    is_active
  )
  values (
    trim(p_username),
    trim(p_full_name),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    v_role,
    true
  )
  returning id into v_teacher_id;

  return query
  select v_teacher_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_teacher_record(p_teacher_id bigint, p_username text, p_full_name text, p_email text, p_phone text, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_previous public.teachers%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can update teacher records.';
  end if;

  select * into v_previous
  from public.teachers
  where id = p_teacher_id
    and is_active = true
  for update;

  if not found then
    raise exception 'Teacher record not found.';
  end if;

  if coalesce(trim(p_username), '') = '' then
    raise exception 'Username is required.';
  end if;

  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Teacher full name is required.';
  end if;

  if p_role not in ('admin', 'teacher', 'staff') then
    raise exception 'Role must be admin, teacher or staff.';
  end if;

  if v_previous.username = 'admin_demo' and (
    trim(p_username) <> 'admin_demo' or p_role <> 'admin'
  ) then
    raise exception 'The bootstrap Admin username and role are protected.';
  end if;

  if p_role = 'staff' and v_previous.role <> 'staff' and (
    exists (select 1 from public.classrooms where teacher_id = p_teacher_id and status = 'active')
    or exists (select 1 from public.schedules where teacher_id = p_teacher_id and status = 'active')
  ) then
    raise exception 'Move this teacher''s classes to another teacher before changing the account to staff.';
  end if;

  update public.teachers
  set
    username = trim(p_username),
    full_name = trim(p_full_name),
    email = nullif(trim(coalesce(p_email, '')), ''),
    phone = nullif(trim(coalesce(p_phone, '')), ''),
    role = p_role
  where id = p_teacher_id;

  perform public.record_admin_activity(
    'teacher_updated',
    'teacher',
    p_teacher_id,
    trim(p_full_name),
    jsonb_build_object(
      'previous_username', v_previous.username,
      'new_username', trim(p_username),
      'previous_role', v_previous.role,
      'new_role', p_role
    )
  );
end;
$function$;
