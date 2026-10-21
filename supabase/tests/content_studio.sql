-- Checks for 20261028500000_content_studio.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/content_studio.sql

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

-- Accounts: 1 admin, 2 marketer (Content Studio edit), 3 staff A (library), 4 staff B (library),
-- 5 staff C (library), 6 staff D (library), 7 staff with nothing.
insert into auth.users (id, email, aud, role, instance_id)
select ('00000000-0000-0000-0000-0000000002' || lpad(n::text, 2, '0'))::uuid, 'cs' || n || '@mirai.internal',
  'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'
from generate_series(1, 7) n;

insert into public.teachers (id, full_name, username, role, is_active, auth_user_id, permissions)
overriding system value
values
  (9201, 'CS Admin', 'cs_admin', 'admin', true, '00000000-0000-0000-0000-000000000201', '{}'),
  (9202, 'CS Marketer', 'cs_marketer', 'staff', true, '00000000-0000-0000-0000-000000000202', '{"content_studio": {"level": "edit"}}'),
  (9203, 'CS A', 'cs_a', 'staff', true, '00000000-0000-0000-0000-000000000203', '{"content_library": {"level": "view"}}'),
  (9204, 'CS B', 'cs_b', 'staff', true, '00000000-0000-0000-0000-000000000204', '{"content_library": {"level": "view"}}'),
  (9205, 'CS C', 'cs_c', 'staff', true, '00000000-0000-0000-0000-000000000205', '{"content_library": {"level": "view"}}'),
  (9206, 'CS D', 'cs_d', 'staff', true, '00000000-0000-0000-0000-000000000206', '{"content_library": {"level": "view"}}'),
  (9207, 'CS None', 'cs_none', 'staff', true, '00000000-0000-0000-0000-000000000207', '{}');

