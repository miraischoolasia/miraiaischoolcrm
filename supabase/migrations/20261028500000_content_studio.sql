-- Content Studio, phase 1 (Marketing > Content Studio / Content Library).
--
-- An admin or marketer writes a brief (what to promote, key points, who for, the call to action, a PDF's
-- text and pictures), picks styles, angles, sizes and how many; the `content-generate` function asks the AI
-- for a plan: one row per post with its headline, subheadline, words on the poster, caption (Malaysian
-- Chinese) and a picture description. Rows can be changed, removed or added to ("a few more"). A reviewer
-- approves or rejects each row; approved rows show in the Content Library, where staff claim one to post
-- on their own social media (copy the caption now; the pictures come in phase 2). Each post can be claimed
-- by at most N people (the school's setting, default 3) and everybody sees how many have claimed it.
--
-- Every school has its own database, so everything here is that school's own (white-label): its voice,
-- banned words, must-have details, styles, angles, limits and AI provider. Styles and angles are hidden,
-- never deleted.
--
-- Ticks (My Team): content_studio = write briefs, make plans, review (view = look only);
--                  content_library = see approved posts and claim them.
--
-- Tables
--   content_studio_settings  one row: voice, banned words, must-have lines, claim limit, daily AI limit,
--                            text and picture AI provider (gemini now; openai later)
--   content_styles           look of the posts: name, description, reference pictures
--   content_angles           what the post argues: name, description, example headlines
--   content_briefs           one campaign's material and choices
--   content_items            the plan rows (draft / approved / rejected)
--   content_claims           who claimed which approved post, when
--   content_ai_usage         every AI call: who, what, how many rows, which model, whether it worked
-- Files: the private content-files bucket (style reference pictures, a brief's PDFs and pictures).

-- ---------------------------------------------------------------------------------------------------------
-- 1. The two new ticks. Same as 20261026000000_teams_permissions.sql with content_studio and
--    content_library added to the list of pages.
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.valid_account_permissions(p jsonb)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(p) = 'object' and not exists (
    select 1
    from jsonb_each(p) as e(module, value)
    where e.module not in (
        'calendar', 'classrooms', 'students', 'leads', 'forms', 'activity', 'team_replies',
        'inbox', 'automations', 'ai_knowledge', 'videos', 'questions', 'app_logins', 'packages',
        'class_settings', 'staff_hours', 'content_studio', 'content_library'
      )
      or jsonb_typeof(e.value) <> 'object'
      or coalesce(e.value ->> 'level', '') not in ('view', 'edit')
      or (e.value ? 'delete' and jsonb_typeof(e.value -> 'delete') <> 'boolean')
      or (e.value -> 'delete' = 'true'::jsonb and e.value ->> 'level' <> 'edit')
      -- Seen, never changed (Content Library: seeing it is what lets a person claim a post).
      or (e.module in ('activity', 'team_replies', 'staff_hours', 'content_library')
          and (e.value ->> 'level' <> 'view' or e.value -> 'delete' = 'true'::jsonb))
      -- Whose rows: only where the page has rows that belong to someone.
      or (e.value ? 'scope' and (
        jsonb_typeof(e.value -> 'scope') <> 'string'
        or case
          when e.module in ('leads', 'inbox') then e.value ->> 'scope' not in ('all', 'own_unassigned', 'own')
          when e.module = 'team_replies' then e.value ->> 'scope' not in ('all', 'own')
          else e.value ->> 'scope' <> 'all'
        end
      ))
      -- Only these keys.
      or exists (select 1 from jsonb_object_keys(e.value) k where k not in ('level', 'delete', 'scope'))
  );
$$;

-- Whoever may write briefs or claim posts sees the school's settings, styles and angles.
create or replace function public.can_see_content()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('content_studio') or public.has_permission('content_library');
$$;

revoke all on function public.can_see_content() from public, anon;
grant execute on function public.can_see_content() to authenticated;

create or replace function public.content_studio_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 2. Settings (one row).
-- ---------------------------------------------------------------------------------------------------------

create table public.content_studio_settings (
  id smallint primary key default 1 check (id = 1),
  -- How the school talks, for the AI ("friendly, like a teacher in the parents' group").
  voice text not null default '' check (char_length(voice) <= 2000),
  -- Words the AI must never use; a row that still has one is marked on the plan.
  banned_words text[] not null default '{}'
    check (cardinality(banned_words) <= 100 and array_position(banned_words, null) is null),
  -- Lines every caption must carry (WhatsApp number, website); added to the end when the AI left one out.
  must_include text[] not null default '{}'
    check (cardinality(must_include) <= 10 and array_position(must_include, null) is null),
  -- How many people may claim one post.
  claim_limit integer not null default 3 check (claim_limit between 1 and 100),
  -- Most plan rows (and, in phase 2, pictures) the AI may make in one day (Malaysia time) for the school.
  daily_limit integer not null default 60 check (daily_limit between 1 and 2000),
  text_provider text not null default 'gemini' check (text_provider in ('gemini', 'openai')),
  image_provider text not null default 'gemini' check (image_provider in ('gemini', 'openai')),
  updated_at timestamptz not null default now(),
  updated_by bigint references public.teachers (id) on delete set null
);

insert into public.content_studio_settings (id, voice)
values (
  1,
  '亲切、口语化的马来西亚华文，像老师在家长群里讲话；可以自然夹一点大马常用的英文词（class、trial、slot、online）。'
  || '不夸大、不吓家长、不说别家坏话。价钱用 RM。'
)
on conflict (id) do nothing;

alter table public.content_studio_settings enable row level security;

create policy content_studio_settings_select_permitted
on public.content_studio_settings
for select to authenticated
using ((select public.can_see_content()));
-- Written only through save_content_studio_settings().

-- Voice, banned words and must-have lines: whoever may edit Content Studio. The claim limit, the daily
-- limit and the AI providers cost money or change what staff may do: an admin only.
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
    where k not in ('voice', 'banned_words', 'must_include', 'claim_limit', 'daily_limit', 'text_provider', 'image_provider')
  ) then
    raise exception 'Content Studio settings are not valid.';
  end if;
  if (p ?| array['claim_limit', 'daily_limit', 'text_provider', 'image_provider']) and not public.is_admin() then
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
  if p ? 'text_provider' then v_row.text_provider := p ->> 'text_provider'; end if;
  if p ? 'image_provider' then v_row.image_provider := p ->> 'image_provider'; end if;

  update public.content_studio_settings
  set voice = v_row.voice,
      banned_words = v_row.banned_words,
      must_include = v_row.must_include,
      claim_limit = v_row.claim_limit,
      daily_limit = v_row.daily_limit,
      text_provider = v_row.text_provider,
      image_provider = v_row.image_provider,
      updated_at = now(),
      updated_by = public.current_teacher_id()
  where id = 1;
end;
$$;

revoke all on function public.save_content_studio_settings(jsonb) from public, anon;
grant execute on function public.save_content_studio_settings(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Styles and angles (each school's own; hidden, never deleted).
-- ---------------------------------------------------------------------------------------------------------

create table public.content_styles (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text not null default '' check (char_length(description) <= 2000),
  -- Files in the content-files bucket (styles/...).
  reference_paths text[] not null default '{}'
    check (cardinality(reference_paths) <= 12 and array_position(reference_paths, null) is null),
  hidden boolean not null default false,
  sort_order integer not null default 0,
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_angles (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text not null default '' check (char_length(description) <= 1000),
  -- One or two example headlines.
  examples text[] not null default '{}'
    check (cardinality(examples) <= 3 and array_position(examples, null) is null),
  hidden boolean not null default false,
  sort_order integer not null default 0,
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger content_styles_touch before update on public.content_styles
for each row execute function public.content_studio_touch();
create trigger content_angles_touch before update on public.content_angles
for each row execute function public.content_studio_touch();

alter table public.content_styles enable row level security;
alter table public.content_angles enable row level security;

create policy content_styles_select_permitted on public.content_styles
for select to authenticated using ((select public.can_see_content()));
create policy content_styles_insert_editor on public.content_styles
for insert to authenticated with check ((select public.has_permission('content_studio', 'edit')));
create policy content_styles_update_editor on public.content_styles
for update to authenticated
using ((select public.has_permission('content_studio', 'edit')))
with check ((select public.has_permission('content_studio', 'edit')));

create policy content_angles_select_permitted on public.content_angles
for select to authenticated using ((select public.can_see_content()));
create policy content_angles_insert_editor on public.content_angles
for insert to authenticated with check ((select public.has_permission('content_studio', 'edit')));
create policy content_angles_update_editor on public.content_angles
for update to authenticated
using ((select public.has_permission('content_studio', 'edit')))
with check ((select public.has_permission('content_studio', 'edit')));

-- A few to start with; the school changes or hides them.
insert into public.content_styles (name, description, sort_order) values
  ('清新卡通', '明亮粉色系、圆角卡片、可爱插画人物或吉祥物，大标题粗体，留白多，适合小学家长。', 10),
  ('真实课堂照片', '真实孩子上课的照片感（专注、开心），上方或下方一条品牌色色块放标题，干净专业。', 20),
  ('大字报优惠', '超大数字和价钱、强烈对比色、少量文字，一眼看到优惠和截止日期。', 30),
  ('简约高级', '白底或浅色底、细线条、少颜色、大量留白，像杂志排版，适合中学生家长。', 40);

insert into public.content_angles (name, description, examples, sort_order) values
  ('家长痛点', '先说出家长最担心的事（成绩跟不上、孩子不专心、没时间陪），再给出我们的办法。',
    array['孩子数学一直跟不上？', '放学回家只顾玩手机？'], 10),
  ('成绩见证', '用真实的进步（分数、老师评语、家长回馈）说话，不夸大。',
    array['3个月，从 C 到 A', '家长说：孩子终于肯开口讲英文了'], 20),
  ('限时优惠', '清楚写出优惠内容、名额和截止日期，制造合理的紧迫感。',
    array['只剩 10 个名额', '本月报名送 1 堂试课'], 30),
  ('老师介绍', '介绍老师的经验、教法和亲切的一面，让家长放心。',
    array['认识一下教了 10 年数学的 Ms Lim', '我们的老师怎样让孩子爱上课堂'], 40),
  ('试课邀请', '邀请家长先带孩子来上一堂试课，降低报名的门槛。',
    array['先试一堂，再决定', '免费试课，孩子喜欢才报名'], 50);

-- ---------------------------------------------------------------------------------------------------------
-- 4. Briefs and plan rows.
-- ---------------------------------------------------------------------------------------------------------

create table public.content_briefs (
  id bigint generated always as identity primary key,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  -- What is promoted, the key points (price, dates, ages), who it is for, what they should do.
  topic text not null default '' check (char_length(topic) <= 4000),
  key_points text not null default '' check (char_length(key_points) <= 4000),
  audience text not null default '' check (char_length(audience) <= 1000),
  call_to_action text not null default '' check (char_length(call_to_action) <= 500),
  -- The words read out of the uploaded PDFs (can be corrected by hand).
  pdf_text text not null default '' check (char_length(pdf_text) <= 30000),
  -- Uploaded files: [{"path": "briefs/...", "name": "flyer.pdf", "type": "application/pdf"}].
  files jsonb not null default '[]'::jsonb
    check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 20),
  style_ids bigint[] not null default '{}' check (cardinality(style_ids) <= 20),
  angle_ids bigint[] not null default '{}' check (cardinality(angle_ids) <= 20),
  item_count integer not null default 6 check (item_count between 1 and 20),
  sizes text[] not null default array['1:1']
    check (cardinality(sizes) between 1 and 4 and sizes <@ array['1:1', '4:5', '9:16', '3:4']),
  -- single = one poster, carousel = several pages, caption = words only.
  kind text not null default 'single' check (kind in ('single', 'carousel', 'caption')),
  carousel_pages integer not null default 5 check (carousel_pages between 2 and 10),
  archived boolean not null default false,
  created_by bigint references public.teachers (id) on delete set null default public.current_teacher_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_items (
  id bigint generated always as identity primary key,
  brief_id bigint not null references public.content_briefs (id) on delete cascade,
  style_id bigint references public.content_styles (id) on delete set null,
  angle_id bigint references public.content_angles (id) on delete set null,
  headline text not null default '' check (char_length(headline) <= 200),
  subheadline text not null default '' check (char_length(subheadline) <= 300),
  -- The other words on the poster; for a carousel one line per page ("第1页：...").
  poster_text text not null default '' check (char_length(poster_text) <= 3000),
  caption text not null default '' check (char_length(caption) <= 4000),
  -- What the picture shows (for the picture AI in phase 2).
  visual text not null default '' check (char_length(visual) <= 2000),
  size text not null default '1:1' check (size in ('1:1', '4:5', '9:16', '3:4')),
  kind text not null default 'single' check (kind in ('single', 'carousel', 'caption')),
  pages integer not null default 1 check (pages between 1 and 10),
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  review_note text not null default '' check (char_length(review_note) <= 500),
  reviewed_by bigint references public.teachers (id) on delete set null,
  reviewed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_items_brief_idx on public.content_items (brief_id, sort_order, id);
create index content_items_status_idx on public.content_items (status, reviewed_at desc);

create trigger content_briefs_touch before update on public.content_briefs
for each row execute function public.content_studio_touch();

-- Who approved or rejected a row, and when, is filled in by the database.
create or replace function public.content_items_review()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      new.reviewed_by := public.current_teacher_id();
      new.reviewed_at := now();
    end if;
  elsif new.status is distinct from old.status then
    if new.status = 'draft' then
      new.reviewed_by := null;
      new.reviewed_at := null;
    else
      new.reviewed_by := public.current_teacher_id();
      new.reviewed_at := now();
    end if;
  else
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;
  return new;
end;
$$;

create trigger content_items_review before insert or update on public.content_items
for each row execute function public.content_items_review();

alter table public.content_briefs enable row level security;
alter table public.content_items enable row level security;

create policy content_briefs_select_permitted on public.content_briefs
for select to authenticated using ((select public.has_permission('content_studio')));
create policy content_briefs_insert_editor on public.content_briefs
for insert to authenticated with check ((select public.has_permission('content_studio', 'edit')));
create policy content_briefs_update_editor on public.content_briefs
for update to authenticated
using ((select public.has_permission('content_studio', 'edit')))
with check ((select public.has_permission('content_studio', 'edit')));
-- A brief is archived, never deleted (its approved posts and claims stay).

-- The library reads approved rows through content_library_items(), not this table.
create policy content_items_select_permitted on public.content_items
for select to authenticated using ((select public.has_permission('content_studio')));
create policy content_items_insert_editor on public.content_items
for insert to authenticated with check ((select public.has_permission('content_studio', 'edit')));
create policy content_items_update_editor on public.content_items
for update to authenticated
using ((select public.has_permission('content_studio', 'edit')))
with check ((select public.has_permission('content_studio', 'edit')));
-- Removing a row from the plan: see section 5 (it needs the claims table).

-- ---------------------------------------------------------------------------------------------------------
-- 5. Claims.
-- ---------------------------------------------------------------------------------------------------------

create table public.content_claims (
  id bigint generated always as identity primary key,
  item_id bigint not null references public.content_items (id) on delete cascade,
  teacher_id bigint not null references public.teachers (id) on delete cascade,
  claimed_at timestamptz not null default now(),
  unique (item_id, teacher_id)
);

create index content_claims_teacher_idx on public.content_claims (teacher_id, claimed_at desc);

alter table public.content_claims enable row level security;

-- Content Studio sees every claim; anybody else only their own. Written only by claim_content_item().
create policy content_claims_select_permitted on public.content_claims
for select to authenticated
using (
  (select public.has_permission('content_studio'))
  or teacher_id = (select public.current_teacher_id())
);

-- A plan row nobody has claimed and that is not in the library can be removed.
create policy content_items_delete_editor on public.content_items
for delete to authenticated
using (
  (select public.has_permission('content_studio', 'edit'))
  and status <> 'approved'
  and not exists (select 1 from public.content_claims c where c.item_id = content_items.id)
);

-- The approved posts, newest first, with how many have claimed each and whether I have.
create or replace function public.content_library_items()
returns table (
  id bigint,
  brief_id bigint,
  brief_title text,
  style_id bigint,
  style_name text,
  angle_id bigint,
  angle_name text,
  headline text,
  subheadline text,
  poster_text text,
  caption text,
  size text,
  kind text,
  pages integer,
  approved_at timestamptz,
  claimed_count integer,
  claim_limit integer,
  my_claimed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me bigint := public.current_teacher_id();
  v_limit integer := coalesce((select s.claim_limit from public.content_studio_settings s where s.id = 1), 3);
begin
  if not public.can_see_content() then
    raise exception 'You may not see the Content Library.';
  end if;
  return query
  select
    i.id, i.brief_id, b.title, i.style_id, st.name, i.angle_id, an.name,
    i.headline, i.subheadline, i.poster_text, i.caption, i.size, i.kind, i.pages, i.reviewed_at,
    (select count(*)::integer from public.content_claims c where c.item_id = i.id),
    v_limit,
    (select c.claimed_at from public.content_claims c where c.item_id = i.id and c.teacher_id = v_me)
  from public.content_items i
  join public.content_briefs b on b.id = i.brief_id
  left join public.content_styles st on st.id = i.style_id
  left join public.content_angles an on an.id = i.angle_id
  where i.status = 'approved'
  order by i.reviewed_at desc nulls last, i.id desc
  limit 500;
end;
$$;

revoke all on function public.content_library_items() from public, anon;
grant execute on function public.content_library_items() to authenticated;

-- Claims one approved post for me. Claiming a post I already have just says so (I can copy it again);
-- a post that has reached the limit cannot be claimed. Rows are locked so two people cannot both take the
-- last place.
create or replace function public.claim_content_item(p_item_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me bigint := public.current_teacher_id();
  v_status text;
  v_limit integer := coalesce((select s.claim_limit from public.content_studio_settings s where s.id = 1), 3);
  v_count integer;
  v_mine timestamptz;
begin
  if v_me is null or not public.has_permission('content_library') then
    raise exception 'You may not claim posts.';
  end if;
  select i.status into v_status from public.content_items i where i.id = p_item_id for update;
  if v_status is null or v_status <> 'approved' then
    raise exception 'This post is not in the library.';
  end if;
  select c.claimed_at into v_mine from public.content_claims c where c.item_id = p_item_id and c.teacher_id = v_me;
  select count(*)::integer into v_count from public.content_claims c where c.item_id = p_item_id;
  if v_mine is not null then
    return jsonb_build_object('already', true, 'claimed_count', v_count, 'claim_limit', v_limit, 'claimed_at', v_mine);
  end if;
  if v_count >= v_limit then
    raise exception 'All places for this post have been claimed.';
  end if;
  insert into public.content_claims (item_id, teacher_id) values (p_item_id, v_me) returning claimed_at into v_mine;
  return jsonb_build_object('already', false, 'claimed_count', v_count + 1, 'claim_limit', v_limit, 'claimed_at', v_mine);
end;
$$;

revoke all on function public.claim_content_item(bigint) from public, anon;
grant execute on function public.claim_content_item(bigint) to authenticated;

-- Who claimed which posts (for Content Studio): the person's name and when.
create or replace function public.content_item_claims(p_item_ids bigint[])
returns table (item_id bigint, teacher_id bigint, teacher_name text, claimed_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('content_studio') then
    raise exception 'You may not see who claimed posts.';
  end if;
  return query
  select c.item_id, c.teacher_id, t.full_name, c.claimed_at
  from public.content_claims c
  join public.teachers t on t.id = c.teacher_id
  where c.item_id = any(coalesce(p_item_ids, '{}'::bigint[]))
  order by c.claimed_at;
end;
$$;

revoke all on function public.content_item_claims(bigint[]) from public, anon;
grant execute on function public.content_item_claims(bigint[]) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 6. AI usage (written by the content-generate function with the service key).
-- ---------------------------------------------------------------------------------------------------------

create table public.content_ai_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  teacher_id bigint references public.teachers (id) on delete set null,
  brief_id bigint references public.content_briefs (id) on delete set null,
  -- plan = the first plan, more = "a few more", read_pdf = words read out of a PDF.
  action text not null check (action in ('plan', 'more', 'read_pdf', 'image')),
  provider text not null default 'gemini',
  model text not null default '',
  -- What counts toward the daily limit: rows made (or 1 for a PDF read; pictures in phase 2).
  units integer not null default 0 check (units >= 0),
  ok boolean not null default true,
  error text check (error is null or char_length(error) <= 300),
  latency_ms integer
);

create index content_ai_usage_created_idx on public.content_ai_usage (created_at desc);

alter table public.content_ai_usage enable row level security;

create policy content_ai_usage_select_permitted on public.content_ai_usage
for select to authenticated using ((select public.has_permission('content_studio')));

-- Units used today (Malaysia time) and the limit.
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
      where u.ok and u.created_at >= (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur')
    ), 0),
    'limit', coalesce((select s.daily_limit from public.content_studio_settings s where s.id = 1), 60)
  );
end;
$$;

revoke all on function public.content_ai_today() from public, anon;
grant execute on function public.content_ai_today() to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 7. Files: a private bucket. Content Studio reads them (signed links); its editors upload and remove.
-- ---------------------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-files',
  'content-files',
  false,
  20971520,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy content_files_select_permitted
on storage.objects
for select to authenticated
using (bucket_id = 'content-files' and (select public.has_permission('content_studio')));

create policy content_files_insert_editor
on storage.objects
for insert to authenticated
with check (bucket_id = 'content-files' and (select public.has_permission('content_studio', 'edit')));

create policy content_files_update_editor
on storage.objects
for update to authenticated
using (bucket_id = 'content-files' and (select public.has_permission('content_studio', 'edit')))
with check (bucket_id = 'content-files' and (select public.has_permission('content_studio', 'edit')));

create policy content_files_delete_editor
on storage.objects
for delete to authenticated
using (bucket_id = 'content-files' and (select public.has_permission('content_studio', 'edit')));
