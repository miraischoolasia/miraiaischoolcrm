import { describe, expect, it } from 'vitest'
import {
  addDays,
  dailyTrend,
  dayBounds,
  dayOf,
  daysBetween,
  mergeDayRows,
  replierOf,
  summarizeDays,
  type DayRow,
  type ReplyMessage,
} from '../../supabase/functions/team-replies/logic'

// 2026-10-19 00:00 in Kuala Lumpur is 2026-10-18 16:00 UTC.
const OCT19 = Date.parse('2026-10-18T16:00:00Z') / 1000

let nextId = 1
const parent = (at: number): ReplyMessage => ({ id: nextId++, message_type: 0, created_at: at })
const ours = (at: number, sender: number | null): ReplyMessage => ({
  id: nextId++,
  message_type: 1,
  created_at: at,
  content_attributes: sender === null ? null : { crm_sender: { id: sender } },
})

function row(day: string, replier: DayRow['replier'], waits: number[], chatIds: number[] = [1]): DayRow {
  return {
    day,
    replier,
    staffId: replier.startsWith('staff:') ? Number(replier.slice(6)) : null,
    replies: waits.length,
    chatIds,
    waits,
    withinTarget: waits.filter((wait) => wait <= 1800).length,
    slowest: waits.length ? Math.max(...waits) : null,
  }
}

describe('Malaysian days', () => {
  it('cuts the day at midnight Kuala Lumpur time, not UTC', () => {
    expect(dayOf(OCT19 - 1)).toBe('2026-10-18')
    expect(dayOf(OCT19)).toBe('2026-10-19')
    expect(dayOf(OCT19 + 86_399)).toBe('2026-10-19')
    expect(dayOf(OCT19 + 86_400)).toBe('2026-10-20')
    expect(dayBounds('2026-10-19')).toEqual({ from: OCT19, to: OCT19 + 86_400 })
  })

  it('walks days across a month end', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(daysBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    expect(daysBetween('2026-11-02', '2026-11-01')).toEqual([])
  })
})

describe('summarizeDays', () => {
  it('gives a wait that crosses midnight to the day of the reply', () => {
    const rows = summarizeDays(
      [{ id: 7, messages: [parent(OCT19 - 600), ours(OCT19 + 600, 1)] }],
      OCT19 - 86_400,
      OCT19 + 86_400,
    )
    expect(rows).toEqual([
      { day: '2026-10-19', replier: 'staff:1', staffId: 1, replies: 1, chatIds: [7], waits: [1200], withinTarget: 1, slowest: 1200 },
    ])
  })

  it('reads earlier messages for the wait but only counts replies inside the period', () => {
    const rows = summarizeDays(
      [{ id: 7, messages: [parent(OCT19 - 3600), ours(OCT19 - 60, 1), parent(OCT19 + 100), ours(OCT19 + 200, 2)] }],
      OCT19,
      OCT19 + 86_400,
    )
    expect(rows.map((entry) => [entry.replier, entry.waits])).toEqual([['staff:2', [100]]])
  })

  it('keeps the automatic sender apart from the phone', () => {
    expect(replierOf(ours(0, 0)).replier).toBe('automation')
    expect(replierOf(ours(0, null)).replier).toBe('phone')
    expect(replierOf({ ...ours(0, null), content_attributes: { crm_sender: { id: '4' } } }).replier).toBe('staff:4')

    const rows = summarizeDays(
      [{ id: 7, messages: [parent(OCT19 + 10), ours(OCT19 + 20, 0), ours(OCT19 + 30, null)] }],
      OCT19,
      OCT19 + 86_400,
    )
    expect(rows.map((entry) => [entry.replier, entry.replies, entry.waits])).toEqual([
      ['automation', 1, [10]],
      ['phone', 1, []],
    ])
  })

  it('splits one period into a row per day and person', () => {
    const rows = summarizeDays(
      [{ id: 7, messages: [parent(OCT19 + 10), ours(OCT19 + 70, 1), parent(OCT19 + 86_400 + 10), ours(OCT19 + 86_400 + 4000, 1)] }],
      OCT19,
      OCT19 + 2 * 86_400,
    )
    expect(rows.map((entry) => [entry.day, entry.waits, entry.withinTarget])).toEqual([
      ['2026-10-19', [60], 1],
      ['2026-10-20', [3990], 0],
    ])
  })
})

describe('mergeDayRows', () => {
  it('takes the middle of every wait of the period, not the middle of the daily middles', () => {
    // Day 1 middle is 60, day 2 middle is 1000: averaging those says 530; the real middle of all 4 waits is 80.
    const merged = mergeDayRows([row('2026-10-19', 'staff:1', [50, 60, 70]), row('2026-10-20', 'staff:1', [1000], [2])])
    const mei = merged.repliers[0]
    expect(mei.medianSeconds).toBe(65)
    expect(mei.averageSeconds).toBe(295)
    expect([mei.replies, mei.answers, mei.withinTarget, mei.slowestSeconds]).toEqual([4, 4, 4, 1000])
  })

  it('counts a chat answered on several days, or by several people, once in the total', () => {
    const merged = mergeDayRows([
      row('2026-10-19', 'staff:1', [10], [5]),
      row('2026-10-20', 'staff:1', [20], [5]),
      row('2026-10-20', 'staff:2', [30], [5, 6]),
    ])
    expect(merged.repliers.find((entry) => entry.replier === 'staff:1')!.chats).toBe(1)
    expect(merged.totals).toEqual({ replies: 3, chats: 2, answers: 3, medianSeconds: 20, withinTarget: 3 })
  })
})

describe('dailyTrend', () => {
  it('has a point for every day, an empty one included', () => {
    expect(
      dailyTrend([row('2026-10-19', 'staff:1', [10, 30]), row('2026-10-19', 'phone', [50])], ['2026-10-19', '2026-10-20']),
    ).toEqual([
      { day: '2026-10-19', replies: 3, answers: 3, medianSeconds: 30 },
      { day: '2026-10-20', replies: 0, answers: 0, medianSeconds: null },
    ])
  })
})
