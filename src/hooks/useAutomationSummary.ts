import { useEffect, useState } from 'react'
import { isExpired, isStuck, type AutomationSettings } from '../lib/automationQueue'
import { subscribeAutomationSnapshot } from '../lib/automationSnapshot'

export type AutomationSummary = {
  // Waiting for a person to approve.
  waiting: number
  // Tried and did not go out, or stuck while sending: they need a look.
  failed: number
  sentToday: number
  settings: AutomationSettings
}

// A read-only count of the automation approval queue for the admin's Today. Approving, editing and
// sending stay on the WhatsApp page. It shares one read with the ⚡ window: once a minute while the tab
// is looked at, and at once when it is looked at again.
export function useAutomationSummary(enabled: boolean) {
  const [summary, setSummary] = useState<AutomationSummary | null>(null)
  // Automations may not be set up in the database yet: then there is nothing to show.
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    if (!enabled) {
      return
    }
    return subscribeAutomationSnapshot((result) => {
      if (result.snapshot === null) {
        setUnavailable(true)
        return
      }
      const { queue, settings, sentToday } = result.snapshot
      const now = Date.now()
      setSummary({
        waiting: queue.filter((item) => item.status === 'pending' && !isExpired(item, now)).length,
        failed: queue.filter((item) => item.status === 'failed' || isStuck(item, now)).length,
        sentToday,
        settings,
      })
      setUnavailable(false)
    })
  }, [enabled])

  return { summary, unavailable }
}
