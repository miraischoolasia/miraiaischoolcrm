-- Teams, and a tick for every page (docs/teams-permissions-design.md, sections 1-4).
--
-- A team is a group of people with a set of ticks; whoever is in a team gets its ticks. A person can be in
-- several teams. Each account keeps its own ticks too (teachers.permissions), as extra ticks on top.
-- What a person may do is the widest of all of them; an admin may always do everything.
--
-- The total is worked out by the database into teachers.effective_permissions whenever a person's ticks,
-- a team's ticks or the members of a team change, so has_permission() reads one column as before and every
-- rule that already uses it knows about teams without being changed.
--
-- The Leads, Inbox and Team Replies ticks can also say whose rows they cover ("scope"): all, own (assigned
-- to me), or own_unassigned (mine plus those given to nobody; Leads and Inbox only). The scope goes with the
-- action: a person who may see all leads (one team) and edit only their own (another team) sees all and
-- edits their own. The rules that use the scope are in 20261026010000_permission_scopes.sql; here every
-- existing tick means "all", as before. (The class ticks have no scope: without them a teacher already sees
-- only their own classes.)
--
-- New page ticks: inbox, automations, ai_knowledge, videos, questions, app_logins, packages, class_settings,
-- staff_hours. Each account gets the new ticks its current ticks already allowed (Inbox = its Leads tick,
-- App Logins = its Students tick...), so nobody sees or does more or less on the day this goes live.
-- Teams and every tick stay admin-only to change.

