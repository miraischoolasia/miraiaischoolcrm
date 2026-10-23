-- Media > Galleries: the school's shared file library. Staff upload photos, PDFs, videos and other files, keep them in
-- folders, search, rename, move and delete them (deleted = in the Bin, can be restored), and pick them from the Inbox
-- message box, an Automation message step and the Quick reply editor. Each school has its own (its own database).
--
--   * public.gallery_folders / public.gallery_files: the folders (one inside another) and the files. Deleting sets
--     deleted_at (with the batch it was deleted in, so a folder comes back with what was inside); "Delete forever"
--     removes the row after the page removed the file from storage.
--   * bucket gallery-files: public to read (the owner chose it, 2026-10-23): a file's address is random and cannot be
--     listed, so an Automation message or a quick reply can use the same file without a copy. Web pages and
--     programs (html, svg, js, exe ...) cannot be uploaded.
--   * the limits are settings (app_settings 'galleries', the Galleries page): the largest file (50 MB by default, the
--     Supabase Free plan's limit) and the space for all files (1000 MB by default, warned from 80 %). The Bin counts.
--   * the tick 'galleries': view = see and pick, edit = upload, folders, rename, move, delete = Bin and forever.

-- ---------------------------------------------------------------------------------------------------------
-- 1. The tick
-- ---------------------------------------------------------------------------------------------------------

create or replace function pg_temp.patch(p_fn regprocedure, p_label text, p_from text, p_to text)
returns void
language plpgsql
as $$
declare
  v_def text := replace(pg_get_functiondef(p_fn), chr(13), '');
begin
  if position(p_to in v_def) > 0 then
    raise notice '%: already there', p_label;
    return;
  end if;
  if position(p_from in v_def) = 0 then
    raise exception '%: the text to change was not found', p_label;
  end if;
  execute replace(v_def, p_from, p_to);
end;
$$;

select pg_temp.patch(
  'public.valid_account_permissions(jsonb)'::regprocedure,
  'valid_account_permissions: galleries',
  $x$'fee_calculator', 'quality', 'progress_cards', 'quotations'$x$,
  $x$'fee_calculator', 'quality', 'progress_cards', 'quotations', 'galleries'$x$
);

-- ---------------------------------------------------------------------------------------------------------
-- 2. Settings
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.gallery_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('max_file_mb', 50, 'quota_mb', 1000, 'warn_percent', 80)
    || coalesce((select value from public.app_settings where key = 'galleries'), '{}'::jsonb);
$$;

revoke all on function public.gallery_settings() from public, anon;
grant execute on function public.gallery_settings() to authenticated;

create or replace function public.set_gallery_settings(p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb := public.gallery_settings() || coalesce(p_value, '{}'::jsonb);
begin
  if not public.has_permission('galleries', 'delete') then
    raise exception 'Only someone who may delete in Galleries can change its limits.' using errcode = '42501';
  end if;
  if jsonb_typeof(v -> 'max_file_mb') <> 'number' or (v ->> 'max_file_mb')::numeric not between 1 and 5000 then
    raise exception 'The largest file must be 1 to 5000 MB.' using errcode = '22023';
  end if;
  if jsonb_typeof(v -> 'quota_mb') <> 'number' or (v ->> 'quota_mb')::numeric not between 10 and 1000000 then
    raise exception 'The space must be 10 to 1000000 MB.' using errcode = '22023';
  end if;
  if jsonb_typeof(v -> 'warn_percent') <> 'number' or (v ->> 'warn_percent')::numeric not between 10 and 100 then
    raise exception 'The warning must be 10 to 100 %%.' using errcode = '22023';
  end if;
  v := jsonb_build_object('max_file_mb', (v ->> 'max_file_mb')::numeric, 'quota_mb', (v ->> 'quota_mb')::numeric,
    'warn_percent', (v ->> 'warn_percent')::numeric);
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('galleries', v, timezone('utc', now()), public.current_teacher_id())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  return public.gallery_settings();
end;
$$;

revoke all on function public.set_gallery_settings(jsonb) from public, anon;
grant execute on function public.set_gallery_settings(jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Folders and files
-- ---------------------------------------------------------------------------------------------------------

create table if not exists public.gallery_folders (
  id bigint generated always as identity primary key,
  parent_id bigint references public.gallery_folders (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_by bigint references public.teachers (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_batch uuid,
  check (parent_id is null or parent_id <> id)
);

create table if not exists public.gallery_files (
  id bigint generated always as identity primary key,
  folder_id bigint references public.gallery_folders (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 200),
  -- Where it is in the bucket; never changes (renaming or moving changes the row only).
  path text not null unique check (char_length(path) between 3 and 400),
  mime text not null default 'application/octet-stream' check (char_length(mime) <= 200),
  kind text not null check (kind in ('image', 'video', 'audio', 'document')),
  size_bytes bigint not null check (size_bytes >= 0),
  uploaded_by bigint references public.teachers (id) on delete set null,
  uploaded_by_name text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_batch uuid,
  deleted_by_name text
);

create index if not exists gallery_files_folder_idx on public.gallery_files (folder_id) where deleted_at is null;
create index if not exists gallery_folders_parent_idx on public.gallery_folders (parent_id) where deleted_at is null;

alter table public.gallery_folders enable row level security;
alter table public.gallery_files enable row level security;

drop policy if exists gallery_folders_read on public.gallery_folders;
create policy gallery_folders_read on public.gallery_folders
  for select to authenticated using ((select public.has_permission('galleries')));
drop policy if exists gallery_files_read on public.gallery_files;
create policy gallery_files_read on public.gallery_files
  for select to authenticated using ((select public.has_permission('galleries')));

-- Changes go through the functions below.
revoke all on public.gallery_folders, public.gallery_files from anon, authenticated;
grant select on public.gallery_folders, public.gallery_files to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 4. The bucket
-- ---------------------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery-files', 'gallery-files', true, null, null)
on conflict (id) do update set public = excluded.public;

-- A file name the page or a program could run.
create or replace function public.gallery_blocked_name(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(substring(p_name from '\.([A-Za-z0-9]+)$'), '')) in
    ('html', 'htm', 'xhtml', 'svg', 'js', 'mjs', 'exe', 'msi', 'bat', 'cmd', 'sh', 'ps1', 'php', 'apk', 'jar', 'scr', 'com');
$$;

grant execute on function public.gallery_blocked_name(text) to authenticated;

drop policy if exists gallery_files_storage_read on storage.objects;
create policy gallery_files_storage_read on storage.objects
  for select to authenticated
  using (bucket_id = 'gallery-files' and (select public.has_permission('galleries')));
drop policy if exists gallery_files_storage_upload on storage.objects;
create policy gallery_files_storage_upload on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gallery-files' and (select public.has_permission('galleries', 'edit'))
              and not public.gallery_blocked_name(name));
drop policy if exists gallery_files_storage_delete on storage.objects;
create policy gallery_files_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'gallery-files' and (
    (select public.has_permission('galleries', 'delete'))
    -- The one who just uploaded it takes it back when it could not be kept (over a limit).
    or (owner_id = (select auth.uid()::text) and not exists (select 1 from public.gallery_files f where f.path = name))
  ));

-- ---------------------------------------------------------------------------------------------------------
-- 5. Space and the actions
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.gallery_usage()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select public.gallery_settings() || jsonb_build_object(
    'used_bytes', coalesce((select sum(size_bytes) from public.gallery_files), 0),
    'bin_bytes', coalesce((select sum(size_bytes) from public.gallery_files where deleted_at is not null), 0),
    'files', (select count(*) from public.gallery_files where deleted_at is null)
  )
  where public.has_permission('galleries');
$$;

revoke all on function public.gallery_usage() from public, anon;
grant execute on function public.gallery_usage() to authenticated;

create or replace function public.gallery_require(p_action text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('galleries', p_action) then
    raise exception '%', case p_action
      when 'delete' then 'Only someone with the Galleries delete tick can do this.'
      else 'Only someone who may edit Galleries can do this.' end
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.gallery_require(text) from public, anon, authenticated;

-- An uploaded file is kept: its real size is read from storage; over the largest file or the space, it is refused
-- (the page then takes the upload back).
create or replace function public.gallery_add_file(p_path text, p_name text, p_folder_id bigint default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings jsonb := public.gallery_settings();
  v_size bigint;
  v_mime text;
  v_used bigint;
  v_id bigint;
begin
  perform public.gallery_require('edit');
  select coalesce((o.metadata ->> 'size')::bigint, 0), coalesce(o.metadata ->> 'mimetype', 'application/octet-stream')
  into v_size, v_mime
  from storage.objects o
  where o.bucket_id = 'gallery-files' and o.name = p_path;
  if not found then
    raise exception 'The upload did not arrive. Try again.' using errcode = '22023';
  end if;
  if public.gallery_blocked_name(p_name) then
    raise exception 'Web pages and programs cannot be kept in Galleries.' using errcode = '22023';
  end if;
  if v_size > (v_settings ->> 'max_file_mb')::numeric * 1048576 then
    raise exception 'This file is larger than % MB, the largest Galleries keeps.', v_settings ->> 'max_file_mb' using errcode = '22023';
  end if;
  select coalesce(sum(size_bytes), 0) into v_used from public.gallery_files;
  if v_used + v_size > (v_settings ->> 'quota_mb')::numeric * 1048576 then
    raise exception 'Galleries is full (% MB). Empty the Bin or ask an admin for more space.', v_settings ->> 'quota_mb' using errcode = '22023';
  end if;
  if p_folder_id is not null and not exists (select 1 from public.gallery_folders where id = p_folder_id and deleted_at is null) then
    raise exception 'That folder is not there any more.' using errcode = '22023';
  end if;

  insert into public.gallery_files (folder_id, name, path, mime, kind, size_bytes, uploaded_by, uploaded_by_name)
  values (
    p_folder_id, left(btrim(p_name), 200), p_path, left(v_mime, 200),
    case when v_mime like 'image/%' then 'image' when v_mime like 'video/%' then 'video'
         when v_mime like 'audio/%' then 'audio' else 'document' end,
    v_size, public.current_teacher_id(), public.chat_schedule_author()
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.gallery_add_folder(p_name text, p_parent_id bigint default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  perform public.gallery_require('edit');
  if p_parent_id is not null and not exists (select 1 from public.gallery_folders where id = p_parent_id and deleted_at is null) then
    raise exception 'That folder is not there any more.' using errcode = '22023';
  end if;
  insert into public.gallery_folders (parent_id, name, created_by)
  values (p_parent_id, left(btrim(p_name), 120), public.current_teacher_id())
  returning id into v_id;
  return v_id;
end;
$$;

-- p_kind 'file' | 'folder'.
create or replace function public.gallery_rename(p_kind text, p_id bigint, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.gallery_require('edit');
  if char_length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'Write a name.' using errcode = '22023';
  end if;
  if p_kind = 'folder' then
    update public.gallery_folders set name = left(btrim(p_name), 120) where id = p_id;
  else
    update public.gallery_files set name = left(btrim(p_name), 200) where id = p_id;
  end if;
end;
$$;

-- Moves files and folders into p_folder_id (null = the top). A folder cannot go inside itself.
create or replace function public.gallery_move(p_file_ids bigint[], p_folder_ids bigint[], p_to bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.gallery_require('edit');
  if p_to is not null and not exists (select 1 from public.gallery_folders where id = p_to and deleted_at is null) then
    raise exception 'That folder is not there any more.' using errcode = '22023';
  end if;
  if p_to is not null and exists (
    with recursive up as (
      select id, parent_id from public.gallery_folders where id = p_to
      union all
      select f.id, f.parent_id from public.gallery_folders f join up on f.id = up.parent_id
    )
    select 1 from up where up.id = any(coalesce(p_folder_ids, '{}'))
  ) then
    raise exception 'A folder cannot go inside itself.' using errcode = '22023';
  end if;
  update public.gallery_files set folder_id = p_to where id = any(coalesce(p_file_ids, '{}'));
  update public.gallery_folders set parent_id = p_to where id = any(coalesce(p_folder_ids, '{}'));
end;
$$;

-- Into the Bin: the files, and the folders with everything inside them, in one batch.
create or replace function public.gallery_trash(p_file_ids bigint[], p_folder_ids bigint[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch uuid := gen_random_uuid();
  v_who text := public.chat_schedule_author();
begin
  perform public.gallery_require('delete');
  with recursive down as (
    select id from public.gallery_folders where id = any(coalesce(p_folder_ids, '{}')) and deleted_at is null
    union all
    select f.id from public.gallery_folders f join down on f.parent_id = down.id where f.deleted_at is null
  )
  update public.gallery_folders set deleted_at = now(), deleted_batch = v_batch where id in (select id from down);
  update public.gallery_files
  set deleted_at = now(), deleted_batch = v_batch, deleted_by_name = v_who
  where deleted_at is null
    and (id = any(coalesce(p_file_ids, '{}')) or folder_id in (select id from public.gallery_folders where deleted_batch = v_batch));
  return v_batch;
end;
$$;

-- Back from the Bin: what was picked comes back together with everything deleted at the same time (a folder with what
-- was inside it). Something whose folder is still in the Bin comes back at the top.
create or replace function public.gallery_restore(p_file_ids bigint[], p_folder_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batches uuid[];
begin
  perform public.gallery_require('delete');
  select array_agg(distinct b) into v_batches from (
    select deleted_batch b from public.gallery_files where id = any(coalesce(p_file_ids, '{}'))
    union select deleted_batch from public.gallery_folders where id = any(coalesce(p_folder_ids, '{}'))
  ) x where b is not null;
  update public.gallery_folders set deleted_at = null, deleted_batch = null where deleted_batch = any(coalesce(v_batches, '{}'));
  update public.gallery_files set deleted_at = null, deleted_batch = null, deleted_by_name = null
  where deleted_batch = any(coalesce(v_batches, '{}'));
  update public.gallery_files g set folder_id = null
  where g.deleted_at is null and g.folder_id in (select id from public.gallery_folders where deleted_at is not null);
  update public.gallery_folders f set parent_id = null
  where f.deleted_at is null and f.parent_id in (select id from public.gallery_folders where deleted_at is not null);
end;
$$;

-- Delete forever, after the page removed the files from storage: rows of things in the Bin only.
create or replace function public.gallery_forget(p_file_ids bigint[], p_folder_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.gallery_require('delete');
  delete from public.gallery_files where id = any(coalesce(p_file_ids, '{}')) and deleted_at is not null;
  delete from public.gallery_folders f
  where f.id = any(coalesce(p_folder_ids, '{}')) and f.deleted_at is not null
    and not exists (select 1 from public.gallery_files g where g.folder_id = f.id and g.deleted_at is null);
end;
$$;

revoke all on function public.gallery_add_file(text, text, bigint) from public, anon;
revoke all on function public.gallery_add_folder(text, bigint) from public, anon;
revoke all on function public.gallery_rename(text, bigint, text) from public, anon;
revoke all on function public.gallery_move(bigint[], bigint[], bigint) from public, anon;
revoke all on function public.gallery_trash(bigint[], bigint[]) from public, anon;
revoke all on function public.gallery_restore(bigint[], bigint[]) from public, anon;
revoke all on function public.gallery_forget(bigint[], bigint[]) from public, anon;
grant execute on function public.gallery_add_file(text, text, bigint) to authenticated;
grant execute on function public.gallery_add_folder(text, bigint) to authenticated;
grant execute on function public.gallery_rename(text, bigint, text) to authenticated;
grant execute on function public.gallery_move(bigint[], bigint[], bigint) to authenticated;
grant execute on function public.gallery_trash(bigint[], bigint[]) to authenticated;
grant execute on function public.gallery_restore(bigint[], bigint[]) to authenticated;
grant execute on function public.gallery_forget(bigint[], bigint[]) to authenticated;
