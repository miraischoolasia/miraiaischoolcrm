import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatwootClient } from '../lib/chatwootClient'
import type { ChatForStats } from '../lib/staffReplyStats'
import type { ChatwootConversation, ChatwootMessage } from '../lib/whatsappInbox'

export type StatsRange = 'today' | '7d' | '30d'

export type StatsLoad = {
  range: StatsRange
  from: number
  to: number
  loadedAt: number
  chats: ChatForStats[]
}

// Chatwoot lists 25 chats a page, newest activity first.
const MAX_CONVERSATION_PAGES = 16
const MAX_MESSAGE_PAGES = 12
const WORKERS = 4

// Seconds since epoch where the period starts: midnight today, or midnight 6 / 29 days earlier.
export function rangeStart(range: StatsRange, now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - (range === 'today' ? 0 : range === '7d' ? 6 : 29))
  return Math.floor(start.getTime() / 1000)
}

async function listChats(client: ChatwootClient, from: number, cancelled: () => boolean) {
  const found = new Map<number, ChatwootConversation>()
  for (const status of ['open', 'resolved'] as const) {
    for (let page = 1; page <= MAX_CONVERSATION_PAGES; page += 1) {
      const { conversations } = await client.listConversations(status, page)
      if (cancelled() || conversations.length === 0) {
        break
      }
      for (const conversation of conversations) {
        // A chat nobody touched since the period began has no message in it.
        if (conversation.last_activity_at >= from || (conversation.waiting_since > 0 && status === 'open')) {
          found.set(conversation.id, conversation)
        }
      }
      if (conversations.every((conversation) => conversation.last_activity_at < from)) {
        break
      }
    }
  }
  return [...found.values()]
}

// The messages of one chat back to the start of the period, plus the page that crosses it, so the
// first message of the period still knows whether the parent was already waiting.
async function messagesSince(client: ChatwootClient, conversationId: number, from: number) {
  const byId = new Map<number, ChatwootMessage>()
  let before: number | undefined
  for (let page = 0; page < MAX_MESSAGE_PAGES; page += 1) {
    const messages = await client.listMessages(conversationId, before)
    if (messages.length === 0) {
      break
    }
    for (const message of messages) {
      byId.set(message.id, message)
    }
    const oldest = messages.reduce((first, message) => (message.id < first.id ? message : first))
    if (oldest.created_at < from || (before !== undefined && oldest.id >= before)) {
      break
    }
    before = oldest.id
  }
  return [...byId.values()]
}

function ownerOf(conversation: ChatwootConversation) {
  const id = Number(conversation.custom_attributes?.crm_owner_id)
  return Number.isInteger(id) && id > 0 ? id : null
}

// Reads the WhatsApp chats of a period when asked (it takes a few seconds, so it is never automatic).
export function useStaffReplyStats(client: ChatwootClient | null) {
  const [data, setData] = useState<StatsLoad | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const run = useRef(0)

  useEffect(() => {
    // A new inbox connection or leaving the page cancels what is still being read.
    return () => {
      run.current += 1
    }
  }, [client])

  const load = useCallback(
    async (range: StatsRange) => {
      if (!client) {
        return
      }
      const mine = ++run.current
      const cancelled = () => run.current !== mine
      const now = new Date()
      const from = rangeStart(range, now)
      setIsLoading(true)
      setError(null)
      setProgress(null)
      try {
        const conversations = await listChats(client, from, cancelled)
        if (cancelled()) {
          return
        }
        setProgress({ done: 0, total: conversations.length })
        const chats: ChatForStats[] = []
        let next = 0
        let done = 0
        async function worker() {
          while (!cancelled()) {
            const index = next
            next += 1
            if (index >= conversations.length) {
              return
            }
            const conversation = conversations[index]
            const messages = await messagesSince(client!, conversation.id, from)
            chats.push({
              id: conversation.id,
              status: conversation.status,
              waitingSince: conversation.waiting_since,
              ownerId: ownerOf(conversation),
              messages,
            })
            done += 1
            if (!cancelled()) {
              setProgress({ done, total: conversations.length })
            }
          }
        }
        await Promise.all(Array.from({ length: WORKERS }, () => worker()))
        if (cancelled()) {
          return
        }
        setData({
          range,
          from,
          to: Math.floor(now.getTime() / 1000) + 1,
          loadedAt: now.getTime(),
          chats,
        })
      } catch {
        if (!cancelled()) {
          setError("Couldn't read the WhatsApp chats. Check the inbox connection and try again.")
        }
      } finally {
        if (!cancelled()) {
          setIsLoading(false)
          setProgress(null)
        }
      }
    },
    [client],
  )

  return { data, isLoading, progress, error, load }
}
