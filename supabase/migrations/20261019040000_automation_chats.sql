-- Automations for people with no phone number: Messenger and Instagram, and buttons.
--
-- Until now an automation reached a family only through a phone number, so a parent who wrote on Messenger
-- (no number) could never be messaged. Now the queue can point at a CHAT instead:
--   * automation_queue.conversation_id / contact_id / channel say which chat; phone is empty for these rows;
--   * when a lead has no number the runner uses the lead's Messenger / Instagram chat (lead_channels), but only
--     for a flow that is set to send there: a flow's settings.channels (default ["whatsapp"]) lists where it
--     sends, so every flow made before this keeps sending on WhatsApp only;
--   * a message block may carry ghlWorkflowId: it then starts that GoHighLevel workflow (the buttons are
--     written there) instead of sending text. The queue row is kind 'ghl_workflow'. It only goes out by itself.
--     What the parent presses comes back as their reply (the button's title), so the usual wait-for-reply /
--     reply-word blocks branch on it;
--   * the sender program only picks a Messenger / Instagram message while the parent's last message is under
--     23 hours old (Meta allows 24); later ones wait for a person;
--   * STOP is remembered per chat (automation_chat_optouts) as it is per number.

alter table public.automation_flow_log drop constraint if exists automation_flow_log_kind_check;
alter table public.automation_flow_log
  add constraint automation_flow_log_kind_check
  check (kind in (
    'stage_stopped', 'cooldown', 'condition_no', 'no_message', 'no_phone', 'opted_out',
    'replied', 'no_reply', 'reply_branch', 'action_done', 'action_skipped', 'channel_off'
  ));

alter table public.automation_queue
  add column if not exists conversation_id bigint,
  add column if not exists contact_id bigint,
  add column if not exists channel text not null default 'whatsapp'
    check (channel in ('whatsapp', 'messenger', 'instagram')),
  add column if not exists kind text not null default 'message'
    check (kind in ('message', 'ghl_workflow')),
  add column if not exists workflow_id text check (workflow_id is null or char_length(workflow_id) <= 60);

alter table public.automation_queue alter column phone drop not null;

do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.automation_queue'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%phone%'
  loop
    execute format('alter table public.automation_queue drop constraint %I', c.conname);
  end loop;
end
$$;

alter table public.automation_queue
  add constraint automation_queue_who_check
  check (
    (phone is not null and phone ~ '^[0-9]{8,15}$')
    or (phone is null and conversation_id is not null and contact_id is not null)
  );

create table if not exists public.automation_chat_optouts (
  contact_id bigint primary key,
  reason text check (reason is null or char_length(reason) <= 200),
  created_at timestamptz not null default now()
);

alter table public.automation_chat_optouts enable row level security;

drop policy if exists "automation_chat_optouts_select_permitted" on public.automation_chat_optouts;
create policy "automation_chat_optouts_select_permitted"
on public.automation_chat_optouts
for select to authenticated
using ((select public.has_permission('leads')));

grant select on public.automation_chat_optouts to authenticated;

-- The chat a lead without a number is reached on: its newest Messenger / Instagram chat.
create or replace function automation.lead_chat(p_lead_id bigint)
returns table (conversation_id bigint, contact_id bigint, channel text)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(ca.conversation_id, lc.conversation_id), lc.chatwoot_contact_id, lc.channel
  from public.lead_channels lc
  left join lateral (
    select a.conversation_id, a.last_message_at
    from public.chat_activity a
    where a.contact_id = lc.chatwoot_contact_id
    order by a.last_message_at desc
    limit 1
  ) ca on true
  where lc.lead_id = p_lead_id
    and lc.channel in ('messenger', 'instagram')
    and coalesce(ca.conversation_id, lc.conversation_id) is not null
  order by ca.last_message_at desc nulls last, lc.id desc
  limit 1
$$;

revoke all on function automation.lead_chat(bigint) from public, anon, authenticated;

create or replace function public.automation_flows_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  g jsonb := new.graph;
  nodes jsonb;
  edges jsonb;
  n jsonb;
  e jsonb;
  ids text[] := array['trigger'];
  nid text;
  from_type text;
  lim text;
begin
  if g is null or jsonb_typeof(g) <> 'object' then
    raise exception 'The flow is not valid.';
  end if;
  nodes := coalesce(g -> 'nodes', '[]'::jsonb);
  edges := coalesce(g -> 'edges', '[]'::jsonb);
  if jsonb_typeof(nodes) <> 'array' or jsonb_typeof(edges) <> 'array' then
    raise exception 'The flow is not valid.';
  end if;
  if jsonb_array_length(nodes) > 40 then
    raise exception 'A flow can have up to 40 blocks.';
  end if;
  if jsonb_array_length(edges) > 80 then
    raise exception 'A flow can have up to 80 lines.';
  end if;

  -- Flow settings (optional): stages to leave alone, and days before the same person is messaged again.
  if g -> 'settings' is not null and jsonb_typeof(g -> 'settings') <> 'null' then
    if jsonb_typeof(g -> 'settings') <> 'object' then
      raise exception 'The flow settings are not valid.';
    end if;
    if g -> 'settings' -> 'stopStages' is not null and (
         jsonb_typeof(g -> 'settings' -> 'stopStages') <> 'array'
         or jsonb_array_length(g -> 'settings' -> 'stopStages') > 6
         or exists (
           select 1 from jsonb_array_elements(g -> 'settings' -> 'stopStages') s
           where jsonb_typeof(s) <> 'string'
              or (s #>> '{}') not in ('new', 'contacted', 'trial_scheduled', 'trial_completed', 'converted', 'lost')
         )
       ) then
      raise exception 'The stages to leave alone are not valid.';
    end if;
    if g -> 'settings' ->> 'cooldownDays' is not null and (
         (g -> 'settings' ->> 'cooldownDays') !~ '^[0-9]{1,3}$'
         or (g -> 'settings' ->> 'cooldownDays')::integer > 365
       ) then
      raise exception 'The days before messaging the same person again must be 0 to 365.';
    end if;
    -- Where the flow sends: WhatsApp (the default), Messenger, Instagram.
    if g -> 'settings' -> 'channels' is not null and jsonb_typeof(g -> 'settings' -> 'channels') <> 'null' and (
         jsonb_typeof(g -> 'settings' -> 'channels') <> 'array'
         or jsonb_array_length(g -> 'settings' -> 'channels') not between 1 and 3
         or exists (
           select 1 from jsonb_array_elements(g -> 'settings' -> 'channels') s
           where jsonb_typeof(s) <> 'string' or (s #>> '{}') not in ('whatsapp', 'messenger', 'instagram')
         )
       ) then
      raise exception 'The channels a flow sends on are not valid.';
    end if;
  end if;

  for n in select value from jsonb_array_elements(nodes) as t(value) loop
    nid := n ->> 'id';
    if nid is null or nid !~ '^[A-Za-z0-9_-]{1,20}$' or nid = any (ids) then
      raise exception 'A block has a missing or repeated id.';
    end if;
    ids := ids || nid;

    if n ->> 'type' = 'message' then
      if coalesce(n ->> 'mins', '') !~ '^[0-9]{1,5}$' or (n ->> 'mins')::integer not between 3 and 86400 then
        raise exception 'A message must be set 3 minutes to 60 days before or after.';
      end if;
      if n -> 'after' is not null and jsonb_typeof(n -> 'after') not in ('boolean', 'null') then
        raise exception 'A message must say whether it goes before or after.';
      end if;
      if char_length(btrim(coalesce(n ->> 'text', ''))) not between 1 and 3000 then
        raise exception 'Every message needs text (up to 3000 characters).';
      end if;
      if n -> 'imageUrl' is not null and jsonb_typeof(n -> 'imageUrl') <> 'null' and (
           jsonb_typeof(n -> 'imageUrl') <> 'string'
           or char_length(n ->> 'imageUrl') > 500
           or (n ->> 'imageUrl') !~ '^https://[^ ]+$'
         ) then
        raise exception 'A message picture must be a web address that starts with https://.';
      end if;
      -- A message that starts a GoHighLevel workflow (the buttons are written there) instead of sending its text.
      if n -> 'ghlWorkflowId' is not null and jsonb_typeof(n -> 'ghlWorkflowId') <> 'null' and (
           jsonb_typeof(n -> 'ghlWorkflowId') <> 'string'
           or (n ->> 'ghlWorkflowId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
         ) then
        raise exception 'A button message needs the GoHighLevel workflow id (the long code in the workflow address).';
      end if;
    elsif n ->> 'type' = 'action' then
      if coalesce(n ->> 'mins', '') !~ '^[0-9]{1,5}$' or (n ->> 'mins')::integer not between 0 and 86400 then
        raise exception 'A step that changes the lead must be set 0 minutes to 60 days before or after.';
      end if;
      if n -> 'after' is not null and jsonb_typeof(n -> 'after') not in ('boolean', 'null') then
        raise exception 'A step must say whether it happens before or after.';
      end if;
      if n ->> 'action' in ('add_tag', 'assign_pic') then
        if coalesce(n ->> 'value', '') !~ '^[0-9]{1,12}$' then
          raise exception 'A step that adds a tag or assigns a PIC needs one picked.';
        end if;
      elsif n ->> 'action' = 'set_stage' then
        -- Never "converted": that makes a student, which only a person does.
        if coalesce(n ->> 'value', '') not in ('new', 'contacted', 'trial_scheduled', 'trial_completed', 'lost') then
          raise exception 'A step that changes the stage needs a stage picked (a lead is converted by a person).';
        end if;
      else
        raise exception 'A step has an unknown action.';
      end if;
    elsif n ->> 'type' = 'condition' then
      if n ->> 'kind' = 'age' then
        foreach lim in array array['min', 'max'] loop
          if n ->> lim is not null and ((n ->> lim) !~ '^[0-9]{1,2}$' or (n ->> lim)::integer > 30) then
            raise exception 'Ages must be whole numbers from 0 to 30.';
          end if;
        end loop;
        if n ->> 'min' is null and n ->> 'max' is null then
          raise exception 'An age condition needs a lowest or a highest age.';
        end if;
        if n ->> 'min' is not null and n ->> 'max' is not null and (n ->> 'min')::integer > (n ->> 'max')::integer then
          raise exception 'The lowest age is higher than the highest age.';
        end if;
      elsif n ->> 'kind' = 'classroom' then
        if jsonb_typeof(n -> 'ids') <> 'array'
           or jsonb_array_length(n -> 'ids') not between 1 and 50
           or exists (select 1 from jsonb_array_elements(n -> 'ids') x where jsonb_typeof(x) <> 'number') then
          raise exception 'A class condition needs at least one class.';
        end if;
      elsif n ->> 'kind' = 'hours' then
        if coalesce(n ->> 'max', '') !~ '^[0-9]{1,3}$' or (n ->> 'max')::integer > 500 then
          raise exception 'Hours left must be a whole number from 0 to 500.';
        end if;
      elsif n ->> 'kind' = 'stage' then
        if jsonb_typeof(n -> 'stages') <> 'array' then
          raise exception 'A stage condition needs at least one stage.';
        end if;
        if jsonb_array_length(n -> 'stages') not between 1 and 6
           or exists (
             select 1 from jsonb_array_elements(n -> 'stages') s
             where jsonb_typeof(s) <> 'string'
                or (s #>> '{}') not in ('new', 'contacted', 'trial_scheduled', 'trial_completed', 'converted', 'lost')
           ) then
          raise exception 'A stage condition needs at least one stage.';
        end if;
      elsif n ->> 'kind' in ('source', 'tag', 'pic', 'keyword') then
        if jsonb_typeof(n -> 'ids') <> 'array'
           or jsonb_array_length(n -> 'ids') not between 1 and 50
           or exists (
             select 1 from jsonb_array_elements(n -> 'ids') x
             where jsonb_typeof(x) <> 'string' or (x #>> '{}') !~ '^[0-9]{1,12}$'
           ) then
          raise exception 'A condition needs at least one choice ticked.';
        end if;
      elsif n ->> 'kind' = 'form' then
        if jsonb_typeof(n -> 'ids') <> 'array'
           or jsonb_array_length(n -> 'ids') not between 1 and 50
           or exists (
             select 1 from jsonb_array_elements(n -> 'ids') x
             where jsonb_typeof(x) <> 'string'
                or (x #>> '{}') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
           ) then
          raise exception 'A form condition needs at least one form ticked.';
        end if;
      elsif n ->> 'kind' = 'wait' then
        if coalesce(n ->> 'mins', '') !~ '^[0-9]{1,5}$' or (n ->> 'mins')::integer not between 1 and 20160 then
          raise exception 'Waiting for a reply can be 1 minute to 14 days.';
        end if;
      elsif n ->> 'kind' = 'reply' then
        if jsonb_typeof(n -> 'words') <> 'array'
           or jsonb_array_length(n -> 'words') not between 1 and 20
           or exists (
             select 1 from jsonb_array_elements(n -> 'words') x
             where jsonb_typeof(x) <> 'string' or char_length(btrim(x #>> '{}')) not between 1 and 40
           ) then
          raise exception 'A reply condition needs 1 to 20 words, each up to 40 characters.';
        end if;
      else
        raise exception 'A condition has an unknown kind.';
      end if;
    else
      raise exception 'A block has an unknown type.';
    end if;
  end loop;

  for e in select value from jsonb_array_elements(edges) as t(value) loop
    if not (e ->> 'from') = any (ids) or not (e ->> 'to') = any (ids) or (e ->> 'to') = 'trigger' then
      raise exception 'A line connects to a block that does not exist.';
    end if;
    if e ->> 'from' = 'trigger' then
      from_type := 'trigger';
    else
      select x ->> 'type' into from_type
      from jsonb_array_elements(nodes) x
      where x ->> 'id' = e ->> 'from'
      limit 1;
    end if;
    -- The trigger, a message and a step have one way out ("out"); a condition has Yes and No.
    if (from_type in ('trigger', 'message', 'action') and coalesce(e ->> 'port', '') <> 'out')
       or (from_type = 'condition' and coalesce(e ->> 'port', '') not in ('yes', 'no')) then
      raise exception 'A line starts from an unknown point.';
    end if;
  end loop;

  return new;
end;
$$;

create or replace function public.record_chat_message(
  p_key text,
  p_conversation_id bigint,
  p_contact_id bigint,
  p_direction text,
  p_at timestamptz,
  p_name text,
  p_phone text,
  p_opt_out boolean default false,
  p_text text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_key text;
  at_time timestamptz;
  newest text;
  opt_phone text;
begin
  select webhook_key into stored_key from public.chat_webhook_settings limit 1;
  if p_key is null or stored_key is null or p_key <> stored_key then
    raise exception 'The key is not right.' using errcode = '28000';
  end if;

  if p_direction not in ('incoming', 'outgoing') then
    raise exception 'The direction must be incoming or outgoing.';
  end if;
  if p_conversation_id is null or p_conversation_id <= 0 then
    raise exception 'The chat is missing.';
  end if;

  -- A clock a little ahead is fine; a message from the future is not.
  at_time := least(coalesce(p_at, now()), now() + interval '5 minutes');

  insert into public.chat_activity as a (
    conversation_id, contact_id, contact_name, contact_phone,
    last_incoming_at, last_outgoing_at, last_direction, last_message_at,
    silence_started_at, waiting_started_at
  )
  values (
    p_conversation_id,
    p_contact_id,
    left(nullif(btrim(p_name), ''), 200),
    left(nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), ''), 30),
    case when p_direction = 'incoming' then at_time end,
    case when p_direction = 'outgoing' then at_time end,
    p_direction,
    at_time,
    case when p_direction = 'outgoing' then at_time end,
    case when p_direction = 'incoming' then at_time end
  )
  on conflict (conversation_id) do update
  set contact_id = coalesce(excluded.contact_id, a.contact_id),
      contact_name = coalesce(excluded.contact_name, a.contact_name),
      contact_phone = coalesce(excluded.contact_phone, a.contact_phone),
      last_incoming_at = greatest(a.last_incoming_at, excluded.last_incoming_at),
      last_outgoing_at = greatest(a.last_outgoing_at, excluded.last_outgoing_at),
      last_direction = case
        when excluded.last_message_at >= a.last_message_at then excluded.last_direction
        else a.last_direction
      end,
      -- The silence begins with our first message after the parent's last one and ends when they write.
      silence_started_at = case
        when excluded.last_message_at < a.last_message_at then a.silence_started_at
        when excluded.last_direction = 'incoming' then null
        when a.last_direction = 'incoming' or a.silence_started_at is null then excluded.last_message_at
        else a.silence_started_at
      end,
      -- The parent starts waiting with their first message after ours and stops when we write.
      waiting_started_at = case
        when excluded.last_message_at < a.last_message_at then a.waiting_started_at
        when excluded.last_direction = 'outgoing' then null
        when a.last_direction = 'outgoing' or a.waiting_started_at is null then excluded.last_message_at
        else a.waiting_started_at
      end,
      last_message_at = greatest(a.last_message_at, excluded.last_message_at),
      updated_at = now();

  -- What a parent writes is kept only while an enabled flow waits for a reply (and only as long as the
  -- longest wait plus 2 days), so a flow can look for its words in it.
  if p_direction = 'incoming' and p_contact_id is not null and exists (
    select 1 from public.automation_flows f, jsonb_array_elements(coalesce(f.graph -> 'nodes', '[]'::jsonb)) x
    where f.enabled and x ->> 'kind' = 'wait'
  ) then
    insert into public.chat_messages (conversation_id, contact_id, at, body)
    values (p_conversation_id, p_contact_id, at_time, left(coalesce(p_text, ''), 500));
  end if;

  -- Only when this message is the newest one does it settle what was waiting.
  select last_direction into newest from public.chat_activity where conversation_id = p_conversation_id;
  if newest = p_direction then
    update public.automation_queue
    set status = 'skipped',
        decided_at = now(),
        error = case
          when p_direction = 'incoming' then 'The parent has replied since.'
          else 'The chat has been answered since.'
        end
    where status = 'pending'
      and dedupe_key like (
        'flow:%:' || case when p_direction = 'incoming' then 'chat_out:' else 'chat_in:' end
        || p_conversation_id || ':%'
      );
  end if;
  -- A parent who wrote "STOP" is not messaged by an automation again: the number is remembered and
  -- whatever is still waiting for approval for it is skipped.
  if p_opt_out and p_direction = 'incoming' then
    select coalesce(
      (
        select l.phone
        from public.people pe
        left join public.people par on par.id = pe.parent_id
        join public.leads l on l.id = coalesce(pe.lead_id, par.lead_id)
        where pe.chatwoot_contact_id = p_contact_id and l.phone ~ '^[0-9]{8,15}$'
        limit 1
      ),
      (
        select pe.phone from public.people pe
        where pe.chatwoot_contact_id = p_contact_id and pe.phone ~ '^[0-9]{8,15}$'
        limit 1
      ),
      case
        when regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') ~ '^(60|65)[0-9]{8,10}$'
        then regexp_replace(p_phone, '[^0-9]', '', 'g')
      end
    ) into opt_phone;

    if opt_phone is not null then
      insert into public.automation_optouts (phone, reason)
      values (opt_phone, 'The parent wrote STOP')
      on conflict (phone) do nothing;

      update public.automation_queue
      set status = 'skipped', decided_at = now(), error = 'The parent asked to stop.'
      where status = 'pending' and phone = opt_phone;
    end if;

    -- The same for the chat itself: Messenger and Instagram have no number to remember.
    if p_contact_id is not null then
      insert into public.automation_chat_optouts (contact_id, reason)
      values (p_contact_id, 'The parent wrote STOP')
      on conflict (contact_id) do nothing;

      update public.automation_queue
      set status = 'skipped', decided_at = now(), error = 'The parent asked to stop.'
      where status = 'pending' and contact_id = p_contact_id;
    end if;
  end if;
end;
$$;

revoke all on function public.record_chat_message(text, bigint, bigint, text, timestamptz, text, text, boolean, text)
from public, anon, authenticated;
grant execute on function public.record_chat_message(text, bigint, bigint, text, timestamptz, text, text, boolean, text)
to service_role;

revoke all on function automation.run_rules() from public, anon, authenticated;

drop function if exists public.automation_claim_auto(text);

create or replace function public.automation_claim_auto(p_key text)
returns table (
  id bigint,
  phone text,
  message text,
  parent_name text,
  lead_id bigint,
  rule_name text,
  media_url text,
  conversation_id bigint,
  contact_id bigint,
  channel text,
  kind text,
  workflow_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored text;
  st record;
  local_hour integer;
  used integer;
  last_at timestamptz;
  picked bigint;
begin
  select s.sender_key into stored from public.automation_sender s limit 1;
  if p_key is null or stored is null or p_key <> stored then
    raise exception 'not allowed' using errcode = '28000';
  end if;

  -- (a WHERE is needed: the API role refuses an UPDATE without one)
  update public.automation_settings cfg set sender_seen_at = now() where cfg.id;

  -- Messenger and Instagram only let us answer within 24 hours of the parent's last message. A message
  -- whose time has passed is not sent; a person decides (they can still write in the chat).
  update public.automation_queue q
  set auto_blocked = 'Messenger and Instagram only let us reply within 24 hours of the parent''s last message, and that time is over.'
  where q.status = 'pending'
    and q.auto_blocked is null
    and q.channel in ('messenger', 'instagram')
    and q.due_at <= now()
    and not exists (
      select 1 from public.chat_activity ca
      where ca.contact_id = q.contact_id and ca.last_incoming_at > now() - interval '23 hours'
    );

  -- A message taken by the sender that never reported back is not tried again by itself: it might
  -- have gone out. A person sees it as failed and decides.
  update public.automation_queue q
  set status = 'failed',
      error = 'The sender stopped before it finished. Check the chat before sending it again.'
  where q.status = 'sending'
    and q.sent_by_automation
    and q.decided_at < now() - interval '10 minutes';

  select s.paused, s.daily_cap, s.gap_seconds, s.send_from_hour, s.send_until_hour
  into st
  from public.automation_settings s
  limit 1;
  if not found or st.paused then
    return;
  end if;

  local_hour := extract(hour from (now() at time zone 'Asia/Kuala_Lumpur'))::integer;
  if local_hour < st.send_from_hour or local_hour >= st.send_until_hour then
    return;
  end if;

  select count(*) into used
  from public.automation_queue q
  where q.status in ('sent', 'sending')
    and coalesce(q.sent_at, q.decided_at)
        >= (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur');
  if used >= st.daily_cap then
    return;
  end if;

  select max(coalesce(q.sent_at, q.decided_at)) into last_at
  from public.automation_queue q
  where q.status in ('sent', 'sending');
  if last_at is not null and last_at > now() - make_interval(secs => st.gap_seconds) then
    return;
  end if;

  select q.id into picked
  from public.automation_queue q
  join public.automation_flows f on q.rule_key = 'flow_' || f.id
  where q.status = 'pending'
    and q.auto_blocked is null
    and q.due_at <= now()
    and (q.expires_at is null or q.expires_at > now())
    and f.enabled
    and (f.graph -> 'settings' ->> 'autoSend') = 'true'
    and not exists (select 1 from public.automation_optouts o where o.phone = q.phone)
    and not exists (select 1 from public.automation_chat_optouts oc where oc.contact_id = q.contact_id)
  order by q.due_at, q.id
  limit 1
  for update of q skip locked;

  if picked is null then
    return;
  end if;

  update public.automation_queue q
  set status = 'sending',
      decided_at = now(),
      decided_by = null,
      sent_by_automation = true,
      error = null
  where q.id = picked;

  return query
  select q.id, q.phone, q.message, q.parent_name, q.lead_id, q.rule_name, q.media_url,
         q.conversation_id, q.contact_id, q.channel, q.kind, q.workflow_id
  from public.automation_queue q
  where q.id = picked;
end;
$$;

revoke all on function public.automation_claim_auto(text) from public, anon, authenticated;
grant execute on function public.automation_claim_auto(text) to service_role;

create or replace function automation.run_rules()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued integer := 0;
  added integer;
  is_paused boolean;
  f record;
  ev record;
  m record;
  g record;
  w record;
  due timestamptz;
  expires timestamptz;
  contact_id bigint;
  to_phone text;
  to_name text;
  child_text text;
  groups jsonb;
  gkey text;
  cooldown_days integer;
  n_msgs integer;
  relevant boolean;
  has_wait boolean;
  sent_map jsonb;
  replies jsonb;
  keep_days integer;
  chat_conv bigint;
  chat_contact bigint;
  chat_channel text;
  wf_id text;
begin
  -- Reminders for events that already started are no longer useful.
  update public.automation_queue
  set status = 'expired'
  where status = 'pending'
    and expires_at is not null
    and expires_at < now();

  -- Finished rows older than 90 days are tidied away.
  delete from public.automation_queue
  where status in ('sent', 'skipped', 'expired')
    and created_at < now() - interval '90 days';

  delete from public.automation_flow_log
  where created_at < now() - interval '90 days';

  -- Parents' texts are kept as long as the longest wait of an enabled flow plus 2 days (at least 2 days).
  select greatest(2, coalesce(max(ceil((x ->> 'mins')::numeric / 1440)), 0)::integer + 2)
  into keep_days
  from public.automation_flows wf, jsonb_array_elements(coalesce(wf.graph -> 'nodes', '[]'::jsonb)) x
  where wf.enabled and x ->> 'kind' = 'wait';
  keep_days := coalesce(keep_days, 2);

  delete from public.chat_messages
  where at < now() - make_interval(days => keep_days);

  select s.paused into is_paused from public.automation_settings s limit 1;
  if coalesce(is_paused, false) then
    return 0;
  end if;

  for f in
    select id, name, trigger_type, graph
    from public.automation_flows
    where enabled
    order by id
  loop
    begin
      -- Messages for a contact are gathered here and written once per group (one per class).
      groups := '{}'::jsonb;
      cooldown_days := coalesce(nullif(f.graph -> 'settings' ->> 'cooldownDays', '')::integer, 0);
      -- A flow that waits for a reply only looks at events the kept texts can still answer for.
      has_wait := exists (
        select 1 from jsonb_array_elements(coalesce(f.graph -> 'nodes', '[]'::jsonb)) x
        where x ->> 'kind' = 'wait'
      );

      for ev in
        select *
        from automation.rule_events e
        where e.trigger_type = f.trigger_type
          and e.starts_at > now() - case when has_wait then make_interval(days => keep_days + 14) else interval '62 days' end
          and e.starts_at <= now() + interval '62 days'
      loop
        -- Stages this flow leaves alone (for example Converted and Lost).
        if ev.lead_status is not null
           and coalesce(f.graph -> 'settings' -> 'stopStages', '[]'::jsonb) ? ev.lead_status then
          if has_wait or automation.flow_event_relevant(f.graph, ev.starts_at) then
            perform automation.log_flow_event(
              f.id, ev.event_key, '', 'stage_stopped',
              format('Lead stage is "%s", which this flow leaves alone.', ev.lead_status),
              ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
            );
          end if;
          continue;
        end if;

        -- The same person is not messaged again by this flow within the cooldown, unless it is the
        -- same event (the steps of one sequence).
        if cooldown_days > 0 and exists (
          select 1
          from public.automation_queue q
          where q.rule_key = 'flow_' || f.id
            and q.created_at > now() - make_interval(days => cooldown_days)
            and q.status in ('pending', 'sending', 'sent')
            and (q.lead_id = ev.lead_id or q.phone = ev.phone)
            and right(q.dedupe_key, char_length(ev.event_key)) <> ev.event_key
        ) then
          if has_wait or automation.flow_event_relevant(f.graph, ev.starts_at) then
            perform automation.log_flow_event(
              f.id, ev.event_key, '', 'cooldown',
              format('This person was already messaged by this flow in the last %s days.', cooldown_days),
              ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
            );
          end if;
          continue;
        end if;

        n_msgs := 0;
        sent_map := null;
        replies := null;
        if has_wait then
          -- When each message of this flow was sent for this event, and what the parent wrote.
          select coalesce(jsonb_object_agg(x ->> 'id', q.sent_at), '{}'::jsonb) into sent_map
          from jsonb_array_elements(coalesce(f.graph -> 'nodes', '[]'::jsonb)) x
          join public.automation_queue q
            on q.dedupe_key = 'flow:' || f.id || ':' || (x ->> 'id') || ':' || ev.event_key
           and q.status = 'sent' and q.sent_at is not null
          where x ->> 'type' = 'message';

          select coalesce(jsonb_agg(jsonb_build_object('at', cm.at, 'text', cm.body) order by cm.at), '[]'::jsonb)
          into replies
          from public.chat_messages cm
          where cm.at > now() - make_interval(days => keep_days)
            and cm.contact_id in (
              select p.chatwoot_contact_id
              from public.people p
              left join public.people par on par.id = p.parent_id
              where p.chatwoot_contact_id is not null
                and (
                  (ev.lead_id is not null and (p.lead_id = ev.lead_id or par.lead_id = ev.lead_id))
                  or (ev.student_id is not null and p.student_id = ev.student_id)
                )
            );
        end if;

        for m in
          select * from automation.flow_walk(
            f.graph, ev.age, ev.classroom_id, ev.hours_left, ev.lead_status,
            ev.source_id, ev.pic_id, ev.tag_ids, ev.form_ids, ev.keyword_id,
            sent_map, replies, ev.starts_at
          )
        loop
          -- A step that changes the lead happens by itself once it is due (nothing waits for approval).
          if m.node_type = 'action' then
            n_msgs := n_msgs + 1;
            if m.anchor_at is not null then
              due := m.anchor_at + make_interval(mins => m.mins);
            elsif m.is_after then
              due := ev.starts_at + make_interval(mins => m.mins);
            else
              if ev.starts_at <= now() then
                continue;
              end if;
              due := ev.starts_at - make_interval(mins => m.mins);
            end if;
            -- Not before its time, and not hours late (a lead may have moved on by then).
            if due > now() or due < now() - interval '1 hour' then
              continue;
            end if;
            perform automation.do_flow_action(
              f.id, ev.event_key, m.node_id, m.kind, m.message_text,
              ev.lead_id, ev.phone, ev.parent_name, ev.child_name, ev.student_id, ev.starts_at
            );
            continue;
          end if;

          -- The blocks that are not messages only tell what happened to the parent's reply.
          if m.node_type <> 'message' then
            if m.kind = 'wait' and m.port = 'yes' then
              perform automation.log_flow_event(
                f.id, ev.event_key, m.node_id, 'replied', m.detail,
                ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
              );
            elsif m.kind = 'wait' and m.port = 'no' then
              perform automation.log_flow_event(
                f.id, ev.event_key, m.node_id, 'no_reply', m.detail,
                ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
              );
            elsif m.kind = 'reply' and m.port = 'yes' then
              perform automation.log_flow_event(
                f.id, ev.event_key, m.node_id, 'reply_branch', m.detail,
                ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
              );
            end if;
            continue;
          end if;

          n_msgs := n_msgs + 1;
          if m.anchor_at is not null then
            -- After a reply (or after the wait ran out): counted from that moment.
            due := m.anchor_at + make_interval(mins => m.mins);
            expires := due + interval '1 day';
          elsif m.is_after then
            due := ev.starts_at + make_interval(mins => m.mins);
            -- Something told a day after it happened is not worth sending two days late.
            expires := due + interval '1 day';
          else
            -- Before the event: never once it has started.
            if ev.starts_at <= now() then
              continue;
            end if;
            due := ev.starts_at - make_interval(mins => m.mins);
            expires := ev.starts_at;
          end if;

          if due > now() + interval '3 hours' or due < now() - interval '1 hour' then
            continue;
          end if;

          -- Who gets it: the family of the event, or the contact named on the block.
          select nullif(x ->> 'contactId', '')::bigint into contact_id
          from jsonb_array_elements(coalesce(f.graph -> 'nodes', '[]'::jsonb)) x
          where x ->> 'id' = m.node_id
          limit 1;

          -- A message that starts a GoHighLevel workflow (the buttons live there) instead of sending its text.
          select nullif(x ->> 'ghlWorkflowId', '') into wf_id
          from jsonb_array_elements(coalesce(f.graph -> 'nodes', '[]'::jsonb)) x
          where x ->> 'id' = m.node_id
          limit 1;

          child_text := coalesce(nullif(btrim(ev.child_name), ''), 'your child');

          if contact_id is null then
            -- The family: a number to send to, or (Messenger / Instagram) the lead's own chat.
            chat_conv := null;
            chat_contact := null;
            chat_channel := null;
            if ev.phone is null or ev.phone !~ '^[0-9]{8,15}$' then
              if ev.lead_id is not null then
                select lc.conversation_id, lc.contact_id, lc.channel
                into chat_conv, chat_contact, chat_channel
                from automation.lead_chat(ev.lead_id) lc;
              end if;
              if chat_conv is null then
                perform automation.log_flow_event(
                  f.id, ev.event_key, m.node_id, 'no_phone',
                  'This family has no usable phone number and no Messenger or Instagram chat, so nothing could be queued.',
                  ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
                );
                continue;
              end if;
              if not (coalesce(f.graph -> 'settings' -> 'channels', '["whatsapp"]'::jsonb) ? chat_channel) then
                perform automation.log_flow_event(
                  f.id, ev.event_key, m.node_id, 'channel_off',
                  format('This flow is not set to send on %s.', initcap(chat_channel)),
                  ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
                );
                continue;
              end if;
              if exists (select 1 from public.automation_chat_optouts o where o.contact_id = chat_contact) then
                perform automation.log_flow_event(
                  f.id, ev.event_key, m.node_id, 'opted_out',
                  'The parent wrote STOP, so this flow does not message them.',
                  ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
                );
                continue;
              end if;
            else
              if not (coalesce(f.graph -> 'settings' -> 'channels', '["whatsapp"]'::jsonb) ? 'whatsapp') then
                perform automation.log_flow_event(
                  f.id, ev.event_key, m.node_id, 'channel_off',
                  'This flow is not set to send on WhatsApp.',
                  ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
                );
                continue;
              end if;
              -- A parent who wrote STOP is left alone.
              if exists (select 1 from public.automation_optouts o where o.phone = ev.phone) then
                perform automation.log_flow_event(
                  f.id, ev.event_key, m.node_id, 'opted_out',
                  'The parent wrote STOP, so this flow does not message them.',
                  ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
                );
                continue;
              end if;
            end if;
            -- A button message is a GoHighLevel workflow: it needs a Messenger / Instagram chat and goes out by itself.
            if wf_id is not null and (
                 chat_conv is null or coalesce(f.graph -> 'settings' ->> 'autoSend', 'false') <> 'true'
               ) then
              perform automation.log_flow_event(
                f.id, ev.event_key, m.node_id, 'channel_off',
                'A button message needs a Messenger or Instagram chat, and the flow set to send by itself.',
                ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
              );
              continue;
            end if;
            insert into public.automation_queue
              (rule_key, rule_name, dedupe_key, phone, parent_name, child_name, lead_id, student_id,
               message, due_at, expires_at, media_url, conversation_id, contact_id, channel, kind, workflow_id)
            values (
              'flow_' || f.id,
              f.name,
              'flow:' || f.id || ':' || m.node_id || ':' || ev.event_key,
              case when chat_conv is null then ev.phone end,
              left(ev.parent_name, 200),
              left(ev.child_name, 200),
              ev.lead_id,
              ev.student_id,
              left(
                replace(replace(replace(replace(replace(replace(replace(replace(m.message_text,
                  '{parent_phone}', coalesce(automation.local_phone(ev.phone), '')),
                  '{child_lower}', automation.compact_name(child_text)),
                  '{child}', child_text),
                  '{parent}', coalesce(nullif(btrim(ev.parent_name), ''), 'there')),
                  '{time}', ev.start_label),
                  '{date}', to_char(ev.class_date, 'Dy DD Mon')),
                  '{class}', coalesce(ev.class_label, 'class')),
                  '{hours_left}', coalesce(round(ev.hours_left)::bigint::text, '?')),
                4000),
              due,
              expires,
              nullif(left(m.image_url, 600), ''),
              chat_conv,
              chat_contact,
              coalesce(chat_channel, 'whatsapp'),
              case when wf_id is null then 'message' else 'ghl_workflow' end,
              wf_id
            )
            on conflict (dedupe_key) do nothing;
            get diagnostics added = row_count;
            queued := queued + added;
          else
            select c.phone, c.name into to_phone, to_name
            from public.automation_contacts c
            where c.id = contact_id;
            if not found then
              raise exception 'A message is sent to a contact that no longer exists.';
            end if;
            gkey := 'flow:' || f.id || ':' || m.node_id || ':' || coalesce(ev.group_key, ev.event_key);
            if groups ? gkey then
              groups := jsonb_set(
                jsonb_set(
                  groups,
                  array[gkey, 'children'],
                  (groups -> gkey -> 'children') || to_jsonb(child_text)
                ),
                array[gkey, 'parents'],
                (groups -> gkey -> 'parents') || to_jsonb(coalesce(nullif(btrim(ev.parent_name), ''), ''))
              );
              groups := jsonb_set(
                groups,
                array[gkey, 'phones'],
                (groups -> gkey -> 'phones') || to_jsonb(coalesce(ev.phone, ''))
              );
            else
              groups := groups || jsonb_build_object(
                gkey,
                jsonb_build_object(
                  'phone', to_phone,
                  'name', to_name,
                  'template', m.message_text,
                  'media', m.image_url,
                  'due', due,
                  'expires', expires,
                  'time', ev.start_label,
                  'date', to_char(ev.class_date, 'Dy DD Mon'),
                  'class', coalesce(ev.class_label, 'class'),
                  'hours', ev.hours_left,
                  'children', jsonb_build_array(child_text),
                  'parents', jsonb_build_array(coalesce(nullif(btrim(ev.parent_name), ''), '')),
                  'phones', jsonb_build_array(coalesce(ev.phone, ''))
                )
              );
            end if;
          end if;
        end loop;

        -- Nothing to send for an event that is about to matter: say which block stopped it.
        if n_msgs = 0 then
          relevant := has_wait or automation.flow_event_relevant(f.graph, ev.starts_at);
          if relevant then
            select * into w
            from automation.flow_walk(
              f.graph, ev.age, ev.classroom_id, ev.hours_left, ev.lead_status,
              ev.source_id, ev.pic_id, ev.tag_ids, ev.form_ids, ev.keyword_id,
              sent_map, replies, ev.starts_at
            ) x
            where x.node_type = 'condition' and x.port = 'no' and x.ended and x.kind not in ('wait', 'reply')
            limit 1;
            if found then
              perform automation.log_flow_event(
                f.id, ev.event_key, w.node_id, 'condition_no', w.detail,
                ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
              );
            else
              perform automation.log_flow_event(
                f.id, ev.event_key, '', 'no_message',
                'This flow has no message to send for this event.',
                ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
              );
            end if;
          end if;
        end if;
      end loop;

      for g in select key, value from jsonb_each(groups) loop
        insert into public.automation_queue
          (rule_key, rule_name, dedupe_key, phone, parent_name, child_name, lead_id, student_id,
           message, due_at, expires_at, media_url)
        values (
          'flow_' || f.id,
          f.name,
          g.key,
          g.value ->> 'phone',
          left(g.value ->> 'name', 200),
          left(
            (select string_agg(x, ', ') from jsonb_array_elements_text(g.value -> 'children') as t(x)),
            200
          ),
          null,
          null,
          left(
            replace(replace(replace(replace(replace(replace(replace(replace(g.value ->> 'template',
              '{parent_phone}', coalesce(
                (select string_agg(distinct automation.local_phone(x), ', ')
                 from jsonb_array_elements_text(g.value -> 'phones') as t(x) where x <> ''), '')),
              '{child_lower}', coalesce(
                (select string_agg(automation.compact_name(x), ', ')
                 from jsonb_array_elements_text(g.value -> 'children') as t(x)), '')),
              '{child}', (select string_agg(x, ', ') from jsonb_array_elements_text(g.value -> 'children') as t(x))),
              '{parent}', coalesce(
                nullif((select string_agg(distinct x, ', ') from jsonb_array_elements_text(g.value -> 'parents') as t(x) where x <> ''), ''),
                'there')),
              '{time}', g.value ->> 'time'),
              '{date}', g.value ->> 'date'),
              '{class}', g.value ->> 'class'),
              '{hours_left}', coalesce(g.value ->> 'hours', '?')),
            4000),
          (g.value ->> 'due')::timestamptz,
          (g.value ->> 'expires')::timestamptz,
          nullif(g.value ->> 'media', '')
        )
        on conflict (dedupe_key) do nothing;
        get diagnostics added = row_count;
        queued := queued + added;
      end loop;

      update public.automation_flows set last_run_at = now(), last_error = null where id = f.id;
    exception when others then
      -- One broken flow must not stop the others; the page shows what went wrong.
      update public.automation_flows
      set last_run_at = now(), last_error = left(sqlerrm, 500)
      where id = f.id;
    end;
  end loop;

  return queued;
end;
$$;

revoke all on function automation.run_rules() from public, anon, authenticated;
