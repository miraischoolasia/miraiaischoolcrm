-- Student Inbox (docs/student-inbox-spec.md): a second inbox under Students, for WhatsApp numbers the school
-- uses with its students and parents. Same Inbox, filtered by the number's zone:
--   marketing  the Inbox under Marketing (every number that exists today stays here)
--   students   the Student Inbox under Students
-- Needs 20261026020000_inbox_channel_access (channels and their locks) and 20261028500000_content_studio (the
-- latest valid_account_permissions).
--
-- What changes:
--   1. inbox_channels.zone and whatsapp_numbers.zone ('marketing' by default; the number's zone follows onto its channel).
--   2. A new tick, student_inbox (view / edit / delete messages; no "whose" scope). The Inbox tick does not open
--      the Student Inbox and the Student Inbox tick does not open the Inbox. The channel locks work the same in both.
--   3. The chats and messages of the inbox copy: one more read rule for the Student Inbox tick. The rule of the
--      Inbox tick is not changed: a students number is hidden from it because inbox_access_level() asks the
--      student_inbox tick for it.
--   4. What the Inbox reads beside a chat (stickers, quick replies, AI drafts, channel names and pictures, AI notes,
--      the numbers): one more read rule each for the Student Inbox tick. No rule is changed or dropped.
--   5. A chat of a students number never feeds the enrolment automations: its parent messages are not kept in
--      chat_messages (what the keyword trigger and "wait for a reply" read). chat_activity is still written, so
--      Follow up (chat_schedules) cancels itself when the parent replies.
--   6. student_chat_from_webhook(): chat-activity asks it first. For a students number it ties the WhatsApp contact
--      to the family (people; the existing people_place_new_contact trigger matches the phone to a student or
--      parent; a second parent's phone is matched here) and answers 'students', so chat-activity skips making a lead,
--      listing the chat on a lead and moving the lead's stage.

-- ---------------------------------------------------------------------------------------------------------
-- 1. Zones.
-- ---------------------------------------------------------------------------------------------------------

alter table public.inbox_channels
  add column if not exists zone text not null default 'marketing';
alter table public.inbox_channels
  drop constraint if exists inbox_channels_zone_check;
alter table public.inbox_channels
  add constraint inbox_channels_zone_check check (zone in ('marketing', 'students') and (zone = 'marketing' or kind = 'whatsapp'));

alter table public.whatsapp_numbers
  add column if not exists zone text not null default 'marketing';
alter table public.whatsapp_numbers
  drop constraint if exists whatsapp_numbers_zone_check;
alter table public.whatsapp_numbers
  add constraint whatsapp_numbers_zone_check check (zone in ('marketing', 'students'));

comment on column public.inbox_channels.zone is
  'marketing = the Inbox (Marketing); students = the Student Inbox (Students). Set on the WhatsApp number, copied here.';
comment on column public.whatsapp_numbers.zone is
  'marketing = the Inbox (Marketing); students = the Student Inbox (Students). Chosen in the Numbers window.';

-- Same as 20261026020000_inbox_channel_access.sql, with the zone carried over too.
create or replace function public.whatsapp_numbers_to_channels()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.inbox_channels (chatwoot_inbox_id, kind, label, access, is_active, zone)
    values (new.chatwoot_inbox_id, 'whatsapp', new.label, 'limited', new.is_active, new.zone)
    on conflict (chatwoot_inbox_id) do update
      set kind = 'whatsapp', label = excluded.label, access = 'limited', is_active = excluded.is_active, zone = excluded.zone;
  elsif tg_op = 'UPDATE' then
    if new.chatwoot_inbox_id <> old.chatwoot_inbox_id then
      delete from public.inbox_channels c
      where c.chatwoot_inbox_id = old.chatwoot_inbox_id
        and not exists (select 1 from public.inbox_channel_access a where a.chatwoot_inbox_id = c.chatwoot_inbox_id);
      insert into public.inbox_channels (chatwoot_inbox_id, kind, label, access, is_active, zone)
      values (new.chatwoot_inbox_id, 'whatsapp', new.label, 'limited', new.is_active, new.zone)
      on conflict (chatwoot_inbox_id) do update set label = excluded.label, is_active = excluded.is_active, zone = excluded.zone;
    else
      update public.inbox_channels set label = new.label, is_active = new.is_active, zone = new.zone
      where chatwoot_inbox_id = new.chatwoot_inbox_id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.whatsapp_numbers_to_channels() from public, anon, authenticated;

-- The zone of a channel; a channel nobody set up (and a chat with no channel) is marketing.
create or replace function public.inbox_zone(p_inbox_id bigint)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select c.zone from public.inbox_channels c where c.chatwoot_inbox_id = p_inbox_id), 'marketing');
$$;

