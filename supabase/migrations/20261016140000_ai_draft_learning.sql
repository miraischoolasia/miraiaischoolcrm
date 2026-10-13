-- The AI brain learns from what the team really sends.
--
-- ai_drafts already logs each AI reply draft. Four things are added so the team can see how the AI is
-- doing and teach it:
--   * sent_text / sent_at / sent_by: what the team really sent in answer to the parent message the
--     draft was for (phone numbers and emails removed), so the draft can be compared with it;
--   * parent_text: the parent message the draft answers (already scrubbed by the function), so an
--     example of "parent asked -> we answered" can be copied into a knowledge note;
--   * category: what kind of question it was, so the share of drafts used as written can be seen per
--     kind (price and refund questions must never be answered without a person);
--   * gap_resolved_at: an admin has dealt with the missing-information reminder (staff_note);
--     reviewed_at: an admin has looked at the sent reply and used it or put it away.
-- Nothing here changes what the AI reads: only an admin saving a knowledge note does that.

alter table public.ai_drafts
  add column if not exists parent_text text
    check (parent_text is null or char_length(parent_text) <= 1500),
  add column if not exists category text
    check (category is null or category in
      ('info', 'schedule', 'price', 'enrol', 'followup', 'complaint', 'refund', 'health', 'other')),
  add column if not exists sent_text text
    check (sent_text is null or char_length(sent_text) <= 4000),
  add column if not exists sent_at timestamptz,
  add column if not exists sent_by uuid,
  add column if not exists gap_resolved_at timestamptz,
  add column if not exists reviewed_at timestamptz;

create index if not exists ai_drafts_gap_idx
  on public.ai_drafts (id desc)
  where staff_note is not null and gap_resolved_at is null;

create index if not exists ai_drafts_sent_idx
  on public.ai_drafts (id desc)
  where sent_text is not null;

-- Whoever sends a reply in the inbox records it against the draft that was shown for that parent
-- message. The first recording wins (two people may have the same draft open).
create or replace function public.record_ai_draft_sent(p_id bigint, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cleaned text;
begin
  if not (select public.has_permission('leads', 'edit')) then
    raise exception 'You do not have permission to do this.';
  end if;
  cleaned := btrim(coalesce(p_text, ''));
  -- The browser already removes these; this is the second lock.
  cleaned := regexp_replace(cleaned, '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+', '[email]', 'g');
  cleaned := regexp_replace(cleaned, '\+?\d(?:[ -]?\d){7,}', '[number]', 'g');
  cleaned := left(cleaned, 4000);
  if cleaned = '' then
    return;
  end if;
  update public.ai_drafts
  set sent_text = cleaned,
      sent_at = now(),
      sent_by = (select auth.uid())
  where id = p_id
    and sent_at is null;
end;
$$;

revoke all on function public.record_ai_draft_sent(bigint, text) from public, anon;
grant execute on function public.record_ai_draft_sent(bigint, text) to authenticated;

-- An admin has written the missing information down: every reminder with the same sentence is done.
create or replace function public.resolve_ai_gap(p_note text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if not (select public.is_admin()) then
    raise exception 'Only an admin can change the AI knowledge.';
  end if;
  update public.ai_drafts
  set gap_resolved_at = now()
  where staff_note = p_note
    and gap_resolved_at is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.resolve_ai_gap(text) from public, anon;
grant execute on function public.resolve_ai_gap(text) to authenticated;

-- An admin has looked at what the team sent and used it as an example, or put it away.
create or replace function public.review_ai_example(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_admin()) then
    raise exception 'Only an admin can change the AI knowledge.';
  end if;
  update public.ai_drafts
  set reviewed_at = coalesce(reviewed_at, now())
  where id = p_id;
end;
$$;

revoke all on function public.review_ai_example(bigint) from public, anon;
grant execute on function public.review_ai_example(bigint) to authenticated;
