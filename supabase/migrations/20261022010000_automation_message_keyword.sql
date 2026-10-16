-- A flow that starts from a message with a keyword, and two steps to go with it: make the lead, set the source.
--
-- "When a WhatsApp / Messenger / Instagram message holds one of my words, the person becomes a lead, gets a
-- tag and a source, and a longer flow goes on from there." Until now this was only possible on WhatsApp through
-- the Source rules of the inbox (the first message, one phrase, one source), and a Source rule cannot start
-- a flow with waits and replies.
--
--   * trigger message_keyword   an incoming message that holds one of the flow's words (settings.keywords, any
--                               capitals and punctuation) on a channel the flow is set to (settings.channels);
--                               the person's first such message only, unless settings.everyTime is true.
--   * step make_lead            makes the lead of that chat when it is not one yet (a WhatsApp number, or the
--                               Messenger / Instagram person); nothing happens when they already are a lead.
--   * step set_source           changes the lead's source (add_tag, assign_pic and set_stage already exist).
--
-- A person's incoming texts are kept (cut at 500 characters, as for the "wait for a reply" blocks) while an
-- enabled flow of this kind exists, for as long as its longest step plus 2 days (at least 2 days).
-- Nothing changes for flows made before this.

alter table public.chat_messages
  add column if not exists channel text check (channel is null or channel in ('whatsapp', 'messenger', 'instagram'));

alter table public.automation_flows drop constraint if exists automation_flows_trigger_type_check;
alter table public.automation_flows
  add constraint automation_flows_trigger_type_check
  check (trigger_type in (
    'class_start', 'replacement_start', 'trial_start', 'zoom_start',
    'lesson_expiry', 'account_fee_expiry', 'club_fee_expiry', 'lead_created', 'form_submitted',
    'parent_no_reply', 'parent_waiting',
    'trial_booked', 'package_start', 'lead_idle', 'task_due',
    'message_keyword'
  ));

-- ---------------------------------------------------------------------------------------------
-- Words
-- ---------------------------------------------------------------------------------------------

-- The same clean-up the source rules use: small letters, every run of other characters becomes one space.
create or replace function automation.keyword_norm(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(lower(coalesce(p_text, '')), '[^[:alnum:]]+', ' ', 'g'))
$$;

-- Does the text hold one of the words (or phrases)?
create or replace function automation.keyword_hit(p_body text, p_keywords jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements_text(
      case when jsonb_typeof(p_keywords) = 'array' then p_keywords else '[]'::jsonb end
    ) k
    where automation.keyword_norm(k) <> ''
      and position(automation.keyword_norm(k) in automation.keyword_norm(p_body)) > 0
  )
$$;

revoke all on function automation.keyword_norm(text), automation.keyword_hit(text, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The lead of a chat (it may not exist yet)
-- ---------------------------------------------------------------------------------------------

create or replace function automation.keyword_contact_lead(p_contact bigint)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select pe.lead_id from public.people pe where pe.chatwoot_contact_id = p_contact and pe.lead_id is not null limit 1),
    (
      select par.lead_id
      from public.people ch
      join public.people par on par.id = ch.parent_id
      where ch.chatwoot_contact_id = p_contact and par.lead_id is not null
      limit 1
    ),
    (select lc.lead_id from public.lead_channels lc where lc.chatwoot_contact_id = p_contact order by lc.id limit 1),
    (
      -- A WhatsApp lead made by this flow is found by the chat's number until the inbox lists the chat on it.
      select l.id
      from public.chat_activity ca
      join public.leads l on public.people_digits(l.phone) = ca.contact_phone
      where ca.contact_id = p_contact and ca.contact_phone is not null and ca.contact_phone <> ''
      order by l.id
      limit 1
    )
  )
$$;

revoke all on function automation.keyword_contact_lead(bigint) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The events: every incoming message that is kept; a flow picks the ones with its words
-- ---------------------------------------------------------------------------------------------

