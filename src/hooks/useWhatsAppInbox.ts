import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatwootClient, Sender } from '../lib/chatwootClient'
import { startChat } from '../lib/startChat'
import { CONFIRM_POLL_MS, CONFIRM_TIMEOUT_MS, fileKind, splitSequence } from '../lib/outbox'
import {
  copyIsBehind,
  fetchCopyChats,
  fetchCopyContactChats,
  fetchCopyMessages,
  fetchCopyMessagesAround,
  fetchRecentMessages,
  fillCopy,
  type CopyCursor,
} from '../lib/inboxCopyReader'
import type { InboxCopyLive } from './useInboxCopyLive'
import {
  SOCIAL_CONFIRM_SECONDS,
  confirmsBySource,
  getOwner,
  getPhoneReadTarget,
  getRealPhone,
  isOnAllowedNumber,
  onePerParent,
  togglePinnedMessage,
  withLeadLink,
  type ChatAttributes,
  type ChatRole,
  type ChatwootConversation,
  type ChatwootMessage,
} from '../lib/whatsappInbox'

const SERVER_DOWN_MESSAGE =
  'The inbox server is not answering right now, so these chats may be out of date and replies may not send. It usually comes back by itself.'

const LIST_REFRESH_MS = 4_000
const DONE_REFRESH_MS = 20_000
const MESSAGES_REFRESH_MS = 3_000
const DEEP_REFRESH_MS = 30_000
// While the copy is live, new messages arrive by themselves; this slow check (every 20th round, one minute)
// only guards against one that was missed.
const LIVE_SAFETY_EVERY = 20
// With the copy but without its live line, the open chat's messages are asked about every fifth round (15 seconds).
const COPY_SAFETY_EVERY = 5
// The Done list from the copy is read again this often while live (it is the database, not Chatwoot).
const LIVE_DONE_REFRESH_MS = 60_000
// The newest messages of the chats at the top of the list are read ahead (one request for 40 chats), so opening
// one of them shows its messages at once. Read again when the top of the list changes, at most this often.
const PREFETCH_CHATS = 40
const PREFETCH_EVERY_MS = 20_000

function sameChat(a: ChatwootConversation, b: ChatwootConversation) {
  const lastA = a.last_non_activity_message
  const lastB = b.last_non_activity_message
  return (
    a.unread_count === b.unread_count &&
    a.status === b.status &&
    a.waiting_since === b.waiting_since &&
    a.inbox_id === b.inbox_id &&
    JSON.stringify(a.custom_attributes ?? null) === JSON.stringify(b.custom_attributes ?? null) &&
    JSON.stringify(a.labels ?? null) === JSON.stringify(b.labels ?? null) &&
    JSON.stringify(a.meta) === JSON.stringify(b.meta) &&
    (!lastB || (lastA?.id === lastB.id && lastA.content === lastB.content && lastA.status === lastB.status))
  )
}

// A chat's state that is not older than what is shown replaces it: the copy, a live update and the menu badge's
// list each may be a little behind the others, and an older one must not undo a newer one.
function mergeNewer(current: Map<number, ChatwootConversation>, incoming: ChatwootConversation[]) {
  let next: Map<number, ChatwootConversation> | null = null
  for (const conversation of incoming) {
    const shown = (next ?? current).get(conversation.id)
    if (shown === conversation || (shown && shown.last_activity_at > conversation.last_activity_at)) {
      continue
    }
    // The same state again (the badge reads every few seconds): nothing to redraw.
    if (shown && shown.last_activity_at === conversation.last_activity_at && sameChat(shown, conversation)) {
      continue
    }
    next ??= new Map(current)
    next.set(
      conversation.id,
      shown?.last_non_activity_message && !conversation.last_non_activity_message
        ? { ...conversation, last_non_activity_message: shown.last_non_activity_message }
        : conversation,
    )
  }
  return next ?? current
}

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

// Texts and files, each sent as its own message in this order.
export type SendInput = {
  isPrivate: boolean
  sequence: (string | File)[]
  // The message the first one quotes (Chatwoot's id of it).
  replyTo?: number
}

