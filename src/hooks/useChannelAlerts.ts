import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  parseWhatsAppStatus,
  whatsAppNumberAlerts,
  type ChannelAlert,
  type WhatsAppNumberStatus,
} from '../lib/channelAlerts'

// How often the page looks again while it is open and showing (the server writes the state; this only reads it).
export const CHANNEL_ALERTS_EVERY_MS = 2 * 60_000

// The status columns the WhatsApp server's checker (wa-watch) writes into whatsapp_numbers (all in one place, so a
// rename is one line). Their migration is the server team's.
const STATUS_COLUMNS = {
  status: 'status',
  reason: 'status_reason',
  changedAt: 'status_changed_at',
  checkedAt: 'status_checked_at',
  lastMessage: 'last_message_at',
} as const

type Row = Record<string, unknown> & {
  label: string
  phone: string | null
  chatwoot_inbox_id: number
  evolution_instance: string | null
  is_active: boolean
}

export function toNumberStatus(row: Row): WhatsAppNumberStatus {
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null)
  return {
    inboxId: row.chatwoot_inbox_id,
    label: row.label,
    phone: row.phone,
    instance: row.evolution_instance,
    isActive: row.is_active,
    status: parseWhatsAppStatus(row[STATUS_COLUMNS.status]),
    reason: text(row[STATUS_COLUMNS.reason]),
    changedAt: text(row[STATUS_COLUMNS.changedAt]),
    checkedAt: text(row[STATUS_COLUMNS.checkedAt]),
    lastMessageAt: text(row[STATUS_COLUMNS.lastMessage]),
  }
}

// The WhatsApp numbers with their state. [] on a database whose server does not write the state yet (the
// columns are missing), so nothing shows until it does.
export async function fetchNumberStatuses(): Promise<WhatsAppNumberStatus[]> {
  if (!supabase) {
    return []
  }
  const columns = ['label', 'phone', 'chatwoot_inbox_id', 'evolution_instance', 'is_active', ...Object.values(STATUS_COLUMNS)]
  // The status columns are newer than src/types/database.ts.
  const from = supabase.from as unknown as (table: string) => {
    select: (columns: string) => PromiseLike<{ data: unknown; error: { code?: string } | null }>
  }
  const { data, error } = await from.call(supabase, 'whatsapp_numbers').select(columns.join(', '))
  if (error) {
    return []
  }
  return ((data ?? []) as Row[]).map(toNumberStatus)
}

// The channel alerts this person should see. allowedInboxIds: the numbers they work on (null = all; undefined
// while not known yet, then nothing shows). isAdmin: also told when the checker itself stopped. load: where the
// numbers come from (the tests pass their own).
export function useChannelAlerts(
  enabled: boolean,
  allowedInboxIds: number[] | null | undefined,
  isAdmin: boolean,
  load: () => Promise<WhatsAppNumberStatus[]> = fetchNumberStatuses,
) {
  const [statuses, setStatuses] = useState<WhatsAppNumberStatus[]>([])
  const [now, setNow] = useState(() => Date.now())

  const refresh = useCallback(() => {
    void load()
      .then((next) => {
        setStatuses(next)
        setNow(Date.now())
      })
      .catch(() => undefined)
  }, [load])

  useEffect(() => {
    if (!enabled) {
      return
    }
    refresh()
    // Only while the tab is showing: a hidden tab asks nothing, and looks again as soon as it is back.
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }, CHANNEL_ALERTS_EVERY_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [enabled, refresh])

  const alerts: ChannelAlert[] = useMemo(
    () => (enabled && allowedInboxIds !== undefined ? whatsAppNumberAlerts(statuses, allowedInboxIds, isAdmin, now) : []),
    [enabled, allowedInboxIds, isAdmin, statuses, now],
  )

  // The Inbox's number buttons: inbox id -> the problem, for the red dot.
  const problemOf = useMemo(() => new Map(alerts.flatMap((alert) => (alert.inboxId ? [[alert.inboxId, alert] as const] : []))), [alerts])

  return { alerts, problemOf, refresh }
}
