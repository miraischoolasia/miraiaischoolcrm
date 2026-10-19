# Nobody changes on the day the team migrations go live

`run.sh` makes 14 test accounts with every kind of tick that exists before `20261026000000_teams_permissions.sql`
(admin, plain teacher, Leads view, Leads edit + delete, Students, Classrooms, Calendar, Forms, Activity + Team Replies,
a teacher with extra ticks, no ticks, every tick, a switched-off account...), puts one row in each table the rules
touch, and writes down for every account:

- every tick it has (`has_permission` for 16 pages x view / edit / delete),
- how many rows of 34 tables it sees,
- whether 24 kinds of write go through,
- what 40 functions whose check changed answer.

Then it adds the new migrations and writes it all down again. `compare.py` passes only when everything is the same,
and every new page tick equals what the old ticks allowed (Inbox = Leads, App Logins = Students, ...).

How to run it:

1. Start the Supabase Postgres image, apply every migration before `20261026000000` (plus stand-ins for the
   `storage` and `realtime` schemas, which other Supabase services create), and `docker commit` it as an image.
2. `supabase/tests/permissions_no_change/run.sh <that image>`

Last run (2026-10-19): 2156 checks, 0 differences.
