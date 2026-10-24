-- Class effects and the class look.
--
-- 1. class_fx: the school's library of class effects the teacher can play
--    from the live class console (sounds, background music, stickers, light
--    animations). The built-in ones ship with the apps (file_url is a path in
--    the app, e.g. /fx/applause.mp3); a school's own files will come from
--    Galleries (gallery_file_id, linked once Galleries is live). Only admin
--    manage the library (rename, hide, add); every staff login may read it.
--    Children never read it: what to play reaches their class page over the
--    lesson's Realtime channel.
-- 2. class_fx_favorites: each teacher's own buttons on the console (up to 8).
-- 3. set_class_look: the student class page's look per school
--    (app_settings 'class_look'): colours, font, corner size and which set of
--    icons / stickers. No setting = the look the app has today.

create table if not exists public.class_fx (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('sound', 'bgm', 'sticker', 'animation')),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  -- A path in the apps (built-in) or a public file address (school's own).
  file_url text check (file_url is null or char_length(file_url) <= 1000),
  -- Shown when there is no picture yet (stickers) or as the button's face.
  emoji text check (emoji is null or char_length(emoji) <= 16),
  -- Built-in effects: a fixed key (the animations are drawn by the apps from it).
  builtin_key text unique,
  gallery_file_id bigint,
  default_volume numeric(3, 2) not null default 0.8 check (default_volume between 0 and 1),
  sort integer not null default 0,
  hidden boolean not null default false,
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (kind = 'animation' or file_url is not null or (kind = 'sticker' and emoji is not null))
);

create index if not exists class_fx_kind_sort_idx on public.class_fx (kind, sort);

alter table public.class_fx enable row level security;
revoke all on public.class_fx from public, anon, authenticated;
grant select, insert, update on public.class_fx to authenticated;
grant all on public.class_fx to service_role;

create policy class_fx_select_staff
  on public.class_fx for select to authenticated
  using (public.current_teacher_id() is not null);

create policy class_fx_insert_admin
  on public.class_fx for insert to authenticated
  with check (public.is_admin());

-- Hide instead of delete: there is no delete grant.
create policy class_fx_update_admin
  on public.class_fx for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create table if not exists public.class_fx_favorites (
  teacher_id bigint not null references public.teachers (id) on delete cascade,
  fx_id bigint not null references public.class_fx (id) on delete cascade,
  position integer not null default 0,
  primary key (teacher_id, fx_id)
);

alter table public.class_fx_favorites enable row level security;
revoke all on public.class_fx_favorites from public, anon, authenticated;
grant select, insert, update, delete on public.class_fx_favorites to authenticated;
grant all on public.class_fx_favorites to service_role;

create policy class_fx_favorites_own
  on public.class_fx_favorites for all to authenticated
  using (teacher_id = public.current_teacher_id())
  with check (teacher_id = public.current_teacher_id());

-- At most 8 buttons on a teacher's panel.
create or replace function public.class_fx_favorites_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.class_fx_favorites where teacher_id = new.teacher_id) >= 8 then
    raise exception 'At most 8 effects on the panel. Take one off first.';
  end if;
  return new;
end;
$$;

drop trigger if exists class_fx_favorites_limit on public.class_fx_favorites;
create trigger class_fx_favorites_limit
  before insert on public.class_fx_favorites
  for each row execute function public.class_fx_favorites_limit();

