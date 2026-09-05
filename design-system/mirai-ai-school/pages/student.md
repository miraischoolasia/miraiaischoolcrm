# Page Override — Student Portal

Overrides MASTER.md for `/student/*` routes only.

- **Density:** standard/spacious (16-32px scale), not `.compact-admin` (8-16px). This is a kid-facing
  surface opened briefly between classes, not an all-day workspace.
- **Tone:** warm and encouraging copy ("Nice! You're on a 4-week streak" not "Attendance: 4/4"). Short
  sentences, age-appropriate for the 6-17 range — default to the plainer phrasing since one component
  serves the whole age range.
- **Mascot usage:** allowed in Home empty-states, streak/badge moments, and Profile's mascot/badge strip.
  Never in nav, buttons, or data tables.
- **Color:** brand pink for primary nav/actions; amber (`#f59e0b`) exclusively for streak/badge accents so
  it never gets confused with a status warning; sky (`#0284c7`) for "homework assigned"; emerald for
  submitted/present; red only for genuinely overdue/absent.
- **Grades/Progress:** reuse `PerformanceRadarChart.tsx` as-is (already brand-appropriate) plus a plain
  list of the 5 metrics (Logic/Creative/Solve/Express/Focus) with the latest teacher remark per metric —
  don't hide remarks behind a chart-only view, non-technical kids need the words too.
- **No leaderboard, no points shop.** See MASTER.md gamification section.
