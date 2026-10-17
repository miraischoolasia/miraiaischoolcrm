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

## Put the web version online (one Vercel project per school)

Each school (Mirai, EduHero, ...) gets its own Vercel project, because each
has its own Supabase database.

1. New Vercel project from the GitHub repo, **Root Directory** `student-app`
   (the rest comes from `vercel.json`: `expo export --platform web` into `dist`,
   every path served by `index.html`).
2. Environment variables: `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_KEY` (that school's publishable key).
3. Add the school's domain (e.g. `app.<school-domain>`).

The school name and colour come from the database (Class Settings > Student app),
so the same build serves every school.

## Phone apps (App Store / Play Store)

`eas.json` has one build profile per school (`mirai`, `eduhero`): the store
name, the app id and that school's Supabase address and publishable key (made
to be public). `app.config.ts` reads them.

1. `npm i -g eas-cli`, `eas login` (the school's Expo account), `eas init`.
2. `eas build --profile mirai --platform all`
3. `eas submit --profile mirai` (needs the Apple Developer and Google Play accounts).
