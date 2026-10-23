-- Each staff member's own screen settings (for example which columns of the Students roster they show, and in which
-- order), kept on their account so they follow them to another computer. Everyone reads and writes only their own rows.

create table if not exists public.user_ui_preferences (
  teacher_id bigint not null default public.current_teacher_id() references public.teachers (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 80),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (teacher_id, key)
);

alter table public.user_ui_preferences enable row level security;

drop policy if exists user_ui_preferences_own on public.user_ui_preferences;
create policy user_ui_preferences_own on public.user_ui_preferences
  for all to authenticated
  using (teacher_id = public.current_teacher_id())
  with check (teacher_id = public.current_teacher_id());

grant select, insert, update, delete on public.user_ui_preferences to authenticated;