-- Every channel of the Student Inbox (for the read rules and for the page, which splits the two inboxes by it).
create or replace function public.student_zone_inbox_ids()
returns bigint[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(c.chatwoot_inbox_id order by c.chatwoot_inbox_id), '{}'::bigint[])
  from public.inbox_channels c
  where c.zone = 'students' and (select public.current_teacher_id()) is not null;
$$;

-- Is this chat (of the inbox copy) on a students number?
create or replace function public.is_student_chat(p_conversation_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.inbox_chats ch
    join public.inbox_channels c on c.chatwoot_inbox_id = ch.inbox_id
    where ch.conversation_id = p_conversation_id and c.zone = 'students'
  );
$$;

revoke all on function public.inbox_zone(bigint) from public, anon;
revoke all on function public.student_zone_inbox_ids() from public, anon;
revoke all on function public.is_student_chat(bigint) from public, anon, authenticated;
grant execute on function public.inbox_zone(bigint) to authenticated;
grant execute on function public.student_zone_inbox_ids() to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2. The tick. Same as 20261028500000_content_studio.sql with student_inbox added to the list of pages.
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
        'class_settings', 'staff_hours', 'content_studio', 'content_library', 'student_inbox'
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

-- ---------------------------------------------------------------------------------------------------------
-- 3. What the signed-in person may do in each channel: the tick of the channel's zone.
--    Same as 20261026020000_inbox_channel_access.sql otherwise.
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.inbox_access_level(p_inbox_id bigint)
returns text
language sql
stable
security definer
set search_path = public
as $$
  with channel as (
    select c.access, c.is_active, c.zone from public.inbox_channels c where c.chatwoot_inbox_id = p_inbox_id
  ),
  tick as (
    select case when (select zone from channel) = 'students' then 'student_inbox' else 'inbox' end as module
  ),
  me as (
    select t.id, t.role = 'admin' as admin,
      public.has_permission(tick.module, 'view') as may_view,
      public.has_permission(tick.module, 'edit') as may_edit
    from public.teachers t, tick
    where t.auth_user_id = auth.uid() and t.is_active
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
    -- A channel nobody set up, or an open one: the tick of its zone decides.
    when not exists (select 1 from channel) or (select access from channel) = 'open'
      then case when me.may_edit then 'reply' else 'view' end
    when (select best from granted) is null then null
    when (select best from granted) = 2 and me.may_edit then 'reply'
    else 'view'
  end
  from me;
$$;

-- Every channel the person may not see. A students channel is hidden from whoever has no Student Inbox tick
-- even when it is open (the Inbox tick's read rule would otherwise show it).
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
     where (c.access = 'limited' or c.zone = 'students') and public.inbox_access_level(c.chatwoot_inbox_id) is null),
    '{}'::bigint[]
  ) end;
$$;

-- A chat of the copy: what the person may do in it. A students chat has no "whose" scope.
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
    return case when public.has_permission('inbox', 'view') or public.has_permission('student_inbox', 'view')
      then 'unknown' else 'none' end;
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
  if v_chat.inbox_id is not null and public.inbox_zone(v_chat.inbox_id) = 'students' then
    return v_level;
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

