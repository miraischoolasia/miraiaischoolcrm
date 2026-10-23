import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetCopyOpenChats, useCopyOpenChats } from './useCopyOpenChats'
import type { ChatwootConversation } from '../lib/whatsappInbox'
import type { InboxCopyLive } from './useInboxCopyLive'

const fetchCopyOpenChats = vi.fn()
const fetchCopyChatsChangedSince = vi.fn()
vi.mock('../lib/inboxCopyReader', () => ({
  fetchCopyOpenChats: () => fetchCopyOpenChats(),
  fetchCopyChatsChangedSince: (since: string) => fetchCopyChatsChangedSince(since),
}))

const chat = (id: number, status = 'open', activity = 100 - id) =>
  ({ id, status, unread_count: 0, waiting_since: 0, timestamp: activity, last_activity_at: activity, meta: { sender: { id } } }) as ChatwootConversation
const copy: InboxCopyLive = { available: true, live: true, subscribeChats: () => () => undefined, watchMessages: () => () => undefined }

afterEach(() => {
  resetCopyOpenChats()
  fetchCopyOpenChats.mockReset()
  fetchCopyChatsChangedSince.mockReset()
})

describe('useCopyOpenChats (2026-10-23)', () => {
  it('reads nothing until an Inbox page is opened', () => {
    renderHook(() => useCopyOpenChats(copy, false))
    expect(fetchCopyOpenChats).not.toHaveBeenCalled()
  })

  it('reads every open chat once, then catches up with what changed after a while away', async () => {
    fetchCopyOpenChats.mockResolvedValue([chat(1), chat(2)])
    fetchCopyChatsChangedSince.mockResolvedValue({ changed: [chat(3, 'open', 200), chat(2, 'resolved')], complete: true })
    const now = vi.spyOn(Date, 'now')
    now.mockReturnValue(1_000_000)
    const { result, rerender } = renderHook(({ active }) => useCopyOpenChats(copy, active), { initialProps: { active: true } })
    await waitFor(() => expect(result.current.map((entry) => entry.id)).toEqual([1, 2]))

    rerender({ active: false })
    now.mockReturnValue(1_060_000)
    rerender({ active: true })
    await waitFor(() => expect(result.current.map((entry) => entry.id)).toEqual([3, 1]))
    expect(fetchCopyOpenChats).toHaveBeenCalledTimes(1)
    expect(fetchCopyChatsChangedSince).toHaveBeenCalledTimes(1)
    now.mockRestore()
  })

  it('shares one read between the Inbox and the Student Inbox', async () => {
    fetchCopyOpenChats.mockResolvedValue([chat(1)])
    const first = renderHook(() => useCopyOpenChats(copy, true))
    const second = renderHook(() => useCopyOpenChats(copy, true))
    await waitFor(() => expect(first.result.current).toHaveLength(1))
    await waitFor(() => expect(second.result.current).toHaveLength(1))
    expect(fetchCopyOpenChats).toHaveBeenCalledTimes(1)
  })
})
