import { useEffect, useRef, useState } from 'react'
import { keepIfSame } from '../lib/sameData'
import type { ChatwootClient } from '../lib/chatwootClient'
import { isSoundOn, playAlertSound, showDesktopAlert } from '../lib/inboxAlerts'
import { fetchBadgeChats, fetchBadgeChatsChangedSince, fillCopy } from '../lib/inboxCopyReader'
import type { InboxCopyLive } from './useInboxCopyLive'
import {
  countUnreadAcross,
  getChatIdentity,
  getPreview,
  isOverdue,
  isOnAllowedNumber,
  isRecentlyOverdue,
  onePerParent,
  type ChatwootConversation,
  type InboxCategory,
  type UnreadCounts,
} from '../lib/whatsappInbox'

const REFRESH_MS = 10_000
// Chatwoot's page size. The first page is read every round; every other page of open chats is read again now and
// then, so the count covers all of them, not only the newest (EduHero has 36 pages of open chats). The more pages
// there are, the less often: at least every 3 rounds (30 seconds), one round more per 3 pages (36 pages: 2 minutes).
const PAGE_SIZE = 25
const MAX_PAGES = 80
const PARALLEL_PAGES = 3

// With the CRM's copy of the inbox (2026-10-20: reading every page of Chatwoot's list from every tab took 96% of
// Chatwoot's time): the open chats come from the copy. Only a few fields of each are read (fetchBadgeChats, 2026-10-23:
// reading them whole, raw JSON and all, from every tab was the heaviest read of EduHero's database). While the Inbox
// page is open its live line brings each change by itself and the list is read again rarely; elsewhere the live line
// is closed and only the chats changed since the last look are read, every half minute (the whole light list again
// every 10 minutes, in case). Chatwoot's first page is looked at once a minute by one tab of the browser, for what
// Chatwoot does not report (a chat read in Chatwoot itself).
const COPY_REREAD_MS = 10 * 60_000
const COPY_TICK_MS = 30_000
// The database clock and this computer's may differ a little: catch up from a bit earlier.
const CLOCK_SLACK_MS = 2 * 60_000
const CHATWOOT_CHECK_MS = 60_000
const CHATWOOT_CHECK_KEY = 'crm-chatwoot-open-check'
// At most this many chats a check puts right in the copy (their unread count, owner, status).
const MAX_FIXES_PER_CHECK = 10

export function deepEveryRounds(pages: number) {
  return Math.max(3, Math.ceil(pages / 3))
}

// This tab may look at Chatwoot now: no tab of this browser did in the last minute (claims it if so).
export function claimChatwootCheck(now = Date.now()) {
  try {
    const last = Number(window.localStorage.getItem(CHATWOOT_CHECK_KEY) ?? 0)
    if (now - last < CHATWOOT_CHECK_MS - 5_000) {
      return false
    }
    window.localStorage.setItem(CHATWOOT_CHECK_KEY, String(now))
    return true
  } catch {
    return true
  }
}

const NO_UNREAD: Record<InboxCategory, number> = { whatsapp: 0, messenger: 0, instagram: 0 }

// Reads pages 2..pages a few at a time (the gateway refuses a burst), each tried twice. A page that still fails is
// left out (complete: false) instead of losing every page read: on a busy Chatwoot one slow page used to leave a
// tab that had never read them all with the first 25 chats only (EduHero, 2026-10-20: a new account saw 2 Messenger
// chats where the admin saw 99+).
export async function readPages(client: Pick<ChatwootClient, 'listConversations'>, pages: number, cancelled: () => boolean) {
  const found: ChatwootConversation[] = []
  let complete = true
  for (let start = 2; start <= pages && !cancelled(); start += PARALLEL_PAGES) {
    const batch = Array.from({ length: Math.min(PARALLEL_PAGES, pages - start + 1) }, (_, index) => start + index)
    const results = await Promise.all(
      batch.map((page) =>
        client
          .listConversations('open', page)
          .catch(() => client.listConversations('open', page))
          .catch(() => null),
      ),
    )
    for (const result of results) {
      if (result) {
        found.push(...result.conversations)
      } else {
        complete = false
      }
    }
  }
  return { found, complete }
}

// What Chatwoot says that the copy has another way (it does not report a chat read in Chatwoot itself).
function differs(copy: ChatwootConversation, chatwoot: ChatwootConversation) {
  return (
    copy.unread_count !== chatwoot.unread_count ||
    copy.status !== chatwoot.status ||
    copy.waiting_since !== chatwoot.waiting_since ||
    JSON.stringify(copy.custom_attributes ?? null) !== JSON.stringify(chatwoot.custom_attributes ?? null)
  )
}

