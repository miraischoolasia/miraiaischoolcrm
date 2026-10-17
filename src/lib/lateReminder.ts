import { supabase } from './supabase'
import { normalizePhoneInput } from './startChat'

// Reminding a parent whose child is not in the lesson's Zoom yet
// (20261023120000_live_class_tools.sql). The words are the school's own.

export type LateReminderSettings = { afterMinutes: number; text: string }

export const defaultLateReminder: LateReminderSettings = {
  afterMinutes: 5,
  text: "Hi! {child}'s {class} class started at {time}. Please help {child} join the Zoom from the app. Thank you!",
}

export function readLateReminder(value: unknown): LateReminderSettings {
  const raw = (value ?? {}) as { after_minutes?: unknown; text?: unknown }
  const minutes = Number(raw.after_minutes)
  return {
    afterMinutes: Number.isInteger(minutes) && minutes >= 0 && minutes <= 120 ? minutes : defaultLateReminder.afterMinutes,
    text: typeof raw.text === 'string' && raw.text.trim() ? raw.text : defaultLateReminder.text,
  }
}

// {child} is the child's first name; {class} and {time} as given.
export function fillLateReminder(text: string, values: { child: string; className: string; time: string }) {
  const firstName = values.child.trim().split(/\s+/)[0] ?? values.child
  return text.replaceAll('{child}', firstName).replaceAll('{class}', values.className).replaceAll('{time}', values.time)
}

// A link that opens the teacher's own WhatsApp with the message written in.
export function whatsAppLink(phone: string | null | undefined, text: string) {
  const digits = phone ? normalizePhoneInput(phone) : null
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null
}

export async function fetchLateReminderSettings(): Promise<LateReminderSettings> {
  if (!supabase) return defaultLateReminder
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'lesson_late_reminder').maybeSingle()
  return readLateReminder(data?.value)
}

export async function saveLateReminderSettings(settings: LateReminderSettings) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_late_reminder_settings', { p_after_minutes: settings.afterMinutes, p_text: settings.text })
  return error ? error.message || 'Failed to save.' : null
}

// When each child's parent was last reminded in this lesson.
export async function fetchLateReminders(sessionId: number): Promise<Map<number, string>> {
  if (!supabase) return new Map()
  const { data, error } = await supabase.from('lesson_late_reminders').select('student_id, sent_at').eq('session_id', sessionId).order('sent_at')
  if (error) return new Map()
  return new Map((data ?? []).map((row) => [row.student_id, row.sent_at]))
}

export async function recordLateReminder(sessionId: number, studentId: number, via: 'inbox' | 'phone') {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('record_late_reminder', { p_session_id: sessionId, p_student_id: studentId, p_sent_via: via })
  return error ? error.message || 'Could not note the reminder.' : null
}
