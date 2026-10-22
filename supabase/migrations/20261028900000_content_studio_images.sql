-- Content Studio phase 2: the AI draws the posters.
--
-- Every picture is one row of content_images, a small queue: queued → working → done (or failed). A single
-- poster has one page, a carousel one row per page. The `content-images` function draws them in the
-- background (a few at a time, Gemini now; the provider is the school's setting) and keeps going on its own
-- until the queue is empty, so the team can leave the page.
--
--   * Draft first: quick and cheap. A draft the team likes can be redrawn in high quality (hd), with the
--     draft as the model.
--   * "Draw again" makes a new draft of the same page; "Change it" sends the picture back with a short
--     request ("make the title bigger", "use blue"). Every version is kept; the team chooses which one is
--     used (chosen), else the newest finished one is.
--   * A liked picture is added to its style's sample pictures (at most 12), so the style gets closer to
--     what the school likes.
--   * Pictures count toward their own daily limit (content_studio_settings.daily_image_limit, Malaysia day).
--   * Staff with the Content Library tick can open the pictures of approved posts (to download them).

alter table public.content_studio_settings
  add column daily_image_limit integer not null default 40 check (daily_image_limit between 1 and 1000);

create table public.content_images (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.content_items (id) on delete cascade,
  page integer not null default 1 check (page between 1 and 10),
  quality text not null default 'draft' check (quality in ('draft', 'hd')),
  status text not null default 'queued' check (status in ('queued', 'working', 'done', 'failed')),
  -- What the team asked to change ("Change it"); '' for a plain drawing.
  instruction text not null default '' check (char_length(instruction) <= 500),
  -- The picture this one changes or redraws in high quality.
  parent_id bigint references public.content_images (id) on delete set null,
  -- The file in the content-files bucket (images/<item id>/<id>.png) once done.
  path text check (path is null or path ~ '^images/[0-9]+/[A-Za-z0-9._-]+$'),
  error text check (error is null or char_length(error) <= 300),
  attempts integer not null default 0,
  chosen boolean not null default false,
  liked boolean not null default false,
  model text not null default '',
  requested_by bigint references public.teachers (id) on delete set null default public.current_teacher_id(),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index content_images_queue_idx on public.content_images (status, id) where status in ('queued', 'working');
create index content_images_item_idx on public.content_images (item_id, page, id desc);
create unique index content_images_one_chosen on public.content_images (item_id, page) where chosen;

alter table public.content_images enable row level security;

-- Content Studio sees every picture; changes go through the functions below (and the drawing function,
-- which uses the service key).
create policy content_images_select_permitted on public.content_images
for select to authenticated using ((select public.has_permission('content_studio')));

-- ---------------------------------------------------------------------------------------------------------
-- Asking for pictures.
-- ---------------------------------------------------------------------------------------------------------

-- Pictures drawn (or being drawn) today, Malaysia time.
create or replace function public.content_images_today()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.content_images
  where status <> 'failed'
    and created_at >= (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur');
$$;

revoke all on function public.content_images_today() from public, anon;
grant execute on function public.content_images_today() to authenticated;

create or replace function public.content_check_image_budget(p_wanted integer)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := coalesce((select s.daily_image_limit from public.content_studio_settings s where s.id = 1), 40);
  v_used integer := public.content_images_today();
begin
  if (select s.image_provider from public.content_studio_settings s where s.id = 1) = 'openai' then
    raise exception 'Drawing with OpenAI is not connected yet. An admin can switch the picture AI back to Gemini in Settings.';
  end if;
  if v_used + p_wanted > v_limit then
    raise exception 'Today''s picture limit is reached (% of % used, this needs %). It starts again at midnight, or an admin can raise it in Settings.',
      v_used, v_limit, p_wanted;
  end if;
end;
$$;

revoke all on function public.content_check_image_budget(integer) from public, anon, authenticated;

-- Drafts (or high-quality versions) for these posts: one per page that has no picture waiting or being
-- drawn. A high-quality version redraws the page's current picture. Captions only have no pictures.
-- Returns how many were queued.
create or replace function public.content_queue_images(p_item_ids bigint[], p_quality text default 'draft')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.has_permission('content_studio', 'edit') then
    raise exception 'You may not draw pictures.';
  end if;
  if p_quality not in ('draft', 'hd') then
    raise exception 'Unknown picture quality.';
  end if;

  -- Every page of these posts that has no picture waiting or being drawn; for high quality, only pages
  -- with a finished picture to redraw.
  select count(*) into v_count
  from public.content_items i
  cross join lateral generate_series(1, case when i.kind = 'carousel' then i.pages else 1 end) as g(page)
  where i.id = any(coalesce(p_item_ids, '{}'::bigint[]))
    and i.kind <> 'caption'
    and not exists (
      select 1 from public.content_images q
      where q.item_id = i.id and q.page = g.page and q.status in ('queued', 'working')
    )
    and (
      p_quality = 'draft'
      or exists (select 1 from public.content_images c where c.item_id = i.id and c.page = g.page and c.status = 'done')
    );
  if v_count = 0 then
    return 0;
  end if;
  perform public.content_check_image_budget(v_count);

  insert into public.content_images (item_id, page, quality, parent_id)
  select i.id, g.page, p_quality,
    case when p_quality = 'hd' then (
      select c.id from public.content_images c
      where c.item_id = i.id and c.page = g.page and c.status = 'done'
      order by c.chosen desc, c.id desc limit 1
    ) end
  from public.content_items i
  cross join lateral generate_series(1, case when i.kind = 'carousel' then i.pages else 1 end) as g(page)
  where i.id = any(coalesce(p_item_ids, '{}'::bigint[]))
    and i.kind <> 'caption'
    and not exists (
      select 1 from public.content_images q
      where q.item_id = i.id and q.page = g.page and q.status in ('queued', 'working')
    )
    and (
      p_quality = 'draft'
      or exists (select 1 from public.content_images c where c.item_id = i.id and c.page = g.page and c.status = 'done')
    )
  order by i.id, g.page;
  return v_count;
end;
$$;

revoke all on function public.content_queue_images(bigint[], text) from public, anon;
grant execute on function public.content_queue_images(bigint[], text) to authenticated;

-- "Change it": a new draft of this picture with the team's request.
create or replace function public.content_edit_image(p_image_id bigint, p_instruction text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_image public.content_images;
  v_id bigint;
begin
  if not public.has_permission('content_studio', 'edit') then
    raise exception 'You may not change pictures.';
  end if;
  if char_length(btrim(coalesce(p_instruction, ''))) not between 1 and 500 then
    raise exception 'Say what to change (up to 500 letters).';
  end if;
  select * into v_image from public.content_images where id = p_image_id;
  if v_image.id is null or v_image.status <> 'done' then
    raise exception 'Only a finished picture can be changed.';
  end if;
  if exists (
    select 1 from public.content_images q
    where q.item_id = v_image.item_id and q.page = v_image.page and q.status in ('queued', 'working')
  ) then
    raise exception 'This page is already being drawn. Wait for it to finish.';
  end if;
  perform public.content_check_image_budget(1);
  insert into public.content_images (item_id, page, quality, instruction, parent_id)
  values (v_image.item_id, v_image.page, 'draft', btrim(p_instruction), v_image.id)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.content_edit_image(bigint, text) from public, anon;
grant execute on function public.content_edit_image(bigint, text) to authenticated;

-- The picture used for its page (the others are kept).
create or replace function public.content_choose_image(p_image_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_image public.content_images;
begin
  if not public.has_permission('content_studio', 'edit') then
    raise exception 'You may not choose pictures.';
  end if;
  select * into v_image from public.content_images where id = p_image_id;
  if v_image.id is null or v_image.status <> 'done' then
    raise exception 'Only a finished picture can be chosen.';
  end if;
  update public.content_images set chosen = false where item_id = v_image.item_id and page = v_image.page and chosen;
  update public.content_images set chosen = true where id = p_image_id;
end;
$$;

revoke all on function public.content_choose_image(bigint) from public, anon;
grant execute on function public.content_choose_image(bigint) to authenticated;

-- 👍: the picture becomes one of its style's sample pictures (newest kept, at most 12); 👍 again removes it.
create or replace function public.content_like_image(p_image_id bigint, p_liked boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_image public.content_images;
  v_style bigint;
  v_paths text[];
begin
  if not public.has_permission('content_studio', 'edit') then
    raise exception 'You may not do that.';
  end if;
  select * into v_image from public.content_images where id = p_image_id;
  if v_image.id is null or v_image.status <> 'done' or v_image.path is null then
    raise exception 'Only a finished picture can be liked.';
  end if;
  update public.content_images set liked = p_liked where id = p_image_id;
  select i.style_id into v_style from public.content_items i where i.id = v_image.item_id;
  if v_style is null then
    return;
  end if;
  select array_remove(s.reference_paths, v_image.path) into v_paths from public.content_styles s where s.id = v_style;
  if p_liked then
    v_paths := v_paths || v_image.path;
    if cardinality(v_paths) > 12 then
      v_paths := v_paths[cardinality(v_paths) - 11 : cardinality(v_paths)];
    end if;
  end if;
  update public.content_styles set reference_paths = v_paths where id = v_style;
end;
$$;

revoke all on function public.content_like_image(bigint, boolean) from public, anon;
grant execute on function public.content_like_image(bigint, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- The drawing function's side (service key only).
-- ---------------------------------------------------------------------------------------------------------

-- The next picture to draw, marked as being drawn. A carousel's later pages wait until page 1 of the same
-- post is done, so they can follow its look. A picture stuck "being drawn" for 6 minutes goes back in the
-- queue (3 tries in all).
create or replace function public.content_claim_image_job()
returns public.content_images
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.content_images;
begin
  update public.content_images
  set status = case when attempts >= 3 then 'failed' else 'queued' end,
      error = case when attempts >= 3 then 'Drawing took too long three times.' else error end,
      finished_at = case when attempts >= 3 then now() else finished_at end
  where status = 'working' and started_at < now() - interval '6 minutes';

  select q.* into v_job
  from public.content_images q
  where q.status = 'queued'
    and (
      q.page = 1
      or not exists (
        select 1 from public.content_images first
        where first.item_id = q.item_id and first.page = 1 and first.status in ('queued', 'working')
      )
    )
  order by q.id
  limit 1
  for update skip locked;

  if v_job.id is null then
    return null;
  end if;
  update public.content_images
  set status = 'working', started_at = now(), attempts = attempts + 1
  where id = v_job.id
  returning * into v_job;
  return v_job;
end;
$$;

revoke all on function public.content_claim_image_job() from public, anon, authenticated;
grant execute on function public.content_claim_image_job() to service_role;

-- ---------------------------------------------------------------------------------------------------------
-- The Content Library: the pictures of approved posts.
-- ---------------------------------------------------------------------------------------------------------

-- Per approved post and page: the chosen picture, else the newest finished one (high quality first).
create or replace function public.content_library_images(p_item_ids bigint[])
returns table (item_id bigint, page integer, path text, quality text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.can_see_content() then
    raise exception 'You may not see the Content Library.';
  end if;
  return query
  select distinct on (c.item_id, c.page) c.item_id, c.page, c.path, c.quality
  from public.content_images c
  join public.content_items i on i.id = c.item_id
  where c.item_id = any(coalesce(p_item_ids, '{}'::bigint[]))
    and c.status = 'done'
    and c.path is not null
    and (i.status = 'approved' or public.has_permission('content_studio'))
  order by c.item_id, c.page, c.chosen desc, (c.quality = 'hd') desc, c.id desc;
end;
$$;

revoke all on function public.content_library_images(bigint[]) from public, anon;
grant execute on function public.content_library_images(bigint[]) to authenticated;

-- Whether this file is a picture of an approved post (Content Library staff may open those).
create or replace function public.content_image_file_in_library(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_name ~ '^images/[0-9]+/' and exists (
    select 1 from public.content_items i
    where i.id = split_part(p_name, '/', 2)::bigint and i.status = 'approved'
  );
$$;

revoke all on function public.content_image_file_in_library(text) from public, anon;
grant execute on function public.content_image_file_in_library(text) to authenticated;

create policy content_files_select_library_images
on storage.objects
for select to authenticated
using (
  bucket_id = 'content-files'
  and (select public.has_permission('content_library'))
  and public.content_image_file_in_library(name)
);

-- Pictures are one more kind of AI use in the log (action 'image' is already allowed).

-- The settings now also take the daily picture limit (an admin's, like the other limits). Same as in
-- 20261028500000_content_studio.sql otherwise.
create or replace function public.save_content_studio_settings(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.content_studio_settings;
begin
  if not public.has_permission('content_studio', 'edit') then
    raise exception 'You may not change the Content Studio settings.';
  end if;
  if jsonb_typeof(p) <> 'object' or exists (
    select 1 from jsonb_object_keys(p) k
    where k not in ('voice', 'banned_words', 'must_include', 'claim_limit', 'daily_limit', 'daily_image_limit', 'text_provider', 'image_provider')
  ) then
    raise exception 'Content Studio settings are not valid.';
  end if;
  if (p ?| array['claim_limit', 'daily_limit', 'daily_image_limit', 'text_provider', 'image_provider']) and not public.is_admin() then
    raise exception 'Only an admin can change the limits or the AI provider.';
  end if;

  select * into v_row from public.content_studio_settings where id = 1 for update;
  if not found then
    insert into public.content_studio_settings (id) values (1) returning * into v_row;
  end if;

  if p ? 'voice' then
    if jsonb_typeof(p -> 'voice') <> 'string' then raise exception 'Content Studio settings are not valid.'; end if;
    v_row.voice := btrim(p ->> 'voice');
  end if;
  if p ? 'banned_words' then
    if jsonb_typeof(p -> 'banned_words') <> 'array'
      or exists (select 1 from jsonb_array_elements(p -> 'banned_words') x where jsonb_typeof(x) <> 'string') then
      raise exception 'Content Studio settings are not valid.';
    end if;
    v_row.banned_words := array(
      select distinct btrim(x) from jsonb_array_elements_text(p -> 'banned_words') x where btrim(x) <> ''
    );
  end if;
  if p ? 'must_include' then
    if jsonb_typeof(p -> 'must_include') <> 'array'
      or exists (select 1 from jsonb_array_elements(p -> 'must_include') x where jsonb_typeof(x) <> 'string') then
      raise exception 'Content Studio settings are not valid.';
    end if;
    v_row.must_include := array(
      select btrim(x) from jsonb_array_elements_text(p -> 'must_include') with ordinality as t(x, n)
      where btrim(x) <> '' order by n
    );
  end if;
  if p ? 'claim_limit' then v_row.claim_limit := (p ->> 'claim_limit')::integer; end if;
  if p ? 'daily_limit' then v_row.daily_limit := (p ->> 'daily_limit')::integer; end if;
  if p ? 'daily_image_limit' then v_row.daily_image_limit := (p ->> 'daily_image_limit')::integer; end if;
  if p ? 'text_provider' then v_row.text_provider := p ->> 'text_provider'; end if;
  if p ? 'image_provider' then v_row.image_provider := p ->> 'image_provider'; end if;

  update public.content_studio_settings
  set voice = v_row.voice,
      banned_words = v_row.banned_words,
      must_include = v_row.must_include,
      claim_limit = v_row.claim_limit,
      daily_limit = v_row.daily_limit,
      daily_image_limit = v_row.daily_image_limit,
      text_provider = v_row.text_provider,
      image_provider = v_row.image_provider,
      updated_at = now(),
      updated_by = public.current_teacher_id()
  where id = 1;
end;
$$;

revoke all on function public.save_content_studio_settings(jsonb) from public, anon;
grant execute on function public.save_content_studio_settings(jsonb) to authenticated;

-- Post ideas used today: pictures have their own limit (content_images_today), so they are left out here.
-- Same as in 20261028500000_content_studio.sql otherwise.
create or replace function public.content_ai_today()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('content_studio') then
    raise exception 'You may not see the AI usage.';
  end if;
  return jsonb_build_object(
    'used', coalesce((
      select sum(u.units)::integer from public.content_ai_usage u
      where u.ok and u.action <> 'image'
        and u.created_at >= (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur')
    ), 0),
    'limit', coalesce((select s.daily_limit from public.content_studio_settings s where s.id = 1), 60),
    'images_used', public.content_images_today(),
    'images_limit', coalesce((select s.daily_image_limit from public.content_studio_settings s where s.id = 1), 40)
  );
end;
$$;

revoke all on function public.content_ai_today() from public, anon;
grant execute on function public.content_ai_today() to authenticated;
