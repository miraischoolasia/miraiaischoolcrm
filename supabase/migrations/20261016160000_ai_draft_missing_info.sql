-- "To fill in" lists what the school knowledge lacks. It was built on staff_note, but the AI also uses
-- that field for ordinary reminders to the team ("the parent is the student, go to step 2"), which buried
-- the real gaps. The AI now names the missing fact in its own field, and the list is built from that.
--
-- missing_info: a short label of the fact the AI needed and did not find in the notes, for example
-- "付款方式" or "报名表格". Empty when nothing was missing.

alter table public.ai_drafts
  add column if not exists missing_info text
    check (missing_info is null or char_length(missing_info) <= 120);

drop index if exists public.ai_drafts_gap_idx;
create index if not exists ai_drafts_missing_idx
  on public.ai_drafts (id desc)
  where missing_info is not null and gap_resolved_at is null;

-- The same label is done for every draft that named it.
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
  where missing_info = p_note
    and gap_resolved_at is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.resolve_ai_gap(text) from public, anon;
grant execute on function public.resolve_ai_gap(text) to authenticated;
