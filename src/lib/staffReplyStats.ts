import type { ChatwootMessage } from './whatsappInbox'

// How well each staff member answers the WhatsApp chats, worked out from the messages themselves:
// a message sent from the CRM carries who sent it (content_attributes.crm_sender), so "who answered
// this parent, and how fast" is in Chatwoot already. Kept apart from the screen so the rules are tested.

// A parent who has waited longer than this is late; the same 30 minutes the inbox warns about.
export const TARGET_SECONDS = 30 * 60

export type StaffRef = { id: number; name: string }

// One chat with its messages (oldest first or not; they are sorted here).
export type ChatForStats = {
  id: number
  status: string
  // Seconds since epoch of the parent's unanswered message, 0 when answered.
  waitingSince: number
  // Who the team gave the chat to (crm_owner_id), if anybody.
  ownerId: number | null
  messages: ChatwootMessage[]
}

export type StaffReplyRow = {
  // 'staff:<id>', 'other' (sent from the phone or by something else) or 'nobody' (waiting, no owner).
  key: string
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
  // Open chats given to this person where the parent is waiting right now.
  waitingNow: number
  // Open chats given to this person.
  ownedOpen: number
}

export type StaffReplyReport = {
  rows: StaffReplyRow[]
  // The whole team together.
  totals: { replies: number; chats: number; answers: number; medianSeconds: number | null; withinTarget: number }
  waiting: { total: number; overTarget: number; longestSeconds: number | null }
}

function senderOf(message: ChatwootMessage): number | null {
  const id = Number(message.content_attributes?.crm_sender?.id)
  return Number.isInteger(id) && id > 0 ? id : null
}

function median(values: number[]) {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

function average(values: number[]) {
  return values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

type Tally = { replies: number; chatIds: Set<number>; waits: number[] }

function emptyTally(): Tally {
  return { replies: 0, chatIds: new Set(), waits: [] }
}

// from / to are seconds since epoch; only messages sent in [from, to) count as the period's work.
export function buildStaffReplyReport({
  chats,
  staff,
  from,
  to,
  nowSeconds,
}: {
  chats: ChatForStats[]
  staff: StaffRef[]
  from: number
  to: number
  nowSeconds: number
}): StaffReplyReport {
  // null is "no crm_sender": sent from the phone itself, or by something other than a signed-in person.
  const tallies = new Map<number | null, Tally>()
  const tallyOf = (id: number | null) => {
    let tally = tallies.get(id)
    if (!tally) {
      tally = emptyTally()
      tallies.set(id, tally)
    }
    return tally
  }
  const allWaits: number[] = []
  const allChats = new Set<number>()

  for (const chat of chats) {
    const messages = chat.messages
      .filter(
        (message) =>
          !message.private &&
          !message.content_attributes?.deleted &&
          (message.message_type === 0 || message.message_type === 1),
      )
      .sort((a, b) => a.created_at - b.created_at || a.id - b.id)

    // The first message of the parent that nobody has answered yet.
    let waitingFrom: number | null = null
    for (const message of messages) {
      if (message.message_type === 0) {
        if (waitingFrom === null) {
          waitingFrom = message.created_at
        }
        continue
      }
      const inPeriod = message.created_at >= from && message.created_at < to
      const sender = senderOf(message)
      if (inPeriod) {
        const tally = tallyOf(sender)
        tally.replies += 1
        tally.chatIds.add(chat.id)
        allChats.add(chat.id)
        if (waitingFrom !== null) {
          const wait = Math.max(0, message.created_at - waitingFrom)
          tally.waits.push(wait)
          allWaits.push(wait)
        }
      }
      waitingFrom = null
    }
  }

  // Open chats, given to whom, and where the parent is waiting right now.
  const owned = new Map<number | null, { open: number; waiting: number }>()
  let waitingTotal = 0
  let waitingOver = 0
  let longest: number | null = null
  for (const chat of chats) {
    if (chat.status === 'resolved') {
      continue
    }
    const entry = owned.get(chat.ownerId) ?? { open: 0, waiting: 0 }
    entry.open += 1
    if (chat.waitingSince > 0) {
      entry.waiting += 1
      waitingTotal += 1
      const waited = Math.max(0, nowSeconds - chat.waitingSince)
      if (waited >= TARGET_SECONDS) {
        waitingOver += 1
      }
      longest = longest === null ? waited : Math.max(longest, waited)
    }
    owned.set(chat.ownerId, entry)
  }

  function rowFor(key: string, staffId: number | null, name: string): StaffReplyRow {
    const tally = tallies.get(staffId) ?? emptyTally()
    const own = owned.get(staffId) ?? { open: 0, waiting: 0 }
    return {
      key,
      staffId,
      name,
      replies: tally.replies,
      chats: tally.chatIds.size,
      answers: tally.waits.length,
      medianSeconds: median(tally.waits),
      averageSeconds: average(tally.waits),
      withinTarget: tally.waits.filter((wait) => wait <= TARGET_SECONDS).length,
      slowestSeconds: tally.waits.length > 0 ? Math.max(...tally.waits) : null,
      waitingNow: own.waiting,
      ownedOpen: own.open,
    }
  }

  const known = new Set(staff.map((member) => member.id))
  const rows: StaffReplyRow[] = []
  for (const member of staff) {
    const row = rowFor(`staff:${member.id}`, member.id, member.name)
    if (row.replies > 0 || row.ownedOpen > 0) {
      rows.push(row)
    }
  }
  // Somebody who sent from the CRM but is no longer in the team list: keep the work visible.
  for (const id of tallies.keys()) {
    if (id !== null && !known.has(id)) {
      rows.push(rowFor(`staff:${id}`, id, `Staff #${id}`))
    }
  }
  rows.sort((a, b) => b.replies - a.replies || b.ownedOpen - a.ownedOpen || a.name.localeCompare(b.name))

  const other = rowFor('other', null, 'Sent from the phone')
  if (other.replies > 0) {
    rows.push(other)
  }
  const nobody = owned.get(null)
  if (nobody && nobody.waiting > 0) {
    rows.push({
      key: 'nobody',
      staffId: null,
      name: 'Nobody owns these',
      replies: 0,
      chats: 0,
      answers: 0,
      medianSeconds: null,
      averageSeconds: null,
      withinTarget: 0,
      slowestSeconds: null,
      waitingNow: nobody.waiting,
      ownedOpen: nobody.open,
    })
  }

  return {
    rows,
    totals: {
      replies: [...tallies.values()].reduce((sum, tally) => sum + tally.replies, 0),
      chats: allChats.size,
      answers: allWaits.length,
      medianSeconds: median(allWaits),
      withinTarget: allWaits.filter((wait) => wait <= TARGET_SECONDS).length,
    },
    waiting: { total: waitingTotal, overTarget: waitingOver, longestSeconds: longest },
  }
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
