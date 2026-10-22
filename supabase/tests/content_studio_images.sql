-- Checks for 20261028900000_content_studio_images.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/content_studio_images.sql

begin;

create function pg_temp.fails(p_sql text, p_pattern text, p_name text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then
      raise notice 'PASS % [%]', p_name, sqlerrm;
      return;
    end if;
    raise exception 'FAIL % (wrong error: %)', p_name, sqlerrm;
  end;
  raise exception 'FAIL % (no error)', p_name;
end;
$$;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000003' || lpad(n::text, 2, '0'))::uuid, 'ci' || n || '@mirai.internal',
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 3) n;

insert into public.teachers (id, full_name, username, role, is_active, auth_user_id, permissions)
overriding system value
values
  (9301, 'CI Marketer', 'ci_marketer', 'staff', true, '00000000-0000-0000-0000-000000000301', '{"content_studio": {"level": "edit"}}'),
  (9302, 'CI Staff', 'ci_staff', 'staff', true, '00000000-0000-0000-0000-000000000302', '{"content_library": {"level": "view"}}'),
  (9303, 'CI Viewer', 'ci_viewer', 'staff', true, '00000000-0000-0000-0000-000000000303', '{"content_studio": {"level": "view"}}');

create function pg_temp.as_user(p_n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000003' || lpad(p_n::text, 2, '0'), true);
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000003' || lpad(p_n::text, 2, '0'), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function pg_temp.as_user(int) to authenticated;
grant execute on function pg_temp.ok(boolean, text) to authenticated;
grant execute on function pg_temp.fails(text, text, text) to authenticated;

update public.content_studio_settings set daily_image_limit = 6;
insert into public.content_briefs (id, title) overriding system value values (9300, 'Camp');
insert into public.content_items (id, brief_id, style_id, headline, caption, kind, pages, status) overriding system value values
  (9311, 9300, (select min(id) from public.content_styles), 'Single', 'C', 'single', 1, 'draft'),
  (9312, 9300, (select min(id) from public.content_styles), 'Carousel', 'C', 'carousel', 3, 'approved'),
  (9313, 9300, null, 'Caption', 'C', 'caption', 1, 'draft');

-- ---- Queueing ----
select pg_temp.as_user(3);
set local role authenticated;
select pg_temp.fails($$ select public.content_queue_images(array[9311], 'draft') $$, 'may not draw', 'view-only Content Studio cannot draw');
reset role;

select pg_temp.as_user(1);
set local role authenticated;
select pg_temp.ok(public.content_queue_images(array[9311, 9312, 9313], 'draft') = 4, 'one picture for the single, three for the carousel pages, none for the caption');
select pg_temp.ok(public.content_queue_images(array[9311], 'draft') = 0, 'a page already waiting is not queued twice');
select pg_temp.ok(public.content_queue_images(array[9311], 'hd') = 0, 'no high quality without a finished picture');
select pg_temp.ok((select count(*) from public.content_images where requested_by = 9301) = 4, 'who asked is kept');
reset role;

-- ---- The drawing function's queue (service side) ----
select pg_temp.ok((public.content_claim_image_job()).item_id = 9311, 'the oldest picture is drawn first');
select pg_temp.ok((public.content_claim_image_job()).page = 1, 'then page 1 of the carousel');
select pg_temp.ok((public.content_claim_image_job()).id is null, 'later carousel pages wait until page 1 is done');
update public.content_images set status = 'done', path = 'images/' || item_id || '/' || id || '.png', finished_at = now() where status = 'working';
select pg_temp.ok((public.content_claim_image_job()).page = 2, 'page 2 goes once page 1 is done');
update public.content_images set started_at = now() - interval '7 minutes' where status = 'working';
select pg_temp.ok((public.content_claim_image_job()).page in (2, 3), 'a stuck picture goes back in the queue');
update public.content_images set status = 'done', path = 'images/' || item_id || '/' || id || '.png', finished_at = now() where status in ('working', 'queued');

-- ---- Changing, choosing, liking, the daily limit ----
select pg_temp.as_user(1);
set local role authenticated;
select pg_temp.ok(
  public.content_edit_image((select id from public.content_images where item_id = 9311 limit 1), '标题大一点') is not null,
  'a finished picture can be changed'
);
select pg_temp.fails($$ select public.content_edit_image((select id from public.content_images where item_id = 9311 order by id limit 1), 'again') $$,
  'already being drawn', 'one change at a time per page');
select pg_temp.fails($$ select public.content_queue_images(array[9312], 'draft') $$, 'picture limit', 'the daily picture limit stops more');
select public.content_choose_image((select id from public.content_images where item_id = 9312 and page = 2 order by id limit 1));
select public.content_choose_image((select id from public.content_images where item_id = 9312 and page = 2 order by id desc limit 1));
select pg_temp.ok((select count(*) from public.content_images where item_id = 9312 and page = 2 and chosen) = 1, 'one chosen picture per page');
select public.content_like_image((select id from public.content_images where item_id = 9312 and page = 1 limit 1), true);
select pg_temp.ok(
  (select 'images/9312/' || (select id from public.content_images where item_id = 9312 and page = 1 limit 1) || '.png' = any(reference_paths)
   from public.content_styles where id = (select min(id) from public.content_styles)),
  'a liked picture becomes a sample of its style'
);
select public.content_like_image((select id from public.content_images where item_id = 9312 and page = 1 limit 1), false);
select pg_temp.ok(
  (select cardinality(reference_paths) = 0 from public.content_styles where id = (select min(id) from public.content_styles)),
  'unliking takes it out again'
);
select pg_temp.ok((public.content_ai_today() ->> 'images_used')::int = 5 and (public.content_ai_today() ->> 'used')::int = 0,
  'pictures count on their own limit, not the post ideas one');
reset role;

-- ---- The Content Library ----
select pg_temp.as_user(2);
set local role authenticated;
select pg_temp.ok((select count(*) from public.content_images) = 0, 'library staff cannot read the picture queue');
select pg_temp.ok((select count(*) from public.content_library_images(array[9311, 9312])) = 3, 'library staff get one picture per page of the approved post only');
select pg_temp.ok(public.content_image_file_in_library('images/9312/1.png') and not public.content_image_file_in_library('images/9311/1.png'),
  'only files of approved posts can be opened from the library');
reset role;

rollback;
