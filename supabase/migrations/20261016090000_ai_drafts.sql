-- AI reply drafts for the WhatsApp inbox.
--
-- The edge function `ai-draft` asks Google Gemini for the reply the team would write next and the
-- inbox shows it as grey text in the message box. This table is its log:
--   * the same last message of the same chat is answered once for the whole team (the function looks
--     here first), which also keeps the cost down;
--   * accepted_at records that someone used the suggestion, so how often it is used can be measured;
--   * the function counts the rows of the last 24 hours against a daily limit.
-- Only the function (service role) adds rows. Whoever can see Leads can read the log; a person who can
-- edit Leads marks a draft as used through mark_ai_draft_accepted().

create table if not exists public.ai_drafts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  requested_by uuid,
  -- Chatwoot's id of the conversation and of the parent's message that was answered.
  chat_id bigint not null,
  last_message_id bigint not null,
  draft text check (draft is null or char_length(draft) <= 4000),
  -- The AI judged that no reply is needed (a thank-you, or the team spoke last).
  skipped boolean not null default false,
  staff_note text check (staff_note is null or char_length(staff_note) <= 300),
  model text check (model is null or char_length(model) <= 100),
  latency_ms integer,
  accepted_at timestamptz
);

create index if not exists ai_drafts_chat_idx on public.ai_drafts (chat_id, last_message_id, id desc);
create index if not exists ai_drafts_created_idx on public.ai_drafts (created_at);

alter table public.ai_drafts enable row level security;

create policy "ai_drafts_select_permitted"
on public.ai_drafts
for select to authenticated
using ((select public.has_permission('leads')));

revoke all on public.ai_drafts from anon, authenticated;
grant select on public.ai_drafts to authenticated;

create or replace function public.mark_ai_draft_accepted(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.has_permission('leads', 'edit')) then
    raise exception 'You do not have permission to do this.';
  end if;
  update public.ai_drafts
  set accepted_at = coalesce(accepted_at, now())
  where id = p_id;
end;
$$;

revoke all on function public.mark_ai_draft_accepted(bigint) from public, anon;
grant execute on function public.mark_ai_draft_accepted(bigint) to authenticated;