create function pg_temp.as_user(p_n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000002' || lpad(p_n::text, 2, '0'), true);
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000002' || lpad(p_n::text, 2, '0'), 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function pg_temp.as_user(int) to authenticated;
grant execute on function pg_temp.ok(boolean, text) to authenticated;
grant execute on function pg_temp.fails(text, text, text) to authenticated;

select pg_temp.ok(
  not public.valid_account_permissions('{"content_library": {"level": "edit"}}'),
  'Content Library can only be a view tick'
);
select pg_temp.ok(public.valid_account_permissions('{"content_studio": {"level": "edit"}}'), 'Content Studio tick is valid');
select pg_temp.ok((select count(*) from public.content_styles) >= 4 and (select count(*) from public.content_angles) >= 5, 'defaults are there');

-- ---- The marketer writes a brief and a plan ----
select pg_temp.as_user(2);
set local role authenticated;
insert into public.content_briefs (title, style_ids, angle_ids, sizes)
values ('Camp', array[(select min(id) from public.content_styles)], '{}', array['1:1', '9:16']);
select pg_temp.ok((select created_by from public.content_briefs where title = 'Camp') = 9202, 'brief remembers who wrote it');
insert into public.content_items (brief_id, headline, caption)
select id, 'H' || n, 'C' || n from public.content_briefs, generate_series(1, 3) n where title = 'Camp';
update public.content_items set status = 'approved' where headline in ('H1', 'H2');
select pg_temp.ok(
  (select bool_and(reviewed_by = 9202 and reviewed_at is not null) from public.content_items where status = 'approved'),
  'approving fills in who and when'
);
select pg_temp.fails($$ select public.save_content_studio_settings('{"claim_limit": 1}') $$, 'Only an admin', 'marketer cannot change the claim limit');
select public.save_content_studio_settings('{"voice": "亲切", "banned_words": ["保证", " ", "保证"], "must_include": ["WhatsApp 012"]}');
select pg_temp.ok(
  (select banned_words = array['保证'] and must_include = array['WhatsApp 012'] from public.content_studio_settings),
  'marketer saves voice, banned words (cleaned) and must-have lines'
);
reset role;

-- ---- An admin sets the claim limit to 3 (default) ----
select pg_temp.as_user(1);
set local role authenticated;
select public.save_content_studio_settings('{"claim_limit": 3, "daily_limit": 10, "text_provider": "gemini"}');
select pg_temp.ok((select daily_limit from public.content_studio_settings) = 10, 'admin sets the daily limit');
reset role;

-- ---- Staff see only approved posts and claim them ----
select pg_temp.as_user(3);
set local role authenticated;
select pg_temp.ok((select count(*) from public.content_items) = 0, 'library staff cannot read the plan table');
select pg_temp.ok((select count(*) from public.content_briefs) = 0, 'library staff cannot read briefs');
select pg_temp.ok((select count(*) from public.content_library_items()) = 2, 'library staff see the 2 approved posts');
select pg_temp.ok(
  (select (public.claim_content_item((select id from public.content_library_items() where headline = 'H1')) ->> 'claimed_count')::int) = 1,
  'A claims H1'
);
select pg_temp.ok(
  (select (public.claim_content_item((select id from public.content_library_items() where headline = 'H1')) ->> 'already')::boolean),
  'claiming again just says already'
);
select pg_temp.fails($$ insert into public.content_claims (item_id, teacher_id) select id, 9203 from public.content_library_items() where headline = 'H2' $$,
  'row-level security|permission denied', 'claims cannot be written directly');
reset role;

select pg_temp.as_user(4);
set local role authenticated;
select public.claim_content_item((select id from public.content_library_items() where headline = 'H1'));
select pg_temp.ok((select count(*) from public.content_claims) = 1, 'B sees only own claim');
reset role;

select pg_temp.as_user(5);
set local role authenticated;
select public.claim_content_item((select id from public.content_library_items() where headline = 'H1'));
select pg_temp.ok((select claimed_count = 3 and claim_limit = 3 from public.content_library_items() where headline = 'H1'), 'C sees 3/3');
reset role;

select pg_temp.as_user(6);
set local role authenticated;
select pg_temp.fails($$ select public.claim_content_item((select id from public.content_library_items() where headline = 'H1')) $$,
  'All places', 'D cannot claim a full post');
select pg_temp.fails($$ select public.claim_content_item((select max(id) from public.content_library_items()) + 1000) $$,
  'not in the library', 'a post that is not approved cannot be claimed');
reset role;

select pg_temp.as_user(7);
set local role authenticated;
select pg_temp.fails($$ select public.content_library_items() $$, 'may not see', 'staff with no tick cannot open the library');
select pg_temp.ok((select count(*) from public.content_styles) = 0, 'staff with no tick see no styles');
reset role;

-- ---- The marketer sees who claimed; approved or claimed rows cannot be removed ----
select pg_temp.as_user(2);
set local role authenticated;
select pg_temp.ok(
  (select count(*) from public.content_item_claims(array(select id from public.content_items where headline = 'H1'))) = 3,
  'marketer sees the 3 people who claimed H1'
);
delete from public.content_items where headline = 'H1';
select pg_temp.ok((select count(*) from public.content_items where headline = 'H1') = 1, 'an approved post is not removed');
update public.content_items set status = 'rejected' where headline = 'H1';
delete from public.content_items where headline = 'H1';
select pg_temp.ok((select count(*) from public.content_items where headline = 'H1') = 1, 'a claimed post is not removed');
delete from public.content_items where headline = 'H3';
select pg_temp.ok((select count(*) from public.content_items where headline = 'H3') = 0, 'a draft row is removed');
update public.content_items set status = 'draft' where headline = 'H2';
select pg_temp.ok((select reviewed_by is null from public.content_items where headline = 'H2'), 'back to review clears the reviewer');
select pg_temp.ok((select (public.content_ai_today() ->> 'limit')::int) = 10, 'usage today shows the limit');
reset role;

rollback;