-- ---------------------------------------------------------------------------------------------------------
-- 1. Which ticks are valid (personal and team ticks have the same shape).
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
        'class_settings', 'staff_hours'
      )
      or jsonb_typeof(e.value) <> 'object'
      or coalesce(e.value ->> 'level', '') not in ('view', 'edit')
      or (e.value ? 'delete' and jsonb_typeof(e.value -> 'delete') <> 'boolean')
      or (e.value -> 'delete' = 'true'::jsonb and e.value ->> 'level' <> 'edit')
      -- Seen, never changed.
      or (e.module in ('activity', 'team_replies', 'staff_hours')
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

-- ---------------------------------------------------------------------------------------------------------
-- 2. Teams.
-- ---------------------------------------------------------------------------------------------------------

create table public.teams (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  description text check (description is null or char_length(description) <= 300),
  permissions jsonb not null default '{}'::jsonb
    constraint teams_permissions_valid check (public.valid_account_permissions(permissions)),
  -- A team is switched off, never deleted: it then gives nobody anything.
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index teams_name_unique on public.teams (lower(btrim(name)));

create table public.team_members (
  team_id bigint not null references public.teams (id) on delete cascade,
  teacher_id bigint not null references public.teachers (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (team_id, teacher_id)
);

create index team_members_teacher_idx on public.team_members (teacher_id);

comment on table public.teams is
  'Groups of staff with a set of ticks (same shape as teachers.permissions). Admin-only to change.';
comment on table public.team_members is
  'Who is in which team. A person can be in several teams; the widest tick wins.';

create or replace function public.teams_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger teams_touch before update on public.teams
for each row execute function public.teams_touch();

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

-- Every member of staff reads the team names and who is in them (the calendar filters by team); the ticks
-- of a team are not secret either. Students and parents (no teacher row) read nothing.
create policy teams_select_staff on public.teams
  for select to authenticated
  using ((select public.current_teacher_id()) is not null);

create policy team_members_select_staff on public.team_members
  for select to authenticated
  using ((select public.current_teacher_id()) is not null);

-- Changed only through the admin functions below (they also keep the activity log).
revoke all on public.teams, public.team_members from anon;
revoke insert, update, delete on public.teams, public.team_members from authenticated;
grant select on public.teams, public.team_members to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 3. The total of a person's ticks.
-- ---------------------------------------------------------------------------------------------------------

-- Several sets of ticks into one. Per page: the widest scope that gives each action.
--   {"leads": {"level": "edit", "delete": false, "scope": "all", "edit_scope": "own"}}
-- scope = whose rows may be seen, edit_scope / delete_scope = whose rows may be changed / deleted.
create or replace function public.merge_account_permissions(p_sources jsonb[])
returns jsonb
language sql
immutable
set search_path = public
as $$
  with entries as (
    select e.key as module, e.value as v
    from unnest(coalesce(p_sources, '{}'::jsonb[])) as s(src)
    cross join lateral jsonb_each(case when jsonb_typeof(s.src) = 'object' then s.src else '{}'::jsonb end) as e
    where jsonb_typeof(e.value) = 'object' and e.value ->> 'level' in ('view', 'edit')
  ),
  ranked as (
    select
      module,
      case coalesce(v ->> 'scope', 'all') when 'all' then 3 when 'own_unassigned' then 2 when 'own' then 1 else 0 end as r,
      v ->> 'level' = 'edit' as gives_edit,
      v ->> 'level' = 'edit' and v -> 'delete' = 'true'::jsonb as gives_delete
    from entries
  ),
  totals as (
    select
      module,
      max(r) as view_r,
      max(r) filter (where gives_edit) as edit_r,
      max(r) filter (where gives_delete) as delete_r
    from ranked
    where r > 0
    group by module
  ),
  named as (
    select
      module,
      edit_r,
      delete_r,
      (array['own', 'own_unassigned', 'all'])[view_r] as view_scope,
      (array['own', 'own_unassigned', 'all'])[edit_r] as edit_scope,
      (array['own', 'own_unassigned', 'all'])[delete_r] as delete_scope
    from totals
  )
  select coalesce(
    jsonb_object_agg(module, jsonb_strip_nulls(jsonb_build_object(
      'level', case when edit_r is not null then 'edit' else 'view' end,
      'delete', delete_r is not null,
      'scope', view_scope,
      'edit_scope', edit_scope,
      'delete_scope', delete_scope
    ))),
    '{}'::jsonb
  )
  from named;
$$;

-- The ticks of the switched-on teams a person is in.
create or replace function public.team_permissions_of(p_teacher_id bigint)
returns jsonb[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(t.permissions order by t.id), '{}'::jsonb[])
  from public.team_members m
  join public.teams t on t.id = m.team_id
  where m.teacher_id = p_teacher_id and t.is_active;
$$;

alter table public.teachers add column effective_permissions jsonb not null default '{}'::jsonb;

comment on column public.teachers.effective_permissions is
  'Worked out by the database: own ticks (permissions) plus the ticks of every switched-on team. Never written directly.';

-- Whenever an account is written, its total is worked out again (writing the column directly does nothing).
create or replace function public.teachers_effective_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.effective_permissions := public.merge_account_permissions(
    array[coalesce(new.permissions, '{}'::jsonb)] || public.team_permissions_of(new.id)
  );
  return new;
end;
$$;

create trigger teachers_effective_permissions
before insert or update on public.teachers
for each row execute function public.teachers_effective_permissions();

-- Work the totals out again for some people (after a team or its members changed).
create or replace function public.refresh_effective_permissions(p_teacher_ids bigint[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.teachers t
  set effective_permissions = public.merge_account_permissions(
    array[t.permissions] || public.team_permissions_of(t.id)
  )
  where t.id = any(p_teacher_ids)
    and t.effective_permissions is distinct from public.merge_account_permissions(
      array[t.permissions] || public.team_permissions_of(t.id)
    );
$$;

create or replace function public.team_members_refresh()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_effective_permissions(array[old.teacher_id]);
    return old;
  end if;
  perform public.refresh_effective_permissions(array[new.teacher_id]);
  if tg_op = 'UPDATE' and old.teacher_id <> new.teacher_id then
    perform public.refresh_effective_permissions(array[old.teacher_id]);
  end if;
  return new;
end;
$$;

create trigger team_members_refresh
after insert or update or delete on public.team_members
for each row execute function public.team_members_refresh();

create or replace function public.teams_refresh_members()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.permissions is distinct from old.permissions or new.is_active is distinct from old.is_active then
    perform public.refresh_effective_permissions(
      array(select teacher_id from public.team_members where team_id = new.id)
    );
  end if;
  return new;
end;
$$;

create trigger teams_refresh_members
after update on public.teams
for each row execute function public.teams_refresh_members();

revoke all on function public.merge_account_permissions(jsonb[]) from public, anon;
revoke all on function public.team_permissions_of(bigint) from public, anon, authenticated;
revoke all on function public.teachers_effective_permissions() from public, anon, authenticated;
revoke all on function public.refresh_effective_permissions(bigint[]) from public, anon, authenticated;
revoke all on function public.team_members_refresh() from public, anon, authenticated;
revoke all on function public.teams_refresh_members() from public, anon, authenticated;
grant execute on function public.merge_account_permissions(jsonb[]) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 4. The checks read the total. Same names and arguments as before.
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.has_permission(p_module text, p_action text default 'view')
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teachers t
    where t.auth_user_id = auth.uid()
      and t.is_active = true
      and (
        t.role = 'admin'
        or coalesce(case p_action
          when 'view' then t.effective_permissions -> p_module ->> 'level' in ('view', 'edit')
          when 'edit' then t.effective_permissions -> p_module ->> 'level' = 'edit'
          when 'delete' then t.effective_permissions -> p_module ->> 'level' = 'edit'
            and t.effective_permissions -> p_module -> 'delete' = 'true'::jsonb
        end, false)
      )
  );
$$;

-- Whose rows the action covers: 'all', 'own_unassigned', 'own', or null when the action is not allowed.
create or replace function public.permission_scope(p_module text, p_action text default 'view')
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when t.role = 'admin' then 'all'
    when p_action = 'view' and t.effective_permissions -> p_module ->> 'level' in ('view', 'edit')
      then coalesce(t.effective_permissions -> p_module ->> 'scope', 'all')
    when p_action = 'edit' and t.effective_permissions -> p_module ->> 'level' = 'edit'
      then coalesce(t.effective_permissions -> p_module ->> 'edit_scope', 'all')
    when p_action = 'delete' and t.effective_permissions -> p_module ->> 'level' = 'edit'
      and t.effective_permissions -> p_module -> 'delete' = 'true'::jsonb
      then coalesce(t.effective_permissions -> p_module ->> 'delete_scope', 'all')
  end
  from public.teachers t
  where t.auth_user_id = auth.uid() and t.is_active = true;
$$;

revoke all on function public.permission_scope(text, text) from public, anon;
grant execute on function public.permission_scope(text, text) to authenticated;

create or replace function public.has_any_edit_permission()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teachers t
    where t.auth_user_id = auth.uid()
      and t.is_active = true
      and (
        t.role = 'admin'
        or exists (
          select 1 from jsonb_each(t.effective_permissions) as e(module, value)
          where e.value ->> 'level' = 'edit'
        )
      )
  );
$$;

create or replace function public.has_any_permission()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teachers t
    where t.auth_user_id = auth.uid()
      and t.is_active = true
      and (t.role = 'admin' or t.effective_permissions <> '{}'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 5. The new page ticks, copied from what each account's ticks already allowed.
-- ---------------------------------------------------------------------------------------------------------

update public.teachers t
set permissions = t.permissions
  -- The Inbox came with the Leads tick.
  || case when t.permissions ? 'leads' and not t.permissions ? 'inbox'
       then jsonb_build_object('inbox', t.permissions -> 'leads') else '{}'::jsonb end
  -- Automations and AI Knowledge: everyone with Leads looked; only an admin changed them.
  || case when t.permissions ? 'leads' and not t.permissions ? 'automations'
       then '{"automations": {"level": "view"}}'::jsonb else '{}'::jsonb end
  || case when t.permissions ? 'leads' and not t.permissions ? 'ai_knowledge'
       then '{"ai_knowledge": {"level": "view"}}'::jsonb else '{}'::jsonb end
  -- App Logins came with the Students tick.
  || case when t.permissions ? 'students' and not t.permissions ? 'app_logins'
       then jsonb_build_object('app_logins', t.permissions -> 'students') else '{}'::jsonb end
  -- Class Videos came with the Classrooms tick (deleting a video was never part of it).
  || case when t.permissions ? 'classrooms' and not t.permissions ? 'videos'
       then jsonb_build_object('videos', jsonb_build_object('level', t.permissions -> 'classrooms' ->> 'level'))
       else '{}'::jsonb end
where t.permissions ?| array['leads', 'students', 'classrooms'];

-- Every account's total (the trigger works it out; the column itself is ignored).
update public.teachers set effective_permissions = '{}'::jsonb;

-- ---------------------------------------------------------------------------------------------------------
-- 6. The rules of each page follow its own tick. An admin passes every one of them, so nothing an admin
--    did changes; everyone else got the matching tick in step 5.
-- ---------------------------------------------------------------------------------------------------------

-- Replaces text inside a function as it is defined now and defines it again. Stops if the text is not there,
-- so a function that was changed meanwhile is never half-replaced without anyone knowing.
create function pg_temp.regate(p_function text, p_pattern text, p_replacement text)
returns void
language plpgsql
as $$
declare
  r record;
  v_def text;
  v_new text;
  v_found boolean := false;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = p_function
  loop
    v_found := true;
    v_def := pg_get_functiondef(r.oid);
    v_new := regexp_replace(v_def, p_pattern, p_replacement, 'g');
    if v_new = v_def then
      raise exception 'regate: % does not contain %', p_function, p_pattern;
    end if;
    execute v_new;
  end loop;
  if not v_found then
    raise exception 'regate: no function %', p_function;
  end if;
end;
$$;

-- 6a. Inbox (was the Leads tick).
create or replace function public.can_read_inbox(p_inbox_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('inbox', 'view')
    and (
      p_inbox_id is null
      or public.my_whatsapp_inbox_ids() is null
      or p_inbox_id = any(public.my_whatsapp_inbox_ids())
      or not exists (select 1 from public.whatsapp_numbers n where n.chatwoot_inbox_id = p_inbox_id)
    );
$$;

drop policy if exists "Leads tick reads the chats it may see" on public.inbox_chats;
drop policy if exists "Leads tick reads the messages it may see" on public.inbox_messages;

create policy "Inbox tick reads the chats it may see"
  on public.inbox_chats for select to authenticated
  using (
    (select public.has_permission('inbox', 'view'))
    and (
      inbox_id is null
      or (select public.my_whatsapp_inbox_ids()) is null
      or inbox_id = any ((select public.my_whatsapp_inbox_ids())::bigint[])
      or inbox_id <> all (array(select n.chatwoot_inbox_id::bigint from public.whatsapp_numbers n where n.chatwoot_inbox_id is not null))
    )
  );

create policy "Inbox tick reads the messages it may see"
  on public.inbox_messages for select to authenticated
  using (
    (select public.has_permission('inbox', 'view'))
    and (
      inbox_id is null
      or (select public.my_whatsapp_inbox_ids()) is null
      or inbox_id = any ((select public.my_whatsapp_inbox_ids())::bigint[])
      or inbox_id <> all (array(select n.chatwoot_inbox_id::bigint from public.whatsapp_numbers n where n.chatwoot_inbox_id is not null))
    )
  );

drop policy if exists "Leads tick reads the stickers" on public.inbox_stickers;
create policy "Inbox tick reads the stickers" on public.inbox_stickers
  for select to authenticated using ((select public.has_permission('inbox', 'view')));

drop policy if exists whatsapp_numbers_read on public.whatsapp_numbers;
create policy whatsapp_numbers_read on public.whatsapp_numbers
  for select to authenticated
  using ((select public.has_permission('inbox', 'view')) or (select public.has_permission('leads', 'view')));

-- What the Inbox shows beside a chat: either tick reads it.
drop policy if exists lead_channels_select_permitted on public.lead_channels;
create policy lead_channels_select_permitted on public.lead_channels
  for select to authenticated
  using ((select public.has_permission('leads')) or (select public.has_permission('inbox')));

drop policy if exists ai_drafts_select_permitted on public.ai_drafts;
create policy ai_drafts_select_permitted on public.ai_drafts
  for select to authenticated
  using ((select public.has_permission('leads')) or (select public.has_permission('inbox')));

drop policy if exists channel_avatars_select_permitted on public.channel_avatars;
create policy channel_avatars_select_permitted on public.channel_avatars
  for select to authenticated
  using ((select public.has_permission('leads')) or (select public.has_permission('inbox')));

drop policy if exists automation_chat_optouts_select_permitted on public.automation_chat_optouts;
create policy automation_chat_optouts_select_permitted on public.automation_chat_optouts
  for select to authenticated
  using ((select public.has_permission('inbox')) or (select public.has_permission('automations')));

-- Quick replies are written in the Inbox: the school's own ones by whoever may edit Leads or the Inbox,
-- personal ones by their owner.
drop policy if exists quick_replies_select_permitted on public.quick_replies;
drop policy if exists quick_replies_insert_permitted on public.quick_replies;
drop policy if exists quick_replies_update_permitted on public.quick_replies;
drop policy if exists quick_replies_delete_permitted on public.quick_replies;

create policy quick_replies_select_permitted on public.quick_replies
  for select to authenticated
  using (
    ((select public.has_permission('leads')) or (select public.has_permission('inbox')))
    and (owner_id is null or owner_id = (select auth.uid()))
  );

create policy quick_replies_insert_permitted on public.quick_replies
  for insert to authenticated
  with check (
    (owner_id is null and ((select public.has_permission('leads', 'edit')) or (select public.has_permission('inbox', 'edit'))))
    or (owner_id = (select auth.uid()) and ((select public.has_permission('leads')) or (select public.has_permission('inbox'))))
  );

create policy quick_replies_update_permitted on public.quick_replies
  for update to authenticated
  using (
    (owner_id is null and ((select public.has_permission('leads', 'edit')) or (select public.has_permission('inbox', 'edit'))))
    or (owner_id = (select auth.uid()) and ((select public.has_permission('leads')) or (select public.has_permission('inbox'))))
  )
  with check (
    (owner_id is null and ((select public.has_permission('leads', 'edit')) or (select public.has_permission('inbox', 'edit'))))
    or (owner_id = (select auth.uid()) and ((select public.has_permission('leads')) or (select public.has_permission('inbox'))))
  );

create policy quick_replies_delete_permitted on public.quick_replies
  for delete to authenticated
  using (
    (owner_id is null and ((select public.has_permission('leads', 'edit')) or (select public.has_permission('inbox', 'edit'))))
    or (owner_id = (select auth.uid()) and ((select public.has_permission('leads')) or (select public.has_permission('inbox'))))
  );

-- AI drafts are used in the Inbox.
select pg_temp.regate('mark_ai_draft_accepted', 'has_permission\(''leads''', 'has_permission(''inbox''');
select pg_temp.regate('record_ai_draft_sent', 'has_permission\(''leads''', 'has_permission(''inbox''');

-- 6b. Automations (was: Leads to look, admin to change).
do $$
declare
  v_table text;
begin
  foreach v_table in array array['automation_flows', 'automation_contacts', 'automation_settings', 'automation_flow_log', 'automation_optouts'] loop
    execute format('drop policy if exists %I on public.%I', v_table || '_select_permitted', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.has_permission(''automations'')))',
      v_table || '_select_permitted', v_table
    );
  end loop;
  foreach v_table in array array['automation_flows', 'automation_contacts'] loop
    execute format('drop policy if exists %I on public.%I', v_table || '_insert_admin', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_update_admin', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_delete_admin', v_table);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select public.has_permission(''automations'', ''edit'')))',
      v_table || '_insert_permitted', v_table
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select public.has_permission(''automations'', ''edit''))) with check ((select public.has_permission(''automations'', ''edit'')))',
      v_table || '_update_permitted', v_table
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using ((select public.has_permission(''automations'', ''delete'')))',
      v_table || '_delete_permitted', v_table
    );
  end loop;
