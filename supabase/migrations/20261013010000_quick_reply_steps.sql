-- A quick reply is now up to five rows ("steps"), each either a text or a file
-- (photo, video, PDF), sent to the parent in the order the team set. They replace
-- the separate `messages` and `media` lists, which are left in place unused so the
-- page that is still open on someone's screen keeps working until it is reloaded.
--
-- steps holds [{ "kind": "text", "text": "..." } | { "kind": "media", "media": { path, name, type, size } }].
-- sort_order is the order the team dragged the quick replies into, the same for everyone.

alter table public.quick_replies
  add column if not exists steps jsonb not null default '[]'::jsonb,
  add column if not exists sort_order integer not null default 0;

alter table public.quick_replies
  drop constraint if exists quick_replies_steps_check;
alter table public.quick_replies
  add constraint quick_replies_steps_check
  check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 5);

-- Existing replies keep the order they have always been sent in: the files first, then the texts.
update public.quick_replies
set steps =
  coalesce(
    (select jsonb_agg(jsonb_build_object('kind', 'media', 'media', item.value) order by item.position)
     from jsonb_array_elements(media) with ordinality as item(value, position)),
    '[]'::jsonb
  )
  || coalesce(
    (select jsonb_agg(jsonb_build_object('kind', 'text', 'text', item.value) order by item.position)
     from unnest(messages) with ordinality as item(value, position)
     where btrim(item.value) <> ''),
    '[]'::jsonb
  )
where steps = '[]'::jsonb;

-- Start from the title order the list has had until now.
update public.quick_replies q
set sort_order = ranked.position * 10
from (
  select id, row_number() over (order by lower(title)) as position
  from public.quick_replies
) ranked
where q.id = ranked.id and q.sort_order = 0;
