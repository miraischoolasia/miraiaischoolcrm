// How the team answers the chats, cut into school days so a day can be worked out once, kept, and added
// to other days later. Used by the team-replies function (keeps each day) and by the Team replies page
// (today, live, and adding kept days together). No Deno or browser APIs here, so both can import it.
//
// Rules (same as the old Today card):
// - A reply is a message we sent (message_type 1) that is not a private note and not deleted.
// - A parent's wait runs from their FIRST message nobody has answered yet to the next message we send;
//   that wait belongs to the person who sent that message, on the day it was sent.
// - A message sent from the CRM carries who sent it (content_attributes.crm_sender.id); the server's
//   automatic sender writes id 0 ("Automation"); a message with no sender was typed on the phone.

// A parent who has waited longer than this is late; the same 30 minutes the inbox warns about.
export const TARGET_SECONDS = 30 * 60

// School days are cut at midnight Malaysia time (UTC+8, no summer time).
export const DAY_OFFSET_SECONDS = 8 * 3600
const DAY_SECONDS = 86_400

export type ReplyMessage = {
  id: number
  // 0 from the parent, 1 from us, 2 activity line, 3 template.
  message_type: number
  created_at: number
  private?: boolean | null
  content_attributes?: {
    crm_sender?: { id?: number | string | null } | null
    deleted?: boolean | null
  } | null
}

export type ReplyChat = { id: number; messages: ReplyMessage[] }

// 'staff:<id>' for a person, 'automation' for the automatic sender, 'phone' for no sender.
export type ReplierKey = `staff:${number}` | 'automation' | 'phone'

// One person's (or the phone's, or the automation's) work on one day. waits keeps every single wait so
// the middle of 7 or 30 days can be found exactly: the middle of daily middles is not the same thing.
export type DayRow = {
  day: string
  replier: ReplierKey
  staffId: number | null
  replies: number
  chatIds: number[]
  waits: number[]
  withinTarget: number
  slowest: number | null
}

// "2026-10-19" for the Malaysian day a moment (seconds since epoch) falls on.
export function dayOf(seconds: number) {
  return new Date((seconds + DAY_OFFSET_SECONDS) * 1000).toISOString().slice(0, 10)
}

// Seconds since epoch where a Malaysian day starts and where the next one starts.
export function dayBounds(day: string) {
  const midnightUtc = Date.parse(`${day}T00:00:00Z`) / 1000
  if (!Number.isFinite(midnightUtc)) {
    throw new Error(`Not a day: ${day}`)
  }
  const from = midnightUtc - DAY_OFFSET_SECONDS
  return { from, to: from + DAY_SECONDS }
}

export function addDays(day: string, count: number) {
  return dayOf(dayBounds(day).from + count * DAY_SECONDS)
}

// Every day from first to last, both included (empty when first is after last).
export function daysBetween(first: string, last: string) {
  const days: string[] = []
  for (let day = first; day <= last; day = addDays(day, 1)) {
    days.push(day)
  }
  return days
}

export function replierOf(message: ReplyMessage): { replier: ReplierKey; staffId: number | null } {
  const raw = message.content_attributes?.crm_sender?.id
  if (raw === undefined || raw === null || raw === '') {
    return { replier: 'phone', staffId: null }
  }
  const id = Number(raw)
  if (id === 0) {
    return { replier: 'automation', staffId: null }
  }
  return Number.isInteger(id) && id > 0 ? { replier: `staff:${id}`, staffId: id } : { replier: 'phone', staffId: null }
}

function counts(message: ReplyMessage) {
  return !message.private && !message.content_attributes?.deleted && (message.message_type === 0 || message.message_type === 1)
}

