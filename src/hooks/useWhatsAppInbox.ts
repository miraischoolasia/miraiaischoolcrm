import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatwootClient, Sender } from '../lib/chatwootClient'
import { startChat } from '../lib/startChat'
import { CONFIRM_POLL_MS, CONFIRM_TIMEOUT_MS, fileKind, splitForSending } from '../lib/outbox'
import {
  getOwner,
  onePerParent,
  type ChatAttributes,
  type ChatwootConversation,
  type ChatwootMessage,
} from '../lib/whatsappInbox'

const LIST_REFRESH_MS = 4_000
const DONE_REFRESH_MS = 20_000
const MESSAGES_REFRESH_MS = 3_000

function mergeConversations(current: Map<number, ChatwootConversation>, incoming: ChatwootConversation[]) {
  const next = new Map(current)
  for (const conversation of incoming) {
    next.set(conversation.id, conversation)
  }
  return next
}

// By time first, so an older chat of the same parent reads in the right place; the id breaks ties.
function mergeMessages(current: ChatwootMessage[], incoming: ChatwootMessage[]) {
  const byId = new Map(current.map((message) => [message.id, message]))
  for (const message of incoming) {
    byId.set(message.id, message)
  }
  return [...byId.values()].sort((a, b) => a.created_at - b.created_at || a.id - b.id)
}

// moreTexts are extra messages sent after the first one, each on its own.
export type SendInput = { content: string; isPrivate: boolean; files: File[]; moreTexts?: string[] }