create or replace view automation.keyword_events as
select
  'message_keyword'::text as trigger_type,
  ('kw:' || cm.contact_id || ':' || cm.id)::text as event_key,
  coalesce(
    case when ld.phone ~ '^[0-9]{8,15}$' then ld.phone end,
    case when ca.contact_phone ~ '^(60|65)[0-9]{8,10}$' then ca.contact_phone end
  )::text as phone,
  coalesce(nullif(btrim(ld.full_name), ''), nullif(btrim(ca.contact_name), ''))::text as parent_name,
  coalesce(nullif(btrim(st.full_name), ''), nullif(btrim(ld.children -> 0 ->> 'name'), ''))::text as child_name,
  st.id::bigint as student_id,
  ld.id::bigint as lead_id,
  cm.at as starts_at,
  to_char(cm.at at time zone 'Asia/Kuala_Lumpur', 'FMHH12:MI am')::text as start_label,
  (cm.at at time zone 'Asia/Kuala_Lumpur')::date as class_date,
  'Chat'::text as class_label,
  st.classroom_id::bigint as classroom_id,
  coalesce(
    st.age,
    case when (ld.children -> 0 ->> 'age') ~ '^[0-9]{1,2}$' then (ld.children -> 0 ->> 'age')::integer end
  )::integer as age,
  st.remaining_hours::numeric as hours_left,
  ld.status::text as lead_status,
  ('kw:' || cm.contact_id || ':' || cm.id)::text as group_key,
  x.source_id::bigint as source_id,
  x.pic_id::bigint as pic_id,
  x.tag_ids::bigint[] as tag_ids,
  x.form_ids::text[] as form_ids,
  x.keyword_id::bigint as keyword_id
from public.chat_messages cm
left join public.chat_activity ca on ca.conversation_id = cm.conversation_id
left join public.people p on p.chatwoot_contact_id = cm.contact_id
left join public.people par on par.id = p.parent_id
left join automation.leads ld on ld.id = coalesce(p.lead_id, par.lead_id, automation.keyword_contact_lead(cm.contact_id))
left join automation.students st on st.id = p.student_id
left join lateral (
  select
    l.source_id,
    l.pic_id,
    l.source_rule_id as keyword_id,
    coalesce(l.tag_ids, '{}')::bigint[] as tag_ids,
    coalesce(
      (
        select array_agg(distinct fs.form_id::text)
        from public.form_submissions fs
        where fs.lead_id = l.id and fs.status = 'completed'
      ),
      '{}'::text[]
    ) as form_ids
  from public.leads l
  where l.id = ld.id
) x on true
where cm.at > now() - interval '62 days';

revoke all on automation.keyword_events from public, anon, authenticated;

