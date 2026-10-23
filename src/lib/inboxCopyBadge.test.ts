import { describe, expect, it } from 'vitest'
import { conversationFromBadgeRow } from './inboxCopyReader'
import { categoryOf, getWaitingSeconds } from './whatsappInbox'

const row = {
  conversation_id: 7,
  inbox_id: 3,
  status: 'open',
  unread: 2,
  waiting: 0,
  activity: 1_800_000_000,
  channel: 'Channel::Api',
  sender_id: 55,
  sender_name: 'Puan Aminah',
  sender_phone: '+60123456789',
  sender_identifier: null,
  ghl_channel: null,
  last_id: 900,
  last_type: 0,
  last_at: 1_799_999_000,
  last_private: false,
  last_content: 'Boleh daftar kelas Sabtu?',
}

describe('a light chat for the badges (2026-10-23)', () => {
  it('has what the counting and the bell read', () => {
    const chat = conversationFromBadgeRow(row)!
    expect(chat).toMatchObject({ id: 7, inbox_id: 3, status: 'open', unread_count: 2, last_activity_at: 1_800_000_000 })
    expect(chat.meta.sender).toMatchObject({ id: 55, name: 'Puan Aminah', phone_number: '+60123456789' })
    expect(chat.last_non_activity_message).toMatchObject({ id: 900, message_type: 0, content: 'Boleh daftar kelas Sabtu?' })
    // A parent's unanswered message still counts as waiting.
    expect(getWaitingSeconds(chat, 1_800_000_000)).toBe(1000)
    expect(categoryOf(chat)).toBe('whatsapp')
  })

  it('keeps a GoHighLevel chat in Messenger or Instagram', () => {
    expect(categoryOf(conversationFromBadgeRow({ ...row, sender_identifier: 'ghl:9', ghl_channel: 'IG' })!)).toBe('instagram')
    expect(categoryOf(conversationFromBadgeRow({ ...row, sender_identifier: 'ghl:9', ghl_channel: 'FB' })!)).toBe('messenger')
  })

  it('is left out when the chat has no shape yet, and copes with a chat with no message', () => {
    expect(conversationFromBadgeRow({ ...row, sender_id: null })).toBeNull()
    expect(conversationFromBadgeRow({ ...row, last_type: null })!.last_non_activity_message).toBeNull()
  })
})