// Counts chats nobody has looked at for the sidebar badge, and tells the team
// when a new message arrives (sound and a desktop pop-up), wherever they are in
// the app.
export function useWhatsAppUnread(
  client: ChatwootClient | null,
  allowedInboxIds: number[] | null = null,
  // Contacts the CRM knows to be one person (see contactSiblings): their chats count as one.
  siblings?: Map<number, number[]>,
  // The CRM's copy of the inbox: once available the open chats come from it, not from Chatwoot's pages.
  copy: InboxCopyLive | null = null,
  // Numbers of the other inbox, never counted here (see inboxZones.ts).
  excludedInboxIds: readonly number[] = [],
) {
  const excludedRef = useRef(excludedInboxIds)
  excludedRef.current = excludedInboxIds
  const siblingsRef = useRef(siblings)
  useEffect(() => {
    siblingsRef.current = siblings
  }, [siblings])
  const [counts, setCounts] = useState<UnreadCounts>({ total: 0, byCategory: NO_UNREAD })
  // Every open chat as last read, for the Inbox's list and buttons.
  const [openChats, setOpenChats] = useState<ChatwootConversation[]>([])
  // Parents who have waited over 30 minutes (but under a day) for an answer.
  const [waiting, setWaiting] = useState(0)
  const seenUnread = useRef<Map<number, number> | null>(null)
  const overdueIds = useRef<Set<number> | null>(null)
  const copyAvailable = copy?.available ?? false
  const subscribeChats = copy?.subscribeChats

  // A new list of open chats: the badge, the 30-minute bell and the new-message bell.
  const publishRef = useRef<(chats: ChatwootConversation[]) => void>(() => undefined)
  publishRef.current = (everyChat: ChatwootConversation[]) => {
    setOpenChats(keepIfSame(everyChat))
    setCounts(keepIfSame(countUnreadAcross(everyChat, [], allowedInboxIds, siblingsRef.current, excludedRef.current)))
    const conversations = onePerParent(
      everyChat.filter((entry) => isOnAllowedNumber(entry, allowedInboxIds, excludedRef.current)),
      siblingsRef.current,
    )
    // A chat that has just passed 30 minutes unanswered rings once. The first look
    // only records who is already late, so opening the page is not a burst of alerts.
    const nowSeconds = Math.floor(Date.now() / 1000)
    setWaiting(conversations.filter((c) => isRecentlyOverdue(c, nowSeconds)).length)
    const lateNow = new Set(conversations.filter((c) => isOverdue(c, nowSeconds)).map((c) => c.id))
    const lateBefore = overdueIds.current
    overdueIds.current = lateNow
    const newlyLate = lateBefore ? conversations.filter((c) => lateNow.has(c.id) && !lateBefore.has(c.id)) : []

    const previous = seenUnread.current
    const next = new Map(conversations.map((c) => [c.id, c.unread_count]))
    seenUnread.current = next
    if (newlyLate.length > 0) {
      if (isSoundOn()) {
        playAlertSound()
      }
      showDesktopAlert(
        `Waiting over 30 minutes: ${getChatIdentity(newlyLate[0].meta.sender, null, newlyLate[0].meta.channel).title}`,
        newlyLate.length > 1 ? `And ${newlyLate.length - 1} more chats have not been answered.` : 'This parent has not been answered yet.',
      )
    }
    if (!previous) {
      return
    }
    const fresh = conversations.filter((c) => c.unread_count > (previous.get(c.id) ?? 0))
    if (fresh.length > 0) {
      if (isSoundOn()) {
        playAlertSound()
      }
      const newest = fresh[0]
      showDesktopAlert(`New message: ${getChatIdentity(newest.meta.sender, null, newest.meta.channel).title}`, getPreview(newest) || 'New message')
    }
  }

  // From the copy: read whole once, then kept up to date by its live line.
  useEffect(() => {
    if (!client || !copyAvailable || !subscribeChats) {
      return
    }
    let cancelled = false
    const chats = new Map<number, ChatwootConversation>()
    let ready = false
    const publish = () => {
      if (ready && !cancelled) {
        publishRef.current([...chats.values()].sort((a, b) => (b.last_activity_at ?? 0) - (a.last_activity_at ?? 0)))
      }
    }

    let readAt = 0
    async function readCopy() {
      const startedAt = Date.now()
      try {
        const found = await fetchBadgeChats()
        if (cancelled) {
          return
        }
        chats.clear()
        for (const conversation of found) {
          chats.set(conversation.id, conversation)
        }
        readAt = startedAt
        ready = true
        publish()
      } catch {
        // Keep what was counted last time; the next read tries again.
      }
    }

    // Only the chats changed since the last read (a few, light); too many: the whole light list again.
    async function catchUp() {
      if (!ready) {
        return readCopy()
      }
      const startedAt = Date.now()
      try {
        const { changed, complete } = await fetchBadgeChatsChangedSince(new Date(readAt - CLOCK_SLACK_MS).toISOString())
        if (cancelled) {
          return
        }
        if (!complete) {
          return readCopy()
        }
        for (const conversation of changed) {
          if (conversation.status !== 'open') {
            chats.delete(conversation.id)
          } else {
            // A chat the live line brought whole keeps its whole shape; the counted fields come from the light row.
            const known = chats.get(conversation.id)
            chats.set(conversation.id, known ? { ...known, ...conversation, meta: known.meta } : conversation)
          }
        }
        readAt = startedAt
        if (changed.length > 0) {
          publish()
        }
      } catch {
        // The next tick tries again.
      }
    }

    // Chatwoot's first page, by one tab of the browser a minute: what it says differently (a chat read in Chatwoot,
    // so the copy was not told) is shown, and put right in the copy for everybody.
    async function checkChatwoot() {
      if (document.hidden || !claimChatwootCheck()) {
        return
      }
      try {
        const first = await client!.listConversations('open', 1)
        if (cancelled || !ready) {
          return
        }
        const open = first.conversations.filter((conversation) => conversation.status === 'open')
        const fixes = open.filter((conversation) => {
          const known = chats.get(conversation.id)
          return !known || differs(known, conversation)
        })
        for (const conversation of open) {
          const known = chats.get(conversation.id)
          chats.set(conversation.id, known ? { ...known, ...conversation, last_non_activity_message: conversation.last_non_activity_message ?? known.last_non_activity_message } : conversation)
        }
        publish()
        for (const conversation of fixes.slice(0, MAX_FIXES_PER_CHECK)) {
          const newest = conversation.last_non_activity_message
          fillCopy(conversation, newest ? [newest] : []).catch(() => undefined)
        }
      } catch {
        // Chatwoot busy or down: the copy is what there is.
      }
    }

    const stop = subscribeChats((conversation) => {
      if (conversation.status === 'open') {
        chats.set(conversation.id, conversation)
      } else {
        chats.delete(conversation.id)
      }
      publish()
    })
    void readCopy()
    let lastRead = Date.now()
    const timer = window.setInterval(() => {
      if (document.hidden) {
        return
      }
      if (Date.now() - lastRead >= COPY_REREAD_MS) {
        lastRead = Date.now()
        void readCopy()
      } else {
        // What changed since (a few light rows). Also while an Inbox page is on screen: its live line hears only
        // that page's numbers, and the other Inbox's badge must move too.
        void catchUp()
      }
      void checkChatwoot()
    }, COPY_TICK_MS)
    return () => {
      cancelled = true
      stop()
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, copyAvailable, subscribeChats, JSON.stringify(allowedInboxIds), excludedInboxIds.join(',')])

  // Without the copy (not in this database yet, or not complete yet): Chatwoot's pages, as before.
  useEffect(() => {
    if (!client || copyAvailable) {
      return
    }
    let cancelled = false
    let round = 0
    const deepChats = { current: [] as ChatwootConversation[] }

    async function refresh() {
      try {
        const first = await client!.listConversations('open', 1)
        const everyChat = first.conversations
        if (cancelled) {
          return
        }
        // The badge counts the chats beyond the first page too: all of them, read less often (and not while
        // the tab is hidden, when nobody sees the number).
        const pages = Math.min(MAX_PAGES, Math.ceil((first.totalCount ?? 0) / PAGE_SIZE))
        const counted = () => {
          const onFirstPage = new Set(everyChat.map((entry) => entry.id))
          return [...everyChat, ...deepChats.current.filter((entry) => !onFirstPage.has(entry.id))]
        }
        if (pages <= 1) {
          deepChats.current = []
        } else if (round % deepEveryRounds(pages) === 0 && (round === 0 || !document.hidden)) {
          const read = await readPages(client!, pages, () => cancelled)
          if (read.complete) {
            deepChats.current = read.found
          } else {
            // Some pages did not come: what they held last time stays, what came is fresh.
            const merged = new Map(deepChats.current.map((entry) => [entry.id, entry]))
            for (const entry of read.found) {
              merged.set(entry.id, entry)
            }
            deepChats.current = [...merged.values()]
          }
          if (cancelled) {
            return
          }
        }
        round += 1
        publishRef.current(counted())
      } catch {
        // The inbox may be switched off or the gateway down: show no badge.
      }
    }

    void refresh()
    const timer = window.setInterval(() => void refresh(), REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, copyAvailable, JSON.stringify(allowedInboxIds), excludedInboxIds.join(',')])

  return { unread: counts.total, unreadByCategory: counts.byCategory, openChats, waiting }
}