end;
$$;

drop policy if exists automation_settings_update_admin on public.automation_settings;
create policy automation_settings_update_permitted on public.automation_settings
  for update to authenticated
  using ((select public.has_permission('automations', 'edit')))
  with check ((select public.has_permission('automations', 'edit')));

drop policy if exists automation_optouts_delete_admin on public.automation_optouts;
create policy automation_optouts_delete_permitted on public.automation_optouts
  for delete to authenticated using ((select public.has_permission('automations', 'delete')));

-- The approval queue is worked in the Inbox (the lightning button).
drop policy if exists automation_queue_select_permitted on public.automation_queue;
create policy automation_queue_select_permitted on public.automation_queue
  for select to authenticated
  using ((select public.has_permission('inbox')) or (select public.has_permission('automations')));

drop policy if exists automation_queue_delete_admin on public.automation_queue;
create policy automation_queue_delete_permitted on public.automation_queue
  for delete to authenticated using ((select public.has_permission('automations', 'delete')));

select pg_temp.regate('automation_flow_stats', 'has_permission\(''leads''', 'has_permission(''automations''');
select pg_temp.regate('queue_automation_test', '(public\.)?is_admin\(\)', 'public.has_permission(''automations'', ''edit'')');
select pg_temp.regate('run_automation_rules', '(public\.)?is_admin\(\)', 'public.has_permission(''automations'', ''edit'')');

