import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { rangeStart, useStaffReplyStats } from './useStaffReplyStats'
import type { ChatwootClient } from '../lib/chatwootClient'
import type { ChatwootConversation, ChatwootMessage } from '../lib/whatsappInbox'

function conversation(id: number, lastActivity: number, extra: Partial<ChatwootConversation> = {}): ChatwootConversation {
  return {
    id, status: 'open', unread_count: 0, waiting_since: 0, timestamp: lastActivity, last_activity_at: lastActivity,
    meta: { sender: { id: id * 10, name: `P${id}`, phone_number: null, identifier: null } }, ...extra,
  }
}
function message(id: number, createdAt: number, type = 0): ChatwootMessage {
  return { id, content: 'x', message_type: type, created_at: createdAt, private: false, status: 'sent' }
}

describe('rangeStart', () => {
  it('starts at midnight today, 6 days back for a week and 29 for a month', () => {
    const now = new Date(2026, 9, 13, 15, 10)
    expect(rangeStart('today', now)).toBe(new Date(2026, 9, 13).getTime() / 1000)
    expect(rangeStart('7d', now)).toBe(new Date(2026, 9, 7).getTime() / 1000)
    expect(rangeStart('30d', now)).toBe(new Date(2026, 8, 14).getTime() / 1000)
  })
})

describe('useStaffReplyStats', () => {
  it('reads the chats active in the period and walks back through their messages', async () => {
    const from = rangeStart('today')
    const recent = from + 3600
    const listConversations = vi.fn(async (status: string, page: number) => {
      if (status === 'open' && page === 1) {
        return { conversations: [conversation(1, recent), conversation(2, from - 5000)], totalCount: 2 }
      }
      return { conversations: [], totalCount: 0 }
    })
    // The newest 2 messages first, then an older one that crosses the start of the period.
    const listMessages = vi.fn(async (_id: number, before?: number) =>
      before === undefined
        ? [message(8, recent + 10, 1), message(7, recent, 0)]
        : [message(5, from - 100, 1)],
    )
    const client = { listConversations, listMessages } as unknown as ChatwootClient

    const { result } = renderHook(() => useStaffReplyStats(client))
    await act(async () => {
      await result.current.load('today')
    })

    expect(result.current.error).toBeNull()
    expect(result.current.data?.chats.map((chat) => chat.id)).toEqual([1])
    expect(result.current.data?.chats[0].messages.map((m) => m.id).sort()).toEqual([5, 7, 8])
    expect(listMessages).toHaveBeenCalledWith(1, undefined)
    expect(listMessages).toHaveBeenCalledWith(1, 7)
  })

  it('reports a problem instead of throwing', async () => {
    const client = {
      listConversations: vi.fn(async () => {
        throw new Error('down')
      }),
    } as unknown as ChatwootClient

    const { result } = renderHook(() => useStaffReplyStats(client))
    await act(async () => {
      await result.current.load('7d')
    })

    expect(result.current.error).toMatch(/Couldn't read the WhatsApp chats/)
    expect(result.current.data).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })
})
