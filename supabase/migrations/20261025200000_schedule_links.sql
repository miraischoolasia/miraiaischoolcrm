-- Each weekly lesson can carry its own Facebook group and fixed Zoom link.
--
-- EduHero runs every weekly lesson (weekday + time + teacher) with its own FB
-- group and its own fixed Zoom meeting, while one CRM class holds several
-- teachers' lessons. So the links live on the schedule; classrooms.zoom_link
-- stays the class-wide fallback. Mirai leaves both empty.
--
-- Read/write follow the existing schedules policies (the lesson's teacher,
-- staff who may view/edit classes, assistants and substitutes).

alter table public.schedules
  add column if not exists fb_group_url text,
  add column if not exists zoom_link text;

alter table public.schedules drop constraint if exists schedules_fb_group_url_http;
alter table public.schedules
  add constraint schedules_fb_group_url_http
  check (fb_group_url is null or fb_group_url ~* '^https?://\S+$');

alter table public.schedules drop constraint if exists schedules_zoom_link_http;
alter table public.schedules
  add constraint schedules_zoom_link_http
  check (zoom_link is null or zoom_link ~* '^https?://\S+$');

comment on column public.schedules.fb_group_url is
  'Facebook group of this weekly lesson (notices and links for its families).';
comment on column public.schedules.zoom_link is
  'Fixed Zoom link of this weekly lesson, used when the CRM has not made a meeting for the day. '
  'It carries the passcode: only the school and the lesson''s own families see it.';
