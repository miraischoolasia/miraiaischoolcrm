-- Source keywords become automation flows.
--
-- Until now a "source rule" (Inbox -> Source rules: when the parent's first message holds a phrase, the chat becomes a
-- lead with that source and those tags) was kept in its own list, apart from Automations. Now every one of them is a
-- flow on the Automations page, with its own trigger:
--
--   first_message_keyword   "A first message has a source keyword". Its steps: make the lead, set the source, add
--                           tags (nothing else: it runs the moment the message comes in, not every minute). Its words
--                           are settings.keywords (each up to 300 characters, as a source rule was), its channels
--                           settings.channels.
--
-- The three places that make a lead from a first message keep doing exactly what they did:
--   * the chat-activity webhook (auto_lead_from_chat, WhatsApp),
--   * a Messenger / Instagram person's lead (lead_channel_for_chat),
--   * the Inbox in the browser for a chat the webhook missed.
-- They still read public.lead_source_rules, but that list is now only written by these flows: one row per keyword
-- of an enabled or disabled flow (is_active = the flow is on), with the flow's source and tags. Nobody edits the
-- list directly any more, so there is one place to change a source keyword and no second logic that could make a
-- lead twice. The flow engine (run_rules) never runs these flows: they have no events there.
--
-- Moving: every existing source rule becomes a flow (on when the rule was on), and the flow takes over the rule's
-- row - same id, so leads.source_rule_id, the "Source keyword" condition and the lead_created flows that check it
-- keep working unchanged.
--
-- The webhook also writes one line to the flow's Execution logs when it makes a lead.

-- ---------------------------------------------------------------------------------------------------------
-- 1. The trigger
-- ---------------------------------------------------------------------------------------------------------

alter table public.automation_flows drop constraint if exists automation_flows_trigger_type_check;
alter table public.automation_flows
  add constraint automation_flows_trigger_type_check
  check (trigger_type in (
    'class_start', 'replacement_start', 'trial_start', 'zoom_start',
    'lesson_expiry', 'account_fee_expiry', 'club_fee_expiry', 'lead_created', 'form_submitted',
    'parent_no_reply', 'parent_waiting',
    'trial_booked', 'package_start', 'lead_idle', 'task_due',
    'message_keyword',
    'trial_attended', 'trial_absent',
    'class_absent', 'lessons_left', 'birthday', 'student_created', 'app_account', 'lead_stage', 'lead_tag',
    'first_message_keyword'
  ));

-- ---------------------------------------------------------------------------------------------------------
-- 2. The source rule list belongs to the flows
-- ---------------------------------------------------------------------------------------------------------

alter table public.lead_source_rules
  add column if not exists flow_id bigint references public.automation_flows (id) on delete cascade;

create index if not exists lead_source_rules_flow_idx on public.lead_source_rules (flow_id);

-- A flow may only make the lead (no source, no tag): its leads get the source "Other", as before for a rule's
-- source that was switched off.
alter table public.lead_source_rules drop constraint if exists lead_source_rules_has_effect;

-- Read as before; written only by the flows (the sync below runs as the database).
drop policy if exists "lead_source_rules_insert_permitted" on public.lead_source_rules;
drop policy if exists "lead_source_rules_update_permitted" on public.lead_source_rules;
drop policy if exists "lead_source_rules_delete_permitted" on public.lead_source_rules;
revoke insert, update, delete on public.lead_source_rules from authenticated, anon;

-- ---------------------------------------------------------------------------------------------------------
-- 3. Checks for these flows (added to the flow check that runs on every save)
-- ---------------------------------------------------------------------------------------------------------

create or replace function pg_temp.patch(p_fn regprocedure, p_label text, p_from text, p_to text)
returns void
language plpgsql
as $$
declare
  v_def text := replace(pg_get_functiondef(p_fn), chr(13), '');
  v_count integer;
begin
  v_count := (length(v_def) - length(replace(v_def, p_from, ''))) / length(p_from);
  if v_count <> 1 then
    raise exception '%: expected the text once, found it % times.', p_label, v_count;
  end if;
  execute replace(v_def, p_from, p_to);
