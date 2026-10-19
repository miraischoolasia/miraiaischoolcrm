-- The nightly Team Replies job. NOT a migration: it is set up by hand on each database (Mirai, EduHero)
-- once 20261024800000_inbox_copy and 20261024810000_team_reply_days are live and checked.
--   npx supabase db query --linked -f supabase/manual/team_replies_cron.sql
--
-- 16:15 UTC is 00:15 in Malaysia: keeps yesterday and the day before (late messages), then marks the
-- chats whose copy fell behind (see inbox_copy_check).
-- Running this again replaces the job (cron.schedule with the same name updates it).
-- To stop it: select cron.unschedule('team-replies-nightly');

create extension if not exists pg_cron;

select cron.schedule('team-replies-nightly', '15 16 * * *', $cron$select public.team_reply_nightly()$cron$);
