# Design System Master File — Mirai AI School CRM

> **LOGIC:** When building a specific page/portal, first check `design-system/mirai-ai-school/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file. Otherwise follow the rules below.

---

**Project:** Mirai AI School — Admin / Teacher / Student / Parent CRM
**Category:** Education CRM (hybrid: internal ops dashboard + LMS-style family portal)
**Scope decision (2026-09-03):** Redesign all three tiers (Admin+Teacher, Student, Parent) on one shared
system. Parent portal ships **read-only** first (attendance, homework, grades, schedule, billing dates —
no payments/messaging yet). Gamification is intentionally **light-touch**: attendance/homework streaks and
mascot-based badges only — no points economy, no leaderboard, no shop. Platform: responsive web only
(no PWA/native yet, but don't block it). **Build order: Admin/Teacher ships first** (it's the existing,
real surface — lowest risk, highest daily usage), Student and Parent portals follow once the visual
direction below is validated against it.

**Palette direction (revised 2026-09-03):** white page background, black chrome, pink accent — not the
softer pink-tinted neutral explored in the earlier concept mockups. Applied to the live Admin/Teacher app:
`src/index.css` root/body background and every section/modal header tint moved from grey (`#f3f4f6` /
`#f8fafc`) to pure white, and the sidebar moved from dark-grey (`#2f2f2f`) to near-black (`#0a0a0a`). This
is the reference direction Student and Parent portals should follow when built for real — white surfaces,
black text/chrome, pink reserved for brand + primary actions.

This is **not** a from-scratch brand. Mirai already ships an admin dashboard with a defined identity
(pink brand, DM Sans/Nunito, 4 mascots, rounded cards). This system extends that identity to
student- and parent-facing surfaces rather than replacing it — a parent who has seen the school's
WhatsApp broadcasts, invoices, and signage should recognize the portal as the same school.

---

## Global Rules

### Color Palette

Base neutrals and brand pink are the **existing** tokens already live in `src/index.css` / component
classNames — keep them. New tokens below extend the system for record-keeping content (attendance,
homework, grades, billing) that doesn't exist in the admin-only version yet.

| Role | Hex | CSS Variable | Source |
|------|-----|--------------|--------|
| Brand Primary | `#fc0c97` | `--color-brand` | existing (buttons, FullCalendar accents) |
| Brand Primary Hover | `#de0a84` | `--color-brand-hover` | existing |
| Brand Text-on-light | `#be185d` | `--color-brand-text` | existing (SummaryBar "brand" tone, StatusChip critical text) |
| Brand Tint (surface) | `#fff1f8` | `--color-brand-tint` | existing (StatusChip critical bg, FullCalendar today bg) |
| Foreground | `#1e293b` | `--color-foreground` | existing (`:root` color, near-black) |
| Page Background | `#ffffff` | `--color-page-bg` | **updated** — was `#f3f4f6`, now pure white (`body`/`:root` in `src/index.css`) |
| Card | `#ffffff` | `--color-card` | existing |
| Card Header Tint | `#ffffff` | `--color-card-header` | **updated** — was `#f8fafc`; section/modal header bars now white, separated by `border-slate-200` only |
| Sidebar Chrome | `#0a0a0a` | `--color-chrome` | **updated** — was `#2f2f2f` dark-grey, now near-black, matches the pink+black+white direction |
| Border | `#e2e8f0` | `--color-border` | existing (slate-200) |
| Muted Foreground | `#64748b` / `#475569` | `--color-muted` | existing (slate-500 / slate-600) |
| Healthy / On-track | `#059669` on `#ecfdf5` | `--color-healthy` | existing (emerald, StatusChip healthy) |
| Destructive | `#dc2626` | `--color-destructive` | new — reserve for hard failure states only (not "due soon") |

**New semantic tokens** (needed once Homework/Grades/Attendance/Billing become first-class content, not
just admin alert flags):

| Semantic role | Hex | Notes |
|---|---|---|
| Attendance — present | `#059669` (emerald) | reuse "healthy" |
| Attendance — absent/unexcused | `#dc2626` (red) | reserve red for this, not for "due soon" |
| Attendance — excused/leave | `#d97706` (amber) | new — do not reuse brand pink for neutral caution |
| Homework — assigned/open | `#0284c7` (sky-600) | new — distinguishes "to do" from status alerts |
| Homework — submitted | `#059669` | reuse "healthy" |
| Homework — overdue | `#dc2626` | reuse destructive |
| Grades / performance | brand pink family (`#fc0c97` accents on radar chart) | already implemented in `PerformanceRadarChart.tsx` — keep |
| Billing — due soon | `#d97706` (amber) | new — currently billing "due soon" incorrectly shares red/pink with hard failures; separate it |
| Billing — overdue | `#dc2626` | |
| Streak / gamification accent | `#f59e0b` (amber-500, "flame") | new — keep gamification visually distinct from status/alert colors so a badge is never mistaken for a warning |

