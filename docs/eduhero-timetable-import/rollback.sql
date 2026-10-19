-- Undo import_schedules.sql on EduHero. Only rows the import made ('import:eduhero-timetable-2026').
-- A lesson that already has attendance or a class session is KEPT, and so is a new class that
-- already has pupils or lessons (both listed by the last select) - deleting them would delete real records.
begin;

delete from public.schedules s
where s.notes = 'import:eduhero-timetable-2026'
  and not exists (select 1 from public.lesson_logs l where l.schedule_id = s.id)
  and not exists (select 1 from public.class_sessions c where c.schedule_id = s.id);

delete from public.classrooms c
where c.notes = 'import:eduhero-timetable-2026'
  and not exists (select 1 from public.schedules s where s.classroom_id = c.id)
  and not exists (select 1 from public.students st where st.classroom_id = c.id)
  and not exists (select 1 from public.student_classroom_periods p where p.classroom_id = c.id);

select 'lesson kept' as what, id, title from public.schedules where notes = 'import:eduhero-timetable-2026'
union all
select 'class kept', id, name from public.classrooms where notes = 'import:eduhero-timetable-2026';

commit;
-- classroom_teachers rows added for existing classes and the 升级班 program level stay (harmless;
-- remove by hand in Class > Teachers / Class Settings).
