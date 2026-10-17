import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatwootClient } from '../lib/chatwootClient'
import type { ChatwootConversation, ChatwootMessage } from '../lib/whatsappInbox'
import { useWhatsAppInbox } from './useWhatsAppInbox'

// Sending waits for WhatsApp to take each message; here that wait is a few milliseconds, not seconds.
vi.mock('../lib/outbox', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/outbox')>()),
  CONFIRM_POLL_MS: 5,
  CONFIRM_TIMEOUT_MS: 150,
}))

const staff = { id: 1, name: 'Admin' }

const chat: ChatwootConversation = {
  id: 20,
  status: 'open',
  unread_count: 0,
  waiting_since: 0,
  timestamp: 1000,
  last_activity_at: 1000,
  custom_attributes: { crm_owner_id: 1 },
  meta: { sender: { id: 5, name: 'Parent', phone_number: '+60123456789', identifier: null } },
  last_non_activity_message: null,
}

const now = () => Math.floor(Date.now() / 1000)

// What the server shows once it has taken a message and WhatsApp has accepted it.
const accepted = (id: number, text: string): ChatwootMessage => ({
  id,
  content: text,
  message_type: 1,
  created_at: now(),
  private: false,
  status: 'sent',
  source_id: `WAID:${id}`,
  attachments: [],
})

function makeClient(overrides: Partial<Record<keyof ChatwootClient, unknown>> = {}) {
  return {
    listConversations: vi.fn(async (status: string) => ({ conversations: status === 'open' ? [chat] : [], totalCount: status === 'open' ? 1 : 0 })),
    listMessages: vi.fn(async () => [] as ChatwootMessage[]),
    listContactConversations: vi.fn(async () => [{ id: 20, status: 'open', inbox_id: 1 }]),
    markSeen: vi.fn().mockResolvedValue(undefined),
    setAttributes: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as ChatwootClient
}

async function openChat(client: ChatwootClient) {
  const hook = renderHook(() => useWhatsAppInbox(client, staff))
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
  act(() => hook.result.current.setSelectedId(20))
  await waitFor(() => expect(hook.result.current.messagesChat).toBe(20))
  return hook
}

afterEach(() => vi.restoreAllMocks())

describe('sending from the inbox', () => {
  it('keeps a message that did not go through, holds back the ones behind it, and sends them all on Try again', async () => {
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockImplementation(async (_id: number, input: { content: string }) => accepted(Math.round(Math.random() * 1e6), input.content))
    const client = makeClient({ sendMessage })
    const { result } = await openChat(client)

    await act(async () => {
      await result.current.send({ isPrivate: false, sequence: ['first', 'second'] })
    })
    await waitFor(() => expect(result.current.waitingMessages.map((m) => m.local)).toEqual(['failed', 'cancelled']))
    expect(result.current.waitingMessages.map((m) => m.content)).toEqual(['first', 'second'])
    expect(result.current.actionError).toMatch(/Try again/)

    // Both go out again, in the same order.
    const firstTempId = -result.current.waitingMessages[0].id
    sendMessage.mockImplementation(async (_id: number, input: { content: string }) => {
      const message = accepted(sendMessage.mock.calls.length + 100, input.content)
      ;(client.listMessages as ReturnType<typeof vi.fn>).mockImplementation(async () => [message])
      return message
    })
    act(() => result.current.retryUnsent(firstTempId))
    await waitFor(() => expect(result.current.waitingMessages).toHaveLength(0))
    expect(sendMessage.mock.calls.map((call) => (call[1] as { content: string }).content)).toEqual(['first', 'first', 'second'])
    expect(result.current.actionError).toBeNull()
  })

  it('does not send a message twice when the server took it but the answer got lost', async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error('timeout'))
    const client = makeClient({ sendMessage })
    // The chat already has that message (it was taken, only the answer was lost).
    ;(client.listMessages as ReturnType<typeof vi.fn>).mockImplementation(async () => [accepted(777, 'hello')])
    const { result } = await openChat(client)

    await act(async () => {
      await result.current.send({ isPrivate: false, sequence: ['hello'] })
    })
    await waitFor(() => expect(result.current.waitingMessages).toHaveLength(0))
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(result.current.actionError).toBeNull()
  })

  it('does not call a message failed, or let it be sent again, because a check on it failed once', async () => {
    const sendMessage = vi.fn(async (_id: number, input: { content: string }) => accepted(31, input.content))
    const client = makeClient({ sendMessage })
    const listMessages = client.listMessages as ReturnType<typeof vi.fn>
    // The first look at the chat fails (a blip in the connection); the next ones work.
    listMessages.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    listMessages.mockRejectedValueOnce(new Error('network'))
    listMessages.mockImplementation(async () => [accepted(31, 'one'), accepted(32, 'two')])
    sendMessage.mockImplementationOnce(async (_id, input) => accepted(31, input.content)).mockImplementationOnce(async (_id, input) => accepted(32, input.content))
    const { result } = await openChat(client)

    await act(async () => {
      await result.current.send({ isPrivate: false, sequence: ['one', 'two'] })
    })
    await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.waitingMessages).toHaveLength(0))
    expect(result.current.actionError).toBeNull()
  })

  it('lets a message still waiting be removed, and warns before the page is closed while one is unsent', async () => {
    let release: (message: ChatwootMessage) => void = () => undefined
    const sendMessage = vi.fn(() => new Promise<ChatwootMessage>((resolve) => (release = resolve)))
    const client = makeClient({ sendMessage })
    const { result } = await openChat(client)

    await act(async () => {
      await result.current.send({ isPrivate: false, sequence: ['one', 'two'] })
    })
    await waitFor(() => expect(result.current.waitingMessages.map((m) => m.local)).toEqual(['sending', 'queued']))

    const leave = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(leave)
    expect(leave.defaultPrevented).toBe(true)

    act(() => result.current.dismissUnsent(-result.current.waitingMessages[1].id))
    expect(result.current.waitingMessages.map((m) => m.content)).toEqual(['one'])

    await act(async () => {
      release(accepted(40, 'one'))
    })
  })
})

describe('loading older chats', () => {
  it('asks for one page at a time, so pressing twice does not skip a page', async () => {
    const pages: number[] = []
    const client = makeClient({
      listConversations: vi.fn(async (status: string, page = 1) => {
        if (status === 'open' && page >= 3) {
          pages.push(page)
          await new Promise((resolve) => window.setTimeout(resolve, 20))
        }
        return { conversations: status === 'open' && page === 1 ? [chat] : [], totalCount: 100 }
      }),
    })
    const { result } = await openChat(client)

    await act(async () => {
      await Promise.all([result.current.loadMore('open'), result.current.loadMore('open')])
    })
    await act(async () => {
      await result.current.loadMore('open')
    })
    expect(pages).toEqual([3, 4])
  })

  it('says so when more chats cannot be loaded', async () => {
    const client = makeClient({
      listConversations: vi.fn(async (status: string, page = 1) => {
        if (page >= 3) {
          throw new Error('down')
        }
        return { conversations: status === 'open' && page === 1 ? [chat] : [], totalCount: 100 }
      }),
    })
    const { result } = await openChat(client)

    await act(async () => {
      await result.current.loadMore('open')
    })
    expect(result.current.actionError).toBe("Couldn't load more chats. Try again in a moment.")
    expect(result.current.isLoadingMore.open).toBe(false)
  })
})
