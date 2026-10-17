-- More tools for the live class console.
--
-- 1. Reminding a parent whose child is not in Zoom yet. The words are the
--    school's own (app_settings 'lesson_late_reminder': text with {child},
--    {class}, {time}; after_minutes = when the button shows), set by admin.
--    Each reminder sent is kept (lesson_late_reminders), so the teacher sees
--    it was sent and does not send twice.
-- 2. The lesson's question plan: the teacher lines questions up before class
--    and pops "the next one" in class (class_session_question_plan).
--
-- Staff only, like the rest of the lesson; writes go through the functions.

-- ---------------------------------------------------------------------------
-- Late reminders

insert into public.app_settings (key, value)
values ('lesson_late_reminder', jsonb_build_object(
  'after_minutes', 5,
  'text', 'Hi! {child}''s {class} class started at {time}. Please help {child} join the Zoom from the app. Thank you!'
))
on conflict (key) do nothing;

create or replace function public.set_late_reminder_settings(p_after_minutes integer, p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_text text := btrim(coalesce(p_text, ''));
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the reminder.';
  end if;
  if p_after_minutes is null or p_after_minutes not between 0 and 120 then
    raise exception 'Choose 0 to 120 minutes.';
  end if;
  if char_length(v_text) not between 1 and 1000 then
    raise exception 'Write the reminder (up to 1000 characters).';
  end if;
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('lesson_late_reminder', jsonb_build_object('after_minutes', p_after_minutes, 'text', v_text), timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_late_reminder_settings(integer, text) from public, anon;
grant execute on function public.set_late_reminder_settings(integer, text) to authenticated;

create table if not exists public.lesson_late_reminders (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.class_sessions (id) on delete cascade,
  student_id bigint not null references public.students (id) on delete cascade,
  -- 'inbox' = sent from the school's WhatsApp; 'phone' = opened in the teacher's own WhatsApp.
  sent_via text not null check (sent_via in ('inbox', 'phone')),
  sent_at timestamptz not null default timezone('utc', now()),
  sent_by bigint references public.teachers (id) on delete set null
);

create index if not exists lesson_late_reminders_session_idx on public.lesson_late_reminders (session_id);

alter table public.lesson_late_reminders enable row level security;
revoke all on public.lesson_late_reminders from public, anon, authenticated;
grant select on public.lesson_late_reminders to authenticated;
grant all on public.lesson_late_reminders to service_role;

drop policy if exists lesson_late_reminders_select_staff on public.lesson_late_reminders;
create policy lesson_late_reminders_select_staff
  on public.lesson_late_reminders for select to authenticated
  using ((select public.can_see_class_session(session_id)));

create or replace function public.record_late_reminder(p_session_id bigint, p_student_id bigint, p_sent_via text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_run_class_session(p_session_id) then
    raise exception 'Only this class''s teacher can remind parents.';
  end if;
  if not public.is_class_session_student(p_session_id, p_student_id) then
    raise exception 'That student is not in this lesson.';
  end if;
  if p_sent_via is null or p_sent_via not in ('inbox', 'phone') then
    raise exception 'Say how the reminder was sent.';
  end if;
  insert into public.lesson_late_reminders (session_id, student_id, sent_via, sent_by)
  values (p_session_id, p_student_id, p_sent_via, public.current_teacher_id());
end;
$$;

revoke all on function public.record_late_reminder(bigint, bigint, text) from public, anon;
grant execute on function public.record_late_reminder(bigint, bigint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The lesson's question plan

create table if not exists public.class_session_question_plan (
  session_id bigint not null references public.class_sessions (id) on delete cascade,
  question_id bigint not null references public.questions (id) on delete cascade,
  position integer not null check (position between 1 and 200),
  primary key (session_id, question_id),
  unique (session_id, position)
);

alter table public.class_session_question_plan enable row level security;
revoke all on public.class_session_question_plan from public, anon, authenticated;
grant select on public.class_session_question_plan to authenticated;
grant all on public.class_session_question_plan to service_role;

drop policy if exists class_session_question_plan_select_staff on public.class_session_question_plan;
create policy class_session_question_plan_select_staff
  on public.class_session_question_plan for select to authenticated
  using ((select public.can_see_class_session(session_id)));

-- Replaces the plan with these questions, in this order (an empty list clears it).
create or replace function public.set_class_session_plan(p_session_id bigint, p_question_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids bigint[] := coalesce(p_question_ids, '{}');
begin
  if not public.can_run_class_session(p_session_id) then
    raise exception 'Only this class''s teacher can plan its questions.';
  end if;
  if cardinality(v_ids) > 200 then
    raise exception 'Plan up to 200 questions.';
  end if;
  if (select count(distinct t.qid) from unnest(v_ids) as t (qid)) <> cardinality(v_ids) then
    raise exception 'A question is in the plan twice.';
  end if;
  if exists (
    select 1 from unnest(v_ids) as t (qid)
    where not exists (select 1 from public.questions q where q.id = t.qid and not q.is_archived)
  ) then
    raise exception 'A question in the plan is not in the bank.';
  end if;
  delete from public.class_session_question_plan where session_id = p_session_id;
  insert into public.class_session_question_plan (session_id, question_id, position)
  select p_session_id, entry.qid, entry.ord::integer
  from unnest(v_ids) with ordinality as entry (qid, ord);
end;
$$;

revoke all on function public.set_class_session_plan(bigint, bigint[]) from public, anon;
grant execute on function public.set_class_session_plan(bigint, bigint[]) to authenticated;
