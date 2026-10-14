-- Flow logs: why a flow did NOT message someone, so each flow page can show Enrollment history and
-- Execution logs (like Go High Level).
--
-- What was already visible: every message the runner queued (automation_queue: queued, approved, sent,
-- failed, skipped, expired, blocked). What was invisible: the people the runner looked at and left
-- alone. Now the runner writes a row here for each of them, once per person/event/reason:
--   stage_stopped   the lead's stage is one this flow leaves alone
--   cooldown        the same person was messaged by this flow too recently
--   condition_no    a Yes/No block (age, class, keyword ...) said No and nothing follows it
--   no_message      the flow has nothing to send for this event
--   no_phone        the family has no usable phone number
--   opted_out       the parent wrote STOP
-- Only events whose message time is near (the same window the runner queues in) are written, so the
-- table stays small. Rows older than 90 days are tidied away by the runner.
--
-- automation.flow_walk() is the one place that walks a flow's graph. It returns every block the walk
-- reaches with the port taken and a plain-words reason; automation.flow_messages() is now a thin
-- wrapper over it (same result as before).

create table if not exists public.automation_flow_log (
  id bigint generated always as identity primary key,
  flow_id bigint not null references public.automation_flows (id) on delete cascade,
  event_key text not null check (char_length(event_key) between 1 and 200),
  -- The block the reason belongs to; '' when it is about the whole event.
  node_id text not null default '' check (char_length(node_id) <= 60),
  kind text not null
    check (kind in ('stage_stopped', 'cooldown', 'condition_no', 'no_message', 'no_phone', 'opted_out')),
  detail text check (detail is null or char_length(detail) <= 500),
  phone text check (phone is null or char_length(phone) <= 30),
  parent_name text check (parent_name is null or char_length(parent_name) <= 200),
  child_name text check (child_name is null or char_length(child_name) <= 200),
  lead_id bigint references public.leads (id) on delete set null,
  student_id bigint references public.students (id) on delete set null,
  starts_at timestamptz,
  created_at timestamptz not null default now(),
  unique (flow_id, event_key, node_id, kind)
);

create index if not exists automation_flow_log_flow_idx
on public.automation_flow_log (flow_id, created_at desc);

alter table public.automation_flow_log enable row level security;

create policy "automation_flow_log_select_permitted"
on public.automation_flow_log
for select to authenticated
using ((select public.has_permission('leads')));

revoke all on public.automation_flow_log from anon, authenticated;
grant select on public.automation_flow_log to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The walk
-- ---------------------------------------------------------------------------------------------

