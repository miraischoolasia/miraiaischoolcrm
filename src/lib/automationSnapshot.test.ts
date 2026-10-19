import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueueItem } from './automationQueue'

const db = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: db }))

const api = vi.hoisted(() => ({
  fetchQueue: vi.fn(),
  fetchSettings: vi.fn(),
  fetchSentToday: vi.fn(),
  fetchAutoSendRuleKeys: vi.fn(),
  fetchSendHours: vi.fn(),
}))
vi.mock('./automationQueue', async (original) => ({
  ...(await original<typeof import('./automationQueue')>()),
  ...api,
}))

import {
  fetchAutomationSnapshot,
  refreshAutomationSnapshot,
  resetAutomationSnapshotForTests,
  subscribeAutomationSnapshot,
} from './automationSnapshot'

const ROW = {
  id: 7,
  rule_key: 'flow_3',
  rule_name: 'Trial reminder',
  phone: '60123456789',
  parent_name: 'Mrs Tan',
  child_name: 'Ali',
  lead_id: 11,
  student_id: null,
  message: 'Hi',
  status: 'pending',
  due_at: '2026-10-19T01:00:00Z',
  expires_at: null,
  decided_at: null,
  sent_at: null,
  error: null,
  created_at: '2026-10-19T00:00:00Z',
  auto_blocked: null,
  media_url: null,
  conversation_id: null,
  channel: 'whatsapp',
  kind: 'message',
}

const ITEM: QueueItem = {
  id: 7,
  ruleKey: 'flow_3',
  ruleName: 'Trial reminder',
  phone: '60123456789',
  conversationId: null,
  channel: 'whatsapp',
  kind: 'message',
  parentName: 'Mrs Tan',
  childName: 'Ali',
  leadId: 11,
  studentId: null,
  message: 'Hi',
  status: 'pending',
  dueAt: '2026-10-19T01:00:00Z',
  expiresAt: null,
  decidedAt: null,
  sentAt: null,
  error: null,
  createdAt: '2026-10-19T00:00:00Z',
  autoBlocked: null,
  mediaUrl: null,
}

const SNAPSHOT_ROW = {
  queue: [ROW],
  settings: { paused: true, daily_cap: 25, gap_seconds: 45, send_from_hour: 8, send_until_hour: 22 },
  sent_today: 4,
  auto_rule_keys: ['flow_3'],
}

let hidden = false
function setHidden(value: boolean) {
  hidden = value
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('automation snapshot', () => {
  beforeEach(() => {
    resetAutomationSnapshotForTests()
    Object.values(api).forEach((mock) => mock.mockReset())
    db.rpc.mockReset()
    api.fetchQueue.mockResolvedValue([ITEM])
    api.fetchSettings.mockResolvedValue({ paused: true, dailyCap: 25, gapSeconds: 45 })
    api.fetchSentToday.mockResolvedValue(4)
    api.fetchAutoSendRuleKeys.mockResolvedValue(new Set(['flow_3']))
    api.fetchSendHours.mockResolvedValue({ from: 8, until: 22 })
    hidden = false
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('gives exactly what the five separate reads gave, in one request', async () => {
    db.rpc.mockResolvedValue({ data: SNAPSHOT_ROW, error: null })
    const one = await fetchAutomationSnapshot()

    db.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
    resetAutomationSnapshotForTests()
    const five = await fetchAutomationSnapshot()

    expect(one).toEqual(five)
    expect(db.rpc).toHaveBeenCalledTimes(2)
    expect(db.rpc.mock.calls[0][0]).toBe('automation_snapshot')
  })

  it('reads one by one, and asks for the function only once, before the migration', async () => {
    db.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
    await fetchAutomationSnapshot()
    await fetchAutomationSnapshot()
    expect(db.rpc).toHaveBeenCalledTimes(1)
    expect(api.fetchQueue).toHaveBeenCalledTimes(2)
  })

  it('uses the defaults when there is no settings row, as before', async () => {
    db.rpc.mockResolvedValue({ data: { queue: [], settings: null, sent_today: 0, auto_rule_keys: [] }, error: null })
    const snapshot = await fetchAutomationSnapshot()
    expect(snapshot.settings).toEqual({ paused: false, dailyCap: 40, gapSeconds: 30 })
    expect(snapshot.sendHours).toEqual({ from: 9, until: 21 })
  })

  it('one read for everything on the page, once a minute, paused while hidden, at once when back', async () => {
    vi.useFakeTimers()
    db.rpc.mockResolvedValue({ data: SNAPSHOT_ROW, error: null })
    const today = vi.fn()
    const lightning = vi.fn()
    const stopToday = subscribeAutomationSnapshot(today)
    const stopLightning = subscribeAutomationSnapshot(lightning)
    await vi.advanceTimersByTimeAsync(0)
    expect(db.rpc).toHaveBeenCalledTimes(1)
    expect(today).toHaveBeenCalledTimes(1)
    expect(lightning).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(db.rpc).toHaveBeenCalledTimes(2)

    setHidden(true)
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(db.rpc).toHaveBeenCalledTimes(2)

    setHidden(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(db.rpc).toHaveBeenCalledTimes(3)
    expect(lightning).toHaveBeenCalledTimes(3)

    stopToday()
    stopLightning()
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(db.rpc).toHaveBeenCalledTimes(3)
  })

  it('an older read never overwrites a newer one', async () => {
    let releaseOld: (value: unknown) => void = () => undefined
    db.rpc.mockReturnValueOnce(new Promise((resolve) => (releaseOld = resolve)))
    db.rpc.mockResolvedValueOnce({ data: { ...SNAPSHOT_ROW, sent_today: 5 }, error: null })
    const listener = vi.fn()
    const stop = subscribeAutomationSnapshot(listener)
    const fresh = await refreshAutomationSnapshot(true)
    expect(fresh.sentToday).toBe(5)
    releaseOld({ data: { ...SNAPSHOT_ROW, sent_today: 4 }, error: null })
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(listener.mock.calls.map(([result]) => result.snapshot.sentToday)).toEqual([5])
    stop()
  })
})