end;
$$;

select pg_temp.patch(
  'public.automation_flows_validate()'::regprocedure,
  'automation_flows_validate: keyword length',
  $x$where jsonb_typeof(s) <> 'string' or char_length(btrim(s #>> '{}')) not between 1 and 100$x$,
  $x$where jsonb_typeof(s) <> 'string'
              or char_length(btrim(s #>> '{}'))
                 not between 1 and case when new.trigger_type = 'first_message_keyword' then 300 else 100 end$x$
);

select pg_temp.patch(
  'public.automation_flows_validate()'::regprocedure,
  'automation_flows_validate: keyword length message',
  $x$raise exception 'The keywords must be up to 20 words or phrases, each up to 100 characters.';$x$,
  $x$raise exception 'The keywords must be up to 20 words or phrases, each up to 100 characters (300 for a source keyword).';$x$
);

select pg_temp.patch(
  'public.automation_flows_validate()'::regprocedure,
  'automation_flows_validate: keywords needed',
  $x$  if new.trigger_type = 'message_keyword' and ($x$,
  $x$  if new.trigger_type in ('message_keyword', 'first_message_keyword') and ($x$
);

select pg_temp.patch(
  'public.automation_flows_validate()'::regprocedure,
  'automation_flows_validate: make_lead',
  $x$        if new.trigger_type <> 'message_keyword' then$x$,
  $x$        if new.trigger_type not in ('message_keyword', 'first_message_keyword') then$x$
);

select pg_temp.patch(
  'public.automation_flows_validate()'::regprocedure,
  'automation_flows_validate: source keyword shape',
  $x$    raise exception 'A flow that starts from a message needs at least one keyword.';
  end if;
$x$,
  $x$    raise exception 'A flow that starts from a message needs at least one keyword.';
  end if;

  -- A source keyword flow runs the moment the first message comes in: it only makes the lead, sets the source
  -- and adds tags, and each keyword belongs to one such flow.
  if new.trigger_type = 'first_message_keyword' then
    if exists (
      select 1 from jsonb_array_elements(nodes) x
      where x ->> 'type' is distinct from 'action'
         or x ->> 'action' not in ('make_lead', 'set_source', 'add_tag')
    ) then
      raise exception 'A source keyword flow can only make the lead, set the source and add tags. To send a message, make a flow that starts from "A lead comes in with a source keyword".';
    end if;
    if not exists (select 1 from jsonb_array_elements(nodes) x where x ->> 'action' = 'make_lead') then
      raise exception 'A source keyword flow needs the step that makes the lead.';
    end if;
    if (select count(*) from jsonb_array_elements(nodes) x where x ->> 'action' = 'set_source') > 1 then
      raise exception 'A source keyword flow can set one source.';
    end if;
    if (
      select count(*) <> count(distinct lower(btrim(k)))
      from jsonb_array_elements_text(g -> 'settings' -> 'keywords') k
    ) then
      raise exception 'The same keyword is written twice.';
    end if;
    declare
      taken text;
      taken_by text;
    begin
      select r.phrase, f.name into taken, taken_by
      from public.lead_source_rules r
      join public.automation_flows f on f.id = r.flow_id
      where r.flow_id <> new.id
        and lower(btrim(r.phrase)) in (
          select lower(btrim(k)) from jsonb_array_elements_text(g -> 'settings' -> 'keywords') k
        )
      limit 1;
      if taken is not null then
        raise exception 'The keyword "%" is already used by the flow "%".', left(taken, 60), taken_by;
      end if;
    end;
  end if;
$x$
);

-- ---------------------------------------------------------------------------------------------------------
-- 4. Keep the list in step with the flows
-- ---------------------------------------------------------------------------------------------------------

-- One row per keyword. A row keeps its id while its keyword stays (also through other changes), a renamed keyword
-- keeps the row it had, and a row nobody owns with the same phrase (an old source rule) is taken over.
create or replace function automation.sync_source_keywords()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keywords text[];
  v_source bigint;
  v_tags bigint[];
  v_kept bigint[] := '{}';
  v_left_keywords text[] := '{}';
  v_kw text;
  v_row bigint;
begin
  if new.trigger_type is distinct from 'first_message_keyword' then
    if tg_op = 'UPDATE' and old.trigger_type = 'first_message_keyword' then
      delete from public.lead_source_rules where flow_id = new.id;
    end if;
    return null;
  end if;

  select coalesce(array_agg(btrim(k) order by o), '{}') into v_keywords
  from jsonb_array_elements_text(coalesce(new.graph -> 'settings' -> 'keywords', '[]'::jsonb)) with ordinality t(k, o)
  where btrim(k) <> '';

  select o.id into v_source
  from jsonb_array_elements(coalesce(new.graph -> 'nodes', '[]'::jsonb)) x
  join public.lead_options o on o.kind = 'source' and o.id::text = x ->> 'value'
  where x ->> 'action' = 'set_source'
  limit 1;

  select coalesce(array_agg(distinct o.id), '{}') into v_tags
  from jsonb_array_elements(coalesce(new.graph -> 'nodes', '[]'::jsonb)) x
  join public.lead_options o on o.kind = 'tag' and o.id::text = x ->> 'value'
  where x ->> 'action' = 'add_tag';

  -- The same keyword: this flow's row, or an old rule nobody owns yet.
  foreach v_kw in array v_keywords loop
    select r.id into v_row
    from public.lead_source_rules r
    where lower(btrim(r.phrase)) = lower(v_kw)
      and (r.flow_id = new.id or r.flow_id is null)
      and not (r.id = any (v_kept))
    order by (r.flow_id is null), r.id
    limit 1;
    if v_row is null then
      v_left_keywords := v_left_keywords || v_kw;
    else
      update public.lead_source_rules
      set flow_id = new.id, phrase = v_kw, source_id = v_source, tag_ids = v_tags, is_active = new.enabled
      where id = v_row;
      v_kept := v_kept || v_row;
    end if;
    v_row := null;
  end loop;

  -- A changed keyword keeps one of the rows this flow no longer uses; anything more is a new row.
  foreach v_kw in array v_left_keywords loop
    select r.id into v_row
    from public.lead_source_rules r
    where r.flow_id = new.id and not (r.id = any (v_kept))
    order by r.id
    limit 1;
    if v_row is null then
      insert into public.lead_source_rules (phrase, source_id, tag_ids, is_active, flow_id)
      values (v_kw, v_source, v_tags, new.enabled, new.id)
      returning id into v_row;
    else
      update public.lead_source_rules
      set phrase = v_kw, source_id = v_source, tag_ids = v_tags, is_active = new.enabled
      where id = v_row;
    end if;
    v_kept := v_kept || v_row;
    v_row := null;
  end loop;

  delete from public.lead_source_rules where flow_id = new.id and not (id = any (v_kept));
  return null;
end;
$$;

revoke all on function automation.sync_source_keywords() from public, anon, authenticated;

drop trigger if exists automation_flows_sync_source_keywords on public.automation_flows;
create trigger automation_flows_sync_source_keywords
after insert or update of trigger_type, enabled, graph on public.automation_flows
for each row execute function automation.sync_source_keywords();

-- ---------------------------------------------------------------------------------------------------------
-- 5. Every existing source rule becomes a flow
-- ---------------------------------------------------------------------------------------------------------

do $$
declare
  r record;
  nodes jsonb;
  edges jsonb;
  prev text;
  x integer;
  t bigint;
  n integer;
begin
  for r in select * from public.lead_source_rules where flow_id is null order by id loop
    nodes := jsonb_build_array(jsonb_build_object(
      'id', 'a1', 'type', 'action', 'action', 'make_lead', 'value', '', 'mins', 0, 'after', true, 'x', 300, 'y', 140
    ));
    edges := jsonb_build_array(jsonb_build_object('from', 'trigger', 'port', 'out', 'to', 'a1'));
    prev := 'a1';
    x := 580;
    n := 1;
    if r.source_id is not null then
      n := n + 1;
      nodes := nodes || jsonb_build_object(
        'id', 'a' || n, 'type', 'action', 'action', 'set_source', 'value', r.source_id::text,
        'mins', 0, 'after', true, 'x', x, 'y', 140
      );
      edges := edges || jsonb_build_object('from', prev, 'port', 'out', 'to', 'a' || n);
      prev := 'a' || n;
      x := x + 280;
    end if;
    foreach t in array coalesce(r.tag_ids, '{}') loop
      n := n + 1;
      nodes := nodes || jsonb_build_object(
        'id', 'a' || n, 'type', 'action', 'action', 'add_tag', 'value', t::text,
        'mins', 0, 'after', true, 'x', x, 'y', 140
      );
      edges := edges || jsonb_build_object('from', prev, 'port', 'out', 'to', 'a' || n);
      prev := 'a' || n;
      x := x + 280;
    end loop;

    -- The sync takes over the rule's row (same id) because the phrase is the same.
    insert into public.automation_flows (name, trigger_type, enabled, graph)
    values (
      left('Source keyword: ' || btrim(regexp_replace(r.phrase, '\s+', ' ', 'g')), 80),
      'first_message_keyword',
      r.is_active,
      jsonb_build_object(
        'trigger', jsonb_build_object('x', 24, 'y', 140),
        'nodes', nodes,
        'edges', edges,
        'settings', jsonb_build_object(
          'keywords', jsonb_build_array(btrim(r.phrase)),
          'channels', jsonb_build_array('whatsapp', 'messenger', 'instagram')
        )
      )
    );
  end loop;

  if exists (select 1 from public.lead_source_rules where flow_id is null) then
    raise exception 'A source rule was not moved into a flow.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 6. The webhook writes a line in the flow's Execution logs when it makes a lead (never stops the lead)
-- ---------------------------------------------------------------------------------------------------------

select pg_temp.patch(
  'public.auto_lead_from_chat(text, bigint, bigint, timestamp with time zone, text, text, text)'::regprocedure,
  'auto_lead_from_chat: log',
  $x$  returning id into new_id;

  return new_id;$x$,
  $x$  returning id into new_id;

  -- The flow of the keyword that decided the source says what it did (its Execution logs).
  begin
    insert into public.automation_flow_log (flow_id, event_key, node_id, kind, detail, phone, parent_name, lead_id, starts_at)
    select r.flow_id, 'first:' || p_conversation_id, 'a1', 'action_done',
           left(format('Made the lead from the first WhatsApp message (keyword "%s").', left(matched_phrase, 120)), 500),
           left('+' || digits, 30), left(nullif(btrim(coalesce(p_name, '')), ''), 200), new_id, coalesce(p_at, now())
    from public.lead_source_rules r
    where r.id = matched_rule and r.flow_id is not null
    on conflict do nothing;
  exception when others then
    null;
  end;

  return new_id;$x$
);

select pg_temp.patch(
  'public.lead_channel_for_chat(text, bigint, bigint, bigint, text, text, text, text, timestamp with time zone, text)'::regprocedure,
  'lead_channel_for_chat: log',
  $x$    returning id into found_lead;
  end if;$x$,
  $x$    returning id into found_lead;

    if matched_rule is not null then
      begin
        insert into public.automation_flow_log (flow_id, event_key, node_id, kind, detail, parent_name, lead_id, starts_at)
        select r.flow_id, 'first:' || coalesce(p_conversation_id, p_contact_id), 'a1', 'action_done',
               left(format('Made the lead from the first %s message (keyword "%s").', initcap(p_channel), left(r.phrase, 120)), 500),
               clean_name, found_lead, coalesce(p_at, now())
        from public.lead_source_rules r
        where r.id = matched_rule and r.flow_id is not null
        on conflict do nothing;
      exception when others then
        null;
      end;
    end if;
  end if;$x$
);
