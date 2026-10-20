import { average, median, type DayRow, type ReplierKey } from '../../supabase/functions/team-replies/logic'
import type { ChannelDayRow } from './teamReplyDaysApi'
import type { ChannelKind } from './inboxChannels'
import { AUTOMATION_LABEL, PHONE_LABEL, type StaffRef } from './staffReplyStats'

// Team Replies split by channel: every Chatwoot inbox (a WhatsApp number, a Messenger Page, an Instagram
// account) on its own, and which channels each person answered. Channel numbers add the days of the period
// together (a chat that writes on two days counts on both); a person's chats are counted once.

export type ChannelInfo = { inboxId: number; name: string; kind: ChannelKind }

export type ChannelDay = {
  day: string
  incomingMessages: number
  incomingChats: number
  repliedChats: number
  doneChats: number
  firstAverageSeconds: number | null
}

export type ChannelSummary = ChannelInfo & {
  incomingMessages: number
  // Chats with a parent's message, per day, added up.
  incomingChats: number
  // Of those, answered after the parent's last message of the day, the same day.
  repliedChats: number
  // Chats marked Done, per day, added up.
  doneChats: number
  // Each chat's first answer of the day to a waiting parent.
  firstAnswers: number
  firstAverageSeconds: number | null
  firstMedianSeconds: number | null
  // Every message we sent, and every answer to a waiting parent.
  replies: number
  answers: number
  averageSeconds: number | null
  medianSeconds: number | null
  days: ChannelDay[]
}

export type StaffChannelLine = {
  inboxId: number
  channel: string
  kind: ChannelKind
  replies: number
  chats: number
  done: number
  answers: number
  averageSeconds: number | null
  medianSeconds: number | null
}

export type StaffChannels = {
  key: ReplierKey
  staffId: number | null
  name: string
  total: Omit<StaffChannelLine, 'inboxId' | 'channel' | 'kind'> & { channels: number }
  lines: StaffChannelLine[]
}

export type ChannelReport = {
  // null: the channel numbers cannot be read (not in the database yet, or this person sees only their rows).
  channels: ChannelSummary[] | null
  staff: StaffChannels[]
}

export const UNKNOWN_CHANNEL = 'Channel not known'

// What Chatwoot calls each kind of inbox.
export function kindOfChannelType(channelType: string | null | undefined): ChannelKind {
  switch (channelType) {
    case 'Channel::Api':
    case 'Channel::Whatsapp':
      return 'whatsapp'
    case 'Channel::FacebookPage':
      return 'messenger'
    case 'Channel::Instagram':
      return 'instagram'
    default:
      return 'other'
  }
}

// The school's own name for a channel (My Team > channels) first, then Chatwoot's, then its number.
export function channelNames(
  saved: Array<{ inboxId: number; label: string; kind: ChannelKind }>,
  chatwoot: Array<{ id: number; name: string; channelType: string }>,
): Map<number, ChannelInfo> {
  const names = new Map<number, ChannelInfo>()
  for (const inbox of chatwoot) {
    names.set(inbox.id, { inboxId: inbox.id, name: inbox.name || `Inbox ${inbox.id}`, kind: kindOfChannelType(inbox.channelType) })
  }
  for (const channel of saved) {
    names.set(channel.inboxId, { inboxId: channel.inboxId, name: channel.label, kind: channel.kind })
  }
  return names
}

export function channelInfo(names: Map<number, ChannelInfo>, inboxId: number): ChannelInfo {
  if (inboxId === 0) {
    return { inboxId, name: UNKNOWN_CHANNEL, kind: 'other' }
  }
  return names.get(inboxId) ?? { inboxId, name: `Inbox ${inboxId}`, kind: 'other' }
}

const inboxOf = (row: DayRow) => row.inboxId ?? 0

