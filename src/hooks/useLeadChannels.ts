import { useCallback, useEffect, useMemo, useState } from 'react'
import { channelsByLead, fetchLeadChannels, type LeadChannel } from '../lib/leadChannels'

const REFRESH_MS = 60_000

// The chats each lead has (WhatsApp numbers, Messenger Pages, Instagram). A read that fails leaves what is
// shown: a database that was not set up for this yet simply has none.
export function useLeadChannels(enabled: boolean) {
  const [rows, setRows] = useState<LeadChannel[]>([])

  const refresh = useCallback(async () => {
    if (!enabled) {
      return
    }
    try {
      setRows(await fetchLeadChannels())
    } catch {
      // Keep what is shown.
    }
  }, [enabled])

  useEffect(() => {
    void refresh()
    if (!enabled) {
      return undefined
    }
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void refresh()
      }
    }, REFRESH_MS)
    const onVisible = () => {
      if (!document.hidden) {
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, refresh])

  const byLead = useMemo(() => channelsByLead(rows), [rows])
  return { rows, byLead, refresh }
}
