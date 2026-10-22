import { createContext, useCallback, useContext, useEffect, useState } from 'react'

import { type ChatContact, type ChatMessage } from './appChatRules'
import { supabase } from './supabase'

export * from './appChatRules'

// The student app's chat (docs/app-chat-spec.md): a student's own login writes
// to their class's teachers and their consultant; the school answers in the
// CRM. Reading goes through the tables (the database lets a student see only
// their own threads); sending and marking read go through portal functions.

export async function fetchChatOn(): Promise<boolean> {
  const { data, error } = await supabase.rpc('app_chat_enabled')
  return !error && data === true
}

export async function fetchChatContacts(): Promise<ChatContact[]> {
  const { data, error } = await supabase.rpc('portal_chat_contacts')
  if (error) throw new Error(error.message)
  return (data ?? []) as ChatContact[]
}

export async function fetchChatMessages(threadId: number): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('app_chat_messages')
    .select('id, thread_id, sender, body, created_at')
    .eq('thread_id', threadId)
    .order('id', { ascending: false })
    .limit(200)
  if (error) throw new Error(error.message)
  return ((data ?? []) as ChatMessage[]).reverse()
}

// Sends and returns the thread (made the first time the child writes).
export async function sendChatMessage(staffId: number, body: string): Promise<number> {
  const { data, error } = await supabase.rpc('portal_chat_send', { p_staff_id: staffId, p_body: body })
  if (error) throw new Error(error.message)
  return data as number
}

export async function markChatRead(threadId: number) {
  await supabase.rpc('app_chat_mark_read', { p_thread_id: threadId })
}

// The child's contacts, kept fresh: reloaded whenever one of their threads
// changes (a new message, a read). Only for a student's own login with the
// school's chat on; otherwise empty.
export function useChatContacts(studentId: number | null, on: boolean) {
  const [contacts, setContacts] = useState<ChatContact[]>([])
  const [loaded, setLoaded] = useState(false)
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion((value) => value + 1), [])

  useEffect(() => {
    if (studentId === null || !on) return
    let alive = true
    fetchChatContacts()
      .then((rows) => {
        if (!alive) return
        setContacts(rows)
        setLoaded(true)
      })
      .catch(() => {
        if (alive) setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [studentId, on, version])

  useEffect(() => {
    if (studentId === null || !on) return
    const channel = supabase
      .channel(`app-chat-threads-${studentId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'app_chat_threads', filter: `student_id=eq.${studentId}` }, reload)
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [studentId, on, reload])

  return { contacts: studentId !== null && on ? contacts : [], loaded, reload }
}

// The tab bar keeps the contacts (for its unread badge) and the chat page reads the same list.
export type AppChat = { on: boolean; checking: boolean; contacts: ChatContact[]; loaded: boolean; reload: () => void }

export const AppChatContext = createContext<AppChat>({ on: false, checking: false, contacts: [], loaded: false, reload: () => {} })

export function useAppChat() {
  return useContext(AppChatContext)
}