-- 6c. AI Knowledge (was: Leads to look, admin to change). The Inbox reads the notes for its drafts.
drop policy if exists ai_knowledge_notes_select_permitted on public.ai_knowledge_notes;
create policy ai_knowledge_notes_select_permitted on public.ai_knowledge_notes
  for select to authenticated
  using ((select public.has_permission('ai_knowledge')) or (select public.has_permission('inbox')));

drop policy if exists ai_knowledge_notes_insert_admin on public.ai_knowledge_notes;
drop policy if exists ai_knowledge_notes_update_admin on public.ai_knowledge_notes;
drop policy if exists ai_knowledge_notes_delete_admin on public.ai_knowledge_notes;
create policy ai_knowledge_notes_insert_permitted on public.ai_knowledge_notes
  for insert to authenticated with check ((select public.has_permission('ai_knowledge', 'edit')));
create policy ai_knowledge_notes_update_permitted on public.ai_knowledge_notes
  for update to authenticated
  using ((select public.has_permission('ai_knowledge', 'edit')))
  with check ((select public.has_permission('ai_knowledge', 'edit')));
create policy ai_knowledge_notes_delete_permitted on public.ai_knowledge_notes
  for delete to authenticated using ((select public.has_permission('ai_knowledge', 'delete')));

drop policy if exists ai_knowledge_note_versions_select_admin on public.ai_knowledge_note_versions;
create policy ai_knowledge_note_versions_select_permitted on public.ai_knowledge_note_versions
  for select to authenticated using ((select public.has_permission('ai_knowledge', 'edit')));

