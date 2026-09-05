# Page Override — Parent Portal

Overrides MASTER.md for `/parent/*` routes only.

- **Read-only v1:** no buttons that imply an action Mirai doesn't yet support (pay, message, request
  reschedule). If a fact needs school follow-up (e.g. fee overdue), show a plain instruction
  ("Contact the front desk to renew") rather than a fake-functional button.
- **Multi-child support:** Home is a stack/grid of one summary card per child (most parents have 1, some
  have 2-3). Each card: photo/initial, program level, next class, attendance streak chip, any
  overdue/due-soon billing flag. Tapping a card drills into that child's Attendance/Homework/Billing.
- **Density:** standard/spacious, same as Student portal — this is a "check in on my kid" surface, not a
  dashboard to live in.
- **Tone:** calm, factual, reassuring by default — a parent's dominant use case is reassurance ("yes,
  everything's fine") more than alarm, so don't over-use red/warning color; reserve it for things that
  truly need action (overdue fee, unexcused absence), same semantic table as MASTER.
- **Billing:** show dates and status only (Account Fee, Mirai Club, Lesson Package expiry) — explicitly
  no payment collection in v1, per project scope.
- **Gamification:** shown only as a small read-only strip on the child's card (current streak, latest
  badge) — parents observe, they don't manage it.