export function buildChannelReport({
  channelRows,
  dayRows,
  names,
  staff,
  inboxFilter = null,
  staffFilter = null,
}: {
  channelRows: ChannelDayRow[] | null
  dayRows: DayRow[]
  names: Map<number, ChannelInfo>
  staff: StaffRef[]
  inboxFilter?: number | null
  staffFilter?: ReplierKey | null
}): ChannelReport {
  const rows = dayRows.filter((row) => inboxFilter === null || inboxOf(row) === inboxFilter)

  let channels: ChannelSummary[] | null = null
  if (channelRows) {
    const ids = new Set<number>()
    for (const row of channelRows) ids.add(row.inboxId)
    for (const row of dayRows) ids.add(inboxOf(row))
    channels = [...ids]
      .filter((id) => inboxFilter === null || id === inboxFilter)
      .map((inboxId) => {
        const mine = channelRows.filter((row) => row.inboxId === inboxId).sort((a, b) => a.day.localeCompare(b.day))
        const firstWaits = mine.flatMap((row) => row.firstWaits)
        const waits = rows.filter((row) => inboxOf(row) === inboxId).flatMap((row) => row.waits)
        return {
          ...channelInfo(names, inboxId),
          incomingMessages: mine.reduce((sum, row) => sum + row.incomingMessages, 0),
          incomingChats: mine.reduce((sum, row) => sum + row.incomingChatIds.length, 0),
          repliedChats: mine.reduce((sum, row) => sum + row.repliedChatIds.length, 0),
          doneChats: mine.reduce((sum, row) => sum + row.doneChatIds.length, 0),
          firstAnswers: firstWaits.length,
          firstAverageSeconds: average(firstWaits),
          firstMedianSeconds: median(firstWaits),
          replies: rows.filter((row) => inboxOf(row) === inboxId).reduce((sum, row) => sum + row.replies, 0),
          answers: waits.length,
          averageSeconds: average(waits),
          medianSeconds: median(waits),
          days: mine.map((row) => ({
            day: row.day,
            incomingMessages: row.incomingMessages,
            incomingChats: row.incomingChatIds.length,
            repliedChats: row.repliedChatIds.length,
            doneChats: row.doneChatIds.length,
            firstAverageSeconds: average(row.firstWaits),
          })),
        }
      })
      .sort((a, b) => b.incomingMessages - a.incomingMessages || b.replies - a.replies || a.name.localeCompare(b.name))
  }

  // Each person's work per channel.
  type Work = { staffId: number | null; replies: number; chats: Set<number>; done: Set<number>; waits: number[] }
  const byPerson = new Map<ReplierKey, Map<number, Work>>()
  for (const row of rows) {
    if (staffFilter !== null && row.replier !== staffFilter) {
      continue
    }
    const person = byPerson.get(row.replier) ?? new Map<number, Work>()
    byPerson.set(row.replier, person)
    const work = person.get(inboxOf(row)) ?? { staffId: row.staffId, replies: 0, chats: new Set(), done: new Set(), waits: [] }
    person.set(inboxOf(row), work)
    work.replies += row.replies
    row.chatIds.forEach((id) => work.chats.add(id))
    ;(row.doneChatIds ?? []).forEach((id) => work.done.add(id))
    work.waits.push(...row.waits)
  }

  const nameOf = new Map(staff.map((member) => [member.id, member.name]))
  const people: StaffChannels[] = [...byPerson.entries()].map(([key, person]) => {
    const staffId = key.startsWith('staff:') ? Number(key.slice(6)) : null
    const lines = [...person.entries()]
      .map(([inboxId, work]) => {
        const info = channelInfo(names, inboxId)
        return {
          inboxId,
          channel: info.name,
          kind: info.kind,
          replies: work.replies,
          chats: work.chats.size,
          done: work.done.size,
          answers: work.waits.length,
          averageSeconds: average(work.waits),
          medianSeconds: median(work.waits),
        }
      })
      .sort((a, b) => b.replies - a.replies || b.done - a.done || a.channel.localeCompare(b.channel))
    const allWaits = [...person.values()].flatMap((work) => work.waits)
    const chats = new Set([...person.values()].flatMap((work) => [...work.chats]))
    const done = new Set([...person.values()].flatMap((work) => [...work.done]))
    return {
      key,
      staffId,
      name:
        key === 'automation'
          ? AUTOMATION_LABEL
          : key === 'phone'
            ? PHONE_LABEL
            : (nameOf.get(staffId ?? -1) ?? `Staff #${staffId}`),
      total: {
        channels: lines.filter((line) => line.replies > 0 || line.done > 0).length,
        replies: lines.reduce((sum, line) => sum + line.replies, 0),
        chats: chats.size,
        done: done.size,
        answers: allWaits.length,
        averageSeconds: average(allWaits),
        medianSeconds: median(allWaits),
      },
      lines,
    }
  })
  // People first (most replies first), then the automation and the phone.
  const rank = (entry: StaffChannels) => (entry.key === 'automation' ? 1 : entry.key === 'phone' ? 2 : 0)
  people.sort((a, b) => rank(a) - rank(b) || b.total.replies - a.total.replies || a.name.localeCompare(b.name))

  return { channels, staff: people }
}
