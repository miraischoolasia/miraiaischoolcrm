# Supabase Migration Workflow

This project now uses Supabase CLI migrations, so you do not need to paste SQL into the Supabase dashboard every time.

## One-time setup

1. `npm run db:login`
2. `npm run db:link`

When `db:link` asks for the database password, copy it once from:

- Supabase Dashboard
- `Project Settings`
- `Database`
- `Connection string` or `Database password`

## Normal workflow

- Push all new migrations to the linked remote project:
  - `npm run db:push`
- See migration status:
  - `npm run db:status`
- Create a new migration file:
  - `npm run db:new -- add_my_change`

## Local Supabase workflow

- Start local Supabase:
  - `npm run db:start`
- Reset local DB from migrations:
  - `npm run db:reset`
- Stop local Supabase:
  - `npm run db:stop`

## Current migration files

- `supabase/migrations/202607010001_phase_2_base.sql`
- `supabase/migrations/202607010002_phase_3_calendar.sql`
- `supabase/migrations/202607010003_phase_4_attendance.sql`
- `supabase/migrations/202607010004_phase_5_student_records.sql`
- `supabase/migrations/202607010005_phase_6_teacher_records.sql`
- `supabase/migrations/202607010006_phase_7_student_reviews.sql`

## Important

- Do not commit database passwords or access tokens into Git.
- After you change database schema, always create a new migration file instead of editing old production migrations unless you are intentionally resetting everything.

## Standard workflow for every future database change

Use this exact process every time:

1. Create a new migration file
   - `npm run db:new -- add_students_table_field`
2. Open the new SQL file inside `supabase/migrations/`
3. Write only the database change for that step
   - examples:
   - `alter table ... add column ...`
   - `create table ...`
   - `create or replace function ...`
   - `create policy ...`
4. Push the migration to your linked Supabase project
   - `npm run db:push`
5. If frontend types changed, update local TypeScript types manually in:
   - `src/types/database.ts`
6. Test the UI locally
   - `npm run dev`
7. Commit both code and migration together

## Practical rules

- One feature = one migration file.
- Never put secrets, database passwords, or API keys into migration SQL.
- Never silently edit old production migrations after they have already been pushed.
- If you need a correction later, create a new migration that fixes the old one.
- Keep table names, columns, and functions in English system naming.
- For destructive changes like dropping a column or table, stop and review first.

## Recommended naming examples

- `npm run db:new -- add_teacher_notes`
- `npm run db:new -- create_classrooms_table`
- `npm run db:new -- add_attendance_index`
- `npm run db:new -- update_submit_lesson_attendance`

## When you only need data changes

If you are only inserting safe seed/demo rows for development, prefer putting them in a new migration as explicit `insert` / `update` statements.

## Team rule

Only one machine should run `npm run db:push` at a time for the same project branch, to avoid migration ordering conflicts.
