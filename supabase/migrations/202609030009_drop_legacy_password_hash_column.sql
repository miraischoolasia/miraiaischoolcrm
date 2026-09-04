-- password_hash was a placeholder from before real auth existed — it was
-- never read or written by the app. Real password storage now lives
-- entirely inside Supabase Auth (auth.users), reached via
-- teachers.auth_user_id.
alter table public.teachers
drop column if exists password_hash;
