-- AI analysis of a student (phase 4 of the classroom plan).
--
-- student_ai_reports: every analysis the student-report function wrote, newest
-- last; the page shows the latest one per audience.
--   audience 'teacher' - strengths, what to work on, what to try next lesson
--   audience 'parent'  - the same in a warm note the school can send home
-- report: {summary, strengths[], needs[], next_steps[], message}.
-- Only the function (service role) writes; staff read the reports of the
-- students they can see.
--
-- app_settings 'ai_student_report' (admin, Class Settings > AI analysis):
--   sources       which data the analysis may use (each school decides)
--   language      the language the analysis is written in
--   instructions  the school's own guidance (tone, what to stress, ...)

create table public.student_ai_reports (
  id bigint generated always as identity primary key,
  student_id bigint not null references public.students (id) on delete cascade,
  audience text not null check (audience in ('teacher', 'parent')),
  report jsonb not null,
  language text not null,
  sources jsonb not null default '{}'::jsonb,
  lesson_count integer not null default 0,
  model text,
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index student_ai_reports_student_idx on public.student_ai_reports (student_id, audience, created_at desc);
create index student_ai_reports_created_idx on public.student_ai_reports (created_at);

alter table public.student_ai_reports enable row level security;
revoke all on public.student_ai_reports from public, anon, authenticated;
grant select on public.student_ai_reports to authenticated;
grant all on public.student_ai_reports to service_role;

create policy student_ai_reports_select_scoped
  on public.student_ai_reports for select to authenticated
  using (
    (select public.current_teacher_id()) is not null
    and student_id in (select s.id from public.students s)
  );

insert into public.app_settings (key, value)
values (
  'ai_student_report',
  '{"sources": {"reviews": true, "remarks": true, "attendance": true, "points": true}, "language": "English", "instructions": ""}'::jsonb
)
on conflict (key) do nothing;

create or replace function public.set_ai_report_settings(p_settings jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the AI analysis settings.';
  end if;

  if jsonb_typeof(p_settings) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_settings) k where k not in ('sources', 'language', 'instructions'))
    or jsonb_typeof(p_settings -> 'sources') <> 'object'
    or exists (
      select 1 from jsonb_each(p_settings -> 'sources') e
      where e.key not in ('reviews', 'remarks', 'attendance', 'points') or jsonb_typeof(e.value) <> 'boolean'
    )
    or not exists (select 1 from jsonb_each(p_settings -> 'sources') e where e.value = 'true'::jsonb)
    or char_length(btrim(coalesce(p_settings ->> 'language', ''))) not between 1 and 30
    or char_length(coalesce(p_settings ->> 'instructions', '')) > 1000 then
    raise exception 'AI analysis settings are not valid (pick at least one source, a language, and at most 1000 letters of guidance).';
  end if;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('ai_student_report', p_settings, timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_ai_report_settings(jsonb) from public, anon;
grant execute on function public.set_ai_report_settings(jsonb) to authenticated;
