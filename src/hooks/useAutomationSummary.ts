import { useEffect, useState } from 'react'
import {
  DEFAULT_SETTINGS,
  fetchQueue,
  fetchSentToday,
  fetchSettings,
  isExpired,
  isStuck,
  type AutomationSettings,
} from '../lib/automationQueue'

const REFRESH_MS = 60_000

export type AutomationSummary = {
  // Waiting for a person to approve.
  waiting: number
  // Tried and did not go out, or stuck while sending: they need a look.
  failed: number
  sentToday: number
  settings: AutomationSettings
}

// A read-only count of the automation approval queue for the admin's Today. Approving, editing and
// sending stay on the WhatsApp page.
export function useAutomationSummary(enabled: boolean) {
  const [summary, setSummary] = useState<AutomationSummary | null>(null)
  // Automations may not be set up in the database yet: then there is nothing to show.
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    if (!enabled) {
      return
    }
    let cancelled = false

    // The first look always happens; the timer skips a tab nobody is looking at.
    async function refresh(fromTimer = false) {
      if (fromTimer && document.hidden) {
        return
      }
      try {
        const [queue, settings, sentToday] = await Promise.all([fetchQueue(), fetchSettings(), fetchSentToday()])
        if (cancelled) {
          return
        }
        const now = Date.now()
        setSummary({
          waiting: queue.filter((item) => item.status === 'pending' && !isExpired(item, now)).length,
          failed: queue.filter((item) => item.status === 'failed' || isStuck(item, now)).length,
          sentToday,
          settings: settings ?? DEFAULT_SETTINGS,
        })
        setUnavailable(false)
      } catch {
        if (!cancelled) {
          setUnavailable(true)
        }
      }
    }

    void refresh()
    const timer = window.setInterval(() => void refresh(true), REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [enabled])

  return { summary, unavailable }
}
