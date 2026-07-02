-- One-time production reset requested on 2026-07-02.
-- Preserve Admin accounts and remove all teaching operational data.

begin;

create temporary table teacher_auth_users_to_delete on commit drop as
select auth_user_id
from public.teachers
where role <> 'admin'
  and auth_user_id is not null;

-- Immutable teaching records must be removed before their parent records.
delete from public.lesson_log_student_reviews;
delete from public.lesson_log_students;
delete from public.student_lesson_ledger;
delete from public.lesson_logs;
delete from public.student_admin_ledger;
delete from public.schedule_students;
delete from public.schedules;
delete from public.students;
delete from public.classrooms;

delete from public.teachers
where role <> 'admin';

-- Remove Supabase Auth identities that belonged to deleted Teacher accounts.
delete from auth.users
where id in (
  select auth_user_id
  from teacher_auth_users_to_delete
);

-- Admin accounts remain available after the reset.
update public.teachers
set is_active = true
where role = 'admin';

do $$
begin
  if not exists (select 1 from public.teachers where role = 'admin') then
    raise exception 'Operational reset aborted: no Admin account remains.';
  end if;

  if exists (select 1 from public.teachers where role <> 'admin')
    or exists (select 1 from public.students)
    or exists (select 1 from public.classrooms)
    or exists (select 1 from public.schedules)
    or exists (select 1 from public.lesson_logs) then
    raise exception 'Operational reset verification failed.';
  end if;
end;
$$;

commit;
