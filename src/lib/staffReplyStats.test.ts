import { describe, expect, it } from 'vitest'
import { buildTeamRepliesReport, formatDuration, type LiveChat } from './staffReplyStats'
import type { ChatwootMessage } from './whatsappInbox'
import { summarizeDays } from '../../supabase/functions/team-replies/logic'

type ChatForStats = LiveChat & { messages: ChatwootMessage[] }

const FROM = 1_000_000
const TO = FROM + 86_400
const NOW = FROM + 50_000

let nextId = 1
function parent(at: number): ChatwootMessage {
  return { id: nextId++, content: 'hi', message_type: 0, created_at: at, private: false, status: 'sent' }
}
function ours(at: number, staffId: number | null, extra: Partial<ChatwootMessage> = {}): ChatwootMessage {
  return {
    id: nextId++, content: 'hello', message_type: 1, created_at: at, private: false, status: 'sent',
    content_attributes: staffId === null ? null : { crm_sender: { id: staffId, name: `S${staffId}` } },
    ...extra,
  }
}
function chat(id: number, messages: ChatwootMessage[], extra: Partial<ChatForStats> = {}): ChatForStats {
  return { id, status: 'open', waitingSince: 0, ownerId: null, messages, ...extra }
}

const staff = [{ id: 1, name: 'Mei' }, { id: 2, name: 'Jun' }]
const report = (chats: ChatForStats[]) =>
  buildTeamRepliesReport({ dayRows: summarizeDays(chats, FROM, TO), staff, live: chats, nowSeconds: NOW })

describe('buildTeamRepliesReport', () => {
  it('times the first answer to a waiting parent and credits the person who sent it', () => {
    const result = report([
      chat(10, [parent(FROM + 100), ours(FROM + 400, 1)]),
      chat(11, [parent(FROM + 1000), ours(FROM + 1000 + 3600, 2)]),
    ])

    const mei = result.rows.find((row) => row.staffId === 1)!
    const jun = result.rows.find((row) => row.staffId === 2)!
    expect([mei.replies, mei.chats, mei.answers, mei.medianSeconds, mei.withinTarget]).toEqual([1, 1, 1, 300, 1])
    expect([jun.replies, jun.answers, jun.medianSeconds, jun.withinTarget]).toEqual([1, 1, 3600, 0])
    expect(result.totals).toMatchObject({ replies: 2, chats: 2, answers: 2, withinTarget: 1 })
  })

  it('counts a second message sent without the parent writing again as a reply, not a new wait', () => {
    const result = report([
      chat(10, [parent(FROM + 100), ours(FROM + 200, 1), ours(FROM + 5000, 2), parent(FROM + 6000), ours(FROM + 6600, 2)]),
    ])

    const mei = result.rows.find((row) => row.staffId === 1)!
    const jun = result.rows.find((row) => row.staffId === 2)!
    expect([mei.replies, mei.answers, mei.medianSeconds]).toEqual([1, 1, 100])
    expect([jun.replies, jun.answers, jun.medianSeconds]).toEqual([2, 1, 600])
    // The parent's wait runs from their FIRST unanswered message.
  })

  it('measures from the first unanswered message of a run', () => {
    const result = report([chat(10, [parent(FROM + 100), parent(FROM + 300), ours(FROM + 700, 1)])])

    expect(result.rows[0].medianSeconds).toBe(600)
  })

  it('does not count messages outside the period, private notes, deleted ones or activity lines', () => {
    const result = report([
      chat(10, [
        parent(FROM - 500),
        ours(FROM - 100, 1),
        parent(FROM + 10),
        ours(FROM + 20, 1, { private: true }),
        ours(FROM + 30, 1, { content_attributes: { crm_sender: { id: 1 }, deleted: true } }),
        { ...ours(FROM + 40, 1), message_type: 2 },
        ours(TO + 5, 1),
      ]),
    ])

    expect(result.totals.replies).toBe(0)
    expect(result.rows).toEqual([])
  })

  it('keeps messages sent from the phone apart, and a sender who left the team visible', () => {
    const result = report([
      chat(10, [parent(FROM + 10), ours(FROM + 100, null)]),
      chat(11, [parent(FROM + 10), ours(FROM + 100, 99)]),
    ])

    expect(result.rows.map((row) => [row.key, row.name, row.replies])).toEqual([
      ['staff:99', 'Staff #99', 1],
      ['phone', 'Sent from the phone', 1],
    ])
  })

  it('shows who owns the open chats where a parent is waiting, and who nobody owns', () => {
    const result = report([
      chat(10, [parent(FROM + 100)], { waitingSince: FROM + 100, ownerId: 1 }),
      chat(11, [parent(FROM + 200)], { waitingSince: NOW - 60, ownerId: null }),
      chat(12, [ours(FROM + 300, 2)], { ownerId: 2 }),
      chat(13, [parent(FROM + 400)], { waitingSince: FROM + 400, ownerId: 1, status: 'resolved' }),
    ])

    const mei = result.rows.find((row) => row.staffId === 1)!
    expect([mei.ownedOpen, mei.waitingNow]).toEqual([1, 1])
    expect(result.rows.find((row) => row.key === 'nobody')).toMatchObject({ waitingNow: 1 })
    expect(result.waiting).toEqual({ total: 2, overTarget: 1, longestSeconds: NOW - (FROM + 100) })
  })

  it('takes the middle answer as the median', () => {
    const result = report([
      chat(1, [parent(FROM + 0), ours(FROM + 60, 1)]),
      chat(2, [parent(FROM + 0), ours(FROM + 120, 1)]),
      chat(3, [parent(FROM + 0), ours(FROM + 7200, 1)]),
    ])

    expect(result.rows[0].medianSeconds).toBe(120)
    expect(result.rows[0].averageSeconds).toBe(2460)
    expect(result.rows[0].slowestSeconds).toBe(7200)
  })
})

describe('formatDuration', () => {
  it('writes seconds, minutes, hours and days', () => {
    expect([null, 45, 720, 12_000, 7200, 200_000].map(formatDuration)).toEqual([
      '—',
      '45 s',
      '12 min',
      '3 h 20 min',
      '2 h',
      '2 d',
    ])
  })
})
