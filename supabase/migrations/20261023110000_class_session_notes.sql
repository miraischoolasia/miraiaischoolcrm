-- Notes the teacher jots about a child during a live lesson (the class
-- console's "Notes" tool). One note per child per lesson; the attendance form
-- can copy them into each child's lesson remark ("Add class notes").
--
-- Staff only: whoever may see the lesson reads them; the lesson's teacher (or
-- anyone who may edit classes) writes them through save_class_session_note.
-- They are never shown in the student app.

create table if not exists public.class_session_notes (
  session_id bigint not null references public.class_sessions (id) on delete cascade,
  student_id bigint not null references public.students (id) on delete cascade,
  note text not null check (char_length(btrim(note)) between 1 and 2000),
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by bigint references public.teachers (id) on delete set null,
  primary key (session_id, student_id)
);

alter table public.class_session_notes enable row level security;
revoke all on public.class_session_notes from public, anon, authenticated;
grant select on public.class_session_notes to authenticated;
grant all on public.class_session_notes to service_role;

drop policy if exists class_session_notes_select_staff on public.class_session_notes;
create policy class_session_notes_select_staff
  on public.class_session_notes for select to authenticated
  using ((select public.can_see_class_session(session_id)));

-- Saves the note; an empty note removes it.
create or replace function public.save_class_session_note(p_session_id bigint, p_student_id bigint, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := btrim(coalesce(p_note, ''));
begin
  if not public.can_run_class_session(p_session_id) then
    raise exception 'Only this class''s teacher can write notes.';
  end if;
  if not public.is_class_session_student(p_session_id, p_student_id) then
    raise exception 'That student is not in this lesson.';
  end if;
  if char_length(v_note) > 2000 then
    raise exception 'Keep the note under 2000 characters.';
  end if;
  if v_note = '' then
    delete from public.class_session_notes where session_id = p_session_id and student_id = p_student_id;
    return;
  end if;
  insert into public.class_session_notes (session_id, student_id, note, updated_at, updated_by)
  values (p_session_id, p_student_id, v_note, timezone('utc', now()), public.current_teacher_id())
  on conflict (session_id, student_id) do update
    set note = excluded.note, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.save_class_session_note(bigint, bigint, text) from public, anon;
grant execute on function public.save_class_session_note(bigint, bigint, text) to authenticated;