// The work done in [from, to), one row per day and replier. Messages before `from` are only there so the
// first reply of the period knows whether the parent was already waiting.
export function summarizeDays(chats: ReplyChat[], from: number, to: number): DayRow[] {
  const rows = new Map<string, { row: DayRow; chats: Set<number> }>()

  for (const chat of chats) {
    const messages = chat.messages.filter(counts).sort((a, b) => a.created_at - b.created_at || a.id - b.id)
    // The first message of the parent that nobody has answered yet.
    let waitingFrom: number | null = null
    for (const message of messages) {
      if (message.message_type === 0) {
        waitingFrom ??= message.created_at
        continue
      }
      if (message.created_at >= from && message.created_at < to) {
        const day = dayOf(message.created_at)
        const { replier, staffId } = replierOf(message)
        const key = `${day}|${replier}`
        let entry = rows.get(key)
        if (!entry) {
          entry = {
            row: { day, replier, staffId, replies: 0, chatIds: [], waits: [], withinTarget: 0, slowest: null },
            chats: new Set(),
          }
          rows.set(key, entry)
        }
        entry.row.replies += 1
        entry.chats.add(chat.id)
        if (waitingFrom !== null) {
          const wait = Math.max(0, message.created_at - waitingFrom)
          entry.row.waits.push(wait)
          if (wait <= TARGET_SECONDS) {
            entry.row.withinTarget += 1
          }
          entry.row.slowest = entry.row.slowest === null ? wait : Math.max(entry.row.slowest, wait)
        }
      }
      waitingFrom = null
    }
  }

  return [...rows.values()]
    .map(({ row, chats: ids }) => ({ ...row, chatIds: [...ids].sort((a, b) => a - b) }))
    .sort((a, b) => a.day.localeCompare(b.day) || a.replier.localeCompare(b.replier))
}

export function median(values: number[]) {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

export function average(values: number[]) {
  return values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

export type MergedReplier = {
  replier: ReplierKey
  staffId: number | null
  replies: number
  // Different chats, counted once even when answered on several days.
  chats: number
  answers: number
  medianSeconds: number | null
  averageSeconds: number | null
  withinTarget: number
  slowestSeconds: number | null
}

export type MergedDays = {
  repliers: MergedReplier[]
  totals: { replies: number; chats: number; answers: number; medianSeconds: number | null; withinTarget: number }
}

// Adds kept days together: counts are summed, chats are counted once, and the middle wait is taken from
// every single wait of the period.
export function mergeDayRows(rows: DayRow[]): MergedDays {
  const byReplier = new Map<ReplierKey, { staffId: number | null; replies: number; chats: Set<number>; waits: number[] }>()
  const allChats = new Set<number>()
  const allWaits: number[] = []
  for (const row of rows) {
    let entry = byReplier.get(row.replier)
    if (!entry) {
      entry = { staffId: row.staffId, replies: 0, chats: new Set(), waits: [] }
      byReplier.set(row.replier, entry)
    }
    entry.replies += row.replies
    for (const id of row.chatIds) {
      entry.chats.add(id)
      allChats.add(id)
    }
    entry.waits.push(...row.waits)
    allWaits.push(...row.waits)
  }
  const within = (waits: number[]) => waits.filter((wait) => wait <= TARGET_SECONDS).length
  const repliers = [...byReplier.entries()].map(([replier, entry]) => ({
    replier,
    staffId: entry.staffId,
    replies: entry.replies,
    chats: entry.chats.size,
    answers: entry.waits.length,
    medianSeconds: median(entry.waits),
    averageSeconds: average(entry.waits),
    withinTarget: within(entry.waits),
    slowestSeconds: entry.waits.length > 0 ? Math.max(...entry.waits) : null,
  }))
  return {
    repliers,
    totals: {
      replies: repliers.reduce((sum, row) => sum + row.replies, 0),
      chats: allChats.size,
      answers: allWaits.length,
      medianSeconds: median(allWaits),
      withinTarget: within(allWaits),
    },
  }
}

export type TrendPoint = { day: string; replies: number; answers: number; medianSeconds: number | null }

// One point per day of the period, an empty day included, for the small chart.
export function dailyTrend(rows: DayRow[], days: string[]): TrendPoint[] {
  const byDay = new Map<string, { replies: number; waits: number[] }>()
  for (const row of rows) {
    const entry = byDay.get(row.day) ?? { replies: 0, waits: [] }
    entry.replies += row.replies
    entry.waits.push(...row.waits)
    byDay.set(row.day, entry)
  }
  return days.map((day) => {
    const entry = byDay.get(day)
    return {
      day,
      replies: entry?.replies ?? 0,
      answers: entry?.waits.length ?? 0,
      medianSeconds: entry ? median(entry.waits) : null,
    }
  })
}
