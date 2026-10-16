-- Pictures for the Messenger / Instagram Pages the inbox receives chats from, so a chat shows which Page it came
-- through. The picture is fetched from Facebook when the Page is known to it; when it is not (or the school wants
-- another one) an admin uploads it. The key names the channel: the Chatwoot inbox id, followed by "|" and the Page
-- name when one inbox carries several Pages (the GoHighLevel bridge).

create table if not exists public.channel_avatars (
  channel_key text primary key check (char_length(channel_key) between 1 and 200),
  -- A small square picture as a data URL (the page shrinks it before it is sent), or an https link.
  avatar text not null check (char_length(avatar) between 1 and 80000),
  updated_at timestamptz not null default now()
);

alter table public.channel_avatars enable row level security;

create policy "channel_avatars_select_permitted"
on public.channel_avatars for select to authenticated
using ((select public.has_permission('leads')));

create policy "channel_avatars_insert_admin"
on public.channel_avatars for insert to authenticated
with check ((select public.is_admin()));

create policy "channel_avatars_update_admin"
on public.channel_avatars for update to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

create policy "channel_avatars_delete_admin"
on public.channel_avatars for delete to authenticated
using ((select public.is_admin()));

revoke all on public.channel_avatars from anon, authenticated;
grant select on public.channel_avatars to authenticated;
grant insert (channel_key, avatar, updated_at) on public.channel_avatars to authenticated;
grant update (avatar, updated_at) on public.channel_avatars to authenticated;
grant delete on public.channel_avatars to authenticated;
