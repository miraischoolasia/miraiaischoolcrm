import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QueueItem } from '../lib/automationQueue'
import { useAutomationQueue } from './useAutomationQueue'

const api = vi.hoisted(() => ({
  fetchQueue: vi.fn(),
  fetchSettings: vi.fn(),
  fetchSentToday: vi.fn(),
  saveQueueMessage: vi.fn(),
  claimQueueItem: vi.fn(),
  finishQueueItem: vi.fn(),
  skipQueueItems: vi.fn(),
  currentUserId: vi.fn(),
}))
vi.mock('../lib/automationQueue', async (original) => ({
  ...(await original<typeof import('../lib/automationQueue')>()),
  ...api,
}))

const item = (id: number, change: Partial<QueueItem> = {}): QueueItem => ({
  id,
  ruleKey: 'trial_reminder',
  ruleName: 'Trial reminder',
  phone: `6012345678${id}`,
  parentName: `Parent ${id}`,
  childName: null,
  leadId: null,
  studentId: null,
  message: `Hi ${id}`,
  status: 'pending',
  dueAt: new Date(Date.now() - 60_000).toISOString(),
  expiresAt: null,
  decidedAt: null,
  sentAt: null,
  error: null,
  createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  autoBlocked: null,
  ...change,
})

describe('useAutomationQueue approve', () => {
  const sleep = vi.fn().mockResolvedValue(undefined)

  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset())
    sleep.mockClear()
    api.fetchQueue.mockResolvedValue([item(1), item(2), item(3)])
    api.fetchSettings.mockResolvedValue({ paused: false, dailyCap: 40, gapSeconds: 30 })
    api.fetchSentToday.mockResolvedValue(0)
    api.saveQueueMessage.mockResolvedValue(true)
    api.claimQueueItem.mockResolvedValue(true)
    api.finishQueueItem.mockResolvedValue(undefined)
    api.currentUserId.mockResolvedValue('user-1')
  })

  async function ready() {
    const hook = renderHook(() => useAutomationQueue({ enabled: true, sleep }))
    await waitFor(() => expect(hook.result.current.items).toHaveLength(3))
    return hook
  }

  it('sends the messages one at a time with the pause between, and marks each sent', async () => {
    const { result } = await ready()
    const sendOne = vi.fn().mockResolvedValue(null)

    let outcome: Awaited<ReturnType<typeof result.current.approve>> | undefined
    await act(async () => {
      outcome = await result.current.approve(
        result.current.items.map((entry) => ({ item: entry, message: entry.message })),
        sendOne,
      )
    })

    expect(outcome).toEqual({ sent: 3, failure: null, taken: 0, heldBack: 0 })
    expect(sendOne.mock.calls.map((call) => call[0].id)).toEqual([1, 2, 3])
    expect(api.finishQueueItem.mock.calls.map((call) => call[1])).toEqual([{ ok: true }, { ok: true }, { ok: true }])
    // A pause of 30 seconds between messages, none after the last.
    expect(sleep.mock.calls).toEqual([[30_000], [30_000]])
  })

  it('saves an edited text before sending it', async () => {
    const { result } = await ready()
    const sendOne = vi.fn().mockResolvedValue(null)

    await act(async () => {
      await result.current.approve([{ item: result.current.items[0], message: 'Hi, new words' }], sendOne)
    })

    expect(api.saveQueueMessage).toHaveBeenCalledWith(1, 'Hi, new words')
    expect(sendOne).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), 'Hi, new words')
  })

  it('stops at the first message that fails and leaves the rest waiting', async () => {
    const { result } = await ready()
    const sendOne = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('WhatsApp is not connected.')

    let outcome: Awaited<ReturnType<typeof result.current.approve>> | undefined
    await act(async () => {
      outcome = await result.current.approve(
        result.current.items.map((entry) => ({ item: entry, message: entry.message })),
        sendOne,
      )
    })

    expect(outcome?.sent).toBe(1)
    expect(outcome?.failure).toBe('WhatsApp is not connected.')
    expect(sendOne).toHaveBeenCalledTimes(2)
    expect(api.finishQueueItem).toHaveBeenLastCalledWith(2, { ok: false, error: 'WhatsApp is not connected.' })
    expect(api.claimQueueItem).toHaveBeenCalledTimes(2)
  })

  it('never sends more than the daily limit leaves', async () => {
    api.fetchSentToday.mockResolvedValue(39)
    const { result } = await ready()
    const sendOne = vi.fn().mockResolvedValue(null)

    let outcome: Awaited<ReturnType<typeof result.current.approve>> | undefined
    await act(async () => {
      outcome = await result.current.approve(
        result.current.items.map((entry) => ({ item: entry, message: entry.message })),
        sendOne,
      )
    })

    expect(outcome).toEqual({ sent: 1, failure: null, taken: 0, heldBack: 2 })
    expect(sendOne).toHaveBeenCalledTimes(1)
  })

  it('skips a message someone else already took, without sending it', async () => {
    api.claimQueueItem.mockResolvedValueOnce(false).mockResolvedValue(true)
    const { result } = await ready()
    const sendOne = vi.fn().mockResolvedValue(null)

    let outcome: Awaited<ReturnType<typeof result.current.approve>> | undefined
    await act(async () => {
      outcome = await result.current.approve(
        result.current.items.slice(0, 2).map((entry) => ({ item: entry, message: entry.message })),
        sendOne,
      )
    })

    expect(outcome).toEqual({ sent: 1, failure: null, taken: 1, heldBack: 0 })
    expect(sendOne).toHaveBeenCalledTimes(1)
    expect(sendOne).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), 'Hi 2')
  })

  it('shows a clear message when the tables are not there yet', async () => {
    api.fetchQueue.mockRejectedValue({ message: 'relation "public.automation_queue" does not exist' })

    const { result } = renderHook(() => useAutomationQueue({ enabled: true, sleep }))

    await waitFor(() => expect(result.current.error).toBe('Automations are not set up in the database yet.'))
  })
})
