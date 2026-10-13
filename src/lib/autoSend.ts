import type { Database } from '../types/database'
import { supabase } from './supabase'

// The rules for messages that go out by themselves (flows set to "Send by itself"): one switch to stop
// everything, how many a day, the pause between two, and the hours of the day. The database enforces
// them; this is where an admin sees and changes them.

export type AutoSendSettings = {
  paused: boolean
  dailyCap: number
  gapSeconds: number
  // Whole hours in Kuala Lumpur time: messages go out from this hour up to (not including) the other.
  fromHour: number
  untilHour: number
  // When the sender program on the WhatsApp server last asked for work.
  senderSeenAt: string | null
}

export const DEFAULT_AUTO_SEND: AutoSendSettings = {
  paused: false,
  dailyCap: 40,
  gapSeconds: 30,
  fromHour: 9,
  untilHour: 21,
  senderSeenAt: null,
}

// The sender asks about every 15 seconds.
const OFFLINE_AFTER_MS = 3 * 60 * 1000

export type SenderState = 'never' | 'online' | 'offline'

export function senderState(seenAt: string | null, now = Date.now()): SenderState {
  if (!seenAt) {
    return 'never'
  }
  return now - Date.parse(seenAt) > OFFLINE_AFTER_MS ? 'offline' : 'online'
}

export function hourLabel(hour: number) {
  return `${String(hour % 24).padStart(2, '0')}:00`
}

export function validateAutoSend(settings: AutoSendSettings): string | null {
  if (!Number.isInteger(settings.dailyCap) || settings.dailyCap < 1 || settings.dailyCap > 200) {
    return 'The daily limit must be from 1 to 200.'
  }
  if (!Number.isInteger(settings.gapSeconds) || settings.gapSeconds < 10 || settings.gapSeconds > 600) {
    return 'The pause between two messages must be from 10 to 600 seconds.'
  }
  if (settings.fromHour < 0 || settings.fromHour > 23 || settings.untilHour < 1 || settings.untilHour > 24) {
    return 'The hours are not valid.'
  }
  if (settings.fromHour >= settings.untilHour) {
    return 'The first hour must be before the last hour.'
  }
  return null
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  return supabase
}

const COLUMNS = 'paused, daily_cap, gap_seconds, send_from_hour, send_until_hour, sender_seen_at'

type Row = {
  paused: boolean
  daily_cap: number
  gap_seconds: number
  send_from_hour: number
  send_until_hour: number
  sender_seen_at: string | null
}

export async function fetchAutoSend(): Promise<AutoSendSettings> {
  const { data, error } = await requireSupabase().from('automation_settings').select(COLUMNS).maybeSingle()
  if (error) {
    throw error
  }
  const row = data as Row | null
  return row
    ? {
        paused: row.paused,
        dailyCap: row.daily_cap,
        gapSeconds: row.gap_seconds,
        fromHour: row.send_from_hour,
        untilHour: row.send_until_hour,
        senderSeenAt: row.sender_seen_at,
      }
    : DEFAULT_AUTO_SEND
}

export async function saveAutoSend(change: Partial<Omit<AutoSendSettings, 'senderSeenAt'>>) {
  const update: Database['public']['Tables']['automation_settings']['Update'] = {
    updated_at: new Date().toISOString(),
  }
  if (change.paused !== undefined) {
    update.paused = change.paused
  }
  if (change.dailyCap !== undefined) {
    update.daily_cap = change.dailyCap
  }
  if (change.gapSeconds !== undefined) {
    update.gap_seconds = change.gapSeconds
  }
  if (change.fromHour !== undefined) {
    update.send_from_hour = change.fromHour
  }
  if (change.untilHour !== undefined) {
    update.send_until_hour = change.untilHour
  }
  const { data, error } = await requireSupabase().from('automation_settings').update(update).eq('id', true).select('id')
  if (error) {
    throw error
  }
  if ((data ?? []).length === 0) {
    throw new Error('Only an admin can change this.')
  }
}

export function autoSendErrorMessage(problem: unknown, fallback: string) {
  const text =
    problem instanceof Error
      ? problem.message
      : typeof problem === 'object' && problem && 'message' in problem
        ? String((problem as { message: unknown }).message)
        : ''
  if (/send_from_hour|send_until_hour|sender_seen_at/.test(text)) {
    return 'Sending by itself is not set up in the database yet.'
  }
  if (/row-level security|permission denied|Only an admin/i.test(text)) {
    return 'Only an admin can change this.'
  }
  return fallback
}
