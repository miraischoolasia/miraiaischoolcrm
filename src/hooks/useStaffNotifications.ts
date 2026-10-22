import { useCallback, useEffect, useState } from 'react'
import { everyWhileVisible } from '../lib/visibleTimer'
import { fetchStaffNotifications, markStaffNotificationsRead, type StaffNotification } from '../lib/staffNotifications'

const CHECK_MS = 60_000

// The signed-in person's notes from flows, checked every minute while the page is looked at.
// `available` is false before the database update (no table) or when signed out: then the bell is hidden.
export function useStaffNotifications({ enabled }: { enabled: boolean }) {
  const [items, setItems] = useState<StaffNotification[]>([])
  const [available, setAvailable] = useState(false)

  const reload = useCallback(async () => {
    if (!enabled) {
      return
    }
    try {
      const rows = await fetchStaffNotifications()
      setAvailable(rows !== null)
      setItems(rows ?? [])
    } catch {
      // A failed check keeps what is shown; the next one tries again.
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) {
      setItems([])
      setAvailable(false)
      return
    }
    void reload()
    return everyWhileVisible(() => void reload(), CHECK_MS)
  }, [enabled, reload])

  const markRead = useCallback(
    async (ids: number[] | null) => {
      const readAt = new Date().toISOString()
      // Shown read at once; put back by the reload if the database said no.
      setItems((current) =>
        current.map((item) => (item.readAt === null && (ids === null || ids.includes(item.id)) ? { ...item, readAt } : item)),
      )
      const problem = await markStaffNotificationsRead(ids)
      if (problem) {
        await reload()
      }
      return problem
    },
    [reload],
  )

  const unread = items.filter((item) => item.readAt === null).length
  return { items, unread, available, reload, markRead }
}
