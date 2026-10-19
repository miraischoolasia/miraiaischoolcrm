import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatwootClient } from '../lib/chatwootClient'
import type { ChatwootConversation, ChatwootMessage } from '../lib/whatsappInbox'
import type { InboxCopyLive } from './useInboxCopyLive'

// The copy's reader is replaced: these tests are about what the page does with it.
const reader = vi.hoisted(() => ({
  fetchCopyChats: vi.fn(),
  fetchCopyMessages: vi.fn(),
  fetchCopyContactChats: vi.fn(),
  fetchCopyMessagesAround: vi.fn(),
  fillCopy: vi.fn(),
}))
vi.mock('../lib/inboxCopyReader', async (original) => ({ ...(await original<object>()), ...reader }))

const { useWhatsAppInbox } = await import('./useWhatsAppInbox')

const staff = { id: 1, name: 'Admin' }

function chat(id: number, activity: number, extra: Partial<ChatwootConversation> = {}): ChatwootConversation {
  return {
    id, status: 'open', unread_count: 0, waiting_since: 0, timestamp: activity, last_activity_at: activity, inbox_id: 1,
    meta: { sender: { id: id * 10, name: `Parent ${id}`, phone_number: null, identifier: null } },
    last_non_activity_message: null, ...extra,
  }
}

function message(id: number, text: string, extra: Partial<ChatwootMessage> = {}): ChatwootMessage {
  return { id, content: text, message_type: 0, created_at: 1000 + id, private: false, status: 'sent', ...extra }
}

function client(messages: Record<number, ChatwootMessage[]> = {}) {
  return {
    listConversations: vi.fn(async (status: string) => ({
      conversations: status === 'open' ? [chat(20, 2000), chat(30, 1500)] : [],
      totalCount: status === 'open' ? 2 : 0,
    })),
    listMessages: vi.fn(async (id: number) => messages[id] ?? []),
    listContactConversations: vi.fn(async () => [{ id: 20, status: 'open', inbox_id: 1 }]),
    markSeen: vi.fn().mockResolvedValue(undefined),
    markReadOnPhone: vi.fn().mockResolvedValue(undefined),
  } as unknown as ChatwootClient & { listMessages: ReturnType<typeof vi.fn>; listConversations: ReturnType<typeof vi.fn> }
}

function link(live: boolean) {
  const messageListeners: Array<(conversationId: number, message: ChatwootMessage) => void> = []
  const chatListeners: Array<(conversation: ChatwootConversation) => void> = []
  const value: InboxCopyLive = {
    available: true,
    live,
    subscribeChats: (listener) => {
      chatListeners.push(listener)
      return () => {}
    },
    watchMessages: (_ids, listener) => {
      messageListeners.push(listener)
      return () => {}
    },
  }
  return { value, pushMessage: (id: number, m: ChatwootMessage) => messageListeners.forEach((l) => l(id, m)), pushChat: (c: ChatwootConversation) => chatListeners.forEach((l) => l(c)) }
}