create or replace function public.can_read_inbox(p_inbox_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_inbox_id is not null and public.inbox_zone(p_inbox_id) = 'students'
      then public.has_permission('student_inbox', 'view') and public.inbox_access_level(p_inbox_id) is not null
    else public.has_permission('inbox', 'view')
      and (p_inbox_id is null or public.inbox_access_level(p_inbox_id) is not null)
  end;
$$;

-- Follow up (chat_schedules): on a students number the Student Inbox edit tick may set and cancel it; elsewhere
-- it stays the Leads edit tick, as before.
create or replace function public.chat_may_schedule(p_inbox_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_inbox_id is not null and public.inbox_zone(p_inbox_id) = 'students' then public.has_permission('student_inbox', 'edit')
    else public.has_permission('leads', 'edit')
  end;
$$;

revoke all on function public.chat_may_schedule(bigint) from public, anon;
grant execute on function public.chat_may_schedule(bigint) to authenticated;

-- Changes one condition inside an existing function and keeps the rest exactly (as in 20261026000000).
create function pg_temp.student_inbox_regate(p_function text, p_pattern text, p_replacement text)
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
      raise exception 'student_inbox_regate: % does not contain %', p_function, p_pattern;
    end if;
    execute v_new;
  end loop;
  if not v_found then
    raise exception 'student_inbox_regate: no function %', p_function;
  end if;
end;
$$;

select pg_temp.student_inbox_regate(
  'chat_schedule_check',
  'public\.has_permission\(''leads'', ''edit''\)\) or not \(select public\.can_read_inbox\((\w+)\)\)',
  'public.chat_may_schedule(\1)) or not (select public.can_read_inbox(\1))'
);
select pg_temp.student_inbox_regate(
  'chat_schedule_cancel',
  'public\.has_permission\(''leads'', ''edit''\)\) or not \(select public\.can_read_inbox\((\w+)\)\)',
  'public.chat_may_schedule(\1)) or not (select public.can_read_inbox(\1))'
);

-- AI drafts: marking one used / sent is open to the Student Inbox edit tick too.
select pg_temp.student_inbox_regate(
  'mark_ai_draft_accepted',
  'public\.has_permission\(''inbox'', ''edit''\)',
  '(public.has_permission(''inbox'', ''edit'') or public.has_permission(''student_inbox'', ''edit''))'
);
select pg_temp.student_inbox_regate(
  'record_ai_draft_sent',
  'public\.has_permission\(''inbox'', ''edit''\)',
  '(public.has_permission(''inbox'', ''edit'') or public.has_permission(''student_inbox'', ''edit''))'
);

-- ---------------------------------------------------------------------------------------------------------
-- 4. Read rules for the Student Inbox tick (added beside the Inbox ones, which stay as they are).
-- ---------------------------------------------------------------------------------------------------------

drop policy if exists "Student Inbox tick reads its chats" on public.inbox_chats;
create policy "Student Inbox tick reads its chats"
  on public.inbox_chats for select to authenticated
  using (
    inbox_id = any ((select public.student_zone_inbox_ids())::bigint[])
    and inbox_id <> all ((select public.my_hidden_inbox_ids())::bigint[])
    and (select public.has_permission('student_inbox', 'view'))
  );

drop policy if exists "Student Inbox tick reads its messages" on public.inbox_messages;
create policy "Student Inbox tick reads its messages"
  on public.inbox_messages for select to authenticated
  using (
    inbox_id = any ((select public.student_zone_inbox_ids())::bigint[])
    and inbox_id <> all ((select public.my_hidden_inbox_ids())::bigint[])
    and (select public.has_permission('student_inbox', 'view'))
  );

drop policy if exists "Student Inbox tick reads the stickers" on public.inbox_stickers;
create policy "Student Inbox tick reads the stickers" on public.inbox_stickers
  for select to authenticated using ((select public.has_permission('student_inbox', 'view')));

drop policy if exists whatsapp_numbers_read_student_inbox on public.whatsapp_numbers;
create policy whatsapp_numbers_read_student_inbox on public.whatsapp_numbers
  for select to authenticated using ((select public.has_permission('student_inbox', 'view')));

drop policy if exists inbox_channels_select_student_inbox on public.inbox_channels;
create policy inbox_channels_select_student_inbox on public.inbox_channels
  for select to authenticated using ((select public.has_permission('student_inbox')));

drop policy if exists ai_drafts_select_student_inbox on public.ai_drafts;
create policy ai_drafts_select_student_inbox on public.ai_drafts
  for select to authenticated using ((select public.has_permission('student_inbox')));

drop policy if exists ai_knowledge_notes_select_student_inbox on public.ai_knowledge_notes;
create policy ai_knowledge_notes_select_student_inbox on public.ai_knowledge_notes
  for select to authenticated using ((select public.has_permission('student_inbox')));

drop policy if exists channel_avatars_select_student_inbox on public.channel_avatars;
create policy channel_avatars_select_student_inbox on public.channel_avatars
  for select to authenticated using ((select public.has_permission('student_inbox')));

drop policy if exists channel_labels_select_student_inbox on public.channel_labels;
create policy channel_labels_select_student_inbox on public.channel_labels
  for select to authenticated using ((select public.has_permission('student_inbox')));

-- Quick replies: the school's own ones by whoever may edit the Student Inbox, personal ones by their owner.
drop policy if exists quick_replies_select_student_inbox on public.quick_replies;
drop policy if exists quick_replies_insert_student_inbox on public.quick_replies;
drop policy if exists quick_replies_update_student_inbox on public.quick_replies;
drop policy if exists quick_replies_delete_student_inbox on public.quick_replies;

create policy quick_replies_select_student_inbox on public.quick_replies
  for select to authenticated
  using ((select public.has_permission('student_inbox')) and (owner_id is null or owner_id = (select auth.uid())));

create policy quick_replies_insert_student_inbox on public.quick_replies
  for insert to authenticated
  with check (
    (owner_id is null and (select public.has_permission('student_inbox', 'edit')))
    or (owner_id = (select auth.uid()) and (select public.has_permission('student_inbox')))
  );

create policy quick_replies_update_student_inbox on public.quick_replies
  for update to authenticated
  using (
    (owner_id is null and (select public.has_permission('student_inbox', 'edit')))
    or (owner_id = (select auth.uid()) and (select public.has_permission('student_inbox')))
  )
  with check (
    (owner_id is null and (select public.has_permission('student_inbox', 'edit')))
    or (owner_id = (select auth.uid()) and (select public.has_permission('student_inbox')))
  );

create policy quick_replies_delete_student_inbox on public.quick_replies
  for delete to authenticated
  using (
    (owner_id is null and (select public.has_permission('student_inbox', 'edit')))
    or (owner_id = (select auth.uid()) and (select public.has_permission('student_inbox')))
  );

-- ---------------------------------------------------------------------------------------------------------
-- 5. No enrolment automations from a students number: its parent messages are not kept for them.
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.chat_messages_skip_student_chats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_student_chat(new.conversation_id) then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function public.chat_messages_skip_student_chats() from public, anon, authenticated;

drop trigger if exists chat_messages_skip_student_chats on public.chat_messages;
create trigger chat_messages_skip_student_chats
  before insert on public.chat_messages
  for each row execute function public.chat_messages_skip_student_chats();

-- ---------------------------------------------------------------------------------------------------------
-- 6. chat-activity asks this first: 'students' or 'marketing'. For a students number the WhatsApp contact is put
--    in the family list (people), where people_place_new_contact ties it to the student or parent with that phone.
--    Never makes or changes a lead.
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.student_chat_from_webhook(
  p_key text,
  p_inbox_id bigint,
  p_contact_id bigint,
  p_phone text,
  p_name text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  stored_key text;
  v_zone text;
  v_phone text;
  v_person public.people%rowtype;
  v_students bigint[];
begin
  select webhook_key into stored_key from public.chat_webhook_settings limit 1;
  if p_key is null or stored_key is null or p_key <> stored_key then
    raise exception 'The key is not right.' using errcode = '28000';
  end if;

  v_zone := case when p_inbox_id is null then 'marketing' else public.inbox_zone(p_inbox_id) end;
  if v_zone <> 'students' or p_contact_id is null then
    return v_zone;
  end if;

  v_phone := public.people_digits(p_phone);
  insert into public.people (kind, full_name, phone, chatwoot_contact_id)
  values ('contact', left(nullif(btrim(p_name), ''), 200), v_phone, p_contact_id)
  on conflict (chatwoot_contact_id) do nothing;

  -- Not the student's or the first parent's phone (the trigger above found nobody): maybe the second parent's.
  select * into v_person from public.people where chatwoot_contact_id = p_contact_id;
  if found and v_person.kind = 'contact' and v_person.phone is not null
     and v_person.lead_id is null and v_person.student_id is null and v_person.parent_id is null then
    select array_agg(s.id order by s.id) into v_students
    from public.students s
    where s.is_active and public.people_digits(s.second_parent_phone) = v_person.phone;
    if v_students is not null then
      perform public.people_link_contact_to_students(p_contact_id, v_students);
    end if;
  end if;
  return v_zone;
end;
$$;

revoke all on function public.student_chat_from_webhook(text, bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.student_chat_from_webhook(text, bigint, bigint, text, text) to service_role;
