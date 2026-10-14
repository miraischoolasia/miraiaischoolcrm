-- Steps that change the lead: add a tag, assign a PIC, change the lead stage.
--
-- A new kind of block in a flow graph, next to "message" and "condition":
--     { id, type: "action", action: "add_tag" | "assign_pic" | "set_stage", value, mins, after }
--   value  the tag id, the PIC id (lead_options) or the stage (never "converted": that makes a student, which
--          only a person does).
--   mins / after  when it happens, counted like a message ("0 minutes after" is right away; after a wait or
--          a reply it counts from that moment).
-- It has one way out ("out") like a message, so more steps can follow it. Nothing is sent and nothing waits
-- for approval: the runner (every minute) does it once it is due, to the lead of the event, and writes a log
-- row: action_done, or action_skipped with the reason (no lead, the tag was deleted, the lead is already
-- converted, ...). The same person and event are never done twice (the log row is the guard). The global
-- pause switch stops these steps too.
-- A flow without such steps behaves exactly as before.

alter table public.automation_flow_log drop constraint if exists automation_flow_log_kind_check;
alter table public.automation_flow_log
  add constraint automation_flow_log_kind_check
  check (kind in (
    'stage_stopped', 'cooldown', 'condition_no', 'no_message', 'no_phone', 'opted_out',
    'replied', 'no_reply', 'reply_branch', 'action_done', 'action_skipped'
  ));

-- The flow check on save knows the new block.
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

-- The walker returns a step like a message: its action as the kind, its tag / PIC / stage in message_text.
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
  p_keyword bigint default null,
  -- Message block id -> when it was sent (for this event), and the parent's messages as [{at, text}].
  p_sent jsonb default null,
  p_replies jsonb default null,
  -- When the event itself starts; where a wait with nothing before it begins.
  p_event_at timestamptz default null,
  p_now timestamptz default now()
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
  detail text,
  -- For a message after a reply or a finished wait: the moment its "mins" are counted from.
  anchor_at timestamptz,
  image_url text,
  -- For a wait that has an answer: the reply time, or the moment the waiting ran out.
  resolved_at timestamptz
)
language plpgsql
stable
set search_path = ''
as $$
declare
  sid text[] := array['trigger'];
  sanc timestamptz[] := array[null::timestamptz];
  slast text[] := array[null::text];
  swin_a timestamptz[] := array[null::timestamptz];
  swin_b timestamptz[] := array[null::timestamptz];
  seen text[] := '{}';
  cur text;
  cur_anchor timestamptz;
  cur_last text;
  cur_win_a timestamptz;
  cur_win_b timestamptz;
  child_anchor timestamptz;
  child_last text;
  child_win_a timestamptz;
  child_win_b timestamptz;
  n jsonb;
  e jsonb;
  v_port text;
  v_type text;
  v_kind text;
  v_detail text;
  v_resolved timestamptz;
  v_wait_port text;
  v_start timestamptz;
  v_timeout integer;
  v_reply_text text;
  v_reply_at timestamptz;
  v_word text;
  lo integer;
  hi integer;
  hits integer;
  matched boolean;
