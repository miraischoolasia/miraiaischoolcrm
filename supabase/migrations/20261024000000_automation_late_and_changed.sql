-- Two automation gaps found on the HOA "day before class" flow.
--
-- 1. The same event could be messaged only once: the key of a queued message is flow + step + event, so an old
--    message that a person skipped (or that expired) kept blocking the new one after the flow's timing or the
--    class changed. Now a skipped / expired message is brought back when the new time is more than an hour
--    away from the old one. The same time stays skipped.
-- 2. A family booked after a message's moment (a "day before" message, booked that same morning) got nothing at
--    all. Now it is caught up at the next chance while the class is still at least 30 minutes away.
--    Only trial bookings carry a booking time, so other kinds of events are unchanged.

create or replace function automation.event_created_at(p_key text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select tb.created_at
  from public.trial_bookings tb
  where p_key ~ '^trial:[0-9]+$'
    and tb.id = substr(p_key, 7)::bigint
$$;

revoke all on function automation.event_created_at(text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION automation.run_rules()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  booked_at timestamptz;
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
  where wf.enabled and (
    x ->> 'kind' = 'wait'
    or (wf.trigger_type = 'message_keyword' and x ->> 'type' in ('message', 'action'))
  );
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
        from (
          select * from automation.keyword_events k where f.trigger_type = 'message_keyword'
          union all
          select * from automation.rule_events r where f.trigger_type <> 'message_keyword'
        ) e
        where e.trigger_type = f.trigger_type
          and e.starts_at > now() - case when has_wait then make_interval(days => keep_days + 14) else interval '62 days' end
          and e.starts_at <= now() + interval '62 days'
      loop
        -- A message flow looks only at the messages that hold one of its words (a person's first, unless it repeats).
        if f.trigger_type = 'message_keyword' then
          if not automation.keyword_event_wanted(f.id, f.graph, ev.event_key) then
            continue;
          end if;
          perform automation.log_keyword_match(
            f.id, ev.event_key, ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
          );
        end if;

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
              select case when ev.event_key ~ '^kw:[0-9]+:[0-9]+$' then split_part(ev.event_key, ':', 2)::bigint end
              union
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

          if due > now() + interval '3 hours' then
            continue;
          end if;
          if due < now() - interval '1 hour' then
            -- Booked after this message's moment: it is caught up (sent at the next chance) while the class is still
            -- at least 30 minutes away. Anything else that is late is left alone.
            booked_at := automation.event_created_at(ev.event_key);
            if booked_at is null
               or booked_at <= due
               or m.is_after
               or m.anchor_at is not null
               or ev.starts_at <= now() + interval '30 minutes' then
              continue;
            end if;
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
            on conflict (dedupe_key) do update
            set status = 'pending',
                due_at = excluded.due_at,
                expires_at = excluded.expires_at,
                message = excluded.message,
                parent_name = excluded.parent_name,
                child_name = excluded.child_name,
                lead_id = excluded.lead_id,
                student_id = excluded.student_id,
                media_url = excluded.media_url,
                phone = excluded.phone,
                conversation_id = excluded.conversation_id,
                contact_id = excluded.contact_id,
                channel = excluded.channel,
                kind = excluded.kind,
                workflow_id = excluded.workflow_id,
                decided_by = null,
                decided_at = null,
                sent_at = null,
                sent_by_automation = false,
                error = null,
                auto_blocked = null
            where public.automation_queue.status in ('skipped', 'expired')
              and abs(extract(epoch from (public.automation_queue.due_at - excluded.due_at))) > 3600;
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
        on conflict (dedupe_key) do update
          set status = 'pending',
              due_at = excluded.due_at,
              expires_at = excluded.expires_at,
              message = excluded.message,
              parent_name = excluded.parent_name,
              child_name = excluded.child_name,
              lead_id = excluded.lead_id,
              student_id = excluded.student_id,
              media_url = excluded.media_url,
              phone = excluded.phone,
              conversation_id = excluded.conversation_id,
              contact_id = excluded.contact_id,
              channel = excluded.channel,
              kind = excluded.kind,
              workflow_id = excluded.workflow_id,
              decided_by = null,
              decided_at = null,
              sent_at = null,
              sent_by_automation = false,
              error = null,
              auto_blocked = null
          where public.automation_queue.status in ('skipped', 'expired')
            and abs(extract(epoch from (public.automation_queue.due_at - excluded.due_at))) > 3600;
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
$function$;