type OutboxItem = {
  tempId: number
  conversationId: number
  content: string
  files: File[]
  previewUrls: string[]
  isPrivate: boolean
  replyTo?: number
  state: 'queued' | 'sending' | 'failed' | 'cancelled'
  createdAt: number
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

// active is false while the WhatsApp page is hidden behind another page: the page stays as it
// was, but nothing is marked as read while no one is looking.
// allowedInboxIds: the WhatsApp numbers (Chatwoot inboxes) this person may see; null means all of them.
export function useWhatsAppInbox(
  client: ChatwootClient,
  currentUser: Sender,
  active = true,
  allowedInboxIds: number[] | null = null,
  // Contacts the CRM knows to be one person (see contactSiblings): their chats show as one.
  siblings?: Map<number, number[]>,
  // Which lead the database ties each chat contact to (see leadOfContacts), for chats with no lead written on them.
  leadOfContact?: Map<number, number>,
  // The CRM's copy of the inbox (see useInboxCopyLive) and every open chat the menu badge has read. With them the
  // page reads chats and messages from the copy and hears of new ones by itself; without them, or while the copy
  // is not live, it asks Chatwoot every few seconds as before.
  copy: { link: InboxCopyLive; everyOpen?: ChatwootConversation[] } | null = null,
  // The Evolution name of the number a chat is on (see waInstance), so its read ticks go to that phone.
  instanceOfInbox: (inboxId: number | undefined) => string | null = () => null,
  // Numbers of the other inbox, never listed here (see inboxZones.ts).
  excludedInboxIds: readonly number[] = [],
) {
  const instanceOfInboxRef = useRef(instanceOfInbox)
  useEffect(() => {
    instanceOfInboxRef.current = instanceOfInbox
  }, [instanceOfInbox])
  const copyRef = useRef(copy)
  useEffect(() => {
    copyRef.current = copy
  }, [copy])
  const copyAvailable = copy?.link.available ?? false
  const copyLive = copy?.link.live ?? false
  // Chats whose copy was found behind Chatwoot when opened: they are asked about every few seconds, as before.
  const behindChats = useRef(new Set<number>())
  const doneCursor = useRef<CopyCursor | null>(null)
  // The Done list is read from the copy (page by page, as far back as it goes) once the copy is there.
  const doneFromCopy = useRef(false)
  // A message to open a chat on (a search result).
  const [focus, setFocus] = useState<{ conversationId: number; messageId: number } | null>(null)
  // The chats whose messages are on screen (the open one and newer chats of the same parent), for live updates.
  const [watchIds, setWatchIds] = useState<number[]>([])
  // Newest messages of the chats at the top of the list, read ahead from the copy.
  const readAhead = useRef(new Map<number, ChatwootMessage[]>())
  const siblingsRef = useRef(siblings)
  useEffect(() => {
    siblingsRef.current = siblings
  }, [siblings])
  const activeRef = useRef(active)
  useEffect(() => {
    activeRef.current = active
  }, [active])
  const [conversationMap, setConversationMap] = useState<Map<number, ChatwootConversation>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatwootMessage[]>([])
  // The chat the messages above were loaded for; null while a chat is still loading.
  const [messagesChat, setMessagesChat] = useState<number | null>(null)
  // Whether the selected chat itself has older messages, and how many older chats of the same
  // parent are still to be read after it.
  const [ownHasOlder, setOwnHasOlder] = useState(false)
  const [olderChatCount, setOlderChatCount] = useState(0)
  // Every chat the selected parent has, on any number: which numbers they reached the school on.
  const [contactChats, setContactChats] = useState<{ id: number; inbox_id: number; created_at?: number }[]>([])
  const ownCursor = useRef<number | null>(null)
  const olderChats = useRef<number[]>([])
  // Other chats of the same person that are newer than the open one (a hidden-ID chat beside the phone-number chat):
  // their messages belong to the same conversation, so they are read at once and kept fresh.
  const newerChats = useRef<number[]>([])
  const [actionError, setActionError] = useState<string | null>(null)
  const [outbox, setOutbox] = useState<OutboxItem[]>([])
  const nextPage = useRef({ open: 2, resolved: 2 })
  const totals = useRef({ open: 0, resolved: 0 })
  const [canLoadMore, setCanLoadMore] = useState({ open: false, resolved: false })
  const selectedRef = useRef<number | null>(null)
  const saveAttributesRef = useRef<(id: number, change: ChatAttributes) => Promise<void>>(async () => {})
  const mapRef = useRef(conversationMap)
  const outboxRef = useRef<OutboxItem[]>([])
  const running = useRef(new Set<number>())
  const tempCounter = useRef(0)

  useEffect(() => {
    mapRef.current = conversationMap
  }, [conversationMap])

  const updateLoadMore = useCallback(() => {
    const loaded = (status: 'open' | 'resolved') => (nextPage.current[status] - 1) * 25
    // The menu badge has read every open chat; the Done list from the copy carries on while it has a next page.
    const allOpen = (copyRef.current?.everyOpen?.length ?? 0) > 0
    setCanLoadMore({
      open: !allOpen && totals.current.open > loaded('open'),
      resolved: doneFromCopy.current ? doneCursor.current !== null : totals.current.resolved > loaded('resolved'),
    })
  }, [])

  const conversations = useMemo(
    () =>
      onePerParent(
        [...conversationMap.values()]
          .filter((entry) => isOnAllowedNumber(entry, allowedInboxIds, excludedInboxIds))
          .map((entry) => withLeadLink(entry, leadOfContact)),
        siblings,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the excluded list is compared by its contents
    [conversationMap, allowedInboxIds, siblings, leadOfContact, excludedInboxIds.join(',')],
  )
  // Reads ahead the newest messages of the chats at the top of the list (they are the ones opened).
  const topKey = useMemo(
    () =>
      [...conversations]
        .sort((a, b) => b.last_activity_at - a.last_activity_at)
        .slice(0, PREFETCH_CHATS)
        .map((conversation) => conversation.id)
        .join(','),
    [conversations],
  )
  const lastReadAhead = useRef(0)
  useEffect(() => {
    if (!copyAvailable || topKey === '') {
      return
    }
    let cancelled = false
    const wait = Math.max(0, lastReadAhead.current + PREFETCH_EVERY_MS - Date.now())
    const timer = window.setTimeout(() => {
      lastReadAhead.current = Date.now()
      fetchRecentMessages(topKey.split(',').map(Number))
        .then((byChat) => {
          if (!cancelled) {
            for (const [id, list] of byChat) {
              readAhead.current.set(id, list)
            }
          }
        })
        .catch(() => undefined)
    }, wait)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [copyAvailable, topKey])

  const hasOlder = ownHasOlder || olderChatCount > 0
  const selectedRaw = selectedId === null ? null : (conversationMap.get(selectedId) ?? null)
  const selected = useMemo(
    () => (selectedRaw ? withLeadLink(selectedRaw, leadOfContact) : null),
    [selectedRaw, leadOfContact],
  )

  // Every open chat the menu badge read (all pages): the list needs no pages of its own.
  const everyOpen = copy?.everyOpen
  useEffect(() => {
    if (everyOpen && everyOpen.length > 0) {
      setConversationMap((current) => mergeNewer(current, everyOpen))
      setIsLoading(false)
      updateLoadMore()
    }
  }, [everyOpen, updateLoadMore])

  // A chat changed in the copy (a new message, owner, status): shown at once.
  const subscribeChats = copy?.link.subscribeChats
  useEffect(() => {
    if (!subscribeChats) {
      return
    }
    return subscribeChats((conversation) => {
      setConversationMap((current) => mergeNewer(current, [conversation]))
      // The read-ahead messages of that chat get its new message too.
      const newest = conversation.last_non_activity_message
      const ahead = readAhead.current.get(conversation.id)
      if (newest && ahead && !ahead.some((message) => message.id === newest.id)) {
        readAhead.current.set(conversation.id, [newest, ...ahead].slice(0, PREFETCH_CHATS))
      }
    })
  }, [subscribeChats])

  // The Done list from the copy: its first page, and again now and then while live.
  useEffect(() => {
    if (!copyAvailable) {
      return
    }
    let cancelled = false
    fetchCopyChats('resolved', null)
      .then((page) => {
        if (cancelled) {
          return
        }
        doneFromCopy.current = true
        doneCursor.current = page.next
        setConversationMap((current) => mergeNewer(current, page.conversations))
        updateLoadMore()
      })
      .catch(() => undefined)
    const timer = window.setInterval(() => {
      if (!document.hidden && copyRef.current?.link.live && doneFromCopy.current) {
        // Only the first page again: the pages further back are history.
        fetchCopyChats('resolved', null)
          .then((page) => setConversationMap((current) => mergeNewer(current, page.conversations)))
          .catch(() => undefined)
      }
    }, LIVE_DONE_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [copyAvailable, updateLoadMore])

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
        // With the menu badge's list every open chat is here already.
        if ((copyRef.current?.everyOpen?.length ?? 0) > 0) {
          return
        }
        const second = await client.listConversations('open', 2)
        if (!cancelled) {
          setConversationMap((current) => mergeConversations(current, second.conversations))
          nextPage.current.open = 3
          updateLoadMore()
        }
      } catch {
        if (!cancelled) {
          setLoadError(SERVER_DOWN_MESSAGE)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }
    void firstLoad()

    // A refresh is skipped while the last one is still on its way: when the server is slow, asking
    // again every few seconds only piles requests up and makes it slower.
    let listBusy = false
    let doneBusy = false
    // The list quietly goes stale when the inbox server stops answering: two refreshes in a row that fail say so.
    let failedRefreshes = 0
    const listTimer = window.setInterval(() => {
      // With the copy the menu badge holds every open chat, kept up to date by the copy (2026-10-20: asking Chatwoot
      // every 4 seconds from every tab was most of Chatwoot's work).
      const live = Boolean(copyRef.current?.link.available) && (copyRef.current?.everyOpen?.length ?? 0) > 0
      if (!document.hidden && !listBusy && !live) {
        listBusy = true
        refreshStatus('open')
          .then(() => {
            failedRefreshes = 0
            setLoadError(null)
          })
          .catch(() => {
            failedRefreshes += 1
            if (failedRefreshes >= 2 && !cancelled) {
              setLoadError(SERVER_DOWN_MESSAGE)
            }
          })
          .finally(() => {
            listBusy = false
          })
      }
    }, LIST_REFRESH_MS)
    const doneTimer = window.setInterval(() => {
      if (!document.hidden && !doneBusy && !doneFromCopy.current) {
        doneBusy = true
        refreshStatus('resolved')
          .catch(() => undefined)
          .finally(() => {
            doneBusy = false
          })
      }
    }, DONE_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(listTimer)
      window.clearInterval(doneTimer)
    }
  }, [client, refreshStatus, updateLoadMore])

  // One request at a time: a second press while the first is on its way (or the Unread tab filling itself) would
  // ask for the same page twice and then skip one.
  const loadingMore = useRef({ open: false, resolved: false })
  const [isLoadingMore, setIsLoadingMore] = useState({ open: false, resolved: false })
  const loadMore = useCallback(
    async (status: 'open' | 'resolved') => {
      if (loadingMore.current[status]) {
        return
      }
      loadingMore.current[status] = true
      setIsLoadingMore((current) => ({ ...current, [status]: true }))
      try {
        if (status === 'resolved' && doneFromCopy.current) {
          try {
            if (doneCursor.current) {
              const page = await fetchCopyChats('resolved', doneCursor.current)
              doneCursor.current = page.next
              setConversationMap((current) => mergeNewer(current, page.conversations))
            }
            updateLoadMore()
            return
          } catch {
            // The copy did not answer: Chatwoot's pages from here on.
            doneFromCopy.current = false
          }
        }
        const page = await client.listConversations(status, nextPage.current[status])
        nextPage.current[status] += 1
        setConversationMap((current) => mergeConversations(current, page.conversations))
        totals.current[status] = page.totalCount
        updateLoadMore()
      } catch {
        setActionError("Couldn't load more chats. Try again in a moment.")
      } finally {
        loadingMore.current[status] = false
        setIsLoadingMore((current) => ({ ...current, [status]: false }))
      }
    },
    [client, updateLoadMore],
  )

  // The chats beyond the first page are not refreshed every few seconds, so they would keep an old unread count,
  // owner and status until a reload. They are read again now and then.
  useEffect(() => {
    const timer = window.setInterval(() => {
      // With the badge's list (every open chat, read by the badge) there are no pages of our own to read again.
      if (document.hidden || loadingMore.current.open || (copyRef.current?.everyOpen?.length ?? 0) > 0) {
        return
      }
      const loadedPages = nextPage.current.open - 1
      if (loadedPages < 2) {
        return
      }
      loadingMore.current.open = true
      Promise.all(Array.from({ length: loadedPages - 1 }, (_, index) => client.listConversations('open', index + 2)))
        .then((pages) => setConversationMap((current) => mergeConversations(current, pages.flatMap((page) => page.conversations))))
        .catch(() => undefined)
        .finally(() => {
          loadingMore.current.open = false
        })
    }, DEEP_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [client])

  // `readNow` are the parent's messages the team has just read; the phone is told too, so its
  // unread dot goes away. Not every chat can be reached that way, and the CRM does not wait for it.
  const markSeen = useCallback(
    (conversationId: number, readNow: ChatwootMessage[]) => {
      const conversation = mapRef.current.get(conversationId)
      if (conversation?.custom_attributes?.crm_marked_unread) {
        saveAttributesRef.current(conversationId, { crm_marked_unread: false }).catch(() => undefined)
      }
      const target = conversation ? getPhoneReadTarget(conversation.meta.sender, readNow) : null
      if (target) {
        client.markReadOnPhone(target.phone, target.ids, instanceOfInboxRef.current(conversation?.inbox_id)).catch(() => undefined)
      }
      client
        .markSeen(conversationId)
        .then(() => {
          // Chatwoot does not report a chat being read: the copy is told, so every tab's badge drops it too.
          const read = mapRef.current.get(conversationId)
          if (read && read.unread_count > 0 && copyRef.current?.link.available) {
            fillCopy({ ...read, unread_count: 0 }, []).catch(() => undefined)
          }
        })
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
    setMessagesChat(null)
    setOwnHasOlder(false)
    setOlderChatCount(0)
    setContactChats([])
    setWatchIds(selectedId === null ? [] : [selectedId])
    ownCursor.current = null
    olderChats.current = []
    newerChats.current = []
    setActionError(null)
    if (selectedId === null) {
      return
    }
    let cancelled = false
    // Chatwoot's answer is the truth; the copy's is only shown until it comes (it is usually much faster).
    let fromChatwoot = false
    let copied: ChatwootMessage[] = []
    const showLoaded = (loaded: ChatwootMessage[], full: boolean) => {
      setMessages((current) => mergeMessages(current, loaded))
      setMessagesChat(selectedId)
      setOwnHasOlder(loaded.length >= 20 || (full && ownCursor.current !== null))
      const lowest = loaded.length > 0 ? Math.min(...loaded.map((message) => message.id)) : null
      if (lowest !== null && (ownCursor.current === null || lowest < ownCursor.current)) {
        ownCursor.current = lowest
      }
    }

    // Read ahead: shown at once, before anything is asked.
    const ahead = readAhead.current.get(selectedId)
    if (ahead && ahead.length > 0) {
      copied = ahead
      showLoaded(ahead, false)
    }

    if (copyRef.current?.link.available) {
      fetchCopyMessages(selectedId)
        .then(({ messages: fromCopy }) => {
          copied = fromCopy
          if (!cancelled && !fromChatwoot && fromCopy.length > 0) {
            showLoaded(fromCopy, false)
          }
        })
        .catch(() => undefined)
    }

    client
      .listMessages(selectedId)
      .then((latest) => {
        if (cancelled) {
          return
        }
        fromChatwoot = true
        showLoaded(latest, false)
        readAhead.current.set(selectedId, latest)
        setOwnHasOlder(latest.length >= 20)
        // The phone shows as many unread as the CRM did, so only that many need telling.
        const unread = mapRef.current.get(selectedId)?.unread_count ?? 0
        markSeen(selectedId, unread > 0 ? latest.filter((message) => message.message_type === 0).slice(-unread) : [])
        // What the copy lacks (a message the webhook missed, a delivery tick) is written into it; a chat whose copy
        // was missing a message is asked about every few seconds while it is open, as before.
        const link = copyRef.current?.link
        const conversation = mapRef.current.get(selectedId)
        if (link?.available && conversation) {
          const behind = copyIsBehind(copied, latest)
          if (behind.length > 0) {
            fillCopy(conversation, latest).catch(() => undefined)
            const known = new Set(copied.map((message) => message.id))
            if (copied.length > 0 && behind.some((message) => !known.has(message.id))) {
              behindChats.current.add(selectedId)
            }
          }
        }
      })
      .catch(() => {
        if (!cancelled && copied.length === 0) {
          setActionError("Couldn't load this chat. Try again in a moment.")
        }
      })

    // Other chats of the same parent (an old one under a hidden ID) are read after this one.
    const senderId = mapRef.current.get(selectedId)?.meta.sender.id
    // Only chats on the same number: the chat the parent has on another number is a chat of its own.
    const inboxId = mapRef.current.get(selectedId)?.inbox_id
    if (senderId !== undefined) {
      // The same person under another WhatsApp identity (a hidden ID beside the phone number) is read too, but not a
      // contact of the same lead with another number (a child writing from their own phone is a chat of its own).
      const selectedPhone = getRealPhone(mapRef.current.get(selectedId)?.meta.sender.phone_number)
      const phoneOfContact = new Map<number, string>()
      for (const chat of mapRef.current.values()) {
        const chatPhone = getRealPhone(chat.meta.sender.phone_number)
        if (chatPhone) {
          phoneOfContact.set(chat.meta.sender.id, chatPhone)
        }
      }
      const contactIds = (siblingsRef.current?.get(senderId) ?? [senderId]).filter((contactId) => {
        const theirs = phoneOfContact.get(contactId)
        return contactId === senderId || selectedPhone === null || theirs === undefined || theirs === selectedPhone
      })
      const fromChatwootList = () =>
        Promise.all(contactIds.map((contactId) => client.listContactConversations(contactId))).then((lists) => lists.flat())
      // The copy knows every chat of the contact once it is complete; Chatwoot is asked when it has not got this one.
      const chatsOf = copyRef.current?.link.available
        ? fetchCopyContactChats(contactIds)
            .then((chats) => (chats.some((chat) => chat.id === selectedId) ? chats : fromChatwootList()))
            .catch(fromChatwootList)
        : fromChatwootList()
      chatsOf
        .then((chats) => {
          if (cancelled) {
            return
          }
          setContactChats(chats.map((chat) => ({ id: chat.id, inbox_id: chat.inbox_id, created_at: chat.created_at })))
          olderChats.current = chats
            .filter((chat) => chat.id !== selectedId && (inboxId === undefined || chat.inbox_id === inboxId))
            .map((chat) => chat.id)
            .sort((a, b) => b - a)
          setOlderChatCount(olderChats.current.length)
          newerChats.current = olderChats.current.filter((id) => id > selectedId).slice(0, 3)
          setWatchIds([selectedId, ...newerChats.current])
          for (const id of newerChats.current) {
            client
              .listMessages(id)
              .then((latest) => {
                if (!cancelled) {
                  setMessages((current) => mergeMessages(current, latest))
                }
              })
              .catch(() => undefined)
          }
        })
        .catch(() => undefined)
    }

    let messagesBusy = false
    let round = 0
    const timer = window.setInterval(() => {
      round += 1
      // Live: new messages come by themselves; Chatwoot is only asked now and then, in case one was missed. With the
      // copy but not its live line, every fifth round (15 seconds).
      const behind = behindChats.current.has(selectedId)
      const live = Boolean(copyRef.current?.link.live) && !behind
      const copied = Boolean(copyRef.current?.link.available) && !behind
      if (
        document.hidden ||
        !activeRef.current ||
        messagesBusy ||
        (live && round % LIVE_SAFETY_EVERY !== 0) ||
        (!live && copied && round % COPY_SAFETY_EVERY !== 0)
      ) {
        return
      }
      messagesBusy = true
      client
        .listMessages(selectedId)
        .finally(() => {
          messagesBusy = false
        })
        .then((latest) => {
          if (cancelled || selectedRef.current !== selectedId) {
            return
          }
          setMessages((current) => {
            const known = new Set(current.map((message) => message.id))
            const arrived = latest.filter((message) => message.message_type === 0 && !known.has(message.id))
            if (arrived.length > 0) {
              markSeen(selectedId, arrived)
            }
            return mergeMessages(current, latest)
          })
        })
        .catch(() => undefined)
      for (const id of newerChats.current) {
        client
          .listMessages(id)
          .then((latest) => {
            if (!cancelled && selectedRef.current === selectedId) {
              setMessages((current) => mergeMessages(current, latest))
            }
          })
          .catch(() => undefined)
      }
    }, MESSAGES_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [client, selectedId, markSeen])

  // Live: a new or changed message of the chats on screen arrives the moment the copy has it.
  const watchMessages = copy?.link.watchMessages
  const watchKey = watchIds.join(',')
  useEffect(() => {
    if (!watchMessages || watchKey === '' || !copyLive) {
      return
    }
    const ids = watchKey.split(',').map(Number)
    return watchMessages(ids, (conversationId, message) => {
      const open = selectedRef.current
      if (open === null || !ids.includes(conversationId)) {
        return
      }
      setMessages((current) => {
        const isNew = !current.some((entry) => entry.id === message.id)
        if (isNew && message.message_type === 0 && conversationId === open && activeRef.current && !document.hidden) {
          markSeen(open, [message])
        }
        // A message Chatwoot already gave keeps Chatwoot's version unless the copy's is a change (an edit, a delete).
        const shown = current.find((entry) => entry.id === message.id)
        if (shown && shown.content === message.content && Boolean(shown.content_attributes?.deleted) === Boolean(message.content_attributes?.deleted)) {
          return current
        }
        return mergeMessages(current, [shown ? { ...shown, content: message.content, content_attributes: message.content_attributes } : message])
      })
    })
  }, [watchMessages, watchKey, copyLive, markSeen])

  // A search result: once its chat is open, the messages around the found one are loaded so it can be shown.
  useEffect(() => {
    if (!focus || focus.conversationId !== selectedId || messagesChat !== selectedId) {
      return
    }
    if (messages.some((message) => message.id === focus.messageId)) {
      return
    }
    let cancelled = false
    fetchCopyMessagesAround(focus.conversationId, focus.messageId)
      .then((around) => {
        if (!cancelled && selectedRef.current === focus.conversationId) {
          setMessages((current) => mergeMessages(current, around))
          setOwnHasOlder(true)
          const lowest = around.length > 0 ? Math.min(...around.map((message) => message.id)) : null
          if (lowest !== null && (ownCursor.current === null || lowest < ownCursor.current)) {
            ownCursor.current = lowest
          }
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [focus, selectedId, messagesChat, messages])

  const openAt = useCallback((conversationId: number, messageId: number | null) => {
    setFocus(messageId === null ? null : { conversationId, messageId })
    setSelectedId(conversationId)
  }, [])
  const clearFocus = useCallback(() => setFocus(null), [])
  const focusMessageId = focus && focus.conversationId === selectedId ? focus.messageId : null

  const loadOlder = useCallback(async () => {
    if (selectedId === null) {
      return
    }
    if (ownHasOlder && ownCursor.current !== null) {
      // The copy first (instant); Chatwoot when the copy has fewer than a page (its start, or not copied yet).
      if (copyRef.current?.link.available) {
        const fromCopy = await fetchCopyMessages(selectedId, ownCursor.current).catch(() => null)
        if (fromCopy && fromCopy.complete && fromCopy.messages.length >= 20) {
          ownCursor.current = Math.min(...fromCopy.messages.map((message) => message.id))
          setMessages((current) => mergeMessages(current, fromCopy.messages))
          return
        }
      }
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
        // Shown as a dot, not a number, since nothing new was received.
        await saveAttributesRef.current(conversationId, { crm_marked_unread: true })
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

  useEffect(() => {
    saveAttributesRef.current = saveAttributes
  }, [saveAttributes])

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

  // Pins or unpins a chat for the whole team: pinned chats stay at the top of the list.
  const togglePinned = useCallback(
    async (conversationId: number) => {
      setActionError(null)
      try {
        const pinned = mapRef.current.get(conversationId)?.custom_attributes?.crm_pinned === true
        await saveAttributes(conversationId, { crm_pinned: !pinned })
      } catch {
        setActionError("Couldn't pin this chat. Try again.")
      }
    },
    [saveAttributes],
  )

  // Stars or un-stars one message for the whole team.
  const toggleStar = useCallback(
    async (conversationId: number, messageId: number) => {
      setActionError(null)
      try {
        const starred = mapRef.current.get(conversationId)?.custom_attributes?.crm_starred ?? []
        await saveAttributes(conversationId, {
          crm_starred: starred.includes(messageId) ? starred.filter((id) => id !== messageId) : [...starred, messageId],
        })
      } catch {
        setActionError("Couldn't star this message. Try again.")
      }
    },
    [saveAttributes],
  )

  // Pins or unpins one message at the top of the chat, for the whole team (at most 3, the oldest goes).
  const togglePinMessage = useCallback(
    async (conversationId: number, messageId: number) => {
      setActionError(null)
      try {
        const pinned = mapRef.current.get(conversationId)?.custom_attributes?.crm_pinned_messages
        await saveAttributes(conversationId, { crm_pinned_messages: togglePinnedMessage(pinned, messageId) })
      } catch {
        setActionError("Couldn't pin this message. Try again.")
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

  // Says who is on the other end of the chat: the parent, or the student themself.
  const setChatRole = useCallback(
    async (conversationId: number, role: ChatRole | null, options: { auto?: boolean } = {}) => {
      setActionError(null)
      try {
        await saveAttributes(conversationId, { crm_chat_role: role, ...(options.auto ? { crm_role_auto: true } : {}) })
        return true
      } catch {
        setActionError("Couldn't save who is on this chat. Try again.")
        return false
      }
    },
    [saveAttributes],
  )

  // The students tied to this chat by hand (the whole list, replacing the old one).
  const setStudentLinks = useCallback(
    async (conversationId: number, studentIds: number[]) => {
      setActionError(null)
      try {
        await saveAttributes(conversationId, { crm_student_ids: studentIds })
        return true
      } catch {
        setActionError("Couldn't link this chat to the student. Try again.")
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
        // The message is already posted: a poll that fails (a blip in the connection) is no reason to say it
        // did not go through, so the next poll tries again until the time is up.
        const latest = await client.listMessages(conversationId).catch(() => null)
        if (latest === null) {
          continue
        }
        const message = latest.find((item) => item.id === messageId)
        if (message) {
          if (selectedRef.current === conversationId) {
            setMessages((current) => mergeMessages(current, [message]))
          }
          if (message.status === 'failed') {
            // Why, when the gateway said (a Messenger chat outside Facebook's 24 hours, for one).
            throw Object.assign(new Error('failed'), { reason: message.content_attributes?.external_error ?? null })
          }
          if (message.source_id) {
            return
          }
          // A GoHighLevel reply gets no id; the bridge only marks it failed. Some seconds without that is sent.
          if (
            !confirmsBySource(mapRef.current.get(conversationId)?.meta.sender) &&
            Math.floor(Date.now() / 1000) - message.created_at >= SOCIAL_CONFIRM_SECONDS
          ) {
            return
          }
        }
      }
      throw new Error('timeout')
    },
    [client],
  )

  // After a request that ended with an error, the message may still have been taken by the server (the answer
  // got lost). It is looked for in the chat so it is not sent a second time.
  const findPosted = useCallback(
    async (conversationId: number, item: OutboxItem): Promise<ChatwootMessage | null> => {
      try {
        const latest = await client.listMessages(conversationId)
        return (
          latest.find(
            (message) =>
              message.message_type === 1 &&
              Boolean(message.private) === item.isPrivate &&
              (message.content ?? '').trim() === item.content.trim() &&
              (message.attachments?.length ?? 0) === item.files.length &&
              message.created_at >= item.createdAt - 5,
          ) ?? null
        )
      } catch {
        return null
      }
    },
    [client],
  )

  const runQueue = useCallback(
    async (conversationId: number) => {
      if (running.current.has(conversationId)) {
        return
      }
      running.current.add(conversationId)
      // The message that failed stays on the screen with its text, so it can be tried again; the ones behind it wait.
      const holdBack = (failedId: number | null, text: string) => {
        changeOutbox((items) =>
          items.map((entry) => {
            if (entry.conversationId !== conversationId) {
              return entry
            }
            if (entry.tempId === failedId) {
              return { ...entry, state: 'failed' }
            }
            return entry.state === 'queued' ? { ...entry, state: 'cancelled' } : entry
          }),
        )
        setActionError(text)
      }
      try {
        for (;;) {
          const item = outboxRef.current.find((entry) => entry.conversationId === conversationId && entry.state === 'queued')
          if (!item) {
            return
          }
          changeOutbox((items) => items.map((entry) => (entry.tempId === item.tempId ? { ...entry, state: 'sending' } : entry)))
          let sent: ChatwootMessage | null = null
          try {
            sent = await client.sendMessage(conversationId, {
              content: item.content,
              isPrivate: item.isPrivate,
              files: item.files,
              sender: currentUser,
              replyTo: item.replyTo,
            })
          } catch {
            // The answer may only have got lost on the way back.
            sent = await findPosted(conversationId, item)
            if (sent === null) {
              holdBack(item.tempId, 'A message did not go through. Press "Try again" on it, or remove it. The ones after it are waiting.')
              return
            }
          }
          dropOutboxItems((entry) => entry.tempId === item.tempId)
          if (selectedRef.current === conversationId) {
            setMessages((current) => mergeMessages(current, [sent!]))
          }
          if (!item.isPrivate) {
            const conversation = mapRef.current.get(conversationId)
            patchConversation(conversationId, { waiting_since: 0 })
            // The first person to reply takes the chat, so two people don't answer it.
            if (conversation && getOwner(conversation) === null) {
              void setOwner(conversationId, currentUser)
            }
            try {
              await waitUntilSent(conversationId, sent.id)
            } catch (failure) {
              // The message itself is posted (it is in the chat, with its own mark), so it must not be sent again;
              // only the ones behind it are held back.
              holdBack(
                null,
                failure instanceof Error && failure.message === 'timeout'
                  ? 'WhatsApp has not confirmed the last message yet. Look at the chat before you send it again; the messages after it are waiting.'
                  : 'The last message did not go through, so the ones after it were not sent.',
              )
              return
            }
          }
        }
      } finally {
        running.current.delete(conversationId)
      }
    },
    [changeOutbox, client, currentUser, dropOutboxItems, findPosted, patchConversation, setOwner, waitUntilSent],
  )

  // Puts a message that did not go out (and the ones held back behind it) in the queue again, in the same order.
  const retryUnsent = useCallback(
    (tempId: number) => {
      const target = outboxRef.current.find((entry) => entry.tempId === tempId)
      if (!target) {
        return
      }
      setActionError(null)
      changeOutbox((items) =>
        items.map((entry) =>
          entry.conversationId === target.conversationId && entry.tempId >= tempId && (entry.state === 'failed' || entry.state === 'cancelled')
            ? { ...entry, state: 'queued' }
            : entry,
        ),
      )
      void runQueue(target.conversationId)
    },
    [changeOutbox, runQueue],
  )

  const send = useCallback(
    async (input: SendInput) => {
      if (selectedId === null) {
        return false
      }
      const parts = splitSequence(input.sequence)
      if (parts.length === 0) {
        return false
      }
      setActionError(null)
      const items: OutboxItem[] = parts.map((part, index) => {
        tempCounter.current += 1
        return {
          tempId: tempCounter.current,
          conversationId: selectedId,
          content: part.content,
          files: part.files,
          previewUrls: part.files.map((file) => URL.createObjectURL(file)),
          isPrivate: input.isPrivate,
          replyTo: index === 0 ? input.replyTo : undefined,
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

  // Messages still waiting or on their way are only on this computer: closing or refreshing the page now would lose them.
  const hasUnsent = outbox.length > 0
  useEffect(() => {
    if (!hasUnsent) {
      return undefined
    }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsent])

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

  // Chats the copy's search found (with their newest message): shown in the list straight away.
  const addConversations = useCallback((found: ChatwootConversation[]) => {
    if (found.length > 0) {
      setConversationMap((current) => mergeNewer(current, found))
    }
  }, [])

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
    async (input: { phone: string; name: string; inboxId?: number | null }) => {
      const result = await startChat(client, input)
      if (result.error === null) {
        await Promise.all([refreshStatus('open'), refreshStatus('resolved')])
        // An older chat is not on the pages that were refreshed; it is fetched by its id so it opens.
        await loadMissingConversations([result.conversationId])
        setSelectedId(result.conversationId)
      }
      return result
    },
    [client, refreshStatus, loadMissingConversations],
  )

  return {
    conversations,
    selected,
    selectedId,
    setSelectedId,
    messages,
    messagesChat,
    waitingMessages,
    hasOlder,
    contactChats,
    loadOlder,
    isLoading,
    loadError,
    actionError,
    canLoadMore,
    isLoadingMore,
    loadMore,
    setOwner,
    markUnread,
    togglePinned,
    toggleStar,
    togglePinMessage,
    setLeadLink,
    setStudentLinks,
    setChatRole,
    setStatus,
    send,
    retryUnsent,
    // Waits until WhatsApp has accepted a message that was just posted to a chat.
    waitUntilSent,
    dismissUnsent,
    startNewChat,
    loadMissingConversations,
    addConversations,
    // Opens a chat on one of its messages (a search result), and which message that is.
    openAt,
    focusMessageId,
    clearFocus,
    // The page is reading from the copy and hearing of new messages by itself.
    live: copyLive,
  }
}
