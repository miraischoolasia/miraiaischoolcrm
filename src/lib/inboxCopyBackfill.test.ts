import { describe, expect, it, vi } from 'vitest'
import { copyOldChats, workOutAllDays, type CopyProgress, type CopyStore } from './inboxCopyBackfill'
import type { ChatwootClient } from './chatwootClient'
import type { ChatwootConversation, ChatwootMessage } from './whatsappInbox'
import type { CopyMessage } from '../../supabase/functions/chat-activity/copy'

vi.mock('./supabase', () => ({ supabase: null }))

const NOW = new Date('2026-10-19T02:00:00Z')

function conversation(id: number, lastActivity: number): ChatwootConversation {
  return {
    id, inbox_id: 5, status: 'resolved', unread_count: 0, waiting_since: 0, timestamp: lastActivity, last_activity_at: lastActivity,
    meta: { sender: { id: id * 10, name: `P${id}`, phone_number: null, identifier: null } },
  }
}

// A chat's messages, ids 1..count, 20 a page newest first, as Chatwoot pages them.
function chatwoot(chats: Record<number, { lastActivity: number; count: number }>) {
  const listMessages = vi.fn(async (id: number, before?: number): Promise<ChatwootMessage[]> => {
    const all = Array.from({ length: chats[id].count }, (_, index) => id * 1000 + index + 1)
    const older = all.filter((messageId) => before === undefined || messageId < before).slice(-20)
    return older.reverse().map((messageId) => ({
      id: messageId, content: `m${messageId}`, message_type: messageId % 2, created_at: 1_760_000_000 + messageId,
      private: false, status: 'sent',
    }))
  })
  const listConversations = vi.fn(async (_status: string, page: number) => {
    const all = Object.entries(chats).map(([id, chat]) => conversation(Number(id), chat.lastActivity))
    return { conversations: all.slice((page - 1) * 25, page * 25), totalCount: all.length }
  })
  return { listConversations, listMessages } as unknown as ChatwootClient & { listMessages: typeof listMessages }
}

// The database's side, in memory: messages keyed by id, as the real one is.
function memoryStore(state: Awaited<ReturnType<CopyStore['state']>> = new Map()) {
  const messages = new Map<number, CopyMessage>()
  const done: number[] = []
  const ranges: Array<[string, string]> = []
  const store: CopyStore = {
    state: async () => state,
    importChat: async (_account, chat, rows, finished) => {
      for (const row of rows) {
        messages.set(row.id, row)
      }
      if (finished) {
        done.push((chat as { conversation_id: number }).conversation_id)
      }
    },
    firstMessageAt: async () => (messages.size ? '2026-10-15T03:00:00Z' : null),
    computeDays: async (first, last) => {
      ranges.push([first, last])
    },
  }
  return { store, messages, done, ranges }
}

describe('copyOldChats', () => {
  it('copies every message of every chat, then works out every day since the first message', async () => {
    const client = chatwoot({ 1: { lastActivity: 100, count: 45 }, 2: { lastActivity: 100, count: 3 } })
    const { store, messages, done, ranges } = memoryStore()
    const seen: CopyProgress[] = []

    const result = await copyOldChats({ client, store, onProgress: (progress) => seen.push(progress), now: NOW })

    expect(messages.size).toBe(48)
    expect(done.sort()).toEqual([1, 2])
    // 15 Oct to 18 Oct (yesterday, Malaysia time).
    expect(ranges).toEqual([['2026-10-15', '2026-10-18']])
    expect(result).toMatchObject({ phase: 'done', chatsTotal: 2, chatsDone: 2, messages: 48, daysTotal: 4, daysDone: 4 })
    expect(seen.map((progress) => progress.phase)).toEqual(expect.arrayContaining(['listing', 'chats', 'days', 'done']))
  })

  it('carries on where it stopped: skips finished chats and reads a newer one back to where it got', async () => {
    const client = chatwoot({ 1: { lastActivity: 100, count: 45 }, 2: { lastActivity: 9_999_999_999, count: 60 } })
    const { store, messages } = memoryStore(
      new Map([
        [1, { copiedAt: 1_800_000_000, needsCopy: false, newestMessageId: 1045 }],
        [2, { copiedAt: 1_800_000_000, needsCopy: false, newestMessageId: 2050 }],
      ]),
    )

    const result = await copyOldChats({ client, store, onProgress: () => {}, now: NOW })

    expect(result.chatsSkipped).toBe(1)
    expect(client.listMessages).not.toHaveBeenCalledWith(1, undefined)
    // Chat 2: one page (2041-2060) reaches the message it had copied up to.
    expect([...messages.keys()].sort()).toEqual(Array.from({ length: 20 }, (_, index) => 2041 + index))
  })

  it('reads a chat the nightly check marked again from the start', async () => {
    const client = chatwoot({ 1: { lastActivity: 100, count: 30 } })
    const { store, messages } = memoryStore(new Map([[1, { copiedAt: 1_800_000_000, needsCopy: true, newestMessageId: 1030 }]]))

    await copyOldChats({ client, store, onProgress: () => {}, now: NOW })

    expect(messages.size).toBe(30)
  })

  it('stops when asked, without marking the chat it was in the middle of as done', async () => {
    const client = chatwoot({ 1: { lastActivity: 100, count: 200 } })
    const { store, done, ranges } = memoryStore()
    let stop = false
    client.listMessages.mockImplementationOnce(async () => {
      stop = true
      return Array.from({ length: 20 }, (_, index) => ({
        id: 1200 - index, content: 'x', message_type: 0, created_at: 1_760_000_000, private: false, status: 'sent',
      }))
    })

    const result = await copyOldChats({ client, store, onProgress: () => {}, cancelled: () => stop, now: NOW })

    expect(done).toEqual([])
    expect(ranges).toEqual([])
    expect(result.phase).not.toBe('done')
  })

  it('leaves a chat that keeps failing for the next run and goes on with the others', async () => {
    const client = chatwoot({ 1: { lastActivity: 100, count: 3 }, 2: { lastActivity: 100, count: 3 } })
    client.listMessages.mockImplementation(async (id: number) => {
      if (id === 1) {
        throw new Error('timeout')
      }
      return id === 2 ? [{ id: 2001, content: 'x', message_type: 0, created_at: 1_760_000_000, private: false, status: 'sent' }] : []
    })
    const { store, done } = memoryStore()

    const result = await copyOldChats({ client, store, onProgress: () => {}, now: NOW })

    expect(result.chatsFailed).toBe(1)
    expect(done).toEqual([2])
  })

  it('works out every day from the first message without reading a chat ("Work out the days")', async () => {
    const { store, messages, ranges } = memoryStore()
    messages.set(1, {} as never)
    const firstMessageAt = vi.spyOn(store, 'firstMessageAt').mockResolvedValue('2026-06-12T07:35:30+00:00')

    const result = await workOutAllDays({ store, onProgress: () => {}, now: NOW })

    expect(firstMessageAt).toHaveBeenCalled()
    // 12 Jun to 18 Oct, 31 days a call.
    expect(ranges).toEqual([
      ['2026-06-12', '2026-07-12'],
      ['2026-07-13', '2026-08-12'],
      ['2026-08-13', '2026-09-12'],
      ['2026-09-13', '2026-10-13'],
      ['2026-10-14', '2026-10-18'],
    ])
    expect(result).toMatchObject({ phase: 'done', daysTotal: 129, daysDone: 129, messages: 0 })
  })
})
