import { describe, expect, it } from 'vitest'
import {
  canSend,
  isBeingSent,
  isExpired,
  isStuck,
  needsApproval,
  roomLeft,
  startOfDay,
  willSendByItself,
  type QueueItem,
} from './automationQueue'

const NOW = Date.parse('2026-10-14T10:00:00+08:00')

const item = (change: Partial<QueueItem> = {}): QueueItem => ({
  id: 1,
  ruleKey: 'trial_reminder',
  ruleName: 'Trial reminder',
  phone: '60123456789',
  parentName: 'Mrs Lim',
  childName: 'Ethan',
  leadId: null,
  studentId: null,
  message: 'Hi',
  status: 'pending',
  dueAt: '2026-10-14T09:00:00+08:00',
  expiresAt: null,
  decidedAt: null,
  sentAt: null,
  error: null,
  createdAt: '2026-10-13T09:00:00+08:00',
  autoBlocked: null,
  mediaUrl: null,
  ...change,
})

describe('what can still be sent', () => {
  it('lets a waiting message and a failed one be sent', () => {
    expect(canSend(item(), NOW)).toBe(true)
    expect(canSend(item({ status: 'failed', error: 'timeout' }), NOW)).toBe(true)
  })

  it('does not let a message be sent after its time has passed', () => {
    const late = item({ expiresAt: '2026-10-14T08:00:00+08:00' })
    expect(isExpired(late, NOW)).toBe(true)
    expect(canSend(late, NOW)).toBe(false)
  })

  it('treats a message another window is sending as busy, and an old one as stuck', () => {
    const fresh = item({ status: 'sending', decidedAt: new Date(NOW - 60_000).toISOString() })
    const old = item({ status: 'sending', decidedAt: new Date(NOW - 11 * 60_000).toISOString() })
    expect(isBeingSent(fresh, NOW)).toBe(true)
    expect(canSend(fresh, NOW)).toBe(false)
    expect(isStuck(old, NOW)).toBe(true)
    expect(canSend(old, NOW)).toBe(true)
  })
})

describe('the daily limit', () => {
  it('counts what is left and never goes below zero', () => {
    const settings = { paused: false, dailyCap: 40, gapSeconds: 30 }
    expect(roomLeft(settings, 12)).toBe(28)
    expect(roomLeft(settings, 40)).toBe(0)
    expect(roomLeft(settings, 55)).toBe(0)
  })

  it('starts the day at midnight on this computer', () => {
    const start = new Date(startOfDay(NOW))
    expect(start.getHours()).toBe(0)
    expect(start.getMinutes()).toBe(0)
    expect(NOW - start.getTime()).toBeLessThan(24 * 60 * 60 * 1000)
  })
})

describe('what a person has to approve', () => {
  const auto = new Set(['flow_1'])

  it('leaves the waiting messages of a flow that sends by itself to the sender', () => {
    const waiting = item({ ruleKey: 'flow_1' })
    expect(willSendByItself(waiting, auto, NOW)).toBe(true)
    expect(needsApproval(waiting, auto, NOW)).toBe(false)
  })

  it('still needs a person for a flow that does not send by itself, a test and a handed-back one', () => {
    expect(needsApproval(item({ ruleKey: 'flow_2' }), auto, NOW)).toBe(true)
    expect(needsApproval(item({ ruleKey: 'flow_test_1' }), auto, NOW)).toBe(true)
    expect(needsApproval(item({ ruleKey: 'flow_1', autoBlocked: 'Never wrote first.' }), auto, NOW)).toBe(true)
    expect(needsApproval(item({ ruleKey: 'flow_1', status: 'failed', error: 'x' }), auto, NOW)).toBe(true)
  })
})
