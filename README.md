# Mirai Teaching System

Lightweight teaching administration system built with Vite, React, TypeScript,
Tailwind CSS, FullCalendar, and Supabase.

## Current Modules

- Admin student classes, expiry, renewal, and membership dashboard
- Age Group > Level > Classroom management
- Teacher records and classroom assignment
- Regular and replacement class calendar
- Mobile attendance, lesson remarks, and five-metric student reviews
- Immutable lesson revisions, class deduction ledger, and Admin activity log
- Classroom archive and restore flow

## Local Development

```bash
npm install
npm run dev
```

Create `.env.local` with:

```env
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Never commit `.env.local`, database passwords, access tokens, or service-role keys.

## Validation

```bash
npm run lint
npm run test
npm run build
```

## Database Workflow

All schema changes must be added as a new file under `supabase/migrations`.

```bash
npm run db:status
npm run db:push
```

Do not edit an already-applied production migration. Add a corrective migration
instead. The older manual phase SQL copies have been removed so migrations remain
the single database source of truth.

## Testing-Stage Note

The project currently keeps the local `View As` role preview and development RLS
policies for testing. Supabase Auth and production role isolation must be completed
before real student or teacher data is used.
