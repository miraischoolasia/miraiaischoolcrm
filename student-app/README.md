# Student app

The app children and parents sign in to: the next class and its Zoom link,
points and level, per-lesson scores, and (for whoever the school allows)
lessons left and when the package ends. One Expo codebase for web, iOS and
Android. It reads only through the `portal_*` functions in the CRM database
(migration `20261021200000_student_portal.sql`); logins are made from the
student's page in the CRM.

## Run it

1. `npm install`
2. Copy the CRM's Supabase URL and publishable key into `.env.local`:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   EXPO_PUBLIC_SUPABASE_KEY=sb_publishable_...
   ```

3. `npm run web` (on Windows, set `CI=1` if Metro crashes in watch mode; it
   then does not reload, so restart it after edits).

## Check it

`npx tsc --noEmit` and `npm run lint`.
