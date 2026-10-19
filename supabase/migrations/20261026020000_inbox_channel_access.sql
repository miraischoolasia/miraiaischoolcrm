-- Who may see and who may answer each inbox channel (docs/teams-permissions-design.md, section 5).
-- Needs 20261026000000_teams_permissions and 20261026010000_permission_scopes.
--
-- Every channel of the inbox (a WhatsApp number, a Messenger Page, an Instagram account) is one Chatwoot
-- inbox and gets one row in inbox_channels:
--   open     everyone with the Inbox tick sees it; whoever may edit the Inbox answers in it (as today)
--   limited  only the people and teams listed in inbox_channel_access, each with 'view' or 'reply'
-- A channel never gives more than the Inbox tick: someone who may only look at the Inbox cannot answer,
-- whatever the channel says. An admin sees and answers everything.
--
-- The WhatsApp numbers already in whatsapp_numbers keep meaning what they meant: a number in that list is
-- limited to the staff ticked for it (whatsapp_number_staff = may answer). Both lists are read together until
-- the Numbers window writes the new one.
--
-- The checks: the inbox copy (inbox_chats / inbox_messages) is filtered here; the WhatsApp gateway asks
-- inbox_conversation_access() before letting a message out (whatsapp-sender/gateway_auth.py); the page asks
-- my_inbox_access() to know where to show the reply box.

