-- Two new details the admin keeps, both optional so nothing changes until they are filled in:
--   * classrooms.zoom_link   the Zoom address of the class, shown on the teacher's page.
--   * students.date_of_birth the child's birth date. The age is worked out from it, so it moves on
--                            by itself every year (students.age stays what the HOA booking said).

alter table public.classrooms
  add column if not exists zoom_link text
  check (zoom_link is null or char_length(zoom_link) <= 500);

alter table public.students
  add column if not exists date_of_birth date
  check (date_of_birth is null or date_of_birth >= date '1990-01-01');

comment on column public.classrooms.zoom_link is 'Zoom address of the class; filled in by the admin.';
comment on column public.students.date_of_birth is 'The child''s birth date; the age is worked out from it.';
