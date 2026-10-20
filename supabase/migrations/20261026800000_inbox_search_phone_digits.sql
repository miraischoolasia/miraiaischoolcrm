-- Searching the Inbox for a number found the chat only when it was typed exactly as stored: "+60127633881" and
-- "012-763 3881" found nothing on the server (only the chats already in the list were matched by digits). Now a
-- search made only of digits, spaces, "+", "-" and brackets is also matched by its digits against the number.
-- (Mirai, 2026-10-20: "60127633881" showed "No chats match" while Michelle Hew's chat was there; that part was the
-- list hiding her chat behind her son's, fixed in the page.)

create or replace function public.inbox_search(p_query text, p_limit integer default 40)
returns table (
  kind text,
  conversation_id bigint,
  message_id bigint,
  created_at timestamptz,
  snippet text,
  chat jsonb,
  last_message jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern,
      least(greatest(coalesce(p_limit, 40), 1), 100) as max_rows,
      -- A number typed the way people write it ("+60 12-763 3881", "012 763 3881"): its digits. A local number
      -- (0127633881) is inside the stored one (60127633881) as it is.
      case
        when btrim(p_query) ~ '^[0-9 +()-]+$' and char_length(regexp_replace(p_query, '\D', '', 'g')) >= 6
          then '%' || regexp_replace(p_query, '\D', '', 'g') || '%'
      end as digits_pattern
    where char_length(btrim(coalesce(p_query, ''))) >= 2
  ),
  people as (
    select 'chat'::text as kind, c.conversation_id, null::bigint as message_id, c.last_activity_at as created_at,
      c.contact_name as snippet, c.raw as chat, c.last_message_raw as last_message
    from public.inbox_chats c, q
    where c.raw is not null
      and (c.contact_name ilike q.pattern or c.contact_phone ilike q.pattern or c.contact_identifier ilike q.pattern
           or c.contact_phone like q.digits_pattern or c.contact_identifier like q.digits_pattern)
    order by c.last_activity_at desc nulls last
    limit (select max_rows from q)
  ),
  words as (
    select 'message'::text as kind, m.conversation_id, m.id as message_id, m.created_at,
      left(m.content, 300) as snippet, c.raw as chat, c.last_message_raw as last_message
    from public.inbox_messages m
    join public.inbox_chats c on c.conversation_id = m.conversation_id, q
    where not m.deleted and m.content ilike q.pattern
    order by m.created_at desc
    limit (select max_rows from q)
  )
  select * from people
  union all
  select * from words;
$$;

revoke all on function public.inbox_search(text, integer) from public, anon;
grant execute on function public.inbox_search(text, integer) to authenticated;
