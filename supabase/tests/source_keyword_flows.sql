-- Checks for 20261029800000_source_keyword_flows.sql (source keywords are automation flows). Runs on the local test
-- database; it rolls back.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/source_keyword_flows.sql

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

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

create function pg_temp.login(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
$$;

-- A source keyword flow: make the lead, then the source (when given), then the tags.
create function pg_temp.graph(p_keywords jsonb, p_source bigint, p_tags bigint[]) returns jsonb language plpgsql as $$
declare
  nodes jsonb := '[{"id":"a1","type":"action","action":"make_lead","value":"","mins":0,"after":true,"x":0,"y":0}]';
  edges jsonb := '[{"from":"trigger","port":"out","to":"a1"}]';
  prev text := 'a1';
  n integer := 1;
  t bigint;
begin
  if p_source is not null then
    n := n + 1;
    nodes := nodes || jsonb_build_object('id', 'a' || n, 'type', 'action', 'action', 'set_source', 'value', p_source::text,
      'mins', 0, 'after', true, 'x', 0, 'y', 0);
    edges := edges || jsonb_build_object('from', prev, 'port', 'out', 'to', 'a' || n);
    prev := 'a' || n;
  end if;
  foreach t in array coalesce(p_tags, '{}') loop
    n := n + 1;
    nodes := nodes || jsonb_build_object('id', 'a' || n, 'type', 'action', 'action', 'add_tag', 'value', t::text,
      'mins', 0, 'after', true, 'x', 0, 'y', 0);
    edges := edges || jsonb_build_object('from', prev, 'port', 'out', 'to', 'a' || n);
    prev := 'a' || n;
  end loop;
  return jsonb_build_object('trigger', '{"x":0,"y":0}'::jsonb, 'nodes', nodes, 'edges', edges,
    'settings', jsonb_build_object('keywords', p_keywords, 'channels', '["whatsapp","messenger","instagram"]'::jsonb));
end;
$$;

update public.chat_webhook_settings set webhook_key = 'skw-test-key';

insert into public.lead_options (id, kind, label, is_active) values
  (9201, 'tag', 'SKW Robot', true), (9202, 'tag', 'SKW Day', true)
on conflict (id) do nothing;

-- 1. The move -----------------------------------------------------------------------------------------
select pg_temp.ok(
  not exists (select 1 from public.lead_source_rules where flow_id is null),
  'every old source rule belongs to a flow'
);
select pg_temp.ok(
  not exists (
    select 1 from public.lead_source_rules r join public.automation_flows f on f.id = r.flow_id
    where f.trigger_type <> 'first_message_keyword' or f.enabled <> r.is_active
  ),
  'each moved rule is on exactly when its flow is on'
);

-- 2. A new flow writes its keywords into the list --------------------------------------------------------
insert into public.automation_flows (name, trigger_type, enabled, graph)
values ('SKW robots', 'first_message_keyword', true,
        pg_temp.graph('["Robot Camp 2026", "robotics day"]', 2, '{9201,9202}'));
select id as robot_flow from public.automation_flows where name = 'SKW robots' \gset

select pg_temp.ok(
  (select count(*) from public.lead_source_rules where flow_id = :robot_flow) = 2,
  'one row per keyword'
);
select pg_temp.ok(
  (select bool_and(source_id = 2 and tag_ids @> '{9201,9202}' and is_active) from public.lead_source_rules where flow_id = :robot_flow),
  'each row has the flow''s source, tags and on/off'
);
select id as day_rule from public.lead_source_rules where flow_id = :robot_flow and phrase = 'robotics day' \gset

-- 3. What the flow check refuses ------------------------------------------------------------------------
select pg_temp.fails(
  $$insert into public.automation_flows (name, trigger_type, enabled, graph) values ('x', 'first_message_keyword', false,
    jsonb_set(pg_temp.graph('["zzz unique"]', 2, '{}'), '{nodes}', pg_temp.graph('["zzz unique"]', 2, '{}') -> 'nodes'
      || '[{"id":"m1","type":"message","mins":5,"after":true,"text":"Hi","x":0,"y":0}]'::jsonb))$$,
  'can only make the lead', 'a message in a source keyword flow is refused'
);
select pg_temp.fails(
  $$insert into public.automation_flows (name, trigger_type, enabled, graph) values ('x', 'first_message_keyword', false,
    jsonb_set(pg_temp.graph('["zzz unique"]', null, '{9201}'), '{nodes}',
      (pg_temp.graph('["zzz unique"]', null, '{9201}') -> 'nodes') - 0))$$,
  'needs the step that makes the lead', 'a source keyword flow without "make the lead" is refused'
);
select pg_temp.fails(
  $$insert into public.automation_flows (name, trigger_type, enabled, graph)
    values ('x', 'first_message_keyword', false, pg_temp.graph('["ROBOTICS DAY"]', null, '{}'))$$,
  'already used by the flow', 'a keyword another flow has is refused (any capitals)'
);
select pg_temp.fails(
  $$insert into public.automation_flows (name, trigger_type, enabled, graph)
    values ('x', 'first_message_keyword', false, pg_temp.graph('["abc", "ABC "]', null, '{}'))$$,
  'written twice', 'the same keyword twice in one flow is refused'
);
select pg_temp.fails(
  $$insert into public.automation_flows (name, trigger_type, enabled, graph)
    values ('x', 'first_message_keyword', false, pg_temp.graph(to_jsonb(array[repeat('k', 301)]), null, '{}'))$$,
  '300 for a source keyword', 'a keyword over 300 characters is refused'
);
insert into public.automation_flows (name, trigger_type, enabled, graph)
values ('SKW long', 'first_message_keyword', false, pg_temp.graph(to_jsonb(array[repeat('long words ', 25)]), null, '{}'));
select pg_temp.ok(
  exists (select 1 from public.lead_source_rules r join public.automation_flows f on f.id = r.flow_id where f.name = 'SKW long'),
  'a 275-character keyword is fine (as a source rule was), and a flow may only make the lead'
);

-- 4. The webhook makes the lead from the flow's keyword ---------------------------------------------------
select public.auto_lead_from_chat('skw-test-key', 991001, 991001, now(), 'Mrs Robot', '60129990001', 'Hi! Is the ROBOTICS day still open?') as wa_lead \gset
select pg_temp.ok(
  (select source_id = 2 and tag_ids @> '{9201,9202}' and source_rule_id = :day_rule and status = 'new' from public.leads where id = :wa_lead),
  'a WhatsApp first message with the keyword makes the lead with the flow''s source, tags and keyword'
);
select pg_temp.ok(
  exists (select 1 from public.automation_flow_log where flow_id = :robot_flow and event_key = 'first:991001'
          and kind = 'action_done' and lead_id = :wa_lead),
  'the flow''s Execution logs say it made the lead'
);
select public.lead_channel_for_chat('instagram', 991002, 991002, 3, 'IG', 'ig robot', null, null, now(), 'robot camp 2026 pls') as ig_lead \gset
select pg_temp.ok(
  (select source_id = 2 and tag_ids @> '{9201,9202}' and phone is null from public.leads where id = :ig_lead),
  'an Instagram first message with the keyword gets the same source and tags'
);
select pg_temp.ok(
  exists (select 1 from public.automation_flow_log where flow_id = :robot_flow and event_key = 'first:991002' and lead_id = :ig_lead),
  'the Instagram lead is in the Execution logs too'
);

-- 5. The flow engine leaves these flows alone ------------------------------------------------------------
select automation.run_rules();
select pg_temp.ok(
  not exists (select 1 from public.automation_flow_log where flow_id = :robot_flow and event_key not like 'first:%')
  and not exists (select 1 from public.automation_queue where rule_key = 'flow_' || :robot_flow),
  'run_rules does not run a source keyword flow (no second lead, nothing queued)'
);

-- 6. Changing the flow changes the list --------------------------------------------------------------------
update public.automation_flows
set graph = pg_temp.graph('["Robot Camp 2027", "robotics day"]', 2, '{9201}')
where id = :robot_flow;
select pg_temp.ok(
  (select id from public.lead_source_rules where flow_id = :robot_flow and phrase = 'robotics day') = :day_rule
  and exists (select 1 from public.lead_source_rules where flow_id = :robot_flow and phrase = 'Robot Camp 2027')
  and not exists (select 1 from public.lead_source_rules where phrase = 'Robot Camp 2026'),
  'a kept keyword keeps its row; a changed keyword is changed'
);
select pg_temp.ok(
  (select tag_ids = '{9201}' from public.lead_source_rules where id = :day_rule),
  'a removed tag is gone from the list'
);

update public.automation_flows set enabled = false where id = :robot_flow;
select pg_temp.ok(
  (select bool_and(not is_active) from public.lead_source_rules where flow_id = :robot_flow),
  'switching the flow off switches its keywords off'
);
select coalesce(public.auto_lead_from_chat('skw-test-key', 991003, 991003, now(), 'Mr Off', '60129990003', 'robotics day')::text, 'none') as off_lead \gset
select pg_temp.ok(:'off_lead' = 'none', 'a switched-off flow makes no lead');

-- 7. Only the flows write the list --------------------------------------------------------------------------
select pg_temp.login('a0000000-0000-4000-8000-000000000001');
set local role authenticated;
select pg_temp.ok((select count(*) from public.lead_source_rules) > 0, 'staff still read the list');
select pg_temp.fails(
  $$insert into public.lead_source_rules (phrase, source_id) values ('typed by hand', 2)$$,
  'permission denied', 'nobody writes the list by hand'
);
reset role;

-- 8. Deleting the flow, or giving it another trigger, takes its keywords away --------------------------------
delete from public.automation_flows where id = :robot_flow;
select pg_temp.ok(
  not exists (select 1 from public.lead_source_rules where id = :day_rule)
  and (select source_rule_id is null and source_id = 2 from public.leads where id = :wa_lead),
  'deleting the flow removes its keywords; the lead keeps its source'
);
update public.automation_flows
set trigger_type = 'message_keyword',
    graph = pg_temp.graph(to_jsonb(array['long words']), null, '{}')
where name = 'SKW long';
select pg_temp.ok(
  not exists (select 1 from public.lead_source_rules r join public.automation_flows f on f.id = r.flow_id where f.name = 'SKW long'),
  'a flow moved to another trigger has no source keywords'
);

rollback;