beforeEach(() => {
  reader.fetchCopyChats.mockResolvedValue({ conversations: [chat(90, 100, { status: 'resolved' })], next: { at: '2026-01-01T00:00:00Z', id: 90 }, total: 40 })
  reader.fetchCopyMessages.mockResolvedValue({ messages: [], complete: true })
  reader.fetchCopyContactChats.mockResolvedValue([{ id: 20, status: 'open', inbox_id: 1 }])
  reader.fetchCopyMessagesAround.mockResolvedValue([])
  reader.fillCopy.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('useWhatsAppInbox reading the inbox copy', () => {
  it('shows the copied messages first, then Chatwoot\'s, and fills in what the copy missed', async () => {
    // Chatwoot answers slowly; the copy has one of its two messages.
    let answer: (value: ChatwootMessage[]) => void = () => {}
    const api = client()
    api.listMessages.mockImplementation(() => new Promise<ChatwootMessage[]>((resolve) => (answer = resolve)))
    reader.fetchCopyMessages.mockResolvedValue({ messages: [message(1, 'hello')], complete: true })
    const { value } = link(true)
    const copy = { link: value, everyOpen: [chat(20, 2000)] }
    const { result } = renderHook(() => useWhatsAppInbox(api, staff, true, null, undefined, undefined, copy))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => result.current.setSelectedId(20))
    await waitFor(() => expect(result.current.messages.map((m) => m.content)).toEqual(['hello']))
    expect(result.current.messagesChat).toBe(20)

    await act(async () => answer([message(1, 'hello', { status: 'read' }), message(2, 'missed by the webhook')]))
    expect(result.current.messages.map((m) => [m.content, m.status])).toEqual([['hello', 'read'], ['missed by the webhook', 'sent']])
    expect(reader.fillCopy).toHaveBeenCalledTimes(1)
  })

  it('reads Chatwoot as before when the copy does not answer', async () => {
    reader.fetchCopyMessages.mockRejectedValue(new Error('no copy'))
    const api = client({ 20: [message(1, 'hello')] })
    const copy = { link: link(true).value }
    const { result } = renderHook(() => useWhatsAppInbox(api, staff, true, null, undefined, undefined, copy))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => result.current.setSelectedId(20))
    await waitFor(() => expect(result.current.messages.map((m) => m.content)).toEqual(['hello']))
    expect(result.current.actionError).toBeNull()
  })

  it('while live, hears of a new message by itself and does not ask Chatwoot every few seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const api = client({ 20: [message(1, 'hello')] })
    const { value, pushMessage } = link(true)
    const copy = { link: value, everyOpen: [chat(20, 2000)] }
    const { result } = renderHook(() => useWhatsAppInbox(api, staff, true, null, undefined, undefined, copy))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    act(() => result.current.setSelectedId(20))
    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    const listCalls = api.listConversations.mock.calls.length
    const messageCalls = api.listMessages.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    // No list pages and no message pages asked in 15 seconds.
    expect(api.listConversations.mock.calls.length).toBe(listCalls)
    expect(api.listMessages.mock.calls.length).toBe(messageCalls)

    act(() => pushMessage(20, message(2, 'just now')))
    expect(result.current.messages.map((m) => m.content)).toEqual(['hello', 'just now'])
    // The parent's new message is read straight away, as the open chat always did.
    expect(api.markSeen).toHaveBeenCalled()
  })

  it('when not live, keeps asking Chatwoot every few seconds as before', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const api = client({ 20: [message(1, 'hello')] })
    const copy = { link: { ...link(false).value, live: false } }
    const { result } = renderHook(() => useWhatsAppInbox(api, staff, true, null, undefined, undefined, copy))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    act(() => result.current.setSelectedId(20))
    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    const messageCalls = api.listMessages.mock.calls.length

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_000)
    })
    expect(api.listMessages.mock.calls.length).toBeGreaterThan(messageCalls)
  })

  it('reads the Done list from the copy, page after page', async () => {
    const api = client()
    const copy = { link: link(true).value }
    const { result } = renderHook(() => useWhatsAppInbox(api, staff, true, null, undefined, undefined, copy))
    await waitFor(() => expect(result.current.conversations.some((c) => c.id === 90)).toBe(true))
    await waitFor(() => expect(result.current.canLoadMore.resolved).toBe(true))

    reader.fetchCopyChats.mockResolvedValueOnce({ conversations: [chat(80, 50, { status: 'resolved' })], next: null, total: null })
    await act(async () => {
      await result.current.loadMore('resolved')
    })
    expect(reader.fetchCopyChats).toHaveBeenLastCalledWith('resolved', { at: '2026-01-01T00:00:00Z', id: 90 })
    expect(result.current.conversations.some((c) => c.id === 80)).toBe(true)
    expect(result.current.canLoadMore.resolved).toBe(false)
  })

  it('takes every open chat from the menu badge, and a newer live update over an older copy', async () => {
    const api = client()
    const { value, pushChat } = link(true)
    const copy = { link: value, everyOpen: [chat(20, 2000), chat(40, 1200, { unread_count: 2 })] }
    const { result } = renderHook(() => useWhatsAppInbox(api, staff, true, null, undefined, undefined, copy))
    await waitFor(() => expect(result.current.conversations.some((c) => c.id === 40)).toBe(true))
    expect(result.current.canLoadMore.open).toBe(false)

    act(() => pushChat(chat(40, 1300, { unread_count: 3 })))
    expect(result.current.conversations.find((c) => c.id === 40)?.unread_count).toBe(3)
    // An older report does not undo it.
    act(() => pushChat(chat(40, 1250, { unread_count: 1 })))
    expect(result.current.conversations.find((c) => c.id === 40)?.unread_count).toBe(3)
  })

  it('opens a chat on a message found by search', async () => {
    const api = client({ 20: [message(50, 'newest')] })
    reader.fetchCopyMessagesAround.mockResolvedValue([message(5, 'the one found'), message(6, 'after it')])
    const copy = { link: link(true).value }
    const { result } = renderHook(() => useWhatsAppInbox(api, staff, true, null, undefined, undefined, copy))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    act(() => result.current.openAt(20, 5))
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual([5, 6, 50]))
    expect(result.current.focusMessageId).toBe(5)
    expect(result.current.hasOlder).toBe(true)
  })
})

describe('useWhatsAppInbox reading ahead', () => {
  it('reads ahead the newest messages of the chats at the top, and opens one of them at once', async () => {
    const reader = await import('../lib/inboxCopyReader')
    const readAhead = vi.spyOn(reader, 'fetchRecentMessages').mockResolvedValue(new Map([[20, [message(7, 'read ahead')]]]))
    // Chatwoot never answers: what shows is what was read ahead.
    const api = client()
    api.listMessages.mockImplementation(() => new Promise(() => {}))
    const copy = { link: link(true).value, everyOpen: [chat(20, 2000), chat(30, 1500)] }
    const { result } = renderHook(() => useWhatsAppInbox(api, staff, true, null, undefined, undefined, copy))
    await waitFor(() => expect(readAhead).toHaveBeenCalled())
    expect(readAhead.mock.calls[0][0]).toEqual(expect.arrayContaining([20, 30]))
    await act(async () => {
      await Promise.resolve()
    })

    act(() => result.current.setSelectedId(20))
    // Shown in the same moment, with no request answered.
    expect(result.current.messages.map((m) => m.content)).toEqual(['read ahead'])
    expect(result.current.messagesChat).toBe(20)
  })
})
