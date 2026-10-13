import { supabase } from './supabase'

// Messages the automations (n8n) want to send, waiting for a person to approve them.
// n8n adds the rows; the team ticks, edits and sends them from the inbox. Nothing here sends by
// itself: the inbox sends each approved message through the same WhatsApp path as a normal reply.

export type QueueStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped' | 'expired'

export type QueueItem = {
  id: number
  ruleKey: string
  ruleName: string
  // Digits with the country code.
  phone: string
  parentName: string | null
  childName: string | null
  leadId: number | null
  studentId: number | null
  message: string
  status: QueueStatus
  dueAt: string
  expiresAt: string | null
  decidedAt: string | null
  sentAt: string | null
  error: string | null
  createdAt: string
  // Why the sender program left this one for a person (it only writes to people who wrote to us first).
  autoBlocked: string | null
}

export type AutomationSettings = {
  // The pause switch n8n checks first; messages already in the queue can still be sent.
  paused: boolean
  dailyCap: number
  gapSeconds: number
}

export const DEFAULT_SETTINGS: AutomationSettings = { paused: false, dailyCap: 40, gapSeconds: 30 }

// A message marked "sending" by a window that was closed before it finished.
const STUCK_AFTER_MS = 10 * 60 * 1000

export function isExpired(item: QueueItem, now: number) {
  return item.expiresAt !== null && Date.parse(item.expiresAt) < now
}

export function isStuck(item: QueueItem, now: number) {
  return item.status === 'sending' && item.decidedAt !== null && now - Date.parse(item.decidedAt) > STUCK_AFTER_MS
}

// Whether the message can still be sent: waiting, one that failed, or one stuck while sending.
export function canSend(item: QueueItem, now: number) {
  if (isExpired(item, now)) {
    return false
  }
  return item.status === 'pending' || item.status === 'failed' || isStuck(item, now)
}

// A message someone else is sending right now.
export function isBeingSent(item: QueueItem, now: number) {
  return item.status === 'sending' && !isStuck(item, now)
}

export function roomLeft(settings: AutomationSettings, sentToday: number) {
  return Math.max(0, settings.dailyCap - sentToday)
}

export function startOfDay(now: number) {
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  return day.toISOString()
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  return supabase
}

export function automationErrorMessage(problem: unknown, fallback: string) {
  const text = problem instanceof Error ? problem.message : typeof problem === 'object' && problem && 'message' in problem ? String((problem as { message: unknown }).message) : ''
  if (/automation_(queue|settings)/.test(text) && /(does not exist|schema cache)/.test(text)) {
    return 'Automations are not set up in the database yet.'
  }
  return fallback
}

const COLUMNS =
  'id, rule_key, rule_name, phone, parent_name, child_name, lead_id, student_id, message, status, due_at, expires_at, decided_at, sent_at, error, created_at, auto_blocked'

export async function fetchQueue(): Promise<QueueItem[]> {
  const { data, error } = await requireSupabase()
    .from('automation_queue')
    .select(COLUMNS)
    .in('status', ['pending', 'sending', 'failed'])
    .order('due_at', { ascending: true })
    .limit(300)
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    ruleKey: row.rule_key,
    ruleName: row.rule_name,
    phone: row.phone,
    parentName: row.parent_name,
    childName: row.child_name,
    leadId: row.lead_id,
    studentId: row.student_id,
    message: row.message,
    status: row.status,
    dueAt: row.due_at,
    expiresAt: row.expires_at,
    decidedAt: row.decided_at,
    sentAt: row.sent_at,
    error: row.error,
    createdAt: row.created_at,
    autoBlocked: row.auto_blocked,
  }))
}

// How many automation messages went out since midnight, for the daily limit.
export async function fetchSentToday(now = Date.now()): Promise<number> {
  const { count, error } = await requireSupabase()
    .from('automation_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')
    .gte('sent_at', startOfDay(now))
  if (error) {
    throw error
  }
  return count ?? 0
}

export async function fetchSettings(): Promise<AutomationSettings> {
  const { data, error } = await requireSupabase()
    .from('automation_settings')
    .select('paused, daily_cap, gap_seconds')
    .maybeSingle()
  if (error) {
    throw error
  }
  return data ? { paused: data.paused, dailyCap: data.daily_cap, gapSeconds: data.gap_seconds } : DEFAULT_SETTINGS
}

export async function currentUserId(): Promise<string | null> {
  const { data } = await requireSupabase().auth.getUser()
  return data.user?.id ?? null
}

export async function saveQueueMessage(id: number, message: string) {
  const { data, error } = await requireSupabase()
    .from('automation_queue')
    .update({ message })
    .eq('id', id)
    .in('status', ['pending', 'failed'])
    .select('id')
  if (error) {
    throw error
  }
  return (data ?? []).length > 0
}

// Takes the message for sending. False when someone else already took it or it was skipped,
// so two people pressing the button never send it twice.
export async function claimQueueItem(id: number, userId: string | null, now = Date.now()) {
  const stuckBefore = new Date(now - STUCK_AFTER_MS).toISOString()
  const { data, error } = await requireSupabase()
    .from('automation_queue')
    .update({ status: 'sending', decided_by: userId, decided_at: new Date(now).toISOString(), error: null })
    .eq('id', id)
    .or(`status.in.(pending,failed),and(status.eq.sending,decided_at.lt.${stuckBefore})`)
    .select('id')
  if (error) {
    throw error
  }
  return (data ?? []).length > 0
}

export async function finishQueueItem(id: number, result: { ok: true } | { ok: false; error: string }) {
  const change = result.ok
    ? { status: 'sent' as const, sent_at: new Date().toISOString(), error: null }
    : { status: 'failed' as const, error: result.error.slice(0, 900) }
  const { error } = await requireSupabase().from('automation_queue').update(change).eq('id', id)
  if (error) {
    throw error
  }
}

export async function skipQueueItems(ids: number[], userId: string | null) {
  if (ids.length === 0) {
    return
  }
  const { error } = await requireSupabase()
    .from('automation_queue')
    .update({ status: 'skipped', decided_by: userId, decided_at: new Date().toISOString() })
    .in('id', ids)
    .in('status', ['pending', 'failed', 'sending'])
  if (error) {
    throw error
  }
}
