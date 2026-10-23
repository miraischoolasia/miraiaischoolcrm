-- Lighter Inbox reads (EduHero was getting slow, 2026-10-23; ⑥'s check eduhero-performance-audit-20261023.md #3, #4).
-- Two indexes only; nothing else changes and no row is touched.
--
-- 1. inbox_recent_messages (the newest messages of the chats at the top of the Inbox, read ahead) takes each chat's
--    newest copied messages "order by id desc". The index it had sorts by created_at first, so every chat's messages
--    were read and sorted (on average 416 ms a call). This one hands them over in that order, stopping at the limit.
-- 2. The Inbox page now catches up with "the chats changed since I last looked" (updated_at) instead of reading every
--    open chat again.
--
-- Both are built in a moment on today's tables (EduHero: about 100,000 messages); writes to the two tables wait for
-- that moment.

create index if not exists inbox_messages_chat_newest_idx
  on public.inbox_messages (conversation_id, id desc)
  where raw is not null;

create index if not exists inbox_chats_updated_idx
  on public.inbox_chats (updated_at);
