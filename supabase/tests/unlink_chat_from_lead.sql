-- Checks for 20261029100000_unlink_chat_from_lead.sql.
-- Run on a scratch copy of the schema (never the live database); it rolls back.
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f supabase/tests/unlink_chat_from_lead.sql

begin;

create function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'FAIL %', p_name;
  end if;
  raise notice 'PASS %', p_name;
end;
$$;

-- An admin who is signed in.
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000c1');
insert into public.teachers (id, auth_user_id, username, full_name, role) overriding system value
values (99851, '00000000-0000-0000-0000-0000000000c1', 'unlink_admin', 'Unlink Admin', 'admin');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

-- A lead with number A, a chat (contact 99701) on number B that the team tied to it by hand.
insert into public.leads (id, full_name, phone, status) overriding system value
values (99961, 'Wrong Lead', '60123450961', 'new');
insert into public.people (id, kind, full_name, phone, chatwoot_contact_id) overriding system value
values (99971, 'contact', 'Chat Name', '60123450962', 99701);
select public.link_contact_to_lead(99701, 99961);
insert into public.lead_channels (lead_id, channel, chatwoot_contact_id, inbox_id) values (99961, 'whatsapp', 99701, 1);

select pg_temp.ok((select lead_id from public.people where chatwoot_contact_id = 99701) = 99961, 'the chat is tied to the lead');
select pg_temp.ok(exists (select 1 from public.lead_channels where chatwoot_contact_id = 99701), 'the lead lists the chat');

select public.unlink_contact_from_lead(99701, 99961, 'Chat Name', '60123450962');

select pg_temp.ok(not exists (select 1 from public.lead_channels where chatwoot_contact_id = 99701), 'the lead no longer lists the chat');
select pg_temp.ok((select lead_id from public.people where chatwoot_contact_id = 99701) is null, 'the chat is tied to no lead');
select pg_temp.ok((select kind from public.people where chatwoot_contact_id = 99701) = 'contact', 'the chat is a plain contact again');
select pg_temp.ok((select phone from public.people where chatwoot_contact_id = 99701) = '60123450962', 'the chat keeps its own number');
select pg_temp.ok(exists (select 1 from public.people where lead_id = 99961 and kind = 'parent' and chatwoot_contact_id is null), 'the lead keeps its parent, without the chat');
select pg_temp.ok((select count(*) from public.leads where id = 99961) = 1, 'the lead is not touched');

-- Unlinking again, or a chat that was never on the lead, does nothing.
select public.unlink_contact_from_lead(99701, 99961, 'Chat Name', '60123450962');
select public.unlink_contact_from_lead(99702, 99961, null, null);
select pg_temp.ok((select count(*) from public.people where chatwoot_contact_id = 99701) = 1, 'still one row for the chat');

-- Someone who may not edit is refused.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.unlink_contact_from_lead(99701, 99961, null, null);
    raise exception 'FAIL an outsider was allowed';
  exception when others then
    if sqlerrm = 'Not allowed.' then
      null;
    else
      raise;
    end if;
  end;
end;
$$;
select pg_temp.ok(true, 'someone who cannot edit is refused');

rollback;