select pg_temp.regate('reorder_ai_knowledge_notes', '(public\.)?is_admin\(\)', 'public.has_permission(''ai_knowledge'', ''edit'')');
select pg_temp.regate('resolve_ai_gap', '(public\.)?is_admin\(\)', 'public.has_permission(''ai_knowledge'', ''edit'')');
select pg_temp.regate('review_ai_example', '(public\.)?is_admin\(\)', 'public.has_permission(''ai_knowledge'', ''edit'')');
select pg_temp.regate('set_ai_report_settings', '(public\.)?is_admin\(\)', 'public.has_permission(''ai_knowledge'', ''edit'')');

-- 6d. Class Videos: its tick also reads and manages videos (the class ticks still do, as before).
drop policy if exists class_videos_select_staff on public.class_videos;
create policy class_videos_select_staff on public.class_videos
  for select to authenticated
  using (
    (select public.can_view_classes())
    or (select public.has_permission('videos'))
    or teacher_id = (select public.current_teacher_id())
    or (select public.can_manage_class_videos(class_videos.classroom_id))
  );

create or replace function public.can_manage_class_videos(p_classroom_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_edit_classes()
    or public.has_permission('videos', 'edit')
    or p_classroom_id in (select public.my_classroom_ids())
    or exists (
      select 1 from public.classroom_teacher_libraries l
      where l.classroom_id = p_classroom_id and l.teacher_id = public.current_teacher_id()
    );
$$;

-- 6e. Question Bank: its tick sees every question and changes them (a teacher keeps their own, as before).
drop policy if exists questions_select_staff on public.questions;
create policy questions_select_staff on public.questions
  for select to authenticated
  using (
    ((select public.current_teacher_id()) is not null)
    and (
      owner_id = (select public.current_teacher_id())
      or is_shared
      or (select public.has_permission('questions'))
    )
  );

create or replace function public.can_edit_question(p_owner_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('questions', 'edit')
    or (p_owner_id is not null and p_owner_id = public.current_teacher_id());
$$;

-- 6f. App Logins: its tick reads the logins (the class and student ticks still do, as before).
drop policy if exists portal_accounts_select_staff on public.portal_accounts;
create policy portal_accounts_select_staff on public.portal_accounts
  for select to authenticated
  using (
    (select public.can_view_classes())
    or (select public.has_permission('students'))
    or (select public.has_permission('app_logins'))
    or (
      (select public.current_teacher_id()) is not null
      -- Kept exactly as it is live: any teacher sees the logins of every student they can see. Narrowing it to
      -- the teacher's own classes took logins away from EduHero teachers (found by the before/after check).
      and student_id in (select s.id from public.students s)
    )
  );

-- 6g. Packages (was admin only).
drop policy if exists packages_insert_admin on public.packages;
drop policy if exists packages_update_admin on public.packages;
create policy packages_insert_permitted on public.packages
  for insert to authenticated with check ((select public.has_permission('packages', 'edit')));
create policy packages_update_permitted on public.packages
  for update to authenticated
  using ((select public.has_permission('packages', 'edit')))
  with check ((select public.has_permission('packages', 'edit')));

-- 6h. Class Settings (was admin only): every setting the Class Settings window saves.
do $$
declare
  v_function text;
begin
  foreach v_function in array array[
    'save_age_group', 'save_attendance_status', 'save_program_level', 'save_review_criterion',
    'save_reward_preset', 'save_subject', 'set_attendance_status_points', 'set_attendance_takers',
    'set_calendar_layout', 'set_class_video_settings', 'set_class_videos_per_month', 'set_late_feedback_edit',
    'set_late_reminder_settings', 'set_live_question_settings', 'set_portal_consents', 'set_portal_settings',
    'set_portal_terms', 'set_program_level_flow', 'set_recording_settings', 'set_reward_levels',
    'set_zoom_attendance', 'set_zoom_hosts', 'set_zoom_meeting_options', 'set_zoom_room_rules',
    'set_classroom_recording_library', 'set_classroom_teacher_library', 'save_recording_library',
    'delete_recording_library', 'recording_libraries_list'
  ] loop
    perform pg_temp.regate(v_function, '(public\.)?is_admin\(\)', 'public.has_permission(''class_settings'', ''edit'')');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 7. Admin functions to change teams (each change is kept in the activity log).
-- ---------------------------------------------------------------------------------------------------------

alter table public.admin_activity_logs drop constraint admin_activity_logs_entity_type_check;
alter table public.admin_activity_logs add constraint admin_activity_logs_entity_type_check
  check (entity_type in ('student', 'teacher', 'classroom', 'schedule', 'lead', 'team'));

select pg_temp.regate(
  'record_admin_activity',
  '''student'', ''teacher'', ''classroom'', ''schedule'', ''lead''\)',
  '''student'', ''teacher'', ''classroom'', ''schedule'', ''lead'', ''team'')'
);

-- Makes a team (p_id null) or changes one. Returns its id.
create or replace function public.save_team(
  p_id bigint,
  p_name text,
  p_color text,
  p_description text,
  p_permissions jsonb,
  p_is_active boolean default true
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.teams%rowtype;
  v_id bigint;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change teams.' using errcode = '42501';
  end if;
  if not public.valid_account_permissions(coalesce(p_permissions, '{}'::jsonb)) then
    raise exception 'These permissions are not valid.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.teams (name, color, description, permissions, is_active, sort_order)
    values (
      btrim(p_name), p_color, nullif(btrim(coalesce(p_description, '')), ''), coalesce(p_permissions, '{}'::jsonb),
      coalesce(p_is_active, true),
      coalesce((select max(sort_order) + 1 from public.teams), 0)
    )
    returning id into v_id;
    perform public.record_admin_activity('team_created', 'team', v_id, btrim(p_name),
      jsonb_build_object('permissions', coalesce(p_permissions, '{}'::jsonb)));
    return v_id;
  end if;

  select * into v_old from public.teams where id = p_id for update;
  if not found then
    raise exception 'Team not found.' using errcode = 'P0002';
  end if;

  update public.teams
  set name = btrim(p_name),
      color = p_color,
      description = nullif(btrim(coalesce(p_description, '')), ''),
      permissions = coalesce(p_permissions, '{}'::jsonb),
      is_active = coalesce(p_is_active, true)
  where id = p_id;

  if v_old.permissions is distinct from coalesce(p_permissions, '{}'::jsonb)
    or v_old.is_active is distinct from coalesce(p_is_active, true)
    or v_old.name is distinct from btrim(p_name) then
    perform public.record_admin_activity('team_updated', 'team', p_id, btrim(p_name), jsonb_build_object(
      'previous', jsonb_build_object('name', v_old.name, 'permissions', v_old.permissions, 'is_active', v_old.is_active),
      'new', jsonb_build_object('name', btrim(p_name), 'permissions', coalesce(p_permissions, '{}'::jsonb), 'is_active', coalesce(p_is_active, true))
    ));
  end if;
  return p_id;
end;
$$;

-- The people of a team, all at once.
create or replace function public.set_team_members(p_team_id bigint, p_teacher_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.teams%rowtype;
  v_ids bigint[] := array(select distinct x from unnest(coalesce(p_teacher_ids, '{}'::bigint[])) x where x is not null order by x);
  v_before bigint[];
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change teams.' using errcode = '42501';
  end if;
  select * into v_team from public.teams where id = p_team_id for update;
  if not found then
    raise exception 'Team not found.' using errcode = 'P0002';
  end if;
  if exists (select 1 from unnest(v_ids) x where not exists (select 1 from public.teachers t where t.id = x)) then
    raise exception 'Account not found.' using errcode = 'P0002';
  end if;

  v_before := array(select teacher_id from public.team_members where team_id = p_team_id order by teacher_id);
  if v_before = v_ids then
    return;
  end if;

  delete from public.team_members where team_id = p_team_id and teacher_id <> all(v_ids);
  insert into public.team_members (team_id, teacher_id)
  select p_team_id, x from unnest(v_ids) x
  on conflict do nothing;

  perform public.record_admin_activity('team_members_updated', 'team', p_team_id, v_team.name,
    jsonb_build_object('previous', to_jsonb(v_before), 'new', to_jsonb(v_ids)));
end;
$$;

-- The teams of one person, all at once (the account window).
create or replace function public.set_account_teams(p_teacher_id bigint, p_team_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.teachers%rowtype;
  v_ids bigint[] := array(select distinct x from unnest(coalesce(p_team_ids, '{}'::bigint[])) x where x is not null order by x);
  v_before bigint[];
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change teams.' using errcode = '42501';
  end if;
  select * into v_account from public.teachers where id = p_teacher_id;
  if not found then
    raise exception 'Account not found.' using errcode = 'P0002';
  end if;
  if exists (select 1 from unnest(v_ids) x where not exists (select 1 from public.teams t where t.id = x)) then
    raise exception 'Team not found.' using errcode = 'P0002';
  end if;

  v_before := array(select team_id from public.team_members where teacher_id = p_teacher_id order by team_id);
  if v_before = v_ids then
    return;
  end if;

  delete from public.team_members where teacher_id = p_teacher_id and team_id <> all(v_ids);
  insert into public.team_members (team_id, teacher_id)
  select x, p_teacher_id from unnest(v_ids) x
  on conflict do nothing;

  perform public.record_admin_activity('teams_updated', 'teacher', p_teacher_id, v_account.full_name,
    jsonb_build_object('previous', to_jsonb(v_before), 'new', to_jsonb(v_ids)));
end;
$$;

-- The order of the team list.
create or replace function public.reorder_teams(p_team_ids bigint[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change teams.' using errcode = '42501';
  end if;
  update public.teams t
  set sort_order = o.position
  from unnest(p_team_ids) with ordinality as o(id, position)
  where t.id = o.id and t.sort_order is distinct from o.position::integer;
end;
$$;

revoke all on function public.save_team(bigint, text, text, text, jsonb, boolean) from public, anon;
revoke all on function public.set_team_members(bigint, bigint[]) from public, anon;
revoke all on function public.set_account_teams(bigint, bigint[]) from public, anon;
revoke all on function public.reorder_teams(bigint[]) from public, anon;
grant execute on function public.save_team(bigint, text, text, text, jsonb, boolean) to authenticated;
grant execute on function public.set_team_members(bigint, bigint[]) to authenticated;
grant execute on function public.set_account_teams(bigint, bigint[]) to authenticated;
grant execute on function public.reorder_teams(bigint[]) to authenticated;

-- The page hears about changes at once, like the other tables (crm_table_versions, 20261024900000).
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'crm_bump_table_version') then
    execute 'create trigger crm_version_insert after insert on public.teams referencing new table as changed_rows for each statement execute function public.crm_bump_table_version()';
    execute 'create trigger crm_version_update after update on public.teams referencing new table as changed_rows for each statement execute function public.crm_bump_table_version()';
    execute 'create trigger crm_version_delete after delete on public.teams referencing old table as changed_rows for each statement execute function public.crm_bump_table_version()';
    execute 'create trigger crm_version_insert after insert on public.team_members referencing new table as changed_rows for each statement execute function public.crm_bump_table_version()';
    execute 'create trigger crm_version_delete after delete on public.team_members referencing old table as changed_rows for each statement execute function public.crm_bump_table_version()';
  end if;
end;
$$;
