import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useStaffReplyStats } from './useStaffReplyStats'
import type { ChatwootClient } from '../lib/chatwootClient'
import type { ChatwootConversation } from '../lib/whatsappInbox'

function conversation(id: number, extra: Partial<ChatwootConversation> = {}): ChatwootConversation {
  return {
    id, status: 'open', unread_count: 0, waiting_since: 0, timestamp: 1, last_activity_at: 1,
    meta: { sender: { id: id * 10, name: `P${id}`, phone_number: null, identifier: null } }, ...extra,
  }
}

describe('useStaffReplyStats', () => {
  it('reads every open chat, with its owner and wait, in as many pages as there are', async () => {
    // 30 open chats: a full first page of 25, then 5.
    const all = [conversation(1, { waiting_since: 500, custom_attributes: { crm_owner_id: 3 } }), ...Array.from({ length: 29 }, (_, index) => conversation(index + 2))]
    const listConversations = vi.fn(async (_status: string, page: number) => ({
      conversations: all.slice((page - 1) * 25, page * 25),
      totalCount: 30,
    }))
    const client = { listConversations } as unknown as ChatwootClient

    const { result } = renderHook(() => useStaffReplyStats(client))
    await act(async () => {
      await result.current.load()
    })

    expect(result.current.error).toBeNull()
    expect(result.current.data?.live).toHaveLength(30)
    expect(result.current.data?.live.slice(0, 2)).toEqual([
      { id: 1, status: 'open', waitingSince: 500, ownerId: 3 },
      { id: 2, status: 'open', waitingSince: 0, ownerId: null },
    ])
    // Two pages hold them all: no third request.
    expect(listConversations).toHaveBeenCalledTimes(2)
  })

  it('reports a problem instead of throwing', async () => {
    const client = {
      listConversations: vi.fn(async () => {
        throw new Error('down')
      }),
    } as unknown as ChatwootClient

    const { result } = renderHook(() => useStaffReplyStats(client))
    await act(async () => {
      await result.current.load()
    })

    expect(result.current.error).toMatch(/Couldn't read the open chats/)
    expect(result.current.data).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })
})
