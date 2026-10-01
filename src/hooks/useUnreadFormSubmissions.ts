import { useCallback, useEffect, useState } from 'react'
import { countFormSubmissionsSince } from '../lib/api'

const SEEN_KEY = 'mirai-forms-seen-at'
const REFRESH_MS = 60_000

function readSeenAt() {
  try {
    const stored = window.localStorage.getItem(SEEN_KEY)
    if (stored) {
      return stored
    }
    // First visit on this browser: only submissions from now on are "new".
    const now = new Date().toISOString()
    window.localStorage.setItem(SEEN_KEY, now)
    return now
  } catch {
    return new Date().toISOString()
  }
}

// How many form submissions arrived since this browser last opened the
// Submissions tab. Kept per browser; it only drives the badge on the menu.
export function useUnreadFormSubmissions(enabled: boolean) {
  const [unread, setUnread] = useState(0)

  const refresh = useCallback(async () => {
    if (document.hidden) {
      return
    }
    try {
      setUnread(await countFormSubmissionsSince(readSeenAt()))
    } catch {
      // Forms not set up yet, or offline: show no badge rather than an error.
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      return
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [enabled, refresh])

  const markSeen = useCallback((newestIso: string) => {
    try {
      const current = window.localStorage.getItem(SEEN_KEY)
      if (!current || Date.parse(newestIso) > Date.parse(current)) {
        window.localStorage.setItem(SEEN_KEY, newestIso)
      }
    } catch {
      // Without storage the badge simply comes back on the next check.
    }
    setUnread(0)
  }, [])

  return { unread, markSeen }
}
