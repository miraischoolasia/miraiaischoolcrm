import { useEffect, useRef, useState } from 'react'
import type { ChatwootClient } from '../lib/chatwootClient'
import { isSoundOn, playBeep, showDesktopAlert } from '../lib/inboxAlerts'
import { countUnread, getChatIdentity, getPreview } from '../lib/whatsappInbox'

const REFRESH_MS = 10_000

// Counts chats nobody has looked at for the sidebar badge, and tells the team
// when a new message arrives (sound and a desktop pop-up), wherever they are in
// the app.
export function useWhatsAppUnread(client: ChatwootClient | null) {
  const [unread, setUnread] = useState(0)
  const seenUnread = useRef<Map<number, number> | null>(null)

  useEffect(() => {
    if (!client) {
      return
    }
    let cancelled = false

    async function refresh() {
      try {
        const { conversations } = await client!.listConversations('open', 1)
        if (cancelled) {
          return
        }
        setUnread(countUnread(conversations))

        const previous = seenUnread.current
        const next = new Map(conversations.map((c) => [c.id, c.unread_count]))
        seenUnread.current = next
        if (!previous) {
          return
        }
        const fresh = conversations.filter((c) => c.unread_count > (previous.get(c.id) ?? 0))
        if (fresh.length > 0) {
          if (isSoundOn()) {
            playBeep()
          }
          const newest = fresh[0]
          showDesktopAlert(
            `New WhatsApp message: ${getChatIdentity(newest.meta.sender).title}`,
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
  }, [client])

  return { unread }
}
