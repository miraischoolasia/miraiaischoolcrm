-- Checks for 20261101210000_galleries.sql (Media > Galleries). Runs on the local test database (never the live one);
-- it rolls back.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/galleries.sql

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

create function pg_temp.fails(p_sql text, p_pattern text, p_name text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm ~* p_pattern then
      raise notice 'PASS %', p_name;
      return;
    end if;
    raise exception 'FAIL % (wrong error: %)', p_name, sqlerrm;
  end;
  raise exception 'FAIL % (no error)', p_name;
end;
$$;

create function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;

-- A file "uploaded" to storage (the page does it through the Storage API).
create function pg_temp.stored(p_path text, p_bytes bigint, p_mime text) returns void language sql as $$
  insert into storage.objects (bucket_id, name, metadata)
  values ('gallery-files', p_path, jsonb_build_object('size', p_bytes, 'mimetype', p_mime));
$$;

insert into auth.users (id, email, aud, role)
values ('00000000-0000-0000-0000-0000000000a1', 'test_gal_admin@example.test', 'authenticated', 'authenticated'),
       ('00000000-0000-0000-0000-0000000000b2', 'test_gal_viewer@example.test', 'authenticated', 'authenticated'),
       ('00000000-0000-0000-0000-0000000000c3', 'test_gal_none@example.test', 'authenticated', 'authenticated');
insert into public.teachers (id, full_name, username, role, auth_user_id, is_active, permissions)
overriding system value
values (990001, 'Gal Admin', 'test_gal_admin', 'admin', '00000000-0000-0000-0000-0000000000a1', true, '{}'),
       (990002, 'Gal Viewer', 'test_gal_viewer', 'staff', '00000000-0000-0000-0000-0000000000b2', true, '{"galleries":{"level":"view"}}'),
       (990003, 'No Ticks', 'test_gal_none', 'staff', '00000000-0000-0000-0000-0000000000c3', true, '{}');

select pg_temp.ok(public.valid_account_permissions('{"galleries":{"level":"edit","delete":true}}'), 'the Galleries tick is a known tick');
select pg_temp.ok((public.gallery_settings() ->> 'max_file_mb')::numeric = 50 and (public.gallery_settings() ->> 'quota_mb')::numeric = 1000,
  'by default: 50 MB a file, 1000 MB in all');
select pg_temp.ok((select public from storage.buckets where id = 'gallery-files'), 'the bucket is public to read (addresses are random)');
select pg_temp.ok(public.gallery_blocked_name('page.HTML') and public.gallery_blocked_name('x.svg') and not public.gallery_blocked_name('photo.jpg'),
  'web pages and programs are blocked');

-- 1. Folders and files ---------------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select public.gallery_add_folder('Photos', null) as photos \gset
select public.gallery_add_folder('2026', :photos) as y2026 \gset
reset role;
select pg_temp.stored('aaaa/class.jpg', 300000, 'image/jpeg');
select pg_temp.stored('bbbb/notes.pdf', 2000000, 'application/pdf');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select public.gallery_add_file('aaaa/class.jpg', 'Class photo.jpg', :y2026) as photo \gset
select public.gallery_add_file('bbbb/notes.pdf', 'Notes.pdf', null) as notes \gset
reset role;
select pg_temp.ok((select kind = 'image' and size_bytes = 300000 and uploaded_by_name = 'Gal Admin' and folder_id = :y2026
  from public.gallery_files where id = :photo), 'a file is kept with its real size, kind and who uploaded it');
select pg_temp.ok((select kind = 'document' from public.gallery_files where id = :notes), 'a PDF is a document');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select pg_temp.fails($$select public.gallery_add_file('nope/x.jpg', 'x.jpg', null)$$, 'did not arrive', 'a file that was not uploaded is refused');
select public.gallery_rename('file', :photo, 'Class photo Oct.jpg');
select public.gallery_move(array[:notes]::bigint[], '{}', :photos);
select pg_temp.fails(format('select public.gallery_move(%L, %L, %s)', '{}', array[:photos]::bigint[], :y2026), 'inside itself',
  'a folder cannot go inside itself');
reset role;
select pg_temp.ok((select name = 'Class photo Oct.jpg' from public.gallery_files where id = :photo), 'renamed');
select pg_temp.ok((select folder_id = :photos from public.gallery_files where id = :notes), 'moved');

-- 2. Limits ---------------------------------------------------------------------------------------------------
select pg_temp.stored('cccc/big.mp4', 60 * 1048576, 'video/mp4');
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select pg_temp.fails($$select public.gallery_add_file('cccc/big.mp4', 'big.mp4', null)$$, 'larger than 50 MB', 'a file over the largest size is refused');
select public.set_gallery_settings('{"max_file_mb": 100, "quota_mb": 50}');
select pg_temp.fails($$select public.gallery_add_file('cccc/big.mp4', 'big.mp4', null)$$, 'Galleries is full', 'over the space: refused, with what to do');
select pg_temp.fails($$select public.set_gallery_settings('{"warn_percent": 5}')$$, '10 to 100', 'a limit out of range is refused');
select pg_temp.ok((public.gallery_usage() ->> 'used_bytes')::bigint = 2300000, 'the space used counts every file');
reset role;

-- 3. Who may --------------------------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b2');
set local role authenticated;
select pg_temp.ok((select count(*) from public.gallery_files) = 2, 'a viewer sees the files');
select pg_temp.fails($$select public.gallery_add_folder('Mine', null)$$, 'may edit Galleries', 'a viewer cannot add');
select pg_temp.fails(format('select public.gallery_trash(%L, %L)', array[:notes]::bigint[], '{}'), 'delete tick', 'a viewer cannot delete');
reset role;
select pg_temp.login('00000000-0000-0000-0000-0000000000c3');
set local role authenticated;
select pg_temp.ok((select count(*) from public.gallery_files) = 0, 'without the tick: nothing to see');
select pg_temp.ok(public.gallery_usage() is null, 'and no space figures');
reset role;

-- 4. The Bin --------------------------------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select public.gallery_trash('{}', array[:photos]::bigint[]);
reset role;
select pg_temp.ok((select count(*) from public.gallery_folders where deleted_at is not null) = 2
  and (select count(*) from public.gallery_files where deleted_at is not null) = 2,
  'a folder goes to the Bin with its folders and files');
select pg_temp.ok((select deleted_by_name = 'Gal Admin' from public.gallery_files where id = :photo), 'with who deleted it');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select public.gallery_restore('{}', array[:photos]::bigint[]);
reset role;
select pg_temp.ok((select count(*) from public.gallery_files where deleted_at is null) = 2
  and (select folder_id = :y2026 from public.gallery_files where id = :photo),
  'restored together, in its own folder');

select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
set local role authenticated;
select public.gallery_trash(array[:notes]::bigint[], '{}');
select public.gallery_forget(array[:photo, :notes]::bigint[], '{}');
reset role;
select pg_temp.ok(not exists (select 1 from public.gallery_files where id = :notes), 'deleted forever from the Bin');
select pg_temp.ok(exists (select 1 from public.gallery_files where id = :photo), 'something not in the Bin is not deleted forever');

rollback;
