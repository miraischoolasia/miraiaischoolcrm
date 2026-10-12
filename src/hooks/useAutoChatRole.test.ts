import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ChatAttributes, ChatwootConversation, ChatwootMessage } from '../lib/whatsappInbox'
import { useAutoChatRole } from './useAutoChatRole'

const chat = (id: number, attributes: ChatAttributes = {}): ChatwootConversation => ({
  id,
  status: 'open',
  unread_count: 0,
  waiting_since: 0,
  timestamp: 0,
  last_activity_at: 0,
  custom_attributes: attributes,
  meta: { sender: { id, name: 'S', phone_number: '+60123456789', identifier: null } },
})
const said = (content: string): ChatwootMessage =>
  ({ id: 1, content, message_type: 0, created_at: 1, private: false, status: 'sent' }) as ChatwootMessage

function run(args: Partial<Parameters<typeof useAutoChatRole>[0]> = {}) {
  const setChatRole = vi.fn().mockResolvedValue(true)
  const view = renderHook((props: Parameters<typeof useAutoChatRole>[0]) => useAutoChatRole(props), {
    initialProps: {
      active: true,
      selected: chat(5),
      messages: [said('我是学生')],
      messagesChat: 5 as number | null,
      setChatRole,
      ...args,
    },
  })
  return { setChatRole, view }
}

describe('useAutoChatRole', () => {
  it('sets the student once when the chat says 我是学生', () => {
    const { setChatRole, view } = run()

    expect(setChatRole).toHaveBeenCalledWith(5, 'student', { auto: true })
    view.rerender({ active: true, selected: chat(5), messages: [said('我是学生')], messagesChat: 5, setChatRole })
    expect(setChatRole).toHaveBeenCalledTimes(1)
  })

  it('leaves a chat whose role the team already set, or took back', () => {
    expect(run({ selected: chat(5, { crm_chat_role: 'parent' }) }).setChatRole).not.toHaveBeenCalled()
    expect(run({ selected: chat(5, { crm_role_auto: true }) }).setChatRole).not.toHaveBeenCalled()
  })

  it('does not read the previous chat\'s messages for the chat just opened', () => {
    expect(run({ selected: chat(6), messagesChat: 5 }).setChatRole).not.toHaveBeenCalled()
    expect(run({ messagesChat: null }).setChatRole).not.toHaveBeenCalled()
  })

  it('does nothing for an ordinary message, or while the page is not showing the inbox', () => {
    expect(run({ messages: [said('我要了解课程')] }).setChatRole).not.toHaveBeenCalled()
    expect(run({ active: false }).setChatRole).not.toHaveBeenCalled()
  })
})
