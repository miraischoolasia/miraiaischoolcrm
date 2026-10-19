import { useEffect, useRef, useState } from 'react'
import type { ChatwootClient } from '../lib/chatwootClient'
import { isSoundOn, playAlertSound, showDesktopAlert } from '../lib/inboxAlerts'
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

export function deepEveryRounds(pages: number) {
  return Math.max(3, Math.ceil(pages / 3))
}

const NO_UNREAD: Record<InboxCategory, number> = { whatsapp: 0, messenger: 0, instagram: 0 }

// Reads pages 2..pages a few at a time (the gateway refuses a burst), each tried twice.
async function readPages(client: ChatwootClient, pages: number, cancelled: () => boolean) {
  const found: ChatwootConversation[] = []
  for (let start = 2; start <= pages && !cancelled(); start += PARALLEL_PAGES) {
    const batch = Array.from({ length: Math.min(PARALLEL_PAGES, pages - start + 1) }, (_, index) => start + index)
    const results = await Promise.all(
      batch.map((page) => client.listConversations('open', page).catch(() => client.listConversations('open', page))),
    )
    found.push(...results.flatMap((result) => result.conversations))
  }
  return found
}

// Counts chats nobody has looked at for the sidebar badge, and tells the team
// when a new message arrives (sound and a desktop pop-up), wherever they are in
// the app.
export function useWhatsAppUnread(
  client: ChatwootClient | null,
  allowedInboxIds: number[] | null = null,
  // Contacts the CRM knows to be one person (see contactSiblings): their chats count as one.
  siblings?: Map<number, number[]>,
  // The inbox copy is live (it reports each new message): the full read of every page can be four times rarer.
  slowFullRead = false,
) {
  const slowRef = useRef(slowFullRead)
  useEffect(() => {
    slowRef.current = slowFullRead
  }, [slowFullRead])
  const siblingsRef = useRef(siblings)
  useEffect(() => {
    siblingsRef.current = siblings
  }, [siblings])
  const [counts, setCounts] = useState<UnreadCounts>({ total: 0, byCategory: NO_UNREAD })
  // Every open chat as last read (the first page fresh, the rest from the last full read), for the Inbox's buttons.
  const [openChats, setOpenChats] = useState<ChatwootConversation[]>([])
  // Parents who have waited over 30 minutes (but under a day) for an answer.
  const [waiting, setWaiting] = useState(0)
  const seenUnread = useRef<Map<number, number> | null>(null)
  const overdueIds = useRef<Set<number> | null>(null)

  useEffect(() => {
    if (!client) {
      return
    }
    let cancelled = false
    let round = 0
    const deepChats = { current: [] as ChatwootConversation[] }

    async function refresh() {
      try {
        const first = await client!.listConversations('open', 1)
        const everyChat = first.conversations
        const conversations = onePerParent(
          everyChat.filter((entry) => isOnAllowedNumber(entry, allowedInboxIds)),
          siblingsRef.current,
        )
        if (cancelled) {
          return
        }
        // The badge counts the chats beyond the first page too: all of them, read less often (and not while
        // the tab is hidden, when nobody sees the number).
        const pages = Math.min(MAX_PAGES, Math.ceil((first.totalCount ?? 0) / PAGE_SIZE))
        const publish = () => {
          const onFirstPage = new Set(everyChat.map((entry) => entry.id))
          const counted = [...everyChat, ...deepChats.current.filter((entry) => !onFirstPage.has(entry.id))]
          setOpenChats(counted)
          setCounts(countUnreadAcross(counted, [], allowedInboxIds, siblingsRef.current))
        }
        // The fresh first page shows at once; the full read (seconds, with many pages) updates it after.
        publish()
        if (pages <= 1) {
          deepChats.current = []
        } else if (round % (deepEveryRounds(pages) * (slowRef.current ? 4 : 1)) === 0 && (round === 0 || !document.hidden)) {
          try {
            deepChats.current = await readPages(client!, pages, () => cancelled)
          } catch {
            // Keep what was counted last time.
          }
          if (cancelled) {
            return
          }
          publish()
        }
        round += 1

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
          showDesktopAlert(
            `New message: ${getChatIdentity(newest.meta.sender, null, newest.meta.channel).title}`,
            getPreview(newest) || 'New message',
          )
        }
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
  }, [client, JSON.stringify(allowedInboxIds)])

  return { unread: counts.total, unreadByCategory: counts.byCategory, openChats, waiting }
}