create table public.inbox_channels (
  chatwoot_inbox_id bigint primary key check (chatwoot_inbox_id > 0),
  kind text not null default 'whatsapp' check (kind in ('whatsapp', 'messenger', 'instagram', 'other')),
  label text not null check (char_length(btrim(label)) between 1 and 60),
  access text not null default 'open' check (access in ('open', 'limited')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.inbox_channel_access (
  id bigint generated always as identity primary key,
  chatwoot_inbox_id bigint not null references public.inbox_channels (chatwoot_inbox_id) on delete cascade,
  team_id bigint references public.teams (id) on delete cascade,
  teacher_id bigint references public.teachers (id) on delete cascade,
  level text not null check (level in ('view', 'reply')),
  created_at timestamptz not null default now(),
  check ((team_id is null) <> (teacher_id is null))
);

create unique index inbox_channel_access_team_unique on public.inbox_channel_access (chatwoot_inbox_id, team_id) where team_id is not null;
create unique index inbox_channel_access_teacher_unique on public.inbox_channel_access (chatwoot_inbox_id, teacher_id) where teacher_id is not null;

comment on table public.inbox_channels is
  'One row per inbox channel (Chatwoot inbox). access = open (everyone with the Inbox tick) or limited (inbox_channel_access).';
comment on table public.inbox_channel_access is
  'Who may use a limited channel: a team or one person, view or reply.';

create trigger inbox_channels_touch before update on public.inbox_channels
for each row execute function public.teams_touch();

alter table public.inbox_channels enable row level security;
alter table public.inbox_channel_access enable row level security;

create policy inbox_channels_select_staff on public.inbox_channels
  for select to authenticated
  using ((select public.has_permission('inbox')) or (select public.has_permission('leads')));

create policy inbox_channel_access_select on public.inbox_channel_access
  for select to authenticated
  using (
    (select public.is_admin())
    or teacher_id = (select public.current_teacher_id())
    or team_id in (select m.team_id from public.team_members m where m.teacher_id = (select public.current_teacher_id()))
  );

-- Changed only by an admin (through set_inbox_channel below).
revoke all on public.inbox_channels, public.inbox_channel_access from anon;
revoke insert, update, delete on public.inbox_channels, public.inbox_channel_access from authenticated;
grant select on public.inbox_channels, public.inbox_channel_access to authenticated;

-- The numbers that exist already: limited, as whatsapp_numbers meant.
insert into public.inbox_channels (chatwoot_inbox_id, kind, label, access, is_active)
select n.chatwoot_inbox_id, 'whatsapp', n.label, 'limited', n.is_active
from public.whatsapp_numbers n
on conflict (chatwoot_inbox_id) do nothing;

-- A number added in the Numbers window becomes a limited channel too (and follows its name and switch).
create or replace function public.whatsapp_numbers_to_channels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.inbox_channels (chatwoot_inbox_id, kind, label, access, is_active)
    values (new.chatwoot_inbox_id, 'whatsapp', new.label, 'limited', new.is_active)
    on conflict (chatwoot_inbox_id) do update
      set kind = 'whatsapp', label = excluded.label, access = 'limited', is_active = excluded.is_active;
  elsif tg_op = 'UPDATE' then
    if new.chatwoot_inbox_id <> old.chatwoot_inbox_id then
      delete from public.inbox_channels c
      where c.chatwoot_inbox_id = old.chatwoot_inbox_id
        and not exists (select 1 from public.inbox_channel_access a where a.chatwoot_inbox_id = c.chatwoot_inbox_id);
      insert into public.inbox_channels (chatwoot_inbox_id, kind, label, access, is_active)
      values (new.chatwoot_inbox_id, 'whatsapp', new.label, 'limited', new.is_active)
      on conflict (chatwoot_inbox_id) do update set label = excluded.label, is_active = excluded.is_active;
    else
      update public.inbox_channels set label = new.label, is_active = new.is_active
      where chatwoot_inbox_id = new.chatwoot_inbox_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger whatsapp_numbers_to_channels
after insert or update on public.whatsapp_numbers
for each row execute function public.whatsapp_numbers_to_channels();

revoke all on function public.whatsapp_numbers_to_channels() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- What the signed-in person may do in each channel.
-- ---------------------------------------------------------------------------------------------------------

-- 'reply', 'view' or null (hidden), for one channel.
create or replace function public.inbox_access_level(p_inbox_id bigint)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select t.id, t.role = 'admin' as admin,
      public.has_permission('inbox', 'view') as may_view,
      public.has_permission('inbox', 'edit') as may_edit
    from public.teachers t
    where t.auth_user_id = auth.uid() and t.is_active
  ),
  channel as (
    select c.access, c.is_active from public.inbox_channels c where c.chatwoot_inbox_id = p_inbox_id
  ),
  granted as (
    select max(case a.level when 'reply' then 2 else 1 end) as best
    from (
      select a.level from public.inbox_channel_access a, me
      where a.chatwoot_inbox_id = p_inbox_id
        and (a.teacher_id = me.id
             or a.team_id in (select m.team_id from public.team_members m join public.teams tm on tm.id = m.team_id
                              where m.teacher_id = me.id and tm.is_active))
      union all
      select 'reply' from public.whatsapp_number_staff s
      join public.whatsapp_numbers n on n.id = s.number_id, me
      where n.chatwoot_inbox_id = p_inbox_id and s.teacher_id = me.id
    ) a
  )
  select case
    when me.admin then 'reply'
    when not me.may_view then null
    -- A channel nobody set up, or an open one: the Inbox tick decides.
    when not exists (select 1 from channel) or (select access from channel) = 'open'
      then case when me.may_edit then 'reply' else 'view' end
    when (select best from granted) is null then null
    when (select best from granted) = 2 and me.may_edit then 'reply'
    else 'view'
  end
  from me;
$$;

-- Every channel the person may not see (one look per query, for the inbox copy's rules).
create or replace function public.my_hidden_inbox_ids()
returns bigint[]
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() then '{}'::bigint[] else coalesce(
    (select array_agg(c.chatwoot_inbox_id order by c.chatwoot_inbox_id)
     from public.inbox_channels c
     where c.access = 'limited' and public.inbox_access_level(c.chatwoot_inbox_id) is null),
    '{}'::bigint[]
  ) end;
$$;

-- For the page: every known channel and what the person may do in it ({"5": "reply", "7": "view"}).
-- Channels not listed are open: the Inbox tick decides.
create or replace function public.my_inbox_access()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(c.chatwoot_inbox_id::text, coalesce(public.inbox_access_level(c.chatwoot_inbox_id), 'none')), '{}'::jsonb)
  from public.inbox_channels c
  where (select public.current_teacher_id()) is not null;
$$;

-- The same list in the old shape the Inbox page reads (useWhatsAppNumbers): null = no restriction; otherwise
-- every inbox the person may see (WhatsApp, Messenger and Instagram alike).
create or replace function public.my_whatsapp_inbox_ids()
returns integer[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_admin() then null
    when cardinality(public.my_hidden_inbox_ids()) = 0 then null
    else coalesce(
      (select array_agg(i::integer order by i)
       from (
         select chatwoot_inbox_id as i from public.inbox_channels
         union
         select distinct inbox_id from public.inbox_chats where inbox_id is not null
       ) known
       where i <> all (public.my_hidden_inbox_ids())),
      array[]::integer[]
    )
  end;
$$;

-- A chat of the copy: what the person may do in it. 'unknown' when the copy has not seen the chat yet
-- (the gateway then decides by the Inbox tick alone, as before).
create or replace function public.inbox_conversation_access(p_conversation_id bigint)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_chat public.inbox_chats%rowtype;
  v_level text;
  v_scope text;
begin
  select * into v_chat from public.inbox_chats where conversation_id = p_conversation_id;
  if not found then
    return case when public.has_permission('inbox', 'view') then 'unknown' else 'none' end;
  end if;
  if v_chat.inbox_id is null then
    v_level := case when public.has_permission('inbox', 'edit') then 'reply'
                    when public.has_permission('inbox', 'view') then 'view' end;
  else
    v_level := public.inbox_access_level(v_chat.inbox_id);
  end if;
  if v_level is null then
    return 'none';
  end if;
  -- Whose chats: someone limited to their own may still read the rest of the inbox only as far as the scope says.
  v_scope := public.permission_scope('inbox', 'view');
  if not public.in_scope(v_scope, v_chat.owner_id = public.current_teacher_id(), v_chat.owner_id is null) then
    return 'none';
  end if;
  if v_level = 'reply' and not public.in_scope(
    public.permission_scope('inbox', 'edit'), v_chat.owner_id = public.current_teacher_id(), v_chat.owner_id is null
  ) then
    v_level := 'view';
  end if;
  return v_level;
end;
$$;

revoke all on function public.inbox_access_level(bigint) from public, anon;
revoke all on function public.my_hidden_inbox_ids() from public, anon;
revoke all on function public.my_inbox_access() from public, anon;
revoke all on function public.my_whatsapp_inbox_ids() from public, anon;
revoke all on function public.inbox_conversation_access(bigint) from public, anon;
grant execute on function public.inbox_access_level(bigint) to authenticated;
grant execute on function public.my_hidden_inbox_ids() to authenticated;
grant execute on function public.my_inbox_access() to authenticated;
grant execute on function public.my_whatsapp_inbox_ids() to authenticated;
grant execute on function public.inbox_conversation_access(bigint) to authenticated;

-- One channel: kind, name, open/limited, and who may use it. Admin only.
--   p_grants: [{"team_id": 1, "level": "reply"}, {"teacher_id": 9, "level": "view"}]
create or replace function public.set_inbox_channel(
  p_inbox_id bigint,
  p_kind text,
  p_label text,
  p_access text,
  p_grants jsonb default '[]'::jsonb,
  p_is_active boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change who uses a channel.' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_grants, '[]'::jsonb)) <> 'array' or exists (
    select 1 from jsonb_array_elements(coalesce(p_grants, '[]'::jsonb)) g
    where coalesce(g ->> 'level', '') not in ('view', 'reply')
      or ((g ? 'team_id') = (g ? 'teacher_id'))
  ) then
    raise exception 'These channel grants are not valid.' using errcode = '22023';
  end if;

  select jsonb_build_object('channel', to_jsonb(c), 'grants', coalesce(
    (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('team_id', a.team_id, 'teacher_id', a.teacher_id, 'level', a.level)) order by a.id)
     from public.inbox_channel_access a where a.chatwoot_inbox_id = p_inbox_id), '[]'::jsonb))
  into v_before
  from public.inbox_channels c where c.chatwoot_inbox_id = p_inbox_id;

  insert into public.inbox_channels (chatwoot_inbox_id, kind, label, access, is_active)
  values (p_inbox_id, coalesce(p_kind, 'whatsapp'), btrim(p_label), coalesce(p_access, 'open'), coalesce(p_is_active, true))
  on conflict (chatwoot_inbox_id) do update
    set kind = excluded.kind, label = excluded.label, access = excluded.access, is_active = excluded.is_active;

  delete from public.inbox_channel_access where chatwoot_inbox_id = p_inbox_id;
  insert into public.inbox_channel_access (chatwoot_inbox_id, team_id, teacher_id, level)
  select p_inbox_id, (g ->> 'team_id')::bigint, (g ->> 'teacher_id')::bigint, g ->> 'level'
  from jsonb_array_elements(coalesce(p_grants, '[]'::jsonb)) g;

  perform public.record_admin_activity('inbox_channel_updated', 'team', null, btrim(p_label), jsonb_build_object(
    'inbox_id', p_inbox_id, 'previous', v_before,
    'new', jsonb_build_object('kind', p_kind, 'access', p_access, 'is_active', p_is_active, 'grants', coalesce(p_grants, '[]'::jsonb))
  ));
