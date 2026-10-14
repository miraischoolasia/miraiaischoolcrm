import { useEffect, useRef, useState } from 'react'
import type { ChatwootClient } from '../lib/chatwootClient'
import { isSoundOn, playAlertSound, showDesktopAlert } from '../lib/inboxAlerts'
import {
  countUnread,
  getChatIdentity,
  getPreview,
  isOverdue,
  isOnAllowedNumber,
  isRecentlyOverdue,
  onePerParent,
} from '../lib/whatsappInbox'

const REFRESH_MS = 10_000

// Counts chats nobody has looked at for the sidebar badge, and tells the team
// when a new message arrives (sound and a desktop pop-up), wherever they are in
// the app.
export function useWhatsAppUnread(client: ChatwootClient | null, allowedInboxIds: number[] | null = null) {
  const [unread, setUnread] = useState(0)
  // Parents who have waited over 30 minutes (but under a day) for an answer.
  const [waiting, setWaiting] = useState(0)
  const seenUnread = useRef<Map<number, number> | null>(null)
  const overdueIds = useRef<Set<number> | null>(null)

  useEffect(() => {
    if (!client) {
      return
    }
    let cancelled = false

    async function refresh() {
      try {
        const { conversations: everyChat } = await client!.listConversations('open', 1)
        const conversations = onePerParent(everyChat.filter((entry) => isOnAllowedNumber(entry, allowedInboxIds)))
        if (cancelled) {
          return
        }
        setUnread(countUnread(conversations))

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

  return { unread, waiting }
}
