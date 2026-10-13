-- A teacher sees the students who were ever in a class they teach.
--
-- Since lesson rosters go by day (20261007010000_class_membership_history),
-- a lesson from before a student left still includes them. The class
-- teacher could not see that student any more (they only saw students in
-- their classes today), so the attendance form left them out and the
-- server refused it ("Attendance must include every student ..."). This
-- happened with Branson See in TUE Coding Class C004 on 15 Sep.
--
-- my_former_class_student_ids() is security definer so the students policy
-- does not loop through the student_classroom_periods policy (which itself
-- looks at students).

create or replace function public.my_former_class_student_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.student_id
  from public.student_classroom_periods p
  join public.classrooms c on c.id = p.classroom_id
  where c.teacher_id = public.current_teacher_id();
$$;

revoke all on function public.my_former_class_student_ids() from public, anon;
grant execute on function public.my_former_class_student_ids() to authenticated;

drop policy if exists students_select_scoped on public.students;
create policy students_select_scoped
  on public.students
  for select
  to authenticated
  using (
    (select public.can_view_classes())
    or teacher_id = (select public.current_teacher_id())
    or classroom_id in (
      select c.id from public.classrooms c
      where c.teacher_id = (select public.current_teacher_id())
    )
    or id in (select public.my_former_class_student_ids())
  );
