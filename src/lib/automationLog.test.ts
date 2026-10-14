import { describe, expect, it } from 'vitest'
import {
  buildEnrollments,
  buildTimeline,
  parseDedupeKey,
  personLabel,
  timeAgo,
  type FlowActivity,
  type FlowLogRow,
  type FlowQueueRow,
} from './automationLog'

const NOW = Date.parse('2026-10-14T03:00:00Z')

const queueRow = (change: Partial<FlowQueueRow> = {}): FlowQueueRow => ({
  id: 1,
  eventKey: 'lead:7',
  nodeId: 'm1',
  phone: '60123456789',
  parentName: 'Mrs Lim',
  childName: 'Ethan',
  message: 'Hi Ethan',
  status: 'pending',
  dueAt: '2026-10-14T03:30:00Z',
  expiresAt: '2026-10-15T03:30:00Z',
  createdAt: '2026-10-14T02:30:00Z',
  decidedAt: null,
  sentAt: null,
  error: null,
  autoBlocked: null,
  sentByAutomation: false,
  ...change,
})

const logRow = (change: Partial<FlowLogRow> = {}): FlowLogRow => ({
  id: 1,
  eventKey: 'lead:9',
  nodeId: 'c1',
  kind: 'condition_no',
  detail: 'The lead did not come in with a source keyword',
  phone: '60111111111',
  parentName: null,
  childName: null,
  createdAt: '2026-10-14T02:40:00Z',
  ...change,
})

const activity = (queue: FlowQueueRow[] = [], log: FlowLogRow[] = []): FlowActivity => ({ queue, log })

describe('reading a queue key', () => {
  it('splits the block and the event', () => {
    expect(parseDedupeKey('flow:5:m1:class:10:11:2026-10-13')).toEqual({
      nodeId: 'm1',
      eventKey: 'class:10:11:2026-10-13',
    })
  })

  it('keeps a key it does not know as the event', () => {
    expect(parseDedupeKey('test:1')).toEqual({ nodeId: '', eventKey: 'test:1' })
  })
})

describe('naming the person', () => {
  it('prefers child and parent, then the phone', () => {
    expect(personLabel({ childName: 'Ethan', parentName: 'Mrs Lim', phone: '6012' })).toBe('Ethan (Mrs Lim)')
    expect(personLabel({ childName: null, parentName: null, phone: '6012' })).toBe('6012')
    expect(personLabel({ childName: ' ', parentName: null, phone: null })).toBe('Unknown')
  })
})

describe('the execution log', () => {
  it('tells a message that was sent by itself', () => {
    const entries = buildTimeline(
      activity([queueRow({ status: 'sent', sentAt: '2026-10-14T02:50:00Z', sentByAutomation: true })]),
      NOW,
    )
    expect(entries.map((entry) => entry.title)).toEqual(['Sent by itself', 'Message queued'])
    expect(entries[0].tone).toBe('ok')
  })

  it('tells a message a person approved', () => {
    const entries = buildTimeline(activity([queueRow({ status: 'sent', sentAt: '2026-10-14T02:50:00Z' })]), NOW)
    expect(entries[0].title).toBe('Sent after a person approved it')
  })

  it('gives the reason a message failed', () => {
    const entries = buildTimeline(
      activity([queueRow({ status: 'failed', decidedAt: '2026-10-14T02:55:00Z', error: 'Number is not on WhatsApp' })]),
      NOW,
    )
    expect(entries[0]).toMatchObject({ title: 'Failed to send', detail: 'Number is not on WhatsApp', tone: 'error' })
  })

  it('says why the sender left a message for a person', () => {
    const entries = buildTimeline(activity([queueRow({ autoBlocked: 'Has not written to us first.' })]), NOW)
    expect(entries.some((entry) => entry.detail === 'Has not written to us first.')).toBe(true)
  })

  it('shows a waiting message that is past its expiry as expired', () => {
    const entries = buildTimeline(activity([queueRow({ status: 'pending', expiresAt: '2026-10-14T02:00:00Z' })]), NOW)
    const expired = entries.find((entry) => entry.title === 'Expired before it was sent')
    expect(expired?.group).toBe('problem')
  })

  it('adds the people the runner left alone, with the reason', () => {
    const entries = buildTimeline(activity([], [logRow()]), NOW)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      title: 'Not sent: did not match a condition',
      detail: 'The lead did not come in with a source keyword',
      group: 'skipped',
    })
  })

  it('lists the newest first', () => {
    const entries = buildTimeline(
      activity([queueRow({ createdAt: '2026-10-14T01:00:00Z' })], [logRow({ createdAt: '2026-10-14T02:40:00Z' })]),
      NOW,
    )
    expect(entries[0].key).toBe('log-1')
  })
})

describe('the enrollment history', () => {
  it('puts the steps of one person together and reports where they got to', () => {
    const rows = buildEnrollments(
      activity([
        queueRow({ id: 1, status: 'sent', sentAt: '2026-10-14T02:50:00Z', sentByAutomation: true }),
        queueRow({ id: 2, eventKey: 'lead:8', childName: 'Mia', status: 'pending' }),
      ]),
      NOW,
    )
    expect(rows).toHaveLength(2)
    const ethan = rows.find((row) => row.eventKey === 'lead:7')
    expect(ethan).toMatchObject({ status: 'sent', label: 'Sent', person: 'Ethan (Mrs Lim)' })
    expect(ethan?.steps.map((step) => step.title)).toEqual(['Message queued', 'Sent by itself'])
    const mia = rows.find((row) => row.eventKey === 'lead:8')
    expect(mia).toMatchObject({ status: 'waiting' })
    expect(mia?.reason).toMatch(/^Message due /)
  })

  it('marks a person who was left alone and keeps the reason', () => {
    const [row] = buildEnrollments(
      activity([], [logRow({ kind: 'stage_stopped', detail: 'Lead stage is "lost".' })]),
      NOW,
    )
    expect(row).toMatchObject({ status: 'not_sent', reason: 'Lead stage is "lost".' })
  })

  it('shows a failure above everything else', () => {
    const [row] = buildEnrollments(
      activity([
        queueRow({ id: 1, status: 'sent', sentAt: '2026-10-14T02:50:00Z' }),
        queueRow({ id: 2, nodeId: 'm2', status: 'failed', error: 'Gateway timeout' }),
      ]),
      NOW,
    )
    expect(row).toMatchObject({ status: 'problem', reason: 'Gateway timeout', messages: 2 })
  })

  it('shows a message a person skipped as skipped', () => {
    const [row] = buildEnrollments(activity([queueRow({ status: 'skipped', decidedAt: '2026-10-14T02:55:00Z' })]), NOW)
    expect(row.status).toBe('skipped')
  })

  it('has nobody when nothing happened', () => {
    expect(buildEnrollments(activity(), NOW)).toEqual([])
  })
})

describe('time since the runner looked', () => {
  it('reads in minutes, hours and days', () => {
    expect(timeAgo(null, NOW)).toBe('never')
    expect(timeAgo('2026-10-14T03:00:00Z', NOW)).toBe('just now')
    expect(timeAgo('2026-10-14T02:45:00Z', NOW)).toBe('15 min ago')
    expect(timeAgo('2026-10-14T00:00:00Z', NOW)).toBe('3 h ago')
    expect(timeAgo('2026-10-11T03:00:00Z', NOW)).toBe('3 d ago')
  })
})
