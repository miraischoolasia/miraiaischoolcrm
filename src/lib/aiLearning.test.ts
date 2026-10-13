import { describe, expect, it } from 'vitest'
import {
  autoCandidate,
  buildReport,
  exampleBlock,
  learnableExamples,
  openGaps,
  outcomeOf,
  percent,
  similarity,
  type DraftRow,
} from './aiLearning'

let nextId = 1
const row = (change: Partial<DraftRow> = {}): DraftRow => ({
  id: nextId++,
  createdAt: '2026-10-13T02:00:00Z',
  chatId: 1,
  draft: '妈咪，孩子几岁呢？',
  skipped: false,
  staffNote: null,
  category: 'info',
  parentText: '你们有什么课？',
  sentText: null,
  sentAt: null,
  acceptedAt: null,
  gapResolvedAt: null,
  reviewedAt: null,
  ...change,
})

describe('comparing a draft with what was sent', () => {
  it('scores identical text 1, near text high and unrelated text low', () => {
    expect(similarity('妈咪，孩子几岁呢？', '妈咪，孩子几岁呢？')).toBe(1)
    expect(similarity('妈咪， 孩子几岁呢？', '妈咪，孩子几岁呢？')).toBe(1)
    expect(similarity('妈咪，孩子几岁呢？😊', '妈咪，孩子几岁呢？')).toBeGreaterThan(0.8)
    expect(similarity('妈咪，孩子几岁呢？', 'Sure, RM38 for the sign-up offer')).toBeLessThan(0.2)
    expect(similarity('a', 'b')).toBe(0)
  })

  it('tells used as written, changed, replaced and not answered apart', () => {
    expect(outcomeOf(row({ sentText: '妈咪，孩子几岁呢？' }))).toBe('as-is')
    expect(outcomeOf(row({ sentText: '妈咪，孩子几岁呢？😊 平时有玩电脑吗？' }))).toBe('edited')
    expect(outcomeOf(row({ sentText: 'RM38 就可以报名了哦，周六下午 2pm' }))).toBe('replaced')
    expect(outcomeOf(row())).toBe('unused')
    expect(outcomeOf(row({ skipped: true, draft: null, sentText: 'Hi' }))).toBe('unused')
  })
})

describe('the report', () => {
  const rows = [
    row({ sentText: '妈咪，孩子几岁呢？' }),
    row({ sentText: '妈咪，孩子几岁呢？' }),
    row({ sentText: '妈咪，孩子几岁呢？😊 平时有玩电脑吗？', category: 'schedule' }),
    row({ sentText: 'RM38 就可以报名了哦，周六下午 2pm', category: 'price' }),
    row(),
    row({ skipped: true, draft: null }),
  ]

  it('counts drafts, answered ones and how they were answered, per kind of question', () => {
    const report = buildReport(rows)
    expect(report).toMatchObject({ drafts: 5, answered: 4, asIs: 2, edited: 1, replaced: 1 })
    expect(report.byCategory.map((entry) => [entry.category, entry.total, entry.asIs])).toEqual([
      ['info', 2, 2],
      ['schedule', 1, 0],
      ['price', 1, 0],
    ])
  })

  it('only offers a kind of question for automatic replies with enough good drafts, never price or refund', () => {
    const entry = { category: 'info' as const, total: 30, asIs: 28, edited: 1, replaced: 1 }
    expect(autoCandidate(entry)).toBe(true)
    expect(autoCandidate({ ...entry, total: 29 })).toBe(false)
    expect(autoCandidate({ ...entry, asIs: 20 })).toBe(false)
    expect(autoCandidate({ ...entry, category: 'price' })).toBe(false)
    expect(autoCandidate({ ...entry, category: 'refund' })).toBe(false)
  })

  it('writes a share as a percentage, or a dash with nothing to share', () => {
    expect(percent(1, 4)).toBe('25%')
    expect(percent(0, 0)).toBe('-')
  })
})

describe('reminders about missing information', () => {
  it('groups the same sentence, most often first, and skips the ones already dealt with', () => {
    const gaps = openGaps([
      row({ staffNote: '缺少付款方式', parentText: '怎么付款？', createdAt: '2026-10-13T01:00:00Z' }),
      row({ staffNote: '缺少付款方式', parentText: '可以转账吗', createdAt: '2026-10-13T03:00:00Z' }),
      row({ staffNote: '缺少退款政策', parentText: '可以退款吗' }),
      row({ staffNote: '缺少地址', gapResolvedAt: '2026-10-13T04:00:00Z' }),
      row({ staffNote: '   ' }),
    ])
    expect(gaps.map((gap) => [gap.note, gap.count, gap.example])).toEqual([
      ['缺少付款方式', 2, '怎么付款？'],
      ['缺少退款政策', 1, '可以退款吗'],
    ])
    expect(gaps[0].lastAt).toBe('2026-10-13T03:00:00Z')
  })
})

describe('replies to learn from', () => {
  it('lists only changed or replaced replies nobody looked at yet', () => {
    const examples = learnableExamples([
      row({ sentText: '妈咪，孩子几岁呢？' }),
      row({ sentText: '妈咪，孩子几岁呢？😊 平时有玩电脑吗？' }),
      row({ sentText: 'RM38 就可以报名了哦，周六下午 2pm', reviewedAt: '2026-10-13T05:00:00Z' }),
      row({ sentText: 'RM38 就可以报名了哦，周六下午 2pm' }),
      row(),
    ])
    expect(examples.map((example) => example.outcome)).toEqual(['edited', 'replaced'])
  })

  it('turns an example into lines for a note, with or without the parent message', () => {
    expect(exampleBlock({ parentText: '多少钱？', sentText: 'RM38 哦' })).toBe(
      '例子（家长问 → 我们回）：\n家长：多少钱？\n我们：RM38 哦',
    )
    expect(exampleBlock({ parentText: null, sentText: 'RM38 哦' })).toBe('例子（家长问 → 我们回）：\n我们：RM38 哦')
  })
})
