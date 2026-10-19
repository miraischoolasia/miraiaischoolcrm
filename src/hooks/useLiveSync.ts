import { useEffect, useRef, type MutableRefObject } from 'react'
import { changedGroups, fetchTableVersions, type CoreSyncTarget, type TableVersions } from '../lib/coreSync'
import { supabase } from '../lib/supabase'

// The tables the CRM page shows. A change in any of them (by someone else, or by a teacher's phone) makes
// the page check straight away, so nobody has to refresh to see it.
export const LIVE_TABLES = [
  'students',
  'classrooms',
  'teachers',
  'leads',
  'lead_options',
  'packages',
  'schedules',
  'schedule_students',
  'schedule_exceptions',
  'trial_bookings',
  'makeup_plans',
  'lesson_logs',
  'lesson_log_student_reviews',
] as const

// While Realtime is not connected the page checks every 30 seconds.
const POLL_MS = 30_000
// While Realtime is connected it reports every change itself; this slow check (every 5 minutes) only
// guards against a change it silently missed.
const SAFETY_EVERY_TICKS = 10
const DEBOUNCE_MS = 400
// Away (tab hidden, or Realtime down) longer than this: everything is read again once, as a safety net.
export const FULL_READ_AFTER_MS = 5 * 60_000
// Hidden this long: the Realtime connection is closed, so a phone in a pocket does not keep reconnecting.
// It opens again the moment the tab is looked at.
export const HIDDEN_DISCONNECT_MS = 60_000

type Channel = ReturnType<NonNullable<typeof supabase>['channel']>

// Keeps the data of the page current without a refresh:
//  - the database tells the page the moment a row changes (Supabase Realtime), and
//  - whenever the tab is looked at again the page checks anyway, and every 30 seconds it checks while
//    Realtime is not connected, so it still catches up. While Realtime is connected the check is only
//    every 5 minutes.
// A check is one small request for each table's change number (crm_table_versions); only the parts of the
// page whose tables changed are read again. Away for over 5 minutes, or before that function exists, the
// check reads everything as it always did. `versions` holds the numbers the data on screen matches; the
// first read of the page fills it in (asked for before the data, so a change made during the read is
// seen next time). `sync` reads what it is told and swaps in what changed; it never runs twice at once.
export function useLiveSync(
  enabled: boolean,
  sync: (target: CoreSyncTarget) => Promise<void>,
  versions: MutableRefObject<TableVersions | null>,
) {
  const syncRef = useRef(sync)
  useEffect(() => {
    syncRef.current = sync
  })

  useEffect(() => {
    if (!enabled) {
      return
    }
    let stopped = false
    let running = false
    let again = false
    let debounce: number | undefined
    let hiddenTimer: number | undefined
    // True while the Realtime channel is connected.
    let live = false
    let ticks = 0
    // Since when the page has not been sure it is current (hidden, or Realtime down); null while it is.
    let awaySince: number | null = null
    // The safety read for this time away has been made.
    let fullDone = false
    let channel: Channel | null = null
    let channelCount = 0

    const markAway = () => {
      if (awaySince === null) {
        awaySince = Date.now()
        fullDone = false
      }
    }

    const catchUp = async () => {
      const full = awaySince !== null && !fullDone && Date.now() - awaySince > FULL_READ_AFTER_MS
      // Asked before the data, so a change made while the data is read shows up in the next check.
      const next = await fetchTableVersions()
      const known = versions.current
      if (full || next === null || known === null) {
        await syncRef.current('all')
        if (full) {
          fullDone = true
        }
      } else {
        const groups = changedGroups(known, next)
        if (groups.size > 0) {
          await syncRef.current(groups)
        }
      }
      // Without an answer the old numbers stay: the next check then reads whatever changed since them.
      if (next !== null) {
        versions.current = next
      }
      // Current again once Realtime reports changes (or there is no Realtime to wait for).
      if (!document.hidden && (live || channel === null)) {
        awaySince = null
      }
    }

    const run = async () => {
      if (stopped || document.hidden) {
        return
      }
      if (running) {
        again = true
        return
      }
      running = true
      try {
        await catchUp()
      } catch {
        // Offline or a hiccup: the next round tries again.
      } finally {
        running = false
        if (again && !stopped) {
          again = false
          void run()
        }
      }
    }
    const soon = () => {
      window.clearTimeout(debounce)
      debounce = window.setTimeout(() => void run(), DEBOUNCE_MS)
    }

    const subscribe = () => {
      if (!supabase || channel) {
        return
      }
      try {
        // A new name each time, so a channel still closing is never handed back.
        channelCount += 1
        let next = supabase.channel(`crm-live-${channelCount}`)
        for (const table of LIVE_TABLES) {
          next = next.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
            // A hidden tab catches up when it is looked at again.
            if (!document.hidden) {
              soon()
            }
          })
        }
        const mine = next
        channel = mine
        mine.subscribe((status: string) => {
          if (stopped || channel !== mine) {
            return
          }
          if (status === 'SUBSCRIBED') {
            live = true
            // Changes made while it was connecting are not reported, so check once.
            soon()
          } else {
            live = false
            markAway()
          }
        })
      } catch {
        // Realtime unavailable: the 30-second check still keeps the page current.
        channel = null
      }
    }
    const unsubscribe = () => {
      const old = channel
      channel = null
      live = false
      if (old && supabase) {
        void supabase.removeChannel(old)
      }
    }

    // Looking at the tab fires both "visible" and "focus": one debounced check covers both.
    const onVisible = () => {
      if (document.hidden) {
        return
      }
      window.clearTimeout(hiddenTimer)
      subscribe()
      soon()
    }
    const onVisibility = () => {
      if (document.hidden) {
        markAway()
        window.clearTimeout(hiddenTimer)
        hiddenTimer = window.setTimeout(() => {
          if (document.hidden) {
            unsubscribe()
          }
        }, HIDDEN_DISCONNECT_MS)
      } else {
        onVisible()
      }
    }

    const timer = window.setInterval(() => {
      if (document.hidden) {
        return
      }
      ticks += 1
      if (!live || ticks % SAFETY_EVERY_TICKS === 0) {
        void run()
      }
    }, POLL_MS)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onVisible)
    if (document.hidden) {
      onVisibility()
    }
    subscribe()

    return () => {
      stopped = true
      window.clearInterval(timer)
      window.clearTimeout(debounce)
      window.clearTimeout(hiddenTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onVisible)
      unsubscribe()
    }
  }, [enabled, versions])
}
