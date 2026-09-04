-- Real-auth lockdown: replace every permissive temp_dev_* policy (which
-- allowed anon AND authenticated to read/write everything) with policies
-- scoped to the caller's real identity. Mirrors the client-side scoping
-- that already existed in App.tsx (a teacher only ever saw their own
-- classrooms/schedules/students) — this makes that scoping DB-enforced
-- instead of trust-the-client.
--
-- General pattern: `to authenticated` only (never `anon` again), using
-- public.is_admin() / public.current_teacher_id() from the prior migration.

-- teachers ------------------------------------------------------------
drop policy if exists "temp_dev_teachers_select" on public.teachers;
create policy "teachers_select_own_or_admin"
on public.teachers
for select
to authenticated
using (auth_user_id = auth.uid() or public.is_admin());

create policy "teachers_update_admin"
on public.teachers
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- students --------------------------------------------------------------
drop policy if exists "temp_dev_students_select" on public.students;
create policy "students_select_scoped"
on public.students
for select
to authenticated
using (
  public.is_admin()
  or teacher_id = public.current_teacher_id()
  or classroom_id in (
    select id from public.classrooms where teacher_id = public.current_teacher_id()
  )
);

drop policy if exists "temp_dev_students_update" on public.students;
create policy "students_update_admin"
on public.students
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- classrooms --------------------------------------------------------------
drop policy if exists "temp_dev_classrooms_select" on public.classrooms;
create policy "classrooms_select_scoped"
on public.classrooms
for select
to authenticated
using (public.is_admin() or teacher_id = public.current_teacher_id());

drop policy if exists "temp_dev_classrooms_insert" on public.classrooms;
create policy "classrooms_insert_admin"
on public.classrooms
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "temp_dev_classrooms_update" on public.classrooms;
create policy "classrooms_update_admin"
on public.classrooms
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- schedules --------------------------------------------------------------
drop policy if exists "temp_dev_schedules_select" on public.schedules;
create policy "schedules_select_scoped"
on public.schedules
for select
to authenticated
using (public.is_admin() or teacher_id = public.current_teacher_id());

drop policy if exists "temp_dev_schedules_insert" on public.schedules;
create policy "schedules_insert_admin"
on public.schedules
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "temp_dev_schedules_update" on public.schedules;
create policy "schedules_update_admin"
on public.schedules
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- schedule_students --------------------------------------------------------------
drop policy if exists "temp_dev_schedule_students_select" on public.schedule_students;
create policy "schedule_students_select_scoped"
on public.schedule_students
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.schedules s
    where s.id = schedule_students.schedule_id
      and s.teacher_id = public.current_teacher_id()
  )
);

drop policy if exists "temp_dev_schedule_students_insert" on public.schedule_students;
create policy "schedule_students_insert_admin"
on public.schedule_students
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "temp_dev_schedule_students_update" on public.schedule_students;
create policy "schedule_students_update_admin"
on public.schedule_students
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- lesson_logs / lesson_log_students / student_lesson_ledger /
-- lesson_log_student_reviews: select-only, scoped via the parent lesson
-- log's teacher_id. Writes stay RPC-only via the hardened
-- submit_lesson_attendance (security definer bypasses these policies).
drop policy if exists "temp_dev_lesson_logs_select" on public.lesson_logs;
create policy "lesson_logs_select_scoped"
on public.lesson_logs
for select
to authenticated
using (public.is_admin() or teacher_id = public.current_teacher_id());

drop policy if exists "temp_dev_lesson_log_students_select" on public.lesson_log_students;
create policy "lesson_log_students_select_scoped"
on public.lesson_log_students
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.lesson_logs l
    where l.id = lesson_log_students.lesson_log_id
      and l.teacher_id = public.current_teacher_id()
  )
);

drop policy if exists "temp_dev_student_lesson_ledger_select" on public.student_lesson_ledger;
create policy "student_lesson_ledger_select_scoped"
on public.student_lesson_ledger
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.lesson_logs l
    where l.id = student_lesson_ledger.lesson_log_id
      and l.teacher_id = public.current_teacher_id()
  )
);

drop policy if exists "temp_dev_lesson_log_student_reviews_select" on public.lesson_log_student_reviews;
create policy "lesson_log_student_reviews_select_scoped"
on public.lesson_log_student_reviews
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.lesson_logs l
    where l.id = lesson_log_student_reviews.lesson_log_id
      and l.teacher_id = public.current_teacher_id()
  )
);

-- student_admin_ledger: select-only, scoped like students.
drop policy if exists "temp_dev_student_admin_ledger_select" on public.student_admin_ledger;
create policy "student_admin_ledger_select_scoped"
on public.student_admin_ledger
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1 from public.students st
    where st.id = student_admin_ledger.student_id
      and (
        st.teacher_id = public.current_teacher_id()
        or st.classroom_id in (
          select id from public.classrooms where teacher_id = public.current_teacher_id()
        )
      )
  )
);

-- admin_activity_logs: admin-only, matching the admin-gated Activity Log
-- section. No insert/update policy — writes stay RPC-only
-- (record_admin_activity), immutable history.
drop policy if exists "temp_dev_admin_activity_logs_select" on public.admin_activity_logs;
create policy "admin_activity_logs_select_admin"
on public.admin_activity_logs
for select
to authenticated
using (public.is_admin());

-- leads: admin-only, matching the admin-gated Leads/Sales Pipeline section.
drop policy if exists "temp_dev_leads_select" on public.leads;
drop policy if exists "temp_dev_leads_insert" on public.leads;
drop policy if exists "temp_dev_leads_update" on public.leads;
create policy "leads_select_admin"
on public.leads
for select
to authenticated
using (public.is_admin());
create policy "leads_insert_admin"
on public.leads
for insert
to authenticated
with check (public.is_admin());
create policy "leads_update_admin"
on public.leads
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
