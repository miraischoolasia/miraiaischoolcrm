import { supabase } from './supabase'

// For one chat: a message sent at a chosen time, or one of the school's flows started for this person at a chosen
// time (chat_schedules, 20261025600000). The automatic sender sends the message with the same safety rules as
// every automation; the flow runner walks the flow. "If the parent replies first" cancels it in the database.

export type ChatSchedule = {
  id: number
  kind: 'message' | 'flow'
  message: string | null
  mediaUrl: string | null
  flowId: number | null
  runAt: string
  cancelOnReply: boolean
  status: 'scheduled' | 'sent' | 'failed' | 'started' | 'cancelled' | 'replied'
  createdByName: string | null
  createdAt: string
}

// Who the schedule is for: the chat, and what the database needs to reach the person.
export type ScheduleTarget = {
  conversationId: number
  contactId: number | null
  inboxId: number | null
  channel: 'whatsapp' | 'messenger' | 'instagram'
  phone: string | null
  leadId: number | null
  parentName: string | null
}

export type FlowChoice = { id: number; name: string }

const MEDIA_BUCKET = 'quick-reply-media'
const DAY_SECONDS = 86_400

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }
  return supabase
}

export function scheduleError(error: unknown, fallback = "Couldn't save it. Try again.") {
  const { code, message } = (error ?? {}) as { code?: string; message?: string }
  if (code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || message?.includes('chat_schedule')) {
    return 'Scheduling is not set up yet. Ask the admin to update the database.'
  }
  if (code === '42501' || code === '22023') {
    return message || fallback
  }
  return message || fallback
}

export async function listChatSchedules(conversationId: number): Promise<ChatSchedule[]> {
  const { data, error } = await requireSupabase()
    .from('chat_schedules')
    .select('id, kind, message, media_url, flow_id, run_at, cancel_on_reply, status, created_by_name, created_at')
    .eq('conversation_id', conversationId)
    .order('run_at', { ascending: false })
    .limit(20)
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind as ChatSchedule['kind'],
    message: row.message,
    mediaUrl: row.media_url,
    flowId: row.flow_id,
    runAt: row.run_at,
    cancelOnReply: row.cancel_on_reply,
    status: row.status as ChatSchedule['status'],
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  }))
}

export async function listFlowChoices(): Promise<FlowChoice[]> {
  const { data, error } = await requireSupabase().from('automation_flows').select('id, name, enabled').eq('enabled', true).order('name')
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => ({ id: row.id, name: row.name }))
}

// A picture for a scheduled message: kept with the quick replies' files, and handed to the sender as an address
// that works until a week after the send time.
export async function pictureUrlFor(file: File, runAt: Date) {
  const db = requireSupabase()
  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase().slice(0, 5) : 'jpg'
  const path = `scheduled/${crypto.randomUUID()}.${extension}`
  const upload = await db.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (upload.error) {
    throw upload.error
  }
  return signedPicture(path, runAt)
}

// A quick reply's picture (already in the bucket), for a scheduled message.
export async function signedPicture(path: string, runAt: Date) {
  const seconds = Math.max(DAY_SECONDS, Math.ceil((runAt.getTime() - Date.now()) / 1000) + 7 * DAY_SECONDS)
  const { data, error } = await requireSupabase().storage.from(MEDIA_BUCKET).createSignedUrl(path, seconds)
  if (error || !data?.signedUrl) {
    throw error ?? new Error("Couldn't keep the picture.")
  }
  return data.signedUrl
}

export async function scheduleMessage(target: ScheduleTarget, input: { message: string; mediaUrl: string | null; runAt: Date; cancelOnReply: boolean }) {
  const { data, error } = await requireSupabase().rpc('chat_schedule_message', {
    p_conversation_id: target.conversationId,
    p_contact_id: target.contactId,
    p_inbox_id: target.inboxId,
    p_channel: target.channel,
    p_phone: target.phone,
    p_lead_id: target.leadId,
    p_parent_name: target.parentName,
    p_message: input.message,
    p_media_url: input.mediaUrl,
    p_run_at: input.runAt.toISOString(),
    p_cancel_on_reply: input.cancelOnReply,
  })
  if (error) {
    throw error
  }
  return data
}

export async function scheduleFlow(target: ScheduleTarget, input: { flowId: number; runAt: Date; cancelOnReply: boolean }) {
  const { data, error } = await requireSupabase().rpc('chat_schedule_flow', {
    p_conversation_id: target.conversationId,
    p_contact_id: target.contactId,
    p_inbox_id: target.inboxId,
    p_channel: target.channel,
    p_phone: target.phone,
    p_lead_id: target.leadId,
    p_parent_name: target.parentName,
    p_flow_id: input.flowId,
    p_run_at: input.runAt.toISOString(),
    p_cancel_on_reply: input.cancelOnReply,
  })
  if (error) {
    throw error
  }
  return data
}

export async function changeSchedule(id: number, input: { message: string | null; mediaUrl: string | null; runAt: Date; cancelOnReply: boolean }) {
  const { error } = await requireSupabase().rpc('chat_schedule_change', {
    p_id: id,
    p_message: input.message,
    p_media_url: input.mediaUrl,
    p_run_at: input.runAt.toISOString(),
    p_cancel_on_reply: input.cancelOnReply,
  })
  if (error) {
    throw error
  }
}

export async function cancelSchedule(id: number) {
  const { error } = await requireSupabase().rpc('chat_schedule_cancel', { p_id: id })
  if (error) {
    throw error
  }
}

// "2026-10-20T10:00" for a datetime-local box, in this computer's time.
export function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const STATUS_LABELS: Record<ChatSchedule['status'], string> = {
  scheduled: 'Scheduled',
  sent: 'Sent',
  failed: 'Did not go out',
  started: 'Flow started',
  cancelled: 'Cancelled',
  replied: 'Cancelled: the parent replied first',
}
