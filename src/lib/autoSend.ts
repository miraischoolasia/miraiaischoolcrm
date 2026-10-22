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
  // When it said it would ask again (it sleeps up to 30 minutes at night or while paused); null before
  // that was recorded.
  senderNextAt?: string | null
  // Most automatic messages one family gets in 7 days, from every flow (approved ones too); 0 = no limit.
  // Undefined before migration 20261029700000.
  familyWeeklyCap?: number
}

export const DEFAULT_AUTO_SEND: AutoSendSettings = {
  paused: false,
  dailyCap: 40,
  gapSeconds: 30,
  fromHour: 9,
  untilHour: 21,
  senderSeenAt: null,
  senderNextAt: null,
}

// The sender asks again at the time it gave (about every minute in the day); missing it by more than this
// means it stopped. Without that time (an older sender) it must have asked within this long.
const OFFLINE_AFTER_MS = 3 * 60 * 1000
// Asking again further off than this is a rest (night, or paused), shown with the time it wakes.
const RESTING_AFTER_MS = 2 * 60 * 1000

// 'resting' is fine too: the sender said it sleeps until a set time (see senderWakesAt).
export type SenderState = 'never' | 'online' | 'resting' | 'offline'

export function senderState(seenAt: string | null, now = Date.now(), nextAt: string | null = null): SenderState {
  if (!seenAt) {
    return 'never'
  }
  const next = nextAt ? Date.parse(nextAt) : Number.NaN
  if (!Number.isNaN(next) && now <= next + OFFLINE_AFTER_MS) {
    return next - now > RESTING_AFTER_MS ? 'resting' : 'online'
  }
  return now - Date.parse(seenAt) > OFFLINE_AFTER_MS ? 'offline' : 'online'
}

// Running, or asleep until a time it gave: nothing to warn about.
export function senderIsFine(state: SenderState) {
  return state === 'online' || state === 'resting'
}

// "09:00": when a resting sender asks again, in Kuala Lumpur time.
export function senderWakesAt(nextAt: string) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(new Date(nextAt))
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
  if (
    settings.familyWeeklyCap !== undefined &&
    (!Number.isInteger(settings.familyWeeklyCap) || settings.familyWeeklyCap < 0 || settings.familyWeeklyCap > 50)
  ) {
    return 'The weekly limit per family must be from 0 to 50.'
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
// Before migration 20261024950000 there is no sender_next_at: then it is read without it.
const COLUMNS_WITH_NEXT = `${COLUMNS}, sender_next_at`
// Before migration 20261029700000 there is no family_weekly_cap.
const COLUMNS_WITH_CAP = `${COLUMNS_WITH_NEXT}, family_weekly_cap`

type Row = {
  paused: boolean
  daily_cap: number
  gap_seconds: number
  send_from_hour: number
  send_until_hour: number
  sender_seen_at: string | null
  sender_next_at?: string | null
  family_weekly_cap?: number
}

export async function fetchAutoSend(): Promise<AutoSendSettings> {
  const select = (columns: string) => requireSupabase().from('automation_settings').select(columns).maybeSingle()
  let { data, error } = await select(COLUMNS_WITH_CAP)
  if (error?.code === '42703') {
    ;({ data, error } = await select(COLUMNS_WITH_NEXT))
  }
  if (error?.code === '42703') {
    ;({ data, error } = await select(COLUMNS))
  }
  if (error) {
    throw error
  }
  const row = data as unknown as Row | null
  return row
    ? {
        paused: row.paused,
        dailyCap: row.daily_cap,
        gapSeconds: row.gap_seconds,
        fromHour: row.send_from_hour,
        untilHour: row.send_until_hour,
        senderSeenAt: row.sender_seen_at,
        senderNextAt: row.sender_next_at ?? null,
        ...(row.family_weekly_cap !== undefined ? { familyWeeklyCap: row.family_weekly_cap } : {}),
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
  if (change.familyWeeklyCap !== undefined) {
    update.family_weekly_cap = change.familyWeeklyCap
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