-- Does this message start this flow? It holds a word, it came on a channel the flow uses and, unless the flow
-- repeats, it is the first time this person did so (the flow's own log and queue remember it after the texts
-- are tidied away).
create or replace function automation.keyword_event_wanted(p_flow bigint, p_graph jsonb, p_event_key text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_contact bigint;
  v_msg bigint;
  m record;
  kws jsonb := p_graph -> 'settings' -> 'keywords';
  chans jsonb := coalesce(p_graph -> 'settings' -> 'channels', '["whatsapp"]'::jsonb);
begin
  if p_event_key is null or p_event_key !~ '^kw:[0-9]+:[0-9]+$' then
    return false;
  end if;
  v_contact := split_part(p_event_key, ':', 2)::bigint;
  v_msg := split_part(p_event_key, ':', 3)::bigint;

  select cm.id, cm.contact_id, cm.at, cm.body, cm.channel into m
  from public.chat_messages cm
  where cm.id = v_msg;
  if not found then
    return false;
  end if;
  if not automation.keyword_hit(m.body, kws) then
    return false;
  end if;
  -- A message of unknown channel (kept before the channel was written down) counts for any channel.
  if m.channel is not null and not (chans ? m.channel) then
    return false;
  end if;

  if coalesce(p_graph -> 'settings' ->> 'everyTime', 'false') = 'true' then
    return true;
  end if;

  if exists (
    select 1
    from public.chat_messages c
    where c.contact_id = m.contact_id
      and (c.at < m.at or (c.at = m.at and c.id < m.id))
      and automation.keyword_hit(c.body, kws)
      and (c.channel is null or chans ? c.channel)
  ) then
    return false;
  end if;
  if exists (
    select 1 from public.automation_flow_log l
    where l.flow_id = p_flow
      and l.event_key like 'kw:' || v_contact || ':%'
      and l.event_key <> p_event_key
  ) then
    return false;
  end if;
  if exists (
    select 1 from public.automation_queue q
    where q.rule_key = 'flow_' || p_flow
      and q.dedupe_key like 'flow:' || p_flow || ':%:kw:' || v_contact || ':%'
      and q.dedupe_key not like '%:' || p_event_key
  ) then
    return false;
  end if;
  return true;
end;
$$;

revoke all on function automation.keyword_event_wanted(bigint, jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Make the lead of a chat
-- ---------------------------------------------------------------------------------------------

-- Returns the lead (null when none could be made) and a sentence for the log.
create or replace function automation.make_lead_from_chat(p_event_key text)
returns table (lead_id bigint, detail text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact bigint;
  v_msg bigint;
  m record;
  ca record;
  ch text;
  digits text;
  clean_name text;
  hidden boolean := false;
  other_source bigint;
  new_id bigint;
begin
  v_contact := split_part(p_event_key, ':', 2)::bigint;
  v_msg := split_part(p_event_key, ':', 3)::bigint;

  select cm.id, cm.contact_id, cm.conversation_id, cm.at, cm.body, cm.channel into m
  from public.chat_messages cm
  where cm.id = v_msg;
  if not found then
    lead_id := null;
    detail := 'The message is no longer kept, so the lead could not be made.';
    return next;
    return;
  end if;

  select a.contact_name, a.contact_phone into ca
  from public.chat_activity a
  where a.conversation_id = m.conversation_id;

  ch := coalesce(m.channel, 'whatsapp');

  if ch in ('messenger', 'instagram') then
    -- The chat-activity webhook already makes this person a lead with their first message; this only covers a miss.
    new_id := public.lead_channel_for_chat(
      ch, m.contact_id, m.conversation_id, null, null, ca.contact_name, null, null, m.at, m.body
    );
    lead_id := new_id;
    detail := case
      when new_id is null then 'Could not make a lead from this chat.'
      else format('Made the lead from the %s chat.', initcap(ch))
    end;
    return next;
    return;
  end if;

  digits := regexp_replace(coalesce(ca.contact_phone, ''), '[^0-9]', '', 'g');
  clean_name := nullif(btrim(left(regexp_replace(coalesce(ca.contact_name, ''), '\s*\+[0-9]{10,12}$', ''), 200)), '');

  if digits ~ '^(60|65)[0-9]{8,10}$' then
    hidden := false;
  elsif digits ~ '^[0-9]{13,15}$' and regexp_replace(coalesce(clean_name, ''), '[^[:alpha:]]', '', 'g') <> '' then
    -- WhatsApp hides the number: all there is is its internal ID and the name the parent shows.
    hidden := true;
  else
    lead_id := null;
    detail := 'This chat has no usable phone number, so no lead was made.';
    return next;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('auto_lead:' || digits));

  select l.id into new_id
  from public.leads l
  where public.people_digits(l.phone) = digits
     or exists (
       select 1 from jsonb_array_elements(coalesce(l.children, '[]'::jsonb)) c
       where public.people_digits(c ->> 'phone') = digits
     )
  order by l.id
  limit 1;
  if new_id is not null then
    lead_id := new_id;
    detail := 'They are already a lead.';
    return next;
    return;
  end if;

  if exists (select 1 from public.students s where public.people_digits(s.phone) = digits) then
    lead_id := null;
    detail := 'This number belongs to a student, so no lead was made.';
    return next;
    return;
  end if;

  select o.id into other_source from public.lead_options o
  where o.kind = 'source' and o.legacy_key = 'other' limit 1;

  insert into public.leads (
    full_name, phone, state, source_id, pic_id, tag_ids, status, children, notes, added_date
  )
  values (
    clean_name,
    '+' || digits,
    null,
    other_source,
    null,
    '{}',
    'new',
    '[]'::jsonb,
    'Added by an automation from a WhatsApp message with a keyword'
      || case when hidden then ' (WhatsApp hides the number).' else '.' end,
    (coalesce(m.at, now()) at time zone 'Asia/Kuala_Lumpur')::date
  )
  returning id into new_id;

  lead_id := new_id;
  detail := 'Made the lead from the WhatsApp chat.';
  return next;
end;
$$;

revoke all on function automation.make_lead_from_chat(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The steps: make the lead and set the source join add_tag, assign_pic and set_stage.
-- ---------------------------------------------------------------------------------------------

create or replace function automation.do_flow_action(
  p_flow bigint,
  p_event_key text,
  p_node text,
  p_action text,
  p_value text,
  p_lead bigint,
  p_phone text,
  p_parent text,
  p_child text,
  p_student bigint,
  p_starts timestamptz
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_lead bigint := p_lead;
  v_id bigint;
  v_label text;
  v_status text;
  v_rows integer;
  v_kind text := 'action_done';
  v_detail text;
  v_made record;
begin
  if exists (
    select 1
    from public.automation_flow_log l
    where l.flow_id = p_flow
      and l.event_key = left(p_event_key, 200)
      and l.node_id = left(p_node, 60)
      and l.kind in ('action_done', 'action_skipped')
  ) then
    return;
  end if;

  -- A person who wrote a keyword may have become a lead since the event was read (an earlier step of this
  -- flow, or the inbox): look again before giving up.
  if v_lead is null and p_event_key ~ '^kw:[0-9]+:[0-9]+$' then
    v_lead := automation.keyword_contact_lead(split_part(p_event_key, ':', 2)::bigint);
  end if;

  if p_action = 'make_lead' then
    if v_lead is not null then
      v_detail := 'They are already a lead.';
    elsif p_event_key !~ '^kw:[0-9]+:[0-9]+$' then
      v_kind := 'action_skipped';
      v_detail := 'Making a lead only works in a flow that starts from a message with a keyword.';
    else
      begin
        select * into v_made from automation.make_lead_from_chat(p_event_key);
        v_lead := v_made.lead_id;
        v_detail := v_made.detail;
        if v_lead is null then
          v_kind := 'action_skipped';
        end if;
      exception when others then
        v_kind := 'action_skipped';
        v_detail := left('Could not make the lead: ' || sqlerrm, 480);
      end;
    end if;
    perform automation.log_flow_event(
      p_flow, p_event_key, p_node, v_kind, v_detail,
      p_phone, p_parent, p_child, v_lead, p_student, p_starts
    );
    return;
  end if;

  if v_lead is null then
    perform automation.log_flow_event(
      p_flow, p_event_key, p_node, 'action_skipped',
      'This family has no lead, so there was nothing to change.',
      p_phone, p_parent, p_child, v_lead, p_student, p_starts
    );
    return;
  end if;

  begin
    if p_action = 'add_tag' then
      v_id := p_value::bigint;
      select o.label into v_label from public.lead_options o where o.id = v_id and o.kind = 'tag';
      if not found then
        v_kind := 'action_skipped';
        v_detail := 'That tag no longer exists, so nothing was added.';
      else
        update public.leads l
        set tag_ids = array_append(l.tag_ids, v_id)
        where l.id = v_lead and not (v_id = any (l.tag_ids));
        get diagnostics v_rows = row_count;
        v_detail := case
          when v_rows > 0 then format('Added the tag "%s" to the lead.', v_label)
          else format('The lead already has the tag "%s".', v_label)
        end;
      end if;
    elsif p_action = 'assign_pic' then
      v_id := p_value::bigint;
      select o.label into v_label from public.lead_options o where o.id = v_id and o.kind = 'pic';
      if not found then
        v_kind := 'action_skipped';
        v_detail := 'That person is no longer a PIC, so nothing was changed.';
      else
        update public.leads l
        set pic_id = v_id
        where l.id = v_lead and l.pic_id is distinct from v_id;
        get diagnostics v_rows = row_count;
        v_detail := case
          when v_rows > 0 then format('Assigned %s as the PIC of the lead.', v_label)
          else format('%s is already the PIC of the lead.', v_label)
        end;
      end if;
    elsif p_action = 'set_source' then
      v_id := p_value::bigint;
      select o.label into v_label from public.lead_options o
      where o.id = v_id and o.kind = 'source' and o.is_active;
      if not found then
        v_kind := 'action_skipped';
        v_detail := 'That source no longer exists or is switched off, so nothing was changed.';
      else
        update public.leads l
        set source_id = v_id
        where l.id = v_lead and l.source_id is distinct from v_id;
        get diagnostics v_rows = row_count;
        v_detail := case
          when v_rows > 0 then format('Set the source of the lead to "%s".', v_label)
          else format('The source of the lead is already "%s".', v_label)
        end;
      end if;
    elsif p_action = 'set_stage' then
      select l.status into v_status from public.leads l where l.id = v_lead;
      if not found then
        v_kind := 'action_skipped';
        v_detail := 'The lead no longer exists.';
      elsif v_status = 'converted' then
        v_kind := 'action_skipped';
        v_detail := 'The lead is already converted, so its stage was left alone.';
      elsif not public.is_settable_lead_stage(p_value) then
        v_kind := 'action_skipped';
        v_detail := 'That stage cannot be set by a flow.';
      elsif v_status = p_value then
        v_detail := format('The lead is already "%s".', p_value);
      else
        update public.leads l set status = p_value where l.id = v_lead;
        v_detail := format('Moved the lead from "%s" to "%s".', v_status, p_value);
      end if;
    else
      v_kind := 'action_skipped';
      v_detail := 'This step has an unknown action.';
    end if;
  exception when others then
    v_kind := 'action_skipped';
    v_detail := left('Could not change the lead: ' || sqlerrm, 480);
  end;

  perform automation.log_flow_event(
    p_flow, p_event_key, p_node, v_kind, v_detail,
    p_phone, p_parent, p_child, v_lead, p_student, p_starts
  );
end;
$$;

revoke all on function automation.do_flow_action(
  bigint, text, text, text, text, bigint, text, text, text, bigint, timestamptz
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The pieces that were written long ago are taken as they are in the database (without Windows line ends); only the lines about this change are replaced.
-- ---------------------------------------------------------------------------------------------

do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  -- A flow is checked on save: its words, and the two new steps.
  select p.oid into v_oid from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'automation_flows_validate';
  if v_oid is null then
    raise exception 'automation_flows_validate is missing.';
  end if;
  v_def := replace(pg_get_functiondef(v_oid), chr(13), '');
  v_new := replace(v_def,
    $a$    -- Where the flow sends: WhatsApp (the default), Messenger, Instagram.$a$,
    $b$    -- The words that start a message flow, and whether it starts again every time they are written.
    if g -> 'settings' -> 'keywords' is not null and jsonb_typeof(g -> 'settings' -> 'keywords') <> 'null' and (
         jsonb_typeof(g -> 'settings' -> 'keywords') <> 'array'
         or jsonb_array_length(g -> 'settings' -> 'keywords') > 20
         or exists (
           select 1 from jsonb_array_elements(g -> 'settings' -> 'keywords') s
           where jsonb_typeof(s) <> 'string' or char_length(btrim(s #>> '{}')) not between 1 and 100
         )
       ) then
      raise exception 'The keywords must be up to 20 words or phrases, each up to 100 characters.';
    end if;
    if g -> 'settings' -> 'everyTime' is not null and jsonb_typeof(g -> 'settings' -> 'everyTime') not in ('boolean', 'null') then
      raise exception 'The setting that repeats the flow is not valid.';
    end if;
    -- Where the flow sends: WhatsApp (the default), Messenger, Instagram.$b$);
  if v_new = v_def then
    raise exception 'automation_flows_validate: the settings place was not found.';
  end if;
  v_def := v_new;

  v_new := replace(v_def,
    $a$  for n in select value from jsonb_array_elements(nodes) as t(value) loop
    nid := n ->> 'id';$a$,
    $b$  if new.trigger_type = 'message_keyword' and (
       jsonb_typeof(g -> 'settings' -> 'keywords') is distinct from 'array'
       or jsonb_array_length(g -> 'settings' -> 'keywords') = 0
     ) then
    raise exception 'A flow that starts from a message needs at least one keyword.';
  end if;

  for n in select value from jsonb_array_elements(nodes) as t(value) loop
    nid := n ->> 'id';$b$);
  if v_new = v_def then
    raise exception 'automation_flows_validate: the block loop was not found.';
  end if;
  v_def := v_new;

  v_new := replace(v_def,
    $a$      else
        raise exception 'A step has an unknown action.';$a$,
    $b$      elsif n ->> 'action' = 'set_source' then
        if coalesce(n ->> 'value', '') !~ '^[0-9]{1,12}$' then
          raise exception 'A step that sets the source needs one picked.';
        end if;
      elsif n ->> 'action' = 'make_lead' then
        if new.trigger_type <> 'message_keyword' then
          raise exception 'Making a lead only works in a flow that starts from a message with a keyword.';
        end if;
      else
        raise exception 'A step has an unknown action.';$b$);
  if v_new = v_def then
    raise exception 'automation_flows_validate: the action place was not found.';
  end if;
  execute v_new;

  -- A parent's text is kept while a flow of this kind exists, with the channel it came on.
  select p.oid into v_oid from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'record_chat_message';
  if v_oid is null then
    raise exception 'record_chat_message is missing.';
  end if;
  v_def := replace(pg_get_functiondef(v_oid), chr(13), '');
  v_new := replace(v_def,
    $a$  if p_direction = 'incoming' and p_contact_id is not null and exists (
    select 1 from public.automation_flows f, jsonb_array_elements(coalesce(f.graph -> 'nodes', '[]'::jsonb)) x
    where f.enabled and x ->> 'kind' = 'wait'
  ) then
    insert into public.chat_messages (conversation_id, contact_id, at, body)
    values (p_conversation_id, p_contact_id, at_time, left(coalesce(p_text, ''), 500));$a$,
    $b$  if p_direction = 'incoming' and p_contact_id is not null and (
    exists (
      select 1 from public.automation_flows f, jsonb_array_elements(coalesce(f.graph -> 'nodes', '[]'::jsonb)) x
      where f.enabled and x ->> 'kind' = 'wait'
    )
    or exists (select 1 from public.automation_flows k where k.enabled and k.trigger_type = 'message_keyword')
  ) then
    insert into public.chat_messages (conversation_id, contact_id, at, body, channel)
    values (
      p_conversation_id, p_contact_id, at_time, left(coalesce(p_text, ''), 500),
      -- Messenger and Instagram chats are listed on their lead before the text is recorded; everything else is WhatsApp.
      coalesce(
        (select lc.channel from public.lead_channels lc where lc.chatwoot_contact_id = p_contact_id order by lc.id limit 1),
        'whatsapp'
      )
    );$b$);
  if v_new = v_def then
    raise exception 'record_chat_message: the place that keeps texts was not found.';
  end if;
  execute v_new;

  -- The runner: the flows of this kind read their events from the messages, and their texts are kept as long as their steps need.
  select p.oid into v_oid from pg_proc p
  where p.pronamespace = 'automation'::regnamespace and p.proname = 'run_rules';
  if v_oid is null then
    raise exception 'run_rules is missing.';
  end if;
  v_def := replace(pg_get_functiondef(v_oid), chr(13), '');

  v_new := replace(v_def,
    $a$  where wf.enabled and x ->> 'kind' = 'wait';$a$,
    $b$  where wf.enabled and (
    x ->> 'kind' = 'wait'
    or (wf.trigger_type = 'message_keyword' and x ->> 'type' in ('message', 'action'))
  );$b$);
  if v_new = v_def then
    raise exception 'run_rules: the keep-days place was not found.';
  end if;
  v_def := v_new;

  v_new := replace(v_def,
    $a$        from automation.rule_events e
$a$,
    $b$        from (
          select * from automation.keyword_events k where f.trigger_type = 'message_keyword'
          union all
          select * from automation.rule_events r where f.trigger_type <> 'message_keyword'
        ) e
$b$);
  if v_new = v_def then
    raise exception 'run_rules: the events place was not found.';
  end if;
  v_def := v_new;

  v_new := replace(v_def,
    $a$        -- Stages this flow leaves alone (for example Converted and Lost).
$a$,
    $b$        -- A message flow looks only at the messages that hold one of its words (a person's first, unless it repeats).
        if f.trigger_type = 'message_keyword'
           and not automation.keyword_event_wanted(f.id, f.graph, ev.event_key) then
          continue;
        end if;

        -- Stages this flow leaves alone (for example Converted and Lost).
$b$);
  if v_new = v_def then
    raise exception 'run_rules: the stage place was not found.';
  end if;
  v_def := v_new;

  v_new := replace(v_def,
    $a$            and cm.contact_id in (
              select p.chatwoot_contact_id
$a$,
    $b$            and cm.contact_id in (
              select case when ev.event_key ~ '^kw:[0-9]+:[0-9]+$' then split_part(ev.event_key, ':', 2)::bigint end
              union
              select p.chatwoot_contact_id
$b$);
  if v_new = v_def then
    raise exception 'run_rules: the replies place was not found.';
  end if;
  execute v_new;
end;
$$;
