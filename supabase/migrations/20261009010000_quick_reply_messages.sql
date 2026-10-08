-- A quick reply can now hold up to three separate text messages (sent one after
-- the other, after any photos or videos). They replace the single body.

alter table public.quick_replies
  add column if not exists messages text[] not null default '{}';

update public.quick_replies
set messages = case when btrim(body) = '' then '{}' else array[body] end
where messages = '{}';

alter table public.quick_replies
  drop constraint if exists quick_replies_messages_check;
alter table public.quick_replies
  add constraint quick_replies_messages_check
  check (
    cardinality(messages) <= 3
    and char_length(array_to_string(messages, chr(30))) <= 12000
  );

alter table public.quick_replies drop column if exists body;