begin
  while coalesce(array_length(sid, 1), 0) > 0 loop
    cur := sid[1];
    cur_anchor := sanc[1];
    cur_last := slast[1];
    cur_win_a := swin_a[1];
    cur_win_b := swin_b[1];
    sid := coalesce(sid[2:array_length(sid, 1)], '{}'::text[]);
    sanc := coalesce(sanc[2:array_length(sanc, 1)], '{}'::timestamptz[]);
    slast := coalesce(slast[2:array_length(slast, 1)], '{}'::text[]);
    swin_a := coalesce(swin_a[2:array_length(swin_a, 1)], '{}'::timestamptz[]);
    swin_b := coalesce(swin_b[2:array_length(swin_b, 1)], '{}'::timestamptz[]);
    if cur = any (seen) then
      continue;
    end if;
    seen := seen || cur;

    v_type := null;
    v_kind := null;
    v_detail := null;
    v_resolved := null;
    v_wait_port := null;
    child_anchor := cur_anchor;
    child_last := cur_last;
    child_win_a := cur_win_a;
    child_win_b := cur_win_b;

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
      -- A step that changes the lead reports its action (add_tag, assign_pic, set_stage) as its kind and
      -- the tag / PIC / stage it uses in message_text.
      if v_type = 'action' then
        v_kind := n ->> 'action';
      end if;

      if v_type = 'message' then
        -- This message is queued, and the walk goes on to whatever follows it.
        v_port := 'out';
        child_last := cur;
      elsif v_type = 'action' then
        -- A step is done and the walk goes on; it does not start or end a wait.
        v_port := 'out';
      elsif v_kind = 'age' then
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
      elsif v_kind = 'wait' then
        -- Wait for the parent to write back. It starts when the message before it was SENT (a message
        -- that is still waiting for approval has not started anything); with no message before it,
        -- it starts at the event. Yes = a reply came in time, No = the time ran out.
        v_timeout := (n ->> 'mins')::integer;
        v_start := case
          when cur_last is not null then (p_sent ->> cur_last)::timestamptz
          else coalesce(cur_anchor, p_event_at)
        end;
        if v_start is null then
          v_wait_port := 'waiting';
          v_detail := 'Waiting for the message before it to be sent';
        else
          v_reply_at := null;
          v_reply_text := null;
          select (r ->> 'at')::timestamptz, r ->> 'text'
          into v_reply_at, v_reply_text
          from jsonb_array_elements(coalesce(p_replies, '[]'::jsonb)) r
          where (r ->> 'at')::timestamptz > v_start
            and (r ->> 'at')::timestamptz <= v_start + make_interval(mins => v_timeout)
          order by (r ->> 'at')::timestamptz
          limit 1;
          if v_reply_at is not null then
            v_wait_port := 'yes';
            v_resolved := v_reply_at;
            child_anchor := v_reply_at;
            child_last := null;
            -- The word checks below look at every message of the parent inside this window.
            child_win_a := v_start;
            child_win_b := v_start + make_interval(mins => v_timeout);
            v_detail := case
              when coalesce(v_reply_text, '') = '' then 'The parent replied (no text)'
              else format('The parent replied: "%s"', left(v_reply_text, 120))
            end;
          elsif p_now >= v_start + make_interval(mins => v_timeout) then
            v_wait_port := 'no';
            v_resolved := v_start + make_interval(mins => v_timeout);
            child_anchor := v_resolved;
            child_last := null;
            child_win_a := null;
            child_win_b := null;
            v_detail := format(
              'No reply within %s',
              case
                when v_timeout % 1440 = 0 then (v_timeout / 1440) || ' day(s)'
                when v_timeout % 60 = 0 then (v_timeout / 60) || ' hour(s)'
                else v_timeout || ' minute(s)'
              end
            );
          else
            v_wait_port := 'waiting';
            v_detail := 'Waiting for a reply until '
              || to_char((v_start + make_interval(mins => v_timeout)) at time zone 'Asia/Kuala_Lumpur', 'DD Mon HH12:MI am');
          end if;
        end if;
      elsif v_kind = 'reply' then
        -- Look for one of the words in ANY message the parent wrote while the wait was open (two, three
        -- or four messages all count). The earliest message that has a word starts the next steps.
        v_word := null;
        v_reply_at := null;
        if cur_win_a is not null then
          select (r ->> 'at')::timestamptz, w #>> '{}'
          into v_reply_at, v_word
          from jsonb_array_elements(coalesce(p_replies, '[]'::jsonb)) r
          cross join jsonb_array_elements(coalesce(n -> 'words', '[]'::jsonb)) w
          where (r ->> 'at')::timestamptz > cur_win_a
            and (r ->> 'at')::timestamptz <= cur_win_b
            and btrim(w #>> '{}') <> ''
            and position(lower(btrim(w #>> '{}')) in lower(coalesce(r ->> 'text', ''))) > 0
          order by (r ->> 'at')::timestamptz
          limit 1;
        end if;
        matched := v_reply_at is not null;
        if matched then
          v_resolved := v_reply_at;
          child_anchor := v_reply_at;
        end if;
        v_detail := case
          when matched then format('A reply has the word "%s"', v_word)
          when cur_win_a is null then 'There is no reply to check'
          else 'No reply has any of the words'
        end;
      else
        matched := false;
        v_detail := 'Unknown block';
      end if;

      if v_type not in ('message', 'action') then
        v_port := case
          when v_kind = 'wait' then v_wait_port
          when matched then 'yes'
          else 'no'
        end;
      end if;
    end if;

    hits := 0;
    for e in select value from jsonb_array_elements(coalesce(p_graph -> 'edges', '[]'::jsonb)) as t(value) loop
      if e ->> 'from' = cur and e ->> 'port' = v_port then
        sid := array_append(sid, e ->> 'to');
        sanc := array_append(sanc, child_anchor);
        slast := array_append(slast, child_last);
        swin_a := array_append(swin_a, child_win_a);
        swin_b := array_append(swin_b, child_win_b);
        hits := hits + 1;
      end if;
    end loop;

    if cur <> 'trigger' then
      node_id := cur;
      node_type := v_type;
      kind := v_kind;
      port := v_port;
      ended := hits = 0;
      resolved_at := v_resolved;
      if v_type = 'message' then
        mins := (n ->> 'mins')::integer;
        message_text := n ->> 'text';
        is_after := coalesce((n ->> 'after')::boolean, false);
        detail := null;
        anchor_at := cur_anchor;
        image_url := nullif(btrim(coalesce(n ->> 'imageUrl', '')), '');
      elsif v_type = 'action' then
        mins := (n ->> 'mins')::integer;
        message_text := n ->> 'value';
        is_after := coalesce((n ->> 'after')::boolean, false);
        detail := null;
        anchor_at := cur_anchor;
        image_url := null;
      else
        mins := null;
        message_text := null;
        is_after := null;
        detail := v_detail;
        anchor_at := null;
        image_url := null;
      end if;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function automation.flow_walk(
  jsonb, integer, bigint, numeric, text, bigint, bigint, bigint[], text[], bigint, jsonb, jsonb, timestamptz, timestamptz
) from public, anon, authenticated;

-- Only events that are about to matter are written to the log; a step counts like a message.
create or replace function automation.flow_event_relevant(p_graph jsonb, p_starts timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements(coalesce(p_graph -> 'nodes', '[]'::jsonb)) x
    where x ->> 'type' in ('message', 'action')
      and case
        when coalesce((x ->> 'after')::boolean, false)
          then p_starts + make_interval(mins => (x ->> 'mins')::integer)
        else p_starts - make_interval(mins => (x ->> 'mins')::integer)
      end between now() - interval '1 hour' and now() + interval '3 hours'
      and (coalesce((x ->> 'after')::boolean, false) or p_starts > now())
  )
$$;

-- Does one step that changes the lead, once per person and event (the log row is the guard), and writes
-- what happened. It never raises: a tag that was deleted just ends up in the log.
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
  v_id bigint;
  v_label text;
  v_status text;
  v_rows integer;
  v_kind text := 'action_done';
  v_detail text;
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

  if p_lead is null then
    perform automation.log_flow_event(
      p_flow, p_event_key, p_node, 'action_skipped',
      'This family has no lead, so there was nothing to change.',
      p_phone, p_parent, p_child, p_lead, p_student, p_starts
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
        where l.id = p_lead and not (v_id = any (l.tag_ids));
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
        where l.id = p_lead and l.pic_id is distinct from v_id;
        get diagnostics v_rows = row_count;
        v_detail := case
          when v_rows > 0 then format('Assigned %s as the PIC of the lead.', v_label)
          else format('%s is already the PIC of the lead.', v_label)
        end;
      end if;
    elsif p_action = 'set_stage' then
      select l.status into v_status from public.leads l where l.id = p_lead;
      if not found then
        v_kind := 'action_skipped';
        v_detail := 'The lead no longer exists.';
      elsif v_status = 'converted' then
        v_kind := 'action_skipped';
        v_detail := 'The lead is already converted, so its stage was left alone.';
      elsif p_value not in ('new', 'contacted', 'trial_scheduled', 'trial_completed', 'lost') then
        v_kind := 'action_skipped';
        v_detail := 'That stage cannot be set by a flow.';
      elsif v_status = p_value then
        v_detail := format('The lead is already "%s".', p_value);
      else
        update public.leads l set status = p_value where l.id = p_lead;
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
    p_phone, p_parent, p_child, p_lead, p_student, p_starts
  );
end;
$$;

revoke all on function automation.do_flow_action(
  bigint, text, text, text, text, bigint, text, text, text, bigint, timestamptz
) from public, anon, authenticated;

-- The runner does the steps that are due.
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
               message, due_at, expires_at, media_url)
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
              expires,
              nullif(left(m.image_url, 600), '')
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
