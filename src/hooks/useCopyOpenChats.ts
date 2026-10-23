import { useEffect, useRef, useState } from 'react'
import { fetchCopyChatsChangedSince, fetchCopyOpenChats } from '../lib/inboxCopyReader'
import type { ChatwootConversation } from '../lib/whatsappInbox'
import type { InboxCopyLive } from './useInboxCopyLive'

// Every open chat, whole, for the Inbox page's list (its filters and Unread tab work over all of them). Read only
// once an Inbox page has been opened (2026-10-23: the menu badge used to read them whole from every tab at start and
// every minute). Shared by the Inbox and the Student Inbox: read once, then each page catches up with the chats that
// changed since (a light read), and its live line brings each change while it is on screen.

// Coming back after at least this long: the chats changed meanwhile are read (the live line was closed).
const CATCH_UP_AFTER_MS = 15_000
// The database clock and this computer's may differ a little: catch up from a bit earlier.
const CLOCK_SLACK_MS = 2 * 60_000

type Store = { chats: Map<number, ChatwootConversation>; readAt: number; reading: Promise<void> | null }
const store: Store = { chats: new Map(), readAt: 0, reading: null }

function sorted() {
  return [...store.chats.values()].sort((a, b) => (b.last_activity_at ?? 0) - (a.last_activity_at ?? 0))
}

function put(conversation: ChatwootConversation) {
  if (conversation.status === 'open') {
    store.chats.set(conversation.id, conversation)
  } else {
    store.chats.delete(conversation.id)
  }
}

async function readAll() {
  const startedAt = Date.now()
  const found = await fetchCopyOpenChats()
  store.chats = new Map(found.map((conversation) => [conversation.id, conversation]))
  store.readAt = startedAt
}

async function catchUp() {
  const startedAt = Date.now()
  const { changed, complete } = await fetchCopyChatsChangedSince(new Date(store.readAt - CLOCK_SLACK_MS).toISOString())
  if (!complete) {
    await readAll()
    return
  }
  for (const conversation of changed) {
    put(conversation)
  }
  store.readAt = startedAt
}

// Reads everything the first time, then only what changed; one read at a time for every page.
function refresh() {
  store.reading ??= (store.readAt === 0 ? readAll() : catchUp()).finally(() => {
    store.reading = null
  })
  return store.reading
}

// Only for tests.
export function resetCopyOpenChats() {
  store.chats = new Map()
  store.readAt = 0
  store.reading = null
}

export function useCopyOpenChats(copy: InboxCopyLive | null, active: boolean) {
  const [chats, setChats] = useState<ChatwootConversation[]>([])
  const available = copy?.available ?? false
  const lastLook = useRef(0)

  // Opened, or looked at again after a while: read (first time) or catch up.
  useEffect(() => {
    if (!active || !available) {
      return
    }
    let cancelled = false
    if (store.readAt !== 0 && Date.now() - lastLook.current < CATCH_UP_AFTER_MS) {
      setChats(sorted())
      return
    }
    lastLook.current = Date.now()
    refresh()
      .then(() => {
        if (!cancelled) {
          setChats(sorted())
        }
      })
      .catch(() => {
        // Keep what there is; the next look tries again.
        lastLook.current = 0
      })
    return () => {
      cancelled = true
      lastLook.current = Date.now()
    }
  }, [active, available])

  // While on screen, each change arrives by itself.
  const subscribeChats = copy?.subscribeChats
  useEffect(() => {
    if (!subscribeChats) {
      return
    }
    return subscribeChats((conversation) => {
      if (store.readAt === 0) {
        return
      }
      put(conversation)
      setChats(sorted())
    })
  }, [subscribeChats])

  return chats
}
