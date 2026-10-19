import { mergeDayRows, TARGET_SECONDS, type DayRow, type ReplierKey } from '../../supabase/functions/team-replies/logic'

// How well each staff member answers the chats. The counting rules live in the team-replies function's
// logic (shared with the server, which keeps one row per day); this adds the names and what is true right
// now (open chats, parents waiting), which is never kept.

export { TARGET_SECONDS }

export type StaffRef = { id: number; name: string }

// An open or closed chat as it is right now.
export type LiveChat = {
  id: number
  status: string
  // Seconds since epoch of the parent's unanswered message, 0 when answered.
  waitingSince: number
  // Who the team gave the chat to (crm_owner_id), if anybody.
  ownerId: number | null
}

export type StaffReplyRow = {
  // 'staff:<id>', 'automation' (the automatic sender), 'phone' (typed on the phone) or 'nobody' (waiting, no owner).
  key: ReplierKey | 'nobody'
  staffId: number | null
  name: string
  // Messages sent in the period.
  replies: number
  // Different chats answered in the period.
  chats: number
  // First answers to a waiting parent, and how long they took.
  answers: number
  medianSeconds: number | null
  averageSeconds: number | null
  // Of those answers, how many came within TARGET_SECONDS.
  withinTarget: number
  slowestSeconds: number | null
  // Open chats given to this person where the parent is waiting right now (null when not read).
  waitingNow: number | null
  // Open chats given to this person (null when not read).
  ownedOpen: number | null
}

export type StaffReplyReport = {
  rows: StaffReplyRow[]
  // The whole team together.
  totals: { replies: number; chats: number; answers: number; medianSeconds: number | null; withinTarget: number }
  // What is waiting right now; null when the open chats were not read.
  waiting: { total: number; overTarget: number; longestSeconds: number | null } | null
}

export const PHONE_LABEL = 'Sent from the phone'
export const AUTOMATION_LABEL = 'Automation'

// Adds days together (kept ones, or today's worked out on the spot) and lays the live state over them.
export function buildTeamRepliesReport({
  dayRows,
  staff,
  live,
  nowSeconds,
}: {
  dayRows: DayRow[]
  staff: StaffRef[]
  live: LiveChat[] | null
  nowSeconds: number
}): StaffReplyReport {
  const merged = mergeDayRows(dayRows)
  const work = new Map(merged.repliers.map((entry) => [entry.replier, entry]))

  // Open chats, given to whom, and where the parent is waiting right now.
  const owned = new Map<number | null, { open: number; waiting: number }>()
  let waiting: StaffReplyReport['waiting'] = null
  if (live) {
    waiting = { total: 0, overTarget: 0, longestSeconds: null }
    for (const chat of live) {
      if (chat.status === 'resolved') {
        continue
      }
      const entry = owned.get(chat.ownerId) ?? { open: 0, waiting: 0 }
      entry.open += 1
      if (chat.waitingSince > 0) {
        entry.waiting += 1
        waiting.total += 1
        const waited = Math.max(0, nowSeconds - chat.waitingSince)
        if (waited >= TARGET_SECONDS) {
          waiting.overTarget += 1
        }
        waiting.longestSeconds = waiting.longestSeconds === null ? waited : Math.max(waiting.longestSeconds, waited)
      }
      owned.set(chat.ownerId, entry)
    }
  }

  function rowFor(key: StaffReplyRow['key'], staffId: number | null, name: string): StaffReplyRow {
    const done = key === 'nobody' ? undefined : work.get(key)
    const own = live ? (owned.get(staffId) ?? { open: 0, waiting: 0 }) : null
    return {
      key,
      staffId,
      name,
      replies: done?.replies ?? 0,
      chats: done?.chats ?? 0,
      answers: done?.answers ?? 0,
      medianSeconds: done?.medianSeconds ?? null,
      averageSeconds: done?.averageSeconds ?? null,
      withinTarget: done?.withinTarget ?? 0,
      slowestSeconds: done?.slowestSeconds ?? null,
      waitingNow: own ? own.waiting : null,
      ownedOpen: own ? own.open : null,
    }
  }

  const known = new Set(staff.map((member) => member.id))
  const rows: StaffReplyRow[] = []
  for (const member of staff) {
    const row = rowFor(`staff:${member.id}`, member.id, member.name)
    if (row.replies > 0 || (row.ownedOpen ?? 0) > 0) {
      rows.push(row)
    }
  }
  // Somebody who sent from the CRM but is no longer in the team list: keep the work visible.
  for (const entry of merged.repliers) {
    if (entry.staffId !== null && !known.has(entry.staffId)) {
      rows.push(rowFor(entry.replier, entry.staffId, `Staff #${entry.staffId}`))
    }
  }
  rows.sort((a, b) => b.replies - a.replies || (b.ownedOpen ?? 0) - (a.ownedOpen ?? 0) || a.name.localeCompare(b.name))

  for (const [key, name] of [
    ['automation', AUTOMATION_LABEL],
    ['phone', PHONE_LABEL],
  ] as const) {
    const row = rowFor(key, null, name)
    if (row.replies > 0) {
      // The automatic sender and the phone own no chats.
      rows.push({ ...row, waitingNow: null, ownedOpen: null })
    }
  }
  const nobody = owned.get(null)
  if (nobody && nobody.waiting > 0) {
    rows.push({ ...rowFor('nobody', null, 'Nobody owns these'), waitingNow: nobody.waiting, ownedOpen: nobody.open })
  }

  return { rows, totals: merged.totals, waiting }
}

// "45 s", "12 min", "3 h 20 min", "2 d".
export function formatDuration(seconds: number | null) {
  if (seconds === null) {
    return '—'
  }
  if (seconds < 60) {
    return `${Math.max(0, Math.round(seconds))} s`
  }
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) {
    return `${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rest = minutes % 60
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
  }
  return `${Math.floor(hours / 24)} d`
}