create or replace function automation.flow_walk(
  p_graph jsonb,
  p_age integer,
  p_classroom bigint,
  p_hours numeric default null,
  p_stage text default null,
  p_source bigint default null,
  p_pic bigint default null,
  p_tags bigint[] default null,
  p_forms text[] default null,
  p_keyword bigint default null
)
returns table (
  node_id text,
  node_type text,
  kind text,
  port text,
  ended boolean,
  mins integer,
  message_text text,
  is_after boolean,
  detail text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  stack text[] := array['trigger'];
  seen text[] := '{}';
  cur text;
  n jsonb;
  e jsonb;
  v_port text;
  v_type text;
  v_kind text;
  v_detail text;
  lo integer;
  hi integer;
  hits integer;
  matched boolean;
begin
  while coalesce(array_length(stack, 1), 0) > 0 loop
    cur := stack[1];
    stack := coalesce(stack[2:array_length(stack, 1)], '{}');
    if cur = any (seen) then
      continue;
    end if;
    seen := seen || cur;

    v_type := null;
    v_kind := null;
    v_detail := null;

    if cur = 'trigger' then
      v_port := 'out';
    else
      select x into n
      from jsonb_array_elements(coalesce(p_graph -> 'nodes', '[]'::jsonb)) x
      where x ->> 'id' = cur
      limit 1;
      if n is null then
        continue;
      end if;
      v_type := n ->> 'type';
      v_kind := n ->> 'kind';

      if v_type = 'message' then
        -- This message is queued, and the walk goes on to whatever follows it.
        v_port := 'out';
      elsif v_kind = 'age' then
        -- A condition: an unknown value never matches, so the child goes down No.
        lo := (n ->> 'min')::integer;
        hi := (n ->> 'max')::integer;
        matched := p_age is not null and (lo is null or p_age >= lo) and (hi is null or p_age <= hi);
        v_detail := case
          when matched then format('Age %s is in the range', p_age)
          when p_age is null then 'The age is not known'
          else format('Age %s is not between %s and %s', p_age, coalesce(lo::text, '0'), coalesce(hi::text, 'any'))
        end;
      elsif v_kind = 'classroom' then
        matched := p_classroom is not null
          and exists (
            select 1 from jsonb_array_elements(n -> 'ids') i where (i #>> '{}')::bigint = p_classroom
          );
        v_detail := case
          when matched then 'The class is one of the ticked classes'
          when p_classroom is null then 'The class is not known'
          else 'The class is not one of the ticked classes'
        end;
      elsif v_kind = 'hours' then
        matched := p_hours is not null and p_hours <= (n ->> 'max')::numeric;
        v_detail := case
          when matched then format('%s lesson hours left is within the limit', round(p_hours, 1))
          when p_hours is null then 'The lesson hours left are not known'
          else format('%s lesson hours left is more than %s', round(p_hours, 1), n ->> 'max')
        end;
      elsif v_kind = 'stage' then
        matched := p_stage is not null
          and exists (select 1 from jsonb_array_elements_text(n -> 'stages') s where s = p_stage);
        v_detail := case
          when matched then format('Lead stage "%s" is one of the ticked stages', p_stage)
          when p_stage is null then 'There is no lead stage'
          else format('Lead stage "%s" is not one of the ticked stages', p_stage)
        end;
      elsif v_kind = 'source' then
        matched := p_source is not null
          and exists (select 1 from jsonb_array_elements_text(n -> 'ids') i where i = p_source::text);
        v_detail := case
          when matched then 'The lead source is one of the ticked sources'
          when p_source is null then 'The lead has no source'
          else 'The lead source is not one of the ticked sources'
        end;
      elsif v_kind = 'pic' then
        matched := p_pic is not null
          and exists (select 1 from jsonb_array_elements_text(n -> 'ids') i where i = p_pic::text);
        v_detail := case
          when matched then 'The PIC is one of the ticked people'
          when p_pic is null then 'The lead has no PIC'
          else 'The PIC is not one of the ticked people'
        end;
      elsif v_kind = 'keyword' then
        matched := p_keyword is not null
          and exists (select 1 from jsonb_array_elements_text(n -> 'ids') i where i = p_keyword::text);
        v_detail := case
          when matched then 'The lead came in with one of the ticked source keywords'
          when p_keyword is null then 'The lead did not come in with a source keyword'
          else 'The lead came in with a different source keyword'
        end;
      elsif v_kind = 'tag' then
        matched := p_tags is not null
          and exists (
            select 1 from jsonb_array_elements_text(n -> 'ids') i
            join unnest(p_tags) t on t::text = i
          );
        v_detail := case
          when matched then 'The lead has one of the ticked tags'
          when p_tags is null or array_length(p_tags, 1) is null then 'The lead has no tags'
          else 'The lead has none of the ticked tags'
        end;
      elsif v_kind = 'form' then
        matched := p_forms is not null
          and exists (
            select 1 from jsonb_array_elements_text(n -> 'ids') i
            join unnest(p_forms) t on lower(t) = lower(i)
          );
        v_detail := case
          when matched then 'The lead filled in one of the ticked forms'
          when p_forms is null or array_length(p_forms, 1) is null then 'The lead has not filled in any form'
          else 'The lead has not filled in any of the ticked forms'
        end;
      else
        matched := false;
        v_detail := 'Unknown block';
      end if;

      if v_type <> 'message' then
        v_port := case when matched then 'yes' else 'no' end;
      end if;
    end if;

    hits := 0;
    for e in select value from jsonb_array_elements(coalesce(p_graph -> 'edges', '[]'::jsonb)) as t(value) loop
      if e ->> 'from' = cur and e ->> 'port' = v_port then
        stack := stack || (e ->> 'to');
        hits := hits + 1;
      end if;
    end loop;

    if cur <> 'trigger' then
      node_id := cur;
      node_type := v_type;
      kind := v_kind;
      port := v_port;
      ended := hits = 0;
      if v_type = 'message' then
        mins := (n ->> 'mins')::integer;
        message_text := n ->> 'text';
        is_after := coalesce((n ->> 'after')::boolean, false);
        detail := null;
      else
        mins := null;
        message_text := null;
        is_after := null;
        detail := v_detail;
      end if;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function automation.flow_walk(jsonb, integer, bigint, numeric, text, bigint, bigint, bigint[], text[], bigint)
  from public, anon, authenticated;

-- Same result as before; the walk itself now lives in flow_walk.
create or replace function automation.flow_messages(
  p_graph jsonb,
  p_age integer,
  p_classroom bigint,
  p_hours numeric default null,
  p_stage text default null,
  p_source bigint default null,
  p_pic bigint default null,
  p_tags bigint[] default null,
  p_forms text[] default null,
  p_keyword bigint default null
)
returns table (node_id text, mins integer, message_text text, is_after boolean)
language sql
stable
set search_path = ''
as $$
  select w.node_id, w.mins, w.message_text, w.is_after
  from automation.flow_walk(
    p_graph, p_age, p_classroom, p_hours, p_stage, p_source, p_pic, p_tags, p_forms, p_keyword
  ) w
  where w.node_type = 'message'
$$;

revoke all on function automation.flow_messages(jsonb, integer, bigint, numeric, text, bigint, bigint, bigint[], text[], bigint)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Helpers for the runner
-- ---------------------------------------------------------------------------------------------

-- Whether any message of the flow is due inside the window the runner queues in, so only events that
-- are about to matter are written to the log.
create or replace function automation.flow_event_relevant(p_graph jsonb, p_starts timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce(p_graph -> 'nodes', '[]'::jsonb)) x
    where x ->> 'type' = 'message'
      and case
        when coalesce((x ->> 'after')::boolean, false)
          then p_starts + make_interval(mins => (x ->> 'mins')::integer)
        else p_starts - make_interval(mins => (x ->> 'mins')::integer)
      end between now() - interval '1 hour' and now() + interval '3 hours'
      and (coalesce((x ->> 'after')::boolean, false) or p_starts > now())
  )
$$;

create or replace function automation.log_flow_event(
  p_flow bigint,
  p_event_key text,
  p_node text,
  p_kind text,
  p_detail text,
  p_phone text,
  p_parent text,
  p_child text,
  p_lead bigint,
  p_student bigint,
  p_starts timestamptz
)
returns void
language sql
set search_path = ''
as $$
  insert into public.automation_flow_log
    (flow_id, event_key, node_id, kind, detail, phone, parent_name, child_name, lead_id, student_id, starts_at)
  values (
    p_flow, left(p_event_key, 200), coalesce(left(p_node, 60), ''), p_kind, left(p_detail, 500),
    left(p_phone, 30), left(p_parent, 200), left(p_child, 200), p_lead, p_student, p_starts
  )
  on conflict (flow_id, event_key, node_id, kind) do nothing
$$;

revoke all on function automation.flow_event_relevant(jsonb, timestamptz) from public, anon, authenticated;
revoke all on function automation.log_flow_event(
  bigint, text, text, text, text, text, text, text, bigint, bigint, timestamptz
) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The runner: the same as before, plus the log rows.
-- ---------------------------------------------------------------------------------------------

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

      for ev in
        select *
        from automation.rule_events e
        where e.trigger_type = f.trigger_type
          and e.starts_at > now() - interval '62 days'
          and e.starts_at <= now() + interval '62 days'
      loop
        -- Stages this flow leaves alone (for example Converted and Lost).
        if ev.lead_status is not null
           and coalesce(f.graph -> 'settings' -> 'stopStages', '[]'::jsonb) ? ev.lead_status then
          if automation.flow_event_relevant(f.graph, ev.starts_at) then
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
          if automation.flow_event_relevant(f.graph, ev.starts_at) then
            perform automation.log_flow_event(
              f.id, ev.event_key, '', 'cooldown',
              format('This person was already messaged by this flow in the last %s days.', cooldown_days),
              ev.phone, ev.parent_name, ev.child_name, ev.lead_id, ev.student_id, ev.starts_at
            );
          end if;
          continue;
        end if;

        n_msgs := 0;
        for m in
          select * from automation.flow_messages(
            f.graph, ev.age, ev.classroom_id, ev.hours_left, ev.lead_status,
            ev.source_id, ev.pic_id, ev.tag_ids, ev.form_ids, ev.keyword_id
          )
        loop
          n_msgs := n_msgs + 1;
          if m.is_after then
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

          child_text := coalesce(nullif(btrim(ev.child_name), ''), 'your child');

          if contact_id is null then
            -- The family: needs a number to send to.
            if ev.phone is null or ev.phone !~ '^[0-9]{8,15}$' then
              perform automation.log_flow_event(
                f.id, ev.event_key, m.node_id, 'no_phone',
                'This family has no usable phone number, so nothing could be queued.',
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
            insert into public.automation_queue
              (rule_key, rule_name, dedupe_key, phone, parent_name, child_name, lead_id, student_id,
               message, due_at, expires_at)
            values (
              'flow_' || f.id,
              f.name,
              'flow:' || f.id || ':' || m.node_id || ':' || ev.event_key,
              ev.phone,
              left(ev.parent_name, 200),
              left(ev.child_name, 200),
              ev.lead_id,
              ev.student_id,
              left(
                replace(replace(replace(replace(replace(replace(replace(replace(m.message_text,
                  '{parent_phone}', automation.local_phone(ev.phone)),
                  '{child_lower}', automation.compact_name(child_text)),
                  '{child}', child_text),
                  '{parent}', coalesce(nullif(btrim(ev.parent_name), ''), 'there')),
                  '{time}', ev.start_label),
                  '{date}', to_char(ev.class_date, 'Dy DD Mon')),
                  '{class}', coalesce(ev.class_label, 'class')),
                  '{hours_left}', coalesce(round(ev.hours_left)::bigint::text, '?')),
                4000),
              due,
              expires
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
          relevant := automation.flow_event_relevant(f.graph, ev.starts_at);
          if relevant then
            select * into w
            from automation.flow_walk(
              f.graph, ev.age, ev.classroom_id, ev.hours_left, ev.lead_status,
              ev.source_id, ev.pic_id, ev.tag_ids, ev.form_ids, ev.keyword_id
            ) x
            where x.node_type = 'condition' and x.port = 'no' and x.ended
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
           message, due_at, expires_at)
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
          (g.value ->> 'expires')::timestamptz
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
