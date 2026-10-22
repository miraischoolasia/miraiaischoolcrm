-- "Unlink" on a chat's lead really unlinks it.
--
-- A chat is tied to its lead in three places: the chat itself (crm_lead_id, in Chatwoot), the chats list of the lead
-- (lead_channels) and the family table (people.lead_id). The Unlink button only cleared the first, so the page found
-- the lead again through the other two at once and the button did nothing.
--
-- unlink_contact_from_lead(contact, lead) clears the other two for that one chat:
--   * lead_channels: the row of this contact on this lead is deleted.
--   * people: the person of this chat that was the lead's parent is split. The lead keeps its parent (and the children
--     under it) as a parent with no chat, as if made from the form; the chat gets a plain contact of its own.
-- The lead and its children are never changed or deleted. A chat whose number is the lead's number is found by that
-- number again (a new contact with a number joins the parent that holds it), which is correct; Unlink is for a lead
-- that is the wrong one.

create or replace function public.unlink_contact_from_lead(
  p_contact_id bigint,
  p_lead_id bigint,
  p_name text default null,
  p_phone text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  person public.people%rowtype;
begin
  if not public.people_can_edit() then
    raise exception 'Not allowed.';
  end if;
  if p_contact_id is null or p_lead_id is null then
    return;
  end if;

  delete from public.lead_channels where chatwoot_contact_id = p_contact_id and lead_id = p_lead_id;

  select * into person from public.people
  where chatwoot_contact_id = p_contact_id and lead_id = p_lead_id and kind = 'parent';
  if found then
    -- The lead's parent stays, without this chat.
    update public.people set chatwoot_contact_id = null where id = person.id;
    -- This chat becomes a plain contact again, with the name and number the chat itself shows (the person row took the
    -- lead's name and number when it was tied), tied to no lead.
    insert into public.people (kind, full_name, phone, chatwoot_contact_id)
    values ('contact', left(nullif(btrim(p_name), ''), 200), public.people_digits(p_phone), p_contact_id)
    on conflict (chatwoot_contact_id) do nothing;
  end if;
end;
$$;

revoke all on function public.unlink_contact_from_lead(bigint, bigint, text, text) from public, anon;
grant execute on function public.unlink_contact_from_lead(bigint, bigint, text, text) to authenticated;