**Rule:** pink is the *brand* color (navigation, primary actions, identity) — it must not also mean
"warning." The current codebase conflates them (StatusChip "critical" = pink tint). When touching that
component for the new portals, migrate "critical/attention" semantics to red/amber per the table above and
reserve pink for brand chrome + primary CTAs. Flag this as a follow-up cleanup in the existing admin views
rather than a blocking rewrite.

### Typography

Keep the existing pairing — it already reads as friendly-but-credible, which is the right register for a
system parents rely on for their child's attendance and grades:

- **Heading:** Nunito (`--font-heading`)
- **Body/UI:** DM Sans (`--font-sans`)

Do not introduce Baloo 2 / Comic Neue or any comic-style display font — that reads as a kids'-game app,
which undersells the "this is a serious record of my child's progress" trust signal parents need. Warmth
comes from the mascots, rounded corners, and color — not from a novelty typeface.

### Spacing / Density (role-dependent — see page overrides)

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | 4px | icon gaps |
| `--space-sm` | 8px | inline spacing |
| `--space-md` | 16px | standard padding |
| `--space-lg` | 24px | section padding |
| `--space-xl` | 32px | page-level gaps |

Admin/Teacher stays **dense** (existing `.compact-admin` pattern, 8-16px scale). Student/Parent portals
use **standard/spacious** (16-32px) — these are occasional-use, glanceable surfaces, not all-day
workspaces; cramming them to admin density actively hurts the "friendly" goal.

### Shadows & Radius

Keep existing scale — already appropriate, no need to reinvent:

- Card radius: `24px` (`rounded-[24px]`, sections) / `12-14px` (`rounded-2xl`, nested cards) / `9-12px` (`rounded-xl`, inputs/buttons/chips)
- Shadow: `shadow-sm` (`0 1px 2px rgba(0,0,0,0.05)`) on cards; avoid heavier shadows — current system is flat/calm, not skeuomorphic.

### Style Direction

**Base style:** Flat Design + Accessible & Ethical (per LMS/education pattern), **not** Claymorphism.
Claymorphism (thick borders, double shadows, toy-like bounce) is a mismatch here — Mirai teaches real
programming skills to kids 6–17 and the parent audience spans non-technical guardians who need to trust
the record-keeping. The existing flat/rounded/pink-accent language already sits in the right place;
lean into it rather than adding chunky 3D chrome.

**Where playfulness lives:** the 4 existing mascots (Eggy, Gordo, Carrie, Peppa), rounded corners,
brand-pink accents, and the (intentionally small) streak/badge system — not in typography or shadow
weight. Mascots are illustration accents (empty states, streak milestones, onboarding), never navigation
chrome or buttons.

### Motion

Standard, subtle — 150-300ms ease transitions on hover/press, a short scale/opacity pop (not a bounce)
when a streak or badge is earned. Respect `prefers-reduced-motion`. No scroll-triggered choreography;
this is a utility app opened to check a fact, not a marketing site.

---

## Information Architecture — Three Portals, One Login

```
Login (role-aware) ──┬── Admin/Teacher   (existing, iterate only)
                      ├── Student Portal (new)
                      └── Parent Portal  (new)
```

### Student Portal — top-level nav
1. **Home** — today/this-week's schedule, streak status, latest teacher remark
2. **My Schedule** — calendar (reuse FullCalendar), upcoming/past classes
3. **My Homework** — assigned / submitted / overdue, per class
4. **My Progress** — grades/performance radar (reuse `PerformanceRadarChart`), teacher remarks history
5. **Profile** — program level, badges earned, mascot collection (light gamification, see below)

### Parent Portal — top-level nav (read-only)
1. **Home** — one card per child (if multiple), each summarizing status-at-a-glance
2. **Attendance** — calendar/list of past+upcoming classes, hours remaining, absences
3. **Homework & Grades** — per child, per class: submitted/overdue, teacher scores + remarks
4. **Billing** — account fee / Mirai Club / lesson package expiry dates (read-only; no payment flow yet)
5. **Announcements** *(optional, phase 2)* — school-wide notices

