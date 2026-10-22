-- Student app chat, phase 1 (docs/app-chat-spec.md, owner's answers 2026-10-22).
--
-- A student (the student's own login, not a parent) writes from the student
-- app to one of their class's teachers (the main teacher and the assistants
-- in classroom_teachers, not the day's substitute) or to their consultant
-- (students.consultant_id). The teacher or consultant answers in the CRM
-- Inbox's "App" tab. Text only; no WhatsApp is sent.
--
-- 1. app_chat_threads: one student x one staff member. Counts of unread
--    messages for each side, kept by a trigger.
-- 2. app_chat_messages: the messages; never edited.
-- 3. Who sees what (row level security):
--    - the student: their own threads;
--    - a teacher or consultant: the threads written to them, whatever their
--      Inbox tick says;
--    - an admin: every thread, to keep students safe, but may only answer
--      threads written to the admin.
--    Nobody writes the tables directly: sending and marking read go through
--    the functions below.
-- 4. Each school turns chat on or off (app_settings 'app_chat' {"enabled"}),
--    off here; the school's admin ticks it in Class Settings > Student app.

-- ---------------------------------------------------------------------------
-- 1-2. Tables

create table public.app_chat_threads (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students (id) on delete cascade,
  staff_id bigint not null references public.teachers (id) on delete cascade,
  -- What the staff member was to the student when the thread began.
  role text not null check (role in ('teacher', 'consultant')),
  last_message_at timestamptz,
  last_preview text,
  last_sender text check (last_sender in ('student', 'staff')),
  unread_for_staff integer not null default 0,
  unread_for_student integer not null default 0,
  staff_read_at timestamptz,
  student_read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (student_id, staff_id)
);

create index app_chat_threads_staff_idx on public.app_chat_threads (staff_id, last_message_at desc);

create table public.app_chat_messages (
  id bigint generated always as identity primary key,
  thread_id bigint not null references public.app_chat_threads (id) on delete cascade,
  sender text not null check (sender in ('student', 'staff')),
  sender_staff_id bigint references public.teachers (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default timezone('utc', now())
);

create index app_chat_messages_thread_idx on public.app_chat_messages (thread_id, id desc);

alter table public.app_chat_threads enable row level security;
alter table public.app_chat_messages enable row level security;
revoke all on public.app_chat_threads, public.app_chat_messages from public, anon, authenticated;
grant select on public.app_chat_threads, public.app_chat_messages to authenticated;
grant all on public.app_chat_threads, public.app_chat_messages to service_role;

-- ---------------------------------------------------------------------------
-- 3. Who sees what

create or replace function public.app_chat_may_read(p_thread_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_chat_threads t
    where t.id = p_thread_id
      and (
        (t.student_id = public.current_student_id())
        or t.staff_id = public.current_teacher_id()
        or public.is_admin()
      )
  );
$$;

revoke all on function public.app_chat_may_read(bigint) from public, anon;
grant execute on function public.app_chat_may_read(bigint) to authenticated;

create policy app_chat_threads_select
  on public.app_chat_threads for select to authenticated
  using (
    student_id = (select public.current_student_id())
    or staff_id = (select public.current_teacher_id())
    or (select public.is_admin())
  );

create policy app_chat_messages_select
  on public.app_chat_messages for select to authenticated
  using (public.app_chat_may_read(thread_id));

-- ---------------------------------------------------------------------------
-- 4. The school's switch

insert into public.app_settings (key, value) values ('app_chat', '{"enabled": false}'::jsonb)
on conflict (key) do nothing;

create or replace function public.app_chat_enabled()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select (value ->> 'enabled')::boolean from public.app_settings where key = 'app_chat'), false);
$$;

revoke all on function public.app_chat_enabled() from public, anon;
grant execute on function public.app_chat_enabled() to authenticated;

create or replace function public.set_app_chat_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can turn the student app chat on or off.';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('app_chat', jsonb_build_object('enabled', coalesce(p_enabled, false)), timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_app_chat_enabled(boolean) from public, anon;
grant execute on function public.set_app_chat_enabled(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Whom a student may write to today: the teachers of each class the student
-- is in today (main teacher and assistants), and the student's consultant.
-- A teacher who is also the consultant is listed once, as the consultant.

create or replace function public.app_chat_contacts_of(p_student_id bigint)
returns table (staff_id bigint, role text, classes text)
language sql
stable
security definer
set search_path = public
as $$
  with today as (
    select (timezone('Asia/Kuala_Lumpur', now()))::date as d
  ),
  my_classes as (
    select s.classroom_id as classroom_id
    from public.students s
    where s.id = p_student_id and s.classroom_id is not null
    union
    select p.classroom_id
    from public.student_classroom_periods p, today
    where p.student_id = p_student_id
      and public.is_in_classroom_on(p_student_id, p.classroom_id, today.d)
  ),
  consultant as (
    select s.consultant_id as staff_id
    from public.students s
    join public.teachers t on t.id = s.consultant_id and t.is_active
    where s.id = p_student_id
  ),
  teachers_of as (
    select ct.teacher_id as staff_id, string_agg(c.name, ', ' order by c.name) as classes
    from my_classes m
    join public.classrooms c on c.id = m.classroom_id
    join public.classroom_teachers ct on ct.classroom_id = m.classroom_id
    join public.teachers t on t.id = ct.teacher_id and t.is_active
    group by ct.teacher_id
  )
  select c.staff_id, 'consultant'::text, null::text from consultant c
  union all
  select t.staff_id, 'teacher'::text, t.classes from teachers_of t
  where t.staff_id not in (select staff_id from consultant);
$$;

revoke all on function public.app_chat_contacts_of(bigint) from public, anon, authenticated;
grant execute on function public.app_chat_contacts_of(bigint) to service_role;

-- The student app's list: everyone the student may write to now, and every
-- older thread (a teacher who no longer teaches the student: read only).
create or replace function public.portal_chat_contacts()
returns table (
  staff_id bigint,
  staff_name text,
  role text,
  classes text,
  can_send boolean,
  thread_id bigint,
  last_message_at timestamptz,
  last_preview text,
  last_sender text,
  unread integer,
  staff_read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_student bigint := public.current_student_id();
begin
  if v_student is null or not public.app_chat_enabled() then
    return;
  end if;

  return query
  with now_contacts as (
    select * from public.app_chat_contacts_of(v_student)
  ),
  people as (
    select n.staff_id, n.role, n.classes, true as can_send from now_contacts n
    union all
    select th.staff_id, th.role, null::text, false
    from public.app_chat_threads th
    where th.student_id = v_student and th.staff_id not in (select n.staff_id from now_contacts n)
  )
  select p.staff_id, t.full_name, p.role, p.classes, p.can_send,
    th.id, th.last_message_at, th.last_preview, th.last_sender,
    coalesce(th.unread_for_student, 0), th.staff_read_at
  from people p
  join public.teachers t on t.id = p.staff_id
  left join public.app_chat_threads th on th.student_id = v_student and th.staff_id = p.staff_id
  order by p.can_send desc, (p.role = 'consultant') desc, th.last_message_at desc nulls last, t.full_name;
end;
$$;

revoke all on function public.portal_chat_contacts() from public, anon;
grant execute on function public.portal_chat_contacts() to authenticated;

-- The student sends a message to a teacher or consultant (starting the thread
-- the first time). Returns the thread.
create or replace function public.portal_chat_send(p_staff_id bigint, p_body text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student bigint := public.current_student_id();
  v_role text;
  v_thread bigint;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_student is null then
    raise exception 'Only a student''s own login can send app messages.';
  end if;
  if not public.app_chat_enabled() then
    raise exception 'The school has not turned on app chat.';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'A message has 1 to 2000 characters.';
  end if;

  select c.role into v_role from public.app_chat_contacts_of(v_student) c where c.staff_id = p_staff_id;
  if v_role is null then
    raise exception 'You can only write to your class''s teachers and your consultant.';
  end if;

  insert into public.app_chat_threads (student_id, staff_id, role)
  values (v_student, p_staff_id, v_role)
  on conflict (student_id, staff_id) do nothing;
  select id into v_thread from public.app_chat_threads where student_id = v_student and staff_id = p_staff_id;

  insert into public.app_chat_messages (thread_id, sender, body) values (v_thread, 'student', v_body);
  return v_thread;
end;
$$;

revoke all on function public.portal_chat_send(bigint, text) from public, anon;
grant execute on function public.portal_chat_send(bigint, text) to authenticated;

-- A teacher or consultant answers a thread written to them. An admin reads
-- every thread but answers only their own.
create or replace function public.app_chat_reply(p_thread_id bigint, p_body text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me bigint := public.current_teacher_id();
  v_body text := btrim(coalesce(p_body, ''));
  v_id bigint;
begin
  if v_me is null then
    raise exception 'Only a staff login can answer app messages.';
  end if;
  if not public.app_chat_enabled() then
    raise exception 'The school has not turned on app chat.';
  end if;
  if not exists (select 1 from public.app_chat_threads where id = p_thread_id and staff_id = v_me) then
    raise exception 'Only the teacher or consultant the student wrote to can answer.';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'A message has 1 to 2000 characters.';
  end if;

  insert into public.app_chat_messages (thread_id, sender, sender_staff_id, body)
  values (p_thread_id, 'staff', v_me, v_body)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.app_chat_reply(bigint, text) from public, anon;
grant execute on function public.app_chat_reply(bigint, text) to authenticated;

-- The student, or the staff member written to, has read the thread. An admin
-- looking at someone else's thread does not mark it read.
create or replace function public.app_chat_mark_read(p_thread_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student bigint := public.current_student_id();
  v_me bigint := public.current_teacher_id();
begin
  if v_student is not null then
    update public.app_chat_threads
    set unread_for_student = 0, student_read_at = timezone('utc', now())
    where id = p_thread_id and student_id = v_student;
  elsif v_me is not null then
    update public.app_chat_threads
    set unread_for_staff = 0, staff_read_at = timezone('utc', now())
    where id = p_thread_id and staff_id = v_me;
  end if;
end;
$$;

revoke all on function public.app_chat_mark_read(bigint) from public, anon;
grant execute on function public.app_chat_mark_read(bigint) to authenticated;

-- The CRM's "App" tab: the threads this login may read, with the student's
-- code and name and the staff member's name (a consultant need not see the
-- Students page to know who wrote).
create or replace function public.app_chat_staff_threads()
returns table (
  thread_id bigint,
  student_id bigint,
  student_name text,
  student_code text,
  staff_id bigint,
  staff_name text,
  role text,
  mine boolean,
  last_message_at timestamptz,
  last_preview text,
  last_sender text,
  unread_for_staff integer,
  student_read_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select th.id, s.id, s.full_name, s.student_code, t.id, t.full_name, th.role,
    th.staff_id = public.current_teacher_id(),
    th.last_message_at, th.last_preview, th.last_sender, th.unread_for_staff, th.student_read_at
  from public.app_chat_threads th
  join public.students s on s.id = th.student_id
  join public.teachers t on t.id = th.staff_id
  where public.current_teacher_id() is not null
    and (th.staff_id = public.current_teacher_id() or public.is_admin())
    and th.last_message_at is not null
  order by th.last_message_at desc;
$$;

revoke all on function public.app_chat_staff_threads() from public, anon;
grant execute on function public.app_chat_staff_threads() to authenticated;

-- ---------------------------------------------------------------------------
-- A new message moves its thread to the top and counts as unread for the
-- other side.

create or replace function public.app_chat_message_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.app_chat_threads
  set last_message_at = new.created_at,
    last_preview = left(new.body, 140),
    last_sender = new.sender,
    -- Writing means having read what came before.
    unread_for_staff = case when new.sender = 'student' then unread_for_staff + 1 else 0 end,
    unread_for_student = case when new.sender = 'staff' then unread_for_student + 1 else 0 end,
    student_read_at = case when new.sender = 'student' then new.created_at else student_read_at end,
    staff_read_at = case when new.sender = 'staff' then new.created_at else staff_read_at end
  where id = new.thread_id;
  return new;
end;
$$;

revoke all on function public.app_chat_message_added() from public, anon, authenticated;

create trigger app_chat_messages_added
after insert on public.app_chat_messages
for each row execute function public.app_chat_message_added();

-- ---------------------------------------------------------------------------
-- Live updates: the student app and the CRM listen to both tables (each
-- login receives only the rows it may read).

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;
  foreach t in array array['app_chat_threads', 'app_chat_messages'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
