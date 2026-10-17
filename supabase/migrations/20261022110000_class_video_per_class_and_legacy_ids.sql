-- Two small changes for bringing the EduHero recordings LMS into the CRM.
--
-- 1. One Bunny video can belong to several classes (the LMS shared a few
--    videos between subjects), so a video is unique per class, not overall.
-- 2. legacy_ids remembers which CRM row an outside record became (LMS
--    teacher, subject, student, ...), so an import can run again without
--    making anything twice. Only the server reads or writes it.

alter table public.class_videos drop constraint class_videos_bunny_library_id_bunny_video_id_key;
alter table public.class_videos
  add constraint class_videos_classroom_bunny_key unique (classroom_id, bunny_library_id, bunny_video_id);
create index class_videos_bunny_video_idx on public.class_videos (bunny_video_id);

create table public.legacy_ids (
  source text not null check (char_length(source) between 1 and 40),
  kind text not null check (char_length(kind) between 1 and 40),
  legacy_id text not null check (char_length(legacy_id) between 1 and 200),
  crm_id bigint,
  auth_user_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (source, kind, legacy_id)
);

alter table public.legacy_ids enable row level security;
revoke all on public.legacy_ids from public, anon, authenticated;
grant all on public.legacy_ids to service_role;