### Admin/Teacher Portal — unchanged for now
Keep the current dense CRUD workspace (Students, Classes, Teachers, Activity Log). The only addition
this round: whatever data model changes are needed to power Student/Parent read views (e.g. per-student
homework records, if not already present) — a data/API concern, not a visual redesign.

---

## Gamification — deliberately minimal (v1)

Per project decision: no points economy, no shop, no leaderboard. Just enough to make consistency feel
good, without turning the record-keeping tool into a competitive game (avoids peer-comparison anxiety for
kids and keeps the parent view calm/trustworthy).

- **Attendance streak:** small flame/counter ("4-week streak") on Student Home, driven by consecutive
  attended classes. Amber accent (`#f59e0b`), never brand pink (so it never reads as a nav/brand element).
- **Homework badges:** a simple earned/unearned badge per milestone (e.g. "5 homeworks submitted on
  time"), illustrated using the existing mascots — e.g. Eggy hatching stages as a visual metaphor for
  progress, without needing new artwork immediately (reuse the 4 mascots as milestone stand-ins before
  commissioning more).
- **No leaderboard, no comparison between students** — visible only to the student and their own parent.
- Parent portal shows streaks/badges as a small read-only strip on the child's Home card — context for
  the parent, not a separate feature to manage.

Treat this as v1 scope. If the school wants a fuller system later (redeemable points, class-wide
leaderboards), that's a separate design pass — don't over-build the mascot/badge data model now for
mechanics that don't exist yet.

---

## Component Specs (extends existing components — see `src/components/`)

### Status chips — extend `StatusChip.tsx`
Current component only supports `critical` (pink tint) / `healthy` (emerald). Student/Parent views need
more tones without breaking existing admin usage:

```ts
tone: 'critical' | 'healthy' | 'warning' | 'info' | 'neutral'
// critical → red (dc2626/fee2e2), not pink — reserve pink for brand/nav
// warning  → amber (d97706/fef3c7) — "due soon", "excused absence"
// info     → sky (0284c7/e0f2fe) — "homework assigned"
// healthy  → emerald (existing, unchanged)
// neutral  → slate (existing muted, unchanged)
```

### Cards
Reuse existing `rounded-[24px] border border-slate-200 bg-white shadow-sm` section shell and
`bg-[#f8fafc]` header bar pattern — already correct, apply as-is to Student/Parent sections.

### Buttons
Reuse existing brand pink primary button (`bg-[#fc0c97]` / hover `#de0a84`) for primary actions.
Parent/Student portals are mostly read-only, so most surfaces need **no buttons at all** — resist adding
CTAs where there's no action (a common CRM instinct that doesn't fit a read-only child-progress view).

### Empty / zero states
Use mascots here specifically — e.g. "No homework due — Peppa's taking a break too" on an empty
homework list. This is the highest-leverage, lowest-cost place to use the mascot art for warmth without
touching data-dense admin screens.

---

## Anti-Patterns (do NOT introduce)

- ❌ Claymorphism / thick borders / toy bounce — undermines trust for a real record-keeping tool
- ❌ Comic-style display fonts (Baloo 2, Comic Neue, etc.)
- ❌ Reusing brand pink for "warning/attention" states in new work (legacy StatusChip usage is grandfathered, migrate opportunistically)
- ❌ Leaderboards / student-vs-student comparison anywhere
- ❌ Emojis as icons — Phosphor Icons only (already the project's icon set)
- ❌ Admin-density spacing (8-16px) applied to Student/Parent portals — they need more breathing room
- ❌ Buttons/CTAs on Parent read-only views with no underlying action
- ❌ Dark mode (not requested; skip for now — light mode only, matches current app)

## Pre-Delivery Checklist

- [ ] Reuses existing brand tokens (`#fc0c97` family, DM Sans/Nunito) — no new brand color introduced
- [ ] Pink reserved for brand/nav/primary-action; red/amber/sky used for status per the semantic table
- [ ] Phosphor Icons only, `cursor-pointer` on all clickable elements
- [ ] Hover/press transitions 150-300ms, `prefers-reduced-motion` respected
- [ ] Text contrast 4.5:1 minimum; focus states visible for keyboard nav
- [ ] Responsive: 375px / 768px / 1024px / 1440px, no horizontal scroll
- [ ] Student/Parent spacing scale is standard (16-32px), not admin-compact
- [ ] No leaderboard / no points shop introduced beyond the agreed streak+badge v1 scope
- [ ] Parent portal has zero write/payment actions in v1
