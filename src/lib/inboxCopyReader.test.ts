import { describe, expect, it, vi } from 'vitest'
import { conversationFromCopy, copyIsBehind, messageFromCopy } from './inboxCopyReader'
import type { ChatwootMessage } from './whatsappInbox'

vi.mock('./supabase', () => ({ supabase: null }))

const message = (id: number, extra: Partial<ChatwootMessage> = {}): ChatwootMessage => ({
  id, content: `m${id}`, message_type: 0, created_at: 100 + id, private: false, status: 'sent', ...extra,
})

describe('reading the inbox copy back', () => {
  it('gives a copied chat in Chatwoot\'s list shape, with its newest message', () => {
    const chat = conversationFromCopy(
      { id: 7, status: 'open', unread_count: 2, meta: { sender: { id: 70, name: 'Puan Aminah' }, channel: 'Channel::Api' }, custom_attributes: { crm_owner_id: 3 } },
      { id: 99, content: 'Boleh', message_type: 0, created_at: 1000, private: false, status: 'sent' },
    )
    expect(chat).toMatchObject({ id: 7, unread_count: 2, waiting_since: 0, custom_attributes: { crm_owner_id: 3 }, last_non_activity_message: { id: 99 } })
  })

  it('leaves out what was copied before raw was kept', () => {
    expect(conversationFromCopy(null, null)).toBeNull()
    expect(conversationFromCopy({ id: 7 }, null)).toBeNull()
    expect(messageFromCopy(null)).toBeNull()
    expect(messageFromCopy({ id: 1, message_type: 'incoming', created_at: 1 })).toBeNull()
  })

  it('tells which of Chatwoot\'s messages the copy lacks or has differently', () => {
    const copied = [message(1), message(2, { status: 'sent' }), message(3, { content: 'old text' })]
    const chatwoot = [message(1), message(2, { status: 'read' }), message(3, { content: 'new text' }), message(4)]
    expect(copyIsBehind(copied, chatwoot).map((entry) => entry.id)).toEqual([2, 3, 4])
    expect(copyIsBehind(chatwoot, chatwoot)).toEqual([])
  })
})
