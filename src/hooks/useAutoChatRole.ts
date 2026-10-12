import { useEffect, useRef } from 'react'
import { detectChatRole } from '../lib/studentReply'
import { getChatRole, type ChatRole, type ChatwootConversation, type ChatwootMessage } from '../lib/whatsappInbox'

type Args = {
  active: boolean
  selected: ChatwootConversation | null
  messages: ChatwootMessage[]
  // The chat the messages were loaded for; null while a chat is still loading.
  messagesChat: number | null
  setChatRole: (conversationId: number, role: ChatRole | null, options?: { auto?: boolean }) => Promise<unknown>
}

// Someone who writes "我是学生" (or answers the team's "student or parent?" with it) is the student
// themself: set it when the chat is open, once. If the team changes it or takes it back, it stays
// as they left it (the chat carries crm_role_auto from then on).
export function useAutoChatRole({ active, selected, messages, messagesChat, setChatRole }: Args) {
  const tried = useRef(new Set<number>())

  useEffect(() => {
    if (!selected || !active || tried.current.has(selected.id)) {
      return
    }
    if (getChatRole(selected) !== null || selected.custom_attributes?.crm_role_auto === true) {
      return
    }
    // The messages must be this chat's own, not the previous chat's still on screen.
    if (messagesChat !== selected.id || messages.length === 0) {
      return
    }
    if (detectChatRole(messages) === 'student') {
      tried.current.add(selected.id)
      void setChatRole(selected.id, 'student', { auto: true })
    }
  }, [selected, messages, messagesChat, active, setChatRole])
}
