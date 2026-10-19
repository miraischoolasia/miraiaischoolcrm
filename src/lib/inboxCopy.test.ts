import { describe, expect, it } from 'vitest'
import { asIso, copyChat, copyFromWebhook, copyMessage, senderOf } from '../../supabase/functions/chat-activity/copy'

// Shapes as Chatwoot's Message#webhook_data and Conversations::EventDataPresenter#webhook_data build them.
const conversation = {
  id: 42,
  inbox_id: 5,
  channel: 'Channel::Api',
  status: 'open',
  unread_count: 2,
  waiting_since: 1_760_000_000,
  last_activity_at: 1_760_000_100,
  custom_attributes: { crm_owner_id: 7 },
  meta: { sender: { id: 900, name: 'Puan Aminah', phone_number: '+60 12-345 6789', identifier: '60123456789@s.whatsapp.net' } },
}

function webhookMessage(extra: Record<string, unknown> = {}) {
  return {
    event: 'message_created',
    id: 555,
    account: { id: 2, name: 'EduHero' },
    content: 'Boleh, kelas hari Sabtu',
    content_attributes: { crm_sender: { id: 3, name: 'Mei' } },
    created_at: '2026-10-19T01:05:00.123Z',
    message_type: 'outgoing',
    private: false,
    conversation,
    inbox: { id: 5, name: 'Mirai 1' },
    sender: { id: 1, type: 'user' },
    ...extra,
  }
}

describe('copyFromWebhook', () => {
  it('copies a new message with who sent it, and the chat it is in', () => {
    const copy = copyFromWebhook(webhookMessage())!
    expect(copy.accountId).toBe(2)
    expect(copy.messages).toEqual([
      {
        id: 555, conversation_id: 42, inbox_id: 5, message_type: 1, direction: 'outgoing', sender_kind: 'staff', staff_id: 3,
        content: 'Boleh, kelas hari Sabtu', attachments: [], private: false, deleted: false, reply_to: null,
        created_at: '2026-10-19T01:05:00.123Z', updated_at: null,
      },
    ])
    expect(copy.chat).toEqual({
      conversation_id: 42, inbox_id: 5, channel: 'Channel::Api', contact_id: 900, contact_name: 'Puan Aminah',
      contact_phone: '60123456789', contact_identifier: '60123456789@s.whatsapp.net', status: 'open', owner_id: 7,
      unread_count: 2, waiting_since: '2025-10-09T08:53:20.000Z', last_activity_at: '2025-10-09T08:55:00.000Z',
    })
  })

  it('tells the automatic sender, the phone and the parent apart', () => {
    expect(copyFromWebhook(webhookMessage({ content_attributes: { crm_sender: { id: 0, name: 'Automation' } } }))!.messages[0].sender_kind).toBe('automation')
    expect(copyFromWebhook(webhookMessage({ content_attributes: {} }))!.messages[0].sender_kind).toBe('phone')
    expect(copyFromWebhook(webhookMessage({ message_type: 'incoming', content_attributes: null }))!.messages[0]).toMatchObject({
      sender_kind: 'parent',
      direction: 'incoming',
      staff_id: null,
    })
    expect(senderOf(2, null).kind).toBe('system')
  })

  it('keeps an edit, a delete, a quoted message and a private note', () => {
    const edited = copyFromWebhook(
      webhookMessage({
        event: 'message_updated',
        content: 'This message was deleted',
        content_attributes: { deleted: true, in_reply_to: 554, crm_sender: { id: 3 } },
        private: true,
        updated_at: '2026-10-19T01:06:00Z',
      }),
    )!.messages[0]
    expect(edited).toMatchObject({ deleted: true, reply_to: 554, private: true, updated_at: '2026-10-19T01:06:00.000Z' })
  })

  it('keeps what a file is, never the file', () => {
    const message = copyFromWebhook(
      webhookMessage({
        attachments: [
          { id: 1, file_type: 'image', data_url: 'https://wa.example/rails/active_storage/blobs/x/photo%20one.jpg?x=1', file_size: 2048, extension: 'jpg' },
          { id: 2, file_type: 'location', data_url: '' },
          { id: 3 },
        ],
      }),
    )!.messages[0]
    expect(message.attachments).toEqual([
      { type: 'image', url: 'https://wa.example/rails/active_storage/blobs/x/photo%20one.jpg?x=1', name: 'photo one.jpg', size: 2048 },
      { type: 'location', url: null, name: null, size: null },
    ])
  })

  it('takes a chat event with its newest message', () => {
    const copy = copyFromWebhook({
      ...conversation,
      event: 'conversation_status_changed',
      status: 'resolved',
      account: { id: 1 },
      messages: [{ id: 556, message_type: 0, created_at: 1_760_000_100, content: 'ok', conversation_id: 42 }],
    })!
    expect(copy.chat?.status).toBe('resolved')
    expect(copy.messages.map((message) => [message.id, message.sender_kind, message.conversation_id])).toEqual([[556, 'parent', 42]])
  })

  it('ignores what the copy does not keep', () => {
    expect(copyFromWebhook({ event: 'conversation_typing_on', conversation })).toBeNull()
    expect(copyFromWebhook({ event: 'contact_updated', id: 1 })).toBeNull()
    expect(copyFromWebhook({ event: 'message_created', id: 1 })).toBeNull()
    expect(copyFromWebhook(null)).toBeNull()
  })
})

describe('the API shape (Copy old chats)', () => {
  it('reads seconds and numeric message types', () => {
    expect(copyMessage({ id: 9, message_type: 1, created_at: 1_760_000_000, content: 'hi', private: false }, 42, 5)).toMatchObject({
      conversation_id: 42,
      inbox_id: 5,
      sender_kind: 'phone',
      created_at: '2025-10-09T08:53:20.000Z',
    })
    expect(copyChat({ ...conversation, waiting_since: 0 })?.waiting_since).toBeNull()
    expect(asIso('1760000000')).toBe('2025-10-09T08:53:20.000Z')
    expect(asIso(0)).toBeNull()
  })
})
