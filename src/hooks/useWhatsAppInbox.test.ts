import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatwootClient } from '../lib/chatwootClient'
import type { ChatwootConversation, ChatwootMessage } from '../lib/whatsappInbox'
import { useWhatsAppInbox } from './useWhatsAppInbox'

const staff = { id: 1, name: 'Admin' }

function chat(id: number, senderId: number, activity: number): ChatwootConversation {
  return {
    id,
    status: 'open',
    unread_count: 0,
    waiting_since: 0,
    timestamp: activity,
    last_activity_at: activity,
    meta: { sender: { id: senderId, name: 'Parent', phone_number: '+60123456789', identifier: null } },
    last_non_activity_message: null,
  }
}

function message(id: number, at: number, text: string): ChatwootMessage {
  return { id, content: text, message_type: 0, created_at: at, private: false, status: 'sent' }
}

// A parent with a new chat (20) and an older one (10) that Chatwoot has merged into one contact (5).
function mergedParent() {
  const messages: Record<number, ChatwootMessage[]> = {
    20: [message(500, 1000, 'new one'), message(501, 1001, 'new two')],
    10: [message(100, 10, 'old one'), message(101, 11, 'old two'), message(102, 12, 'old three')],
  }
  return {
    listConversations: vi.fn(async (status: string) => ({
      conversations: status === 'open' ? [chat(20, 5, 1001), chat(10, 5, 12), chat(30, 6, 500)] : [],
      totalCount: status === 'open' ? 3 : 0,
    })),
    listMessages: vi.fn(async (id: number) => messages[id] ?? []),
    listContactConversations: vi.fn(async (contactId: number) =>
      contactId === 5
        ? [
            { id: 10, status: 'open', inbox_id: 1 },
            { id: 20, status: 'open', inbox_id: 1 },
          ]
        : [{ id: 30, status: 'open', inbox_id: 1 }],
    ),
    markSeen: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatwootClient
}

describe('useWhatsAppInbox with a parent who has two chats', () => {
  it('lists one chat for the parent, the newest', async () => {
    const client = mergedParent()
    const { result } = renderHook(() => useWhatsAppInbox(client, staff))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.conversations.map((entry) => entry.id).sort()).toEqual([20, 30])
  })

  it('reads on into the older chat after the newest, in time order', async () => {
    const client = mergedParent()
    const { result } = renderHook(() => useWhatsAppInbox(client, staff))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => result.current.setSelectedId(20))
    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    // The chat itself is short, but the parent has an older chat to read.
    await waitFor(() => expect(result.current.hasOlder).toBe(true))

    await act(async () => {
      await result.current.loadOlder()
    })
    expect(result.current.messages.map((entry) => entry.content)).toEqual([
      'old one',
      'old two',
      'old three',
      'new one',
      'new two',
    ])
    expect(result.current.hasOlder).toBe(false)
  })

  it('has nothing older for a parent with a single chat', async () => {
    const client = mergedParent()
    const { result } = renderHook(() => useWhatsAppInbox(client, staff))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => result.current.setSelectedId(30))
    await waitFor(() => expect(result.current.selected?.id).toBe(30))
    await act(async () => {
      await Promise.resolve()
    })
    expect(result.current.hasOlder).toBe(false)
  })
})

describe('useWhatsAppInbox while another page is showing', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the open chat and stops refreshing and marking it read until it is back', async () => {
    const client = mergedParent()
    const { result, rerender } = renderHook(({ active }) => useWhatsAppInbox(client, staff, active), {
      initialProps: { active: true },
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    act(() => result.current.setSelectedId(20))
    await waitFor(() => expect(result.current.messages).toHaveLength(2))

    rerender({ active: false })
    const calls = (client.listMessages as ReturnType<typeof vi.fn>).mock.calls.length
    vi.useFakeTimers()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    // Nothing was fetched while hidden, and the chat is still the open one.
    expect((client.listMessages as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls)
    expect(result.current.selectedId).toBe(20)
    expect(result.current.messages).toHaveLength(2)
  })
})
