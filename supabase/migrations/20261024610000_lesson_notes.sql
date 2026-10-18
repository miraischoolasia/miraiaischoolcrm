-- Lesson notes: what the class covered, written by the teacher (often made
-- by the AI assistant from a photo of the book, the board or a worksheet).
-- A note stays with the teacher until they publish it; then the children of
-- that lesson and their parents read it in the app, unless the school turns
-- notes off for that login (app_settings 'student_portal' *_sees.notes;
-- shown when the school has not set it).
--
-- Staff who may see the lesson read the notes; the lesson's teacher (or
-- anyone who may edit classes) writes them through the functions below.

create table if not exists public.class_session_lesson_notes (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.class_sessions (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 8000),
  published_at timestamptz,
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists class_session_lesson_notes_session_idx on public.class_session_lesson_notes (session_id);

alter table public.class_session_lesson_notes enable row level security;
revoke all on public.class_session_lesson_notes from public, anon, authenticated;
grant select on public.class_session_lesson_notes to authenticated;
grant all on public.class_session_lesson_notes to service_role;

drop policy if exists class_session_lesson_notes_select_staff on public.class_session_lesson_notes;
create policy class_session_lesson_notes_select_staff
  on public.class_session_lesson_notes for select to authenticated
  using ((select public.can_see_class_session(session_id)));

-- Saves a note (p_id null = a new one). p_publish true shows it in the app
-- (keeping the first publish time); false keeps it with the teacher.
create or replace function public.save_lesson_note(p_id bigint, p_session_id bigint, p_title text, p_body text, p_publish boolean)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_session bigint := p_session_id;
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
begin
  if p_id is not null then
    select session_id into v_session from public.class_session_lesson_notes where id = p_id;
    if v_session is null then
      raise exception 'Note not found.';
    end if;
  end if;
  if not public.can_run_class_session(v_session) then
    raise exception 'Only this class''s teacher can write its notes.';
  end if;
  if char_length(v_title) not between 1 and 120 then
    raise exception 'Give the note a title (up to 120 characters).';
  end if;
  if char_length(v_body) not between 1 and 8000 then
    raise exception 'Write the note (up to 8000 characters).';
  end if;
  if p_id is null then
    insert into public.class_session_lesson_notes (session_id, title, body, published_at, created_by)
    values (v_session, v_title, v_body, case when coalesce(p_publish, false) then timezone('utc', now()) end, public.current_teacher_id())
    returning id into v_id;
  else
    update public.class_session_lesson_notes
      set title = v_title,
          body = v_body,
          published_at = case when coalesce(p_publish, false) then coalesce(published_at, timezone('utc', now())) end,
          updated_at = timezone('utc', now())
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_lesson_note(bigint, bigint, text, text, boolean) from public, anon;
grant execute on function public.save_lesson_note(bigint, bigint, text, text, boolean) to authenticated;

create or replace function public.delete_lesson_note(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session bigint;
begin
  select session_id into v_session from public.class_session_lesson_notes where id = p_id;
  if v_session is null or not public.can_run_class_session(v_session) then
    raise exception 'Note not found.';
  end if;
  delete from public.class_session_lesson_notes where id = p_id;
end;
$$;

revoke all on function public.delete_lesson_note(bigint) from public, anon;
grant execute on function public.delete_lesson_note(bigint) to authenticated;

-- The published notes of the lessons this child was in (newest first).
create or replace function public.portal_lesson_notes(p_student_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_shown boolean;
begin
  if not public.portal_may_act_for(p_student_id) then
    raise exception 'Not found.';
  end if;
  v_shown := coalesce((
    (select value from public.app_settings where key = 'student_portal')
      -> (case when public.current_student_id() = p_student_id then 'student' else 'parent' end || '_sees')
      ->> 'notes'
  )::boolean, true);
  if not v_shown then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', n.id,
      'session_id', n.session_id,
      'date', cs.lesson_date,
      'class', s.title,
      'title', n.title,
      'body', n.body,
      'published_at', n.published_at
    ) order by cs.lesson_date desc, n.published_at desc)
    from public.class_session_lesson_notes n
    join public.class_sessions cs on cs.id = n.session_id
    join public.schedules s on s.id = cs.schedule_id
    where n.published_at is not null
      and public.is_class_session_student(cs.id, p_student_id)
      and cs.lesson_date >= (timezone('Asia/Kuala_Lumpur', now()))::date - 120
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.portal_lesson_notes(bigint) from public, anon;
grant execute on function public.portal_lesson_notes(bigint) to authenticated;
