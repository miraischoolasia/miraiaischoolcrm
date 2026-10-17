-- A class can have several teachers (the EduHero recordings LMS had videos
-- from several teachers in one subject). classrooms.teacher_id stays the main
-- teacher; classroom_teachers lists everyone who teaches the class, the main
-- teacher included. A teacher sees every class they teach and its students,
-- not only the classes where they are the main teacher.

create table public.classroom_teachers (
  classroom_id bigint not null references public.classrooms (id) on delete cascade,
  teacher_id bigint not null references public.teachers (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (classroom_id, teacher_id)
);

create index classroom_teachers_teacher_idx on public.classroom_teachers (teacher_id);

alter table public.classroom_teachers enable row level security;
revoke all on public.classroom_teachers from public, anon, authenticated;
grant select on public.classroom_teachers to authenticated;
grant all on public.classroom_teachers to service_role;

-- Every staff login may see who teaches which class (as with the classes list itself).
create policy classroom_teachers_select_staff
  on public.classroom_teachers for select to authenticated
  using ((select public.current_teacher_id()) is not null);

-- Staff accounts do not teach (same rule as a class's main teacher).
create trigger classroom_teachers_ensure_teaching_account
before insert or update of teacher_id on public.classroom_teachers
for each row execute function public.ensure_teaching_account();

-- Who teaches now: each class's main teacher, and each teacher with their own
-- recordings library for a class.
insert into public.classroom_teachers (classroom_id, teacher_id)
select c.id, c.teacher_id from public.classrooms c
join public.teachers t on t.id = c.teacher_id and t.role <> 'staff'
where c.teacher_id is not null
on conflict do nothing;

insert into public.classroom_teachers (classroom_id, teacher_id)
select l.classroom_id, l.teacher_id from public.classroom_teacher_libraries l
join public.teachers t on t.id = l.teacher_id and t.role <> 'staff'
on conflict do nothing;

-- The main teacher is always one of the class's teachers; a main teacher who is
-- replaced stops teaching the class (as before, when a class had one teacher).
create or replace function public.sync_main_classroom_teacher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.teacher_id is not null and old.teacher_id is distinct from new.teacher_id then
    delete from public.classroom_teachers where classroom_id = new.id and teacher_id = old.teacher_id;
  end if;
  if new.teacher_id is not null then
    insert into public.classroom_teachers (classroom_id, teacher_id) values (new.id, new.teacher_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_main_classroom_teacher() from public, anon, authenticated;

create trigger classrooms_sync_main_teacher
after insert or update of teacher_id on public.classrooms
for each row execute function public.sync_main_classroom_teacher();

-- A teacher given their own recordings library for a class teaches it.
create or replace function public.library_teacher_teaches()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.classroom_teachers (classroom_id, teacher_id)
  select new.classroom_id, new.teacher_id
  where exists (select 1 from public.teachers t where t.id = new.teacher_id and t.role <> 'staff')
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.library_teacher_teaches() from public, anon, authenticated;

create trigger classroom_teacher_libraries_teaches
after insert or update on public.classroom_teacher_libraries
for each row execute function public.library_teacher_teaches();

-- The classes this login teaches.
create or replace function public.my_classroom_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select ct.classroom_id from public.classroom_teachers ct where ct.teacher_id = public.current_teacher_id()
  union
  select c.id from public.classrooms c where c.teacher_id = public.current_teacher_id();
$$;

revoke all on function public.my_classroom_ids() from public, anon;
grant execute on function public.my_classroom_ids() to authenticated;

-- An admin (or whoever may edit classes) sets a class's teachers. The main
-- teacher stays main while still listed; otherwise the first one listed
-- becomes main (or none).
create or replace function public.set_classroom_teachers(p_classroom_id bigint, p_teacher_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids bigint[] := coalesce(array(select distinct unnest(p_teacher_ids)), '{}');
  v_main bigint;
begin
  if not public.can_edit_classes() then
    raise exception 'Only staff who may edit classes can change a class''s teachers.';
  end if;
  if not exists (select 1 from public.classrooms where id = p_classroom_id) then
    raise exception 'Class not found.';
  end if;
  if exists (select 1 from unnest(v_ids) u(tid) where not exists (select 1 from public.teachers t where t.id = u.tid and t.role <> 'staff')) then
    raise exception 'Only teaching accounts can teach a class.';
  end if;

  delete from public.classroom_teachers where classroom_id = p_classroom_id and teacher_id <> all (v_ids);
  insert into public.classroom_teachers (classroom_id, teacher_id)
  select p_classroom_id, u.tid from unnest(v_ids) u(tid)
  on conflict do nothing;

  select teacher_id into v_main from public.classrooms where id = p_classroom_id;
  if v_main is null or v_main <> all (v_ids) then
    update public.classrooms
    set teacher_id = (select u.tid from unnest(p_teacher_ids) with ordinality u(tid, n) order by u.n limit 1)
    where id = p_classroom_id;
  end if;
end;
$$;

revoke all on function public.set_classroom_teachers(bigint, bigint[]) from public, anon;
grant execute on function public.set_classroom_teachers(bigint, bigint[]) to authenticated;

-- What a teacher may see now follows every class they teach.
create or replace function public.my_former_class_student_ids()
returns setof bigint
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.student_id
  from public.student_classroom_periods p
  where p.classroom_id in (select public.my_classroom_ids());
$$;

create or replace function public.can_manage_class_videos(p_classroom_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_classes()
    or p_classroom_id in (select public.my_classroom_ids())
    or exists (
      select 1 from public.classroom_teacher_libraries l
      where l.classroom_id = p_classroom_id and l.teacher_id = public.current_teacher_id()
    );
$$;

drop policy classrooms_select_scoped on public.classrooms;
create policy classrooms_select_scoped
  on public.classrooms for select to authenticated
  using (
    (select public.can_view_classes())
    or id in (select public.my_classroom_ids())
  );

drop policy students_select_scoped on public.students;
create policy students_select_scoped
  on public.students for select to authenticated
  using (
    (select public.can_view_classes())
    or teacher_id = (select public.current_teacher_id())
    or classroom_id in (select public.my_classroom_ids())
    or id in (select public.my_former_class_student_ids())
  );

drop policy student_classroom_periods_select_scoped on public.student_classroom_periods;
create policy student_classroom_periods_select_scoped
  on public.student_classroom_periods for select to authenticated
  using (
    (select public.can_view_classes())
    or exists (select 1 from public.students st where st.id = student_classroom_periods.student_id)
    or classroom_id in (select public.my_classroom_ids())
  );

drop policy student_enrollments_select_scoped on public.student_enrollments;
create policy student_enrollments_select_scoped
  on public.student_enrollments for select to authenticated
  using (
    (select public.can_view_classes())
    or exists (
      select 1 from public.students st
      where st.id = student_enrollments.student_id
        and (st.teacher_id = (select public.current_teacher_id()) or st.classroom_id in (select public.my_classroom_ids()))
    )
  );

drop policy student_admin_ledger_select_scoped on public.student_admin_ledger;
create policy student_admin_ledger_select_scoped
  on public.student_admin_ledger for select to authenticated
  using (
    (select public.can_view_classes())
    or exists (
      select 1 from public.students st
      where st.id = student_admin_ledger.student_id
        and (st.teacher_id = (select public.current_teacher_id()) or st.classroom_id in (select public.my_classroom_ids()))
    )
  );
