import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatwootClient } from '../lib/chatwootClient'
import type { LiveChat } from '../lib/staffReplyStats'
import type { ChatwootConversation } from '../lib/whatsappInbox'

// What is true right now about the open chats (who owns them, where a parent is waiting), read from the
// inbox when asked. The numbers of a period come from the inbox copy instead (Team Replies page).

export type LiveLoad = {
  loadedAt: number
  // Every open chat right now.
  live: LiveChat[]
}

// Chatwoot lists 25 chats a page.
const PAGE_SIZE = 25
const MAX_CONVERSATION_PAGES = 16

function ownerOf(conversation: ChatwootConversation) {
  const id = Number(conversation.custom_attributes?.crm_owner_id)
  return Number.isInteger(id) && id > 0 ? id : null
}

export function liveOf(conversation: ChatwootConversation): LiveChat {
  return {
    id: conversation.id,
    status: conversation.status,
    waitingSince: conversation.waiting_since,
    ownerId: ownerOf(conversation),
  }
}

export function useStaffReplyStats(client: ChatwootClient | null) {
  const [data, setData] = useState<LiveLoad | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = useRef(0)

  useEffect(() => {
    // A new inbox connection or leaving the page cancels what is still being read.
    return () => {
      run.current += 1
    }
  }, [client])

  const load = useCallback(async () => {
    if (!client) {
      return
    }
    const mine = ++run.current
    const cancelled = () => run.current !== mine
    const now = Date.now()
    setIsLoading(true)
    setError(null)
    try {
      // The first page says how many there are; the other pages are then read side by side.
      const first = await client.listConversations('open', 1)
      const pages = Math.min(MAX_CONVERSATION_PAGES, Math.ceil(first.totalCount / PAGE_SIZE))
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, pages - 1) }, (_, index) => client.listConversations('open', index + 2)),
      )
      const open = new Map<number, ChatwootConversation>()
      for (const page of [first, ...rest]) {
        for (const conversation of page.conversations) {
          open.set(conversation.id, conversation)
        }
      }
      if (!cancelled()) {
        setData({ loadedAt: now, live: [...open.values()].map(liveOf) })
      }
    } catch {
      if (!cancelled()) {
        setError("Couldn't read the open chats. Check the inbox connection and try again.")
      }
    } finally {
      if (!cancelled()) {
        setIsLoading(false)
      }
    }
  }, [client])

  return { data, isLoading, error, load }
}
