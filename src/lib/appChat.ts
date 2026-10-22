import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

// The student app chat (docs/app-chat-spec.md; 20261029200000_app_chat.sql): a
// student writes from the app to a class teacher or their consultant, who
// answers here. A teacher or consultant answers the threads written to them;
// an admin reads every thread (to keep students safe) but answers only their own.
// The tables are not in types/database.ts yet (a shared file, filled in when the
// migration is pushed), so they are read without its column types.

export type AppChatThread = {
  thread_id: number
  student_id: number
  student_name: string
  student_code: string | null
  staff_id: number
  staff_name: string
  role: 'teacher' | 'consultant'
  // Written to this login (only then may it answer).
  mine: boolean
  last_message_at: string
  last_preview: string | null
  last_sender: 'student' | 'staff' | null
  unread_for_staff: number
  student_read_at: string | null
}

export type AppChatMessage = {
  id: number
  thread_id: number
  sender: 'student' | 'staff'
  sender_staff_id: number | null
  body: string
  created_at: string
}

export const APP_CHAT_MAX_LENGTH = 2000

function client(): SupabaseClient {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  return supabase as unknown as SupabaseClient
}

export async function fetchAppChatOn(): Promise<boolean> {
  if (!supabase) return false
  const { data, error } = await client().rpc('app_chat_enabled')
  return !error && data === true
}

export async function setAppChatOn(on: boolean) {
  const { error } = await client().rpc('set_app_chat_enabled', { p_enabled: on })
  if (error) throw new Error(error.message)
}

export async function fetchAppChatThreads(): Promise<AppChatThread[]> {
  const { data, error } = await client().rpc('app_chat_staff_threads')
  if (error) throw new Error(error.message)
  return (data ?? []) as AppChatThread[]
}

export async function fetchAppChatMessages(threadId: number): Promise<AppChatMessage[]> {
  const { data, error } = await client()
    .from('app_chat_messages')
    .select('id, thread_id, sender, sender_staff_id, body, created_at')
    .eq('thread_id', threadId)
    .order('id', { ascending: false })
    .limit(300)
  if (error) throw new Error(error.message)
  return ((data ?? []) as AppChatMessage[]).reverse()
}

export async function replyAppChat(threadId: number, body: string) {
  const { error } = await client().rpc('app_chat_reply', { p_thread_id: threadId, p_body: body })
  if (error) throw new Error(error.message)
}

export async function markAppChatRead(threadId: number) {
  await client().rpc('app_chat_mark_read', { p_thread_id: threadId })
}

// What the Student Chat page's menu badge counts: unread messages in threads
// written to this login (an admin looking at others' threads does not count them).
export function appChatUnread(threads: AppChatThread[]) {
  return threads.reduce((sum, thread) => sum + (thread.mine && thread.unread_for_staff > 0 ? thread.unread_for_staff : 0), 0)
}

// "S1234567 · Ali", or the name alone when the student has no code.
export function appChatStudentLabel(thread: Pick<AppChatThread, 'student_code' | 'student_name'>) {
  const code = thread.student_code?.trim()
  return code ? `${code} · ${thread.student_name}` : thread.student_name
}

export function appChatRoleLabel(role: AppChatThread['role']) {
  return role === 'consultant' ? 'Consultant' : 'Class teacher'
}

// The student has read the staff's last message ("Read" under it).
export function appChatSeenByStudent(thread: Pick<AppChatThread, 'student_read_at'> | null, messages: AppChatMessage[]) {
  const last = messages[messages.length - 1]
  if (!thread?.student_read_at || !last || last.sender !== 'staff') return false
  return new Date(thread.student_read_at).getTime() >= new Date(last.created_at).getTime()
}

export function mergeAppChatMessages(current: AppChatMessage[], incoming: AppChatMessage[]) {
  const seen = new Set(current.map((message) => message.id))
  const added = incoming.filter((message) => !seen.has(message.id))
  if (added.length === 0) return current
  return [...current, ...added].sort((a, b) => a.id - b.id)
}

export function filterAppChatThreads(threads: AppChatThread[], query: string, onlyMine: boolean) {
  const words = query.trim().toLowerCase()
  return threads.filter(
    (thread) =>
      (!onlyMine || thread.mine) &&
      (!words || `${thread.student_code ?? ''} ${thread.student_name} ${thread.staff_name}`.toLowerCase().includes(words)),
  )
}
