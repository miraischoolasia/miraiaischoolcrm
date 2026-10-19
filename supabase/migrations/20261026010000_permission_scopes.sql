-- Whose rows a tick covers (docs/teams-permissions-design.md, section 6). Needs 20261026000000_teams_permissions.
--
--   Leads         all / own_unassigned / own   own = the lead's PIC is linked to my account
--   Inbox         all / own_unassigned / own   own = I am the chat's owner (crm_owner_id)
--   Team Replies  all / own                    own = only my own row
--
-- Every tick that exists today means "all", so nobody sees less on the day this goes live.
-- A PIC name (lead_options kind 'pic') can now be linked to one account; only an admin links them.

-- ---------------------------------------------------------------------------------------------------------
-- 1. A PIC name belongs to an account.
-- ---------------------------------------------------------------------------------------------------------

alter table public.lead_options
  add column teacher_id bigint references public.teachers (id) on delete set null;

alter table public.lead_options
  add constraint lead_options_teacher_only_pic check (teacher_id is null or kind = 'pic');

-- One PIC name per account, so "my leads" is never split over two names.
create unique index lead_options_pic_teacher_unique on public.lead_options (teacher_id) where teacher_id is not null;

comment on column public.lead_options.teacher_id is
  'For a PIC name: the account it stands for. Leads whose PIC is this name are that person''s own leads.';

-- Linking decides who sees which leads, so it is an admin's change, like the ticks.
create or replace function public.lead_options_guard_teacher()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.teacher_id is distinct from (case when tg_op = 'UPDATE' then old.teacher_id end)
    and auth.uid() is not null
    and not public.is_admin() then
    raise exception 'Only an admin can link a PIC to an account.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger lead_options_guard_teacher
before insert or update of teacher_id on public.lead_options
for each row execute function public.lead_options_guard_teacher();

revoke all on function public.lead_options_guard_teacher() from public, anon, authenticated;

-- The PIC names linked to the signed-in person (none, or one).
create or replace function public.my_pic_option_ids()
returns bigint[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(o.id), '{}'::bigint[])
  from public.lead_options o
  where o.kind = 'pic' and o.teacher_id = public.current_teacher_id();
$$;

revoke all on function public.my_pic_option_ids() from public, anon;
grant execute on function public.my_pic_option_ids() to authenticated;

-- Is a row with this owner inside the scope? Scope 'all' or null-safe owner checks, one place for every rule.
create or replace function public.in_scope(p_scope text, p_is_mine boolean, p_is_unassigned boolean)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case p_scope
    when 'all' then true
    when 'own_unassigned' then coalesce(p_is_mine, false) or coalesce(p_is_unassigned, false)
    when 'own' then coalesce(p_is_mine, false)
    else false
  end;
$$;

grant execute on function public.in_scope(text, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 2. Leads.
-- ---------------------------------------------------------------------------------------------------------

drop policy if exists leads_select_permitted on public.leads;
drop policy if exists leads_insert_permitted on public.leads;
drop policy if exists leads_update_permitted on public.leads;
drop policy if exists leads_delete_permitted on public.leads;

create policy leads_select_permitted on public.leads
  for select to authenticated
  using (public.in_scope(
    (select public.permission_scope('leads', 'view')),
    pic_id = any ((select public.my_pic_option_ids())::bigint[]),
    pic_id is null
  ));

-- A new lead may be given to nobody, to me, or (scope all) to anyone.
create policy leads_insert_permitted on public.leads
  for insert to authenticated
  with check (
    (select public.permission_scope('leads', 'edit')) = 'all'
    or ((select public.permission_scope('leads', 'edit')) is not null
        and (pic_id is null or pic_id = any ((select public.my_pic_option_ids())::bigint[])))
  );

-- Changing a lead keeps it inside the scope (an own-scope person cannot hand it to someone else).
create policy leads_update_permitted on public.leads
  for update to authenticated
  using (public.in_scope(
    (select public.permission_scope('leads', 'edit')),
    pic_id = any ((select public.my_pic_option_ids())::bigint[]),
    pic_id is null
  ))
  with check (public.in_scope(
    (select public.permission_scope('leads', 'edit')),
    pic_id = any ((select public.my_pic_option_ids())::bigint[]),
    pic_id is null
  ));

create policy leads_delete_permitted on public.leads
  for delete to authenticated
  using (public.in_scope(
    (select public.permission_scope('leads', 'delete')),
    pic_id = any ((select public.my_pic_option_ids())::bigint[]),
    pic_id is null
  ));

-- ---------------------------------------------------------------------------------------------------------
-- 3. Inbox (the copy of the chats in the CRM database).
-- ---------------------------------------------------------------------------------------------------------

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
    and (
      inbox_id is null
      or (select public.my_whatsapp_inbox_ids()) is null
      or inbox_id = any ((select public.my_whatsapp_inbox_ids())::bigint[])
      or inbox_id <> all (array(select n.chatwoot_inbox_id::bigint from public.whatsapp_numbers n where n.chatwoot_inbox_id is not null))
    )
  );

-- A message is seen when its chat is (the chat's own rule above decides, as RLS also applies inside it).
create policy "Inbox tick reads the messages it may see"
  on public.inbox_messages for select to authenticated
  using (
    (select public.permission_scope('inbox', 'view')) is not null
    and (
      inbox_id is null
      or (select public.my_whatsapp_inbox_ids()) is null
      or inbox_id = any ((select public.my_whatsapp_inbox_ids())::bigint[])
      or inbox_id <> all (array(select n.chatwoot_inbox_id::bigint from public.whatsapp_numbers n where n.chatwoot_inbox_id is not null))
    )
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

-- ---------------------------------------------------------------------------------------------------------
-- 4. Team Replies.
-- ---------------------------------------------------------------------------------------------------------

drop policy if exists "Team replies tick reads the kept days" on public.team_reply_days;
create policy "Team replies tick reads the kept days"
  on public.team_reply_days for select to authenticated
  using (public.in_scope(
    (select public.permission_scope('team_replies', 'view')),
    staff_id = (select public.current_teacher_id()),
    false
  ));

create or replace function public.team_reply_today()
returns table (
  day date,
  replier text,
  staff_id bigint,
  replies integer,
  chat_ids bigint[],
  waits integer[],
  within_target integer,
  slowest integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.*
  from public.team_reply_rows(
    ((now() at time zone 'Asia/Kuala_Lumpur')::date)::timestamp at time zone 'Asia/Kuala_Lumpur',
    now() + interval '1 minute'
  ) r
  where public.in_scope(
    (select public.permission_scope('team_replies', 'view')),
    r.staff_id = (select public.current_teacher_id()),
    false
  );
$$;

revoke all on function public.team_reply_today() from public, anon;
grant execute on function public.team_reply_today() to authenticated;
