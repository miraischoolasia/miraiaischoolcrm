import { useCallback, useEffect, useState } from 'react'
import {
  deleteCalendarItem,
  fetchCalendarItems,
  itemDraftError,
  saveCalendarItem,
  setCalendarItemDone,
  type CalendarItem,
  type CalendarItemDraft,
} from '../lib/calendarItems'

const REFRESH_MS = 60_000

function failureText(failure: unknown) {
  const message = failure instanceof Error ? failure.message : (failure as { message?: string } | null)?.message
  return message && message.trim() ? message : 'Could not save. Try again.'
}

// The tasks, Zoom meetings and events on the calendar. A read that fails leaves the calendar as it was:
// a database that has not been set up for these yet simply has none.
export function useCalendarItems(enabled: boolean, teacherId: number | null) {
  const [items, setItems] = useState<CalendarItem[]>([])

  const reload = useCallback(async () => {
    if (!enabled) {
      return
    }
    try {
      setItems(await fetchCalendarItems())
    } catch {
      // Keep what is shown.
    }
  }, [enabled])

  useEffect(() => {
    void reload()
    if (!enabled) {
      return undefined
    }
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        void reload()
      }
    }, REFRESH_MS)
    const onVisible = () => {
      if (!document.hidden) {
        void reload()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, reload])

  // Each resolves to an error message, or null when it worked.
  const save = useCallback(
    async (existing: CalendarItem | null, draft: CalendarItemDraft) => {
      const problem = itemDraftError(draft)
      if (problem) {
        return problem
      }
      try {
        await saveCalendarItem(existing, draft, teacherId)
        await reload()
        return null
      } catch (failure) {
        return failureText(failure)
      }
    },
    [reload, teacherId],
  )

  const setDone = useCallback(
    async (id: number, isDone: boolean) => {
      try {
        await setCalendarItemDone(id, isDone)
        await reload()
        return null
      } catch (failure) {
        return failureText(failure)
      }
    },
    [reload],
  )

  const remove = useCallback(
    async (id: number) => {
      try {
        await deleteCalendarItem(id)
        await reload()
        return null
      } catch (failure) {
        return failureText(failure)
      }
    },
    [reload],
  )

  return { items, reload, save, setDone, remove }
}
