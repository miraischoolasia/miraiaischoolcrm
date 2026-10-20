import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { claimChatwootCheck, deepEveryRounds, readPages, useWhatsAppUnread } from './useWhatsAppUnread'
import type { ChatwootClient } from '../lib/chatwootClient'
import type { ChatwootConversation } from '../lib/whatsappInbox'
import type { InboxCopyLive } from './useInboxCopyLive'

vi.mock('../lib/inboxAlerts', () => ({ isSoundOn: () => false, playAlertSound: vi.fn(), showDesktopAlert: vi.fn() }))
const fetchCopyOpenChats = vi.fn()
const fillCopy = vi.fn(async () => undefined)
vi.mock('../lib/inboxCopyReader', () => ({
  fetchCopyOpenChats: () => fetchCopyOpenChats(),
  fillCopy: (...args: unknown[]) => fillCopy(...(args as [])),
}))

// Like EduHero on 2026-10-19: 892 open chats (36 pages), most of them Instagram and Messenger, most unread.
function chat(id: number): ChatwootConversation {
  const kind = id % 4 === 0 ? 'whatsapp' : id % 4 === 1 ? 'FB' : 'IG'
  return {
    id, inbox_id: 4, status: 'open', unread_count: id % 10 === 0 ? 0 : 1, waiting_since: 0, timestamp: 1, last_activity_at: 10_000 - id,
    meta: {
      channel: 'Channel::Api',
      sender:
        kind === 'whatsapp'
          ? { id: 50_000 + id, name: `P${id}`, phone_number: null, identifier: null }
          : { id: 50_000 + id, name: `P${id}`, phone_number: null, identifier: `ghl:${id}`, additional_attributes: { ghl_channel: kind } },
    },
  } as ChatwootConversation
}

describe('useWhatsAppUnread', () => {
  it('counts the unread chats of every page, not only the first 100', async () => {
    const all = Array.from({ length: 892 }, (_, index) => chat(index + 1))
    const listConversations = vi.fn(async (_status: string, page: number) => ({
      conversations: all.slice((page - 1) * 25, page * 25),
      totalCount: all.length,
    }))
    const client = { listConversations } as unknown as ChatwootClient

    const { result } = renderHook(() => useWhatsAppUnread(client, null))

    const expected = all.filter((entry) => entry.unread_count > 0)
    await waitFor(() => expect(result.current.unread).toBe(expected.length))
    expect(result.current.openChats).toHaveLength(892)
    expect(result.current.unreadByCategory.whatsapp + result.current.unreadByCategory.messenger + result.current.unreadByCategory.instagram).toBe(
      expected.length,
    )
    // Every page read.
    expect(new Set(listConversations.mock.calls.map((call) => call[1])).size).toBe(36)
  })

  it('reads the open chats from the copy, not from Chatwoot, and follows its changes (2026-10-20)', async () => {
    const all = Array.from({ length: 892 }, (_, index) => chat(index + 1))
    fetchCopyOpenChats.mockResolvedValue(all)
    const listConversations = vi.fn(async () => ({ conversations: [], totalCount: 0 }))
    const client = { listConversations } as unknown as ChatwootClient
    let listener: ((conversation: ChatwootConversation) => void) | null = null
    const copy: InboxCopyLive = {
      available: true,
      live: true,
      subscribeChats: (next) => {
        listener = next
        return () => {
          listener = null
        }
      },
      watchMessages: () => () => undefined,
    }

    const { result } = renderHook(() => useWhatsAppUnread(client, null, undefined, copy))

    const expected = all.filter((entry) => entry.unread_count > 0).length
    await waitFor(() => expect(result.current.unread).toBe(expected))
    expect(result.current.openChats).toHaveLength(892)
    // Not one page of Chatwoot's list is read for it.
    expect(listConversations).not.toHaveBeenCalled()

    // A chat read in the CRM (the copy is told) and a chat marked Done arrive by themselves.
    act(() => listener!({ ...all[0], unread_count: 0 }))
    act(() => listener!({ ...all[1], status: 'resolved' }))
    await waitFor(() => expect(result.current.unread).toBe(expected - 2))
    expect(result.current.openChats).toHaveLength(891)
  })

  it('keeps the pages that came when one page of a busy Chatwoot does not (EduHero, 2026-10-20)', async () => {
    const all = Array.from({ length: 892 }, (_, index) => chat(index + 1))
    const listConversations = vi.fn(async (_status: string, page: number) => {
      if (page === 7) {
        throw new Error('timeout')
      }
      return { conversations: all.slice((page - 1) * 25, page * 25), totalCount: all.length }
    })
    const read = await readPages({ listConversations } as unknown as ChatwootClient, 36, () => false)
    expect(read.complete).toBe(false)
    // Pages 2..36 but page 7: 34 pages.
    expect(read.found).toHaveLength(892 - 25 - 25)
  })

  it('lets one tab of the browser look at Chatwoot a minute', () => {
    window.localStorage.removeItem('crm-chatwoot-open-check')
    expect(claimChatwootCheck(1_000_000)).toBe(true)
    expect(claimChatwootCheck(1_010_000)).toBe(false)
    expect(claimChatwootCheck(1_060_000)).toBe(true)
  })

  it('reads all the pages less often the more there are', () => {
    expect(deepEveryRounds(2)).toBe(3)
    expect(deepEveryRounds(4)).toBe(3)
    expect(deepEveryRounds(23)).toBe(8)
    expect(deepEveryRounds(36)).toBe(12)
  })
})
