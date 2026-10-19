import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { deepEveryRounds, useWhatsAppUnread } from './useWhatsAppUnread'
import type { ChatwootClient } from '../lib/chatwootClient'
import type { ChatwootConversation } from '../lib/whatsappInbox'

vi.mock('../lib/inboxAlerts', () => ({ isSoundOn: () => false, playAlertSound: vi.fn(), showDesktopAlert: vi.fn() }))

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

  it('reads all the pages less often the more there are', () => {
    expect(deepEveryRounds(2)).toBe(3)
    expect(deepEveryRounds(4)).toBe(3)
    expect(deepEveryRounds(23)).toBe(8)
    expect(deepEveryRounds(36)).toBe(12)
  })
})
