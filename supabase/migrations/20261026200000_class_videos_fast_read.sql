-- Class videos read fast for a teacher.
--
-- The read rule called can_manage_class_videos(classroom_id) once for every
-- video row: on EduHero (4,164 videos) one page of the Videos list took about
-- 6.3 s for a teacher, the whole list (5 pages) timed out. The rule is the
-- same as before, written so each part is worked out once per query instead
-- of once per video (about 6 ms a page, measured read-only on EduHero
-- 2026-10-19, same videos visible for every teacher checked).
--
-- Who sees a video (unchanged): anyone who sees all classes, the Class Videos
-- tick (20261026000000_teams_permissions.sql), the video's own teacher, anyone
-- who may edit classes or manage videos, the class's teachers, and a teacher
-- with their own recordings library for the class.
-- This runs after 20261026000000, so its policy is the one that stays.

-- The classes a teacher has their own recordings library for.
create or replace function public.my_library_classroom_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select l.classroom_id
  from public.classroom_teacher_libraries l
  where l.teacher_id = public.current_teacher_id();
$$;

revoke all on function public.my_library_classroom_ids() from public, anon;
grant execute on function public.my_library_classroom_ids() to authenticated;

drop policy if exists class_videos_select_staff on public.class_videos;
create policy class_videos_select_staff on public.class_videos
  for select to authenticated
  using (
    (select public.can_view_classes())
    or (select public.has_permission('videos'))
    or teacher_id = (select public.current_teacher_id())
    or (select public.can_edit_classes())
    or (select public.has_permission('videos', 'edit'))
    or classroom_id in (select public.my_classroom_ids())
    or classroom_id in (select public.my_library_classroom_ids())
  );