-- The built-in effects (the files ship in both apps under /fx/). Sounds and
-- music are placeholders made by us; the owner listens and replaces them.
insert into public.class_fx (kind, name, file_url, emoji, builtin_key, default_volume, sort)
values
  ('sound', 'Applause', '/fx/applause.mp3', '👏', 'applause', 0.8, 10),
  ('sound', 'Correct', '/fx/correct.mp3', '✅', 'correct', 0.8, 20),
  ('sound', 'Oops', '/fx/oops.mp3', '🙈', 'oops', 0.7, 30),
  ('sound', 'Drum roll', '/fx/drumroll.mp3', '🥁', 'drumroll', 0.8, 40),
  ('sound', 'Wow', '/fx/wow.mp3', '😮', 'wow', 0.8, 50),
  ('sound', 'Boing', '/fx/boing.mp3', '🤪', 'boing', 0.8, 60),
  ('sound', 'Tick tock', '/fx/ticktock.mp3', '⏱️', 'ticktock', 0.7, 70),
  ('sound', 'Fanfare', '/fx/fanfare.mp3', '🏆', 'fanfare', 0.8, 80),
  ('bgm', 'Calm focus', '/fx/bgm-calm.mp3', '🎧', 'bgm_calm', 0.35, 110),
  ('bgm', 'Happy game', '/fx/bgm-game.mp3', '🎮', 'bgm_game', 0.35, 120),
  ('bgm', 'Countdown', '/fx/bgm-countdown.mp3', '⏳', 'bgm_countdown', 0.35, 130),
  ('sticker', 'Great job', null, '👍', 'sticker_great', 0.8, 210),
  ('sticker', 'Awesome', null, '🌟', 'sticker_awesome', 0.8, 220),
  ('sticker', 'Love it', null, '💖', 'sticker_love', 0.8, 230),
  ('sticker', 'Haha', null, '🤣', 'sticker_haha', 0.8, 240),
  ('sticker', 'Wow', null, '😲', 'sticker_wow', 0.8, 250),
  ('sticker', 'Shh', null, '🤫', 'sticker_shh', 0.8, 260),
  ('sticker', 'You can do it', null, '💪', 'sticker_cheer', 0.8, 270),
  ('sticker', 'Level up', null, '🚀', 'sticker_rocket', 0.8, 280),
  ('animation', 'Confetti', null, '🎊', 'anim_confetti', 0.8, 310),
  ('animation', 'Fireworks', null, '🎆', 'anim_fireworks', 0.8, 320),
  ('animation', 'Star rain', null, '✨', 'anim_stars', 0.8, 330),
  ('animation', 'Balloons', null, '🎈', 'anim_balloons', 0.8, 340)
on conflict (builtin_key) do nothing;

-- The class look (app_settings 'class_look'). Admin only. Keys:
--   theme: which picture set (letters, digits, dashes), e.g. 'eduhero'
--   primary, accent, background: #rrggbb
--   font: a font name (letters, digits, spaces, dashes)
--   radius: corner size in pixels, 0-32
--   mascot: true / false
create or replace function public.set_class_look(p_look jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admin can change the class look.';
  end if;
  if jsonb_typeof(p_look) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_look) k where k not in ('theme', 'primary', 'accent', 'background', 'font', 'radius', 'mascot'))
    or (p_look ? 'theme' and coalesce(p_look ->> 'theme', '') !~ '^[a-z0-9-]{1,30}$')
    or (p_look ? 'primary' and coalesce(p_look ->> 'primary', '') !~ '^#[0-9a-fA-F]{6}$')
    or (p_look ? 'accent' and coalesce(p_look ->> 'accent', '') !~ '^#[0-9a-fA-F]{6}$')
    or (p_look ? 'background' and coalesce(p_look ->> 'background', '') !~ '^#[0-9a-fA-F]{6}$')
    or (p_look ? 'font' and coalesce(p_look ->> 'font', '') !~ '^[A-Za-z0-9 -]{1,40}$')
    or (p_look ? 'radius' and (jsonb_typeof(p_look -> 'radius') <> 'number' or (p_look ->> 'radius')::numeric not between 0 and 32))
    or (p_look ? 'mascot' and jsonb_typeof(p_look -> 'mascot') <> 'boolean') then
    raise exception 'The class look is not valid.';
  end if;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('class_look', p_look, timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update
    set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.set_class_look(jsonb) from public, anon;
grant execute on function public.set_class_look(jsonb) to authenticated;