end;
$$;

revoke all on function public.set_inbox_channel(bigint, text, text, text, jsonb, boolean) from public, anon;
grant execute on function public.set_inbox_channel(bigint, text, text, text, jsonb, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- The inbox copy follows the channels (and the scope of 20261026010000).
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.can_read_inbox(p_inbox_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission('inbox', 'view')
    and (p_inbox_id is null or public.inbox_access_level(p_inbox_id) is not null);
$$;

drop policy if exists "Inbox tick reads the chats it may see" on public.inbox_chats;
drop policy if exists "Inbox tick reads the messages it may see" on public.inbox_messages;

create policy "Inbox tick reads the chats it may see"
  on public.inbox_chats for select to authenticated
  using (
    public.in_scope(
      (select public.permission_scope('inbox', 'view')),
      owner_id = (select public.current_teacher_id()),
      owner_id is null
    )
    and (inbox_id is null or inbox_id <> all ((select public.my_hidden_inbox_ids())::bigint[]))
  );

create policy "Inbox tick reads the messages it may see"
  on public.inbox_messages for select to authenticated
  using (
    (select public.permission_scope('inbox', 'view')) is not null
    and (inbox_id is null or inbox_id <> all ((select public.my_hidden_inbox_ids())::bigint[]))
    and (
      (select public.permission_scope('inbox', 'view')) = 'all'
      or exists (
        select 1 from public.inbox_chats c
        where c.conversation_id = inbox_messages.conversation_id
          and public.in_scope(
            (select public.permission_scope('inbox', 'view')),
            c.owner_id = (select public.current_teacher_id()),
            c.owner_id is null
          )
      )
    )
  );

-- The activity log keeps a channel's changes under 'team' with no id (entity_id may be empty).
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'admin_activity_logs'
             and column_name = 'entity_id' and is_nullable = 'NO') then
    raise exception 'admin_activity_logs.entity_id must allow empty values for channel changes';
  end if;
end;
$$;
