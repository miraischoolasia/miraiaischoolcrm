import { useCallback, useEffect, useRef, useState } from 'react'
import type { CalendarItem } from '../lib/calendarItems'
import { dueFollowUps } from '../lib/followUps'
import { isSoundOn, playAlertSound, showDesktopAlert } from '../lib/inboxAlerts'

const SNOOZE_KEY = 'followup-snoozed-until'
const CHECK_MS = 20_000

function readSnoozed(): Record<number, number> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SNOOZE_KEY) ?? '{}') as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<number, number>) : {}
  } catch {
    return {}
  }
}

function writeSnoozed(value: Record<number, number>) {
  try {
    window.localStorage.setItem(SNOOZE_KEY, JSON.stringify(value))
  } catch {
    // Private windows can refuse storage; the snooze just lasts until the page is reloaded.
  }
}

// The follow-ups of the signed-in person whose time has come. Each one rings once (sound and a desktop pop-up) when
// it falls due, and again when a snooze runs out; the page checks every 20 seconds and when it comes back into view.
export function useFollowUpReminders(items: CalendarItem[], meId: number | null, now: () => Date = () => new Date()) {
  const [snoozed, setSnoozed] = useState<Record<number, number>>(readSnoozed)
  const [moment, setMoment] = useState(() => now())
  const rung = useRef<Set<number>>(new Set())

  useEffect(() => {
    const check = () => setMoment(now())
    const timer = window.setInterval(check, CHECK_MS)
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [now])

  const due = dueFollowUps(items, meId, moment, snoozed)

  // Rings for the ones that have just fallen due. What was already due when the page opened rings once too.
  const dueKey = due.map((entry) => entry.id).join(',')
  useEffect(() => {
    const fresh = due.filter((entry) => !rung.current.has(entry.id))
    // A follow-up put off rings again later, so forget it while it waits.
    rung.current = new Set([...rung.current].filter((id) => due.some((entry) => entry.id === id)))
    if (fresh.length === 0) {
      return
    }
    fresh.forEach((entry) => rung.current.add(entry.id))
    if (isSoundOn()) {
      playAlertSound()
    }
    showDesktopAlert(
      fresh[0].title,
      fresh.length > 1 ? `And ${fresh.length - 1} more follow-ups are due.` : fresh[0].notes || 'Time to write to this parent again.',
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueKey])

  const snooze = useCallback((id: number, until: number) => {
    setSnoozed((current) => {
      const next = { ...current, [id]: until }
      writeSnoozed(next)
      return next
    })
  }, [])

  return { due, snooze }
}