type OutboxItem = {
  tempId: number
  conversationId: number
  content: string
  files: File[]
  previewUrls: string[]
  isPrivate: boolean
  state: 'queued' | 'sending' | 'cancelled'
  createdAt: number
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

export function useWhatsAppInbox(client: ChatwootClient, currentUser: Sender) {
  const [conversationMap, setConversationMap] = useState<Map<number, ChatwootConversation>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatwootMessage[]>([])
  // Whether the selected chat itself has older messages, and how many older chats of the same
  // parent are still to be read after it.
  const [ownHasOlder, setOwnHasOlder] = useState(false)
  const [olderChatCount, setOlderChatCount] = useState(0)
  const ownCursor = useRef<number | null>(null)
  const olderChats = useRef<number[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [outbox, setOutbox] = useState<OutboxItem[]>([])
  const nextPage = useRef({ open: 2, resolved: 2 })
  const totals = useRef({ open: 0, resolved: 0 })
  const [canLoadMore, setCanLoadMore] = useState({ open: false, resolved: false })
  const selectedRef = useRef<number | null>(null)
  const mapRef = useRef(conversationMap)
  const outboxRef = useRef<OutboxItem[]>([])
  const running = useRef(new Set<number>())
  const tempCounter = useRef(0)

  useEffect(() => {
    mapRef.current = conversationMap
  }, [conversationMap])

  const updateLoadMore = useCallback(() => {
    const loaded = (status: 'open' | 'resolved') => (nextPage.current[status] - 1) * 25
    setCanLoadMore({
      open: totals.current.open > loaded('open'),
      resolved: totals.current.resolved > loaded('resolved'),
    })
  }, [])

  const conversations = useMemo(() => onePerParent([...conversationMap.values()]), [conversationMap])
  const hasOlder = ownHasOlder || olderChatCount > 0
  const selected = selectedId === null ? null : (conversationMap.get(selectedId) ?? null)

  const refreshStatus = useCallback(
    async (status: 'open' | 'resolved') => {
      const page = await client.listConversations(status, 1)
      setConversationMap((current) => mergeConversations(current, page.conversations))
      totals.current[status] = page.totalCount
      updateLoadMore()
    },
    [client, updateLoadMore],
  )

  useEffect(() => {
    let cancelled = false
    async function firstLoad() {
      try {
        await Promise.all([refreshStatus('open'), refreshStatus('resolved')])
        const second = await client.listConversations('open', 2)
        if (!cancelled) {
          setConversationMap((current) => mergeConversations(current, second.conversations))
          nextPage.current.open = 3
          updateLoadMore()
        }
      } catch {
        if (!cancelled) {
          setLoadError("Couldn't load WhatsApp chats. Check your connection and try again.")
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }
    void firstLoad()

    const listTimer = window.setInterval(() => {
      if (!document.hidden) {
        refreshStatus('open').then(() => setLoadError(null)).catch(() => undefined)
      }
    }, LIST_REFRESH_MS)
    const doneTimer = window.setInterval(() => {
      if (!document.hidden) {
        refreshStatus('resolved').catch(() => undefined)
      }
    }, DONE_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(listTimer)
      window.clearInterval(doneTimer)
    }
  }, [client, refreshStatus, updateLoadMore])

  const loadMore = useCallback(
    async (status: 'open' | 'resolved') => {
      const page = await client.listConversations(status, nextPage.current[status])
      nextPage.current[status] += 1
      setConversationMap((current) => mergeConversations(current, page.conversations))
      totals.current[status] = page.totalCount
      updateLoadMore()
    },
    [client, updateLoadMore],
  )

  const markSeen = useCallback(
    (conversationId: number) => {
      client
        .markSeen(conversationId)
        .then(() =>
          setConversationMap((current) => {
            const conversation = current.get(conversationId)
            if (!conversation || conversation.unread_count === 0) {
              return current
            }
            return new Map(current).set(conversationId, { ...conversation, unread_count: 0 })
          }),
        )
        .catch(() => undefined)
    },
    [client],
  )

  useEffect(() => {
    selectedRef.current = selectedId
    setMessages([])
    setOwnHasOlder(false)
    setOlderChatCount(0)
    ownCursor.current = null
    olderChats.current = []
    setActionError(null)
    if (selectedId === null) {
      return
    }
    let cancelled = false
    client
      .listMessages(selectedId)
      .then((latest) => {
        if (cancelled) {
          return
        }
        setMessages(mergeMessages([], latest))
        setOwnHasOlder(latest.length >= 20)
        ownCursor.current = latest.length > 0 ? Math.min(...latest.map((message) => message.id)) : null
        markSeen(selectedId)
      })
      .catch(() => {
        if (!cancelled) {
          setActionError("Couldn't load this chat. Try again in a moment.")
        }
      })

    // Other chats of the same parent (an old one under a hidden ID) are read after this one.
    const senderId = mapRef.current.get(selectedId)?.meta.sender.id
    if (senderId !== undefined) {
      client
        .listContactConversations(senderId)
        .then((chats) => {
          if (cancelled) {
            return
          }
          olderChats.current = chats.map((chat) => chat.id).filter((id) => id !== selectedId).sort((a, b) => b - a)
          setOlderChatCount(olderChats.current.length)
        })
        .catch(() => undefined)
    }

    const timer = window.setInterval(() => {
      if (document.hidden) {
        return
      }
      client
        .listMessages(selectedId)
        .then((latest) => {
          if (cancelled || selectedRef.current !== selectedId) {
            return
          }
          setMessages((current) => {
            const known = new Set(current.map((message) => message.id))
            if (latest.some((message) => message.message_type === 0 && !known.has(message.id))) {
              markSeen(selectedId)
            }
            return mergeMessages(current, latest)
          })
        })
        .catch(() => undefined)
    }, MESSAGES_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [client, selectedId, markSeen])

  const loadOlder = useCallback(async () => {
    if (selectedId === null) {
      return
    }
    if (ownHasOlder && ownCursor.current !== null) {
      const older = await client.listMessages(selectedId, ownCursor.current)
      setOwnHasOlder(older.length >= 20)
      if (older.length > 0) {
        ownCursor.current = Math.min(...older.map((message) => message.id))
      }
      setMessages((current) => mergeMessages(current, older))
      return
    }
    // This chat is read to its start; carry on into the next older chat of the same parent.
    const next = olderChats.current.shift()
    if (next === undefined) {
      return
    }
    setOlderChatCount(olderChats.current.length)
    let before: number | undefined
    for (let page = 0; page < 40; page += 1) {
      const older = await client.listMessages(next, before)
      setMessages((current) => mergeMessages(current, older))
      if (older.length < 20) {
        break
      }
      before = Math.min(...older.map((message) => message.id))
    }
  }, [client, selectedId, ownHasOlder])

  const patchConversation = useCallback((id: number, patch: Partial<ChatwootConversation>) => {
    setConversationMap((current) => {
      const conversation = current.get(id)
      return conversation ? new Map(current).set(id, { ...conversation, ...patch }) : current
    })
  }, [])

  // Opening a chat reads it. This undoes that (for a chat opened by mistake) and
  // closes it, so it is not read again at once.
  const markUnread = useCallback(
    async (conversationId: number) => {
      setActionError(null)
      try {
        await client.markUnread(conversationId)
        const conversation = mapRef.current.get(conversationId)
        patchConversation(conversationId, { unread_count: Math.max(1, conversation?.unread_count ?? 0) })
        setSelectedId(null)
      } catch {
        setActionError("Couldn't mark this chat as unread. Try again.")
      }
    },
    [client, patchConversation],
  )

  // Saves the owner and the linked lead together, because Chatwoot replaces the whole set.
  const saveAttributes = useCallback(
    async (conversationId: number, change: ChatAttributes) => {
      const current = mapRef.current.get(conversationId)?.custom_attributes ?? {}
      const next: ChatAttributes = { ...current, ...change }
      await client.setAttributes(conversationId, next)
      patchConversation(conversationId, { custom_attributes: next })
    },
    [client, patchConversation],
  )

  const setOwner = useCallback(
    async (conversationId: number, owner: Sender | null) => {
      setActionError(null)
      try {
        await saveAttributes(conversationId, { crm_owner_id: owner?.id ?? null, crm_owner_name: owner?.name ?? null })
      } catch {
        setActionError("Couldn't change who handles this chat. Try again.")
      }
    },
    [saveAttributes],
  )

  const setLeadLink = useCallback(
    async (conversationId: number, leadId: number | null) => {
      setActionError(null)
      try {
        await saveAttributes(conversationId, { crm_lead_id: leadId })
        return true
      } catch {
        setActionError("Couldn't link this chat to the lead. Try again.")
        return false
      }
    },
    [saveAttributes],
  )

  const setStatus = useCallback(
    async (conversationId: number, status: 'open' | 'resolved') => {
      setActionError(null)
      try {
        await client.setStatus(conversationId, status)
        patchConversation(conversationId, { status })
        if (status === 'resolved') {
          setSelectedId(null)
        }
      } catch {
        setActionError("Couldn't update this chat. Try again.")
      }
    },
    [client, patchConversation],
  )

  const changeOutbox = useCallback((change: (items: OutboxItem[]) => OutboxItem[]) => {
    outboxRef.current = change(outboxRef.current)
    setOutbox(outboxRef.current)
  }, [])

  const dropOutboxItems = useCallback(
    (predicate: (item: OutboxItem) => boolean) => {
      for (const item of outboxRef.current.filter(predicate)) {
        item.previewUrls.forEach((url) => URL.revokeObjectURL(url))
      }
      changeOutbox((items) => items.filter((item) => !predicate(item)))
    },
    [changeOutbox],
  )

  // Waits until WhatsApp has accepted a message (it gets its own id) before the
  // next one is allowed to leave.
  const waitUntilSent = useCallback(
    async (conversationId: number, messageId: number) => {
      const deadline = Date.now() + CONFIRM_TIMEOUT_MS
      while (Date.now() < deadline) {
        await sleep(CONFIRM_POLL_MS)
        const latest = await client.listMessages(conversationId)
        const message = latest.find((item) => item.id === messageId)
        if (message) {
          if (selectedRef.current === conversationId) {
            setMessages((current) => mergeMessages(current, [message]))
          }
          if (message.status === 'failed') {
            throw new Error('failed')
          }
          if (message.source_id) {
            return
          }
        }
      }
      throw new Error('timeout')
    },
    [client],
  )

  const runQueue = useCallback(
    async (conversationId: number) => {
      if (running.current.has(conversationId)) {
        return
      }
      running.current.add(conversationId)
      try {
        for (;;) {
          const item = outboxRef.current.find((entry) => entry.conversationId === conversationId && entry.state === 'queued')
          if (!item) {
            return
          }
          changeOutbox((items) => items.map((entry) => (entry.tempId === item.tempId ? { ...entry, state: 'sending' } : entry)))
          try {
            const sent = await client.sendMessage(conversationId, {
              content: item.content,
              isPrivate: item.isPrivate,
              files: item.files,
              sender: currentUser,
            })
            dropOutboxItems((entry) => entry.tempId === item.tempId)
            if (selectedRef.current === conversationId) {
              setMessages((current) => mergeMessages(current, [sent]))
            }
            if (!item.isPrivate) {
              const conversation = mapRef.current.get(conversationId)
              patchConversation(conversationId, { waiting_since: 0 })
              // The first person to reply takes the chat, so two people don't answer it.
              if (conversation && getOwner(conversation) === null) {
                void setOwner(conversationId, currentUser)
              }
              await waitUntilSent(conversationId, sent.id)
            }
          } catch {
            // Nothing behind a message that did not go out may jump ahead of it.
            changeOutbox((items) =>
              items.map((entry) =>
                entry.conversationId === conversationId && (entry.tempId === item.tempId || entry.state === 'queued')
                  ? { ...entry, state: 'cancelled' }
                  : entry,
              ),
            )
            setActionError('A message did not go through, so the ones after it were not sent.')
            return
          }
        }
      } finally {
        running.current.delete(conversationId)
      }
    },
    [changeOutbox, client, currentUser, dropOutboxItems, patchConversation, setOwner, waitUntilSent],
  )

  const send = useCallback(
    async (input: SendInput) => {
      if (selectedId === null) {
        return false
      }
      const parts = splitForSending(input.content, input.files, input.moreTexts)
      if (parts.length === 0) {
        return false
      }
      setActionError(null)
      const items: OutboxItem[] = parts.map((part) => {
        tempCounter.current += 1
        return {
          tempId: tempCounter.current,
          conversationId: selectedId,
          content: part.content,
          files: part.files,
          previewUrls: part.files.map((file) => URL.createObjectURL(file)),
          isPrivate: input.isPrivate,
          state: 'queued',
          createdAt: Math.floor(Date.now() / 1000),
        }
      })
      changeOutbox((current) => [...current, ...items])
      void runQueue(selectedId)
      return true
    },
    [changeOutbox, runQueue, selectedId],
  )

  const dismissUnsent = useCallback(
    (tempId: number) => dropOutboxItems((item) => item.tempId === tempId),
    [dropOutboxItems],
  )

  // The messages still on this computer, shaped like the ones from the server so
  // the chat can show them in the same place.
  const waitingMessages = useMemo<ChatwootMessage[]>(
    () =>
      outbox
        .filter((item) => item.conversationId === selectedId)
        .map((item) => ({
          id: -item.tempId,
          content: item.content,
          message_type: 1,
          created_at: item.createdAt,
          private: item.isPrivate,
          status: 'sent',
          local: item.state,
          content_attributes: { crm_sender: currentUser },
          attachments: item.files.map((file, index) => ({
            id: -(item.tempId * 100 + index),
            file_type: fileKind(file),
            data_url: item.previewUrls[index],
            file_size: file.size,
            extension: file.name.split('.').pop() ?? null,
          })),
        })),
    [outbox, selectedId, currentUser],
  )

  // Brings in chats that a search found but the list has not loaded (older ones).
  const loadMissingConversations = useCallback(
    async (ids: number[]) => {
      const missing = ids.filter((id) => !mapRef.current.has(id)).slice(0, 10)
      if (missing.length === 0) {
        return
      }
      const found = await Promise.all(missing.map((id) => client.getConversation(id).catch(() => null)))
      const loaded = found.filter((conversation): conversation is ChatwootConversation => conversation !== null)
      if (loaded.length > 0) {
        setConversationMap((current) => mergeConversations(current, loaded))
      }
    },
    [client],
  )

  // Opens the chat with a number, creating it first if the number is new.
  const startNewChat = useCallback(
    async (input: { phone: string; name: string }) => {
      const result = await startChat(client, input)
      if (result.error === null) {
        await Promise.all([refreshStatus('open'), refreshStatus('resolved')])
        setSelectedId(result.conversationId)
      }
      return result
    },
    [client, refreshStatus],
  )

  const savePhone = useCallback(
    async (contactId: number, digits: string) => {
      setActionError(null)
      try {
        await client.setContactPhone(contactId, digits)
        await refreshStatus('open')
        return true
      } catch {
        setActionError("Couldn't save that number. It may already belong to another chat.")
        return false
      }
    },
    [client, refreshStatus],
  )

  return {
    conversations,
    selected,
    selectedId,
    setSelectedId,
    messages,
    waitingMessages,
    hasOlder,
    loadOlder,
    isLoading,
    loadError,
    actionError,
    canLoadMore,
    loadMore,
    setOwner,
    markUnread,
    setLeadLink,
    setStatus,
    send,
    dismissUnsent,
    savePhone,
    startNewChat,
    loadMissingConversations,
  }
}
