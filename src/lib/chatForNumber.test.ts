import { describe, expect, it } from 'vitest'
import type { Lead, Student } from '../types/domain'
import type { ChatAttributes, ChatwootConversation, ChatwootMessage } from './whatsappInbox'
import { findChatForNumber } from './chatForNumber'

const message = { id: 1, content: 'hi', message_type: 0, created_at: 1, private: false, status: 'sent' } as ChatwootMessage

function chat(
  id: number,
  phone: string | null,
  attributes: ChatAttributes = {},
  options: { empty?: boolean; lastActivity?: number } = {},
): ChatwootConversation {
  return {
    id,
    status: 'open',
    unread_count: 0,
    waiting_since: 0,
    timestamp: 0,
    last_activity_at: options.lastActivity ?? id,
    custom_attributes: attributes,
    last_non_activity_message: options.empty ? null : message,
    meta: { sender: { id, name: 'Parent', phone_number: phone, identifier: null } },
  }
}

const lead = (id: number, phone: string | null, children: Lead['children'] = []) => ({ id, phone, children }) as Lead
const student = (id: number, phone: string | null) => ({ id, phone }) as Student

const base = { leads: [] as Lead[], students: [] as Student[], leadId: null as number | null }

describe('findChatForNumber', () => {
  it('finds the chat that has the number itself', () => {
    const found = findChatForNumber({ ...base, phone: '016-465 5564', conversations: [chat(1, '+60164655564')] })

    expect(found?.id).toBe(1)
  })

  it('finds a hidden-ID chat through the lead it is tied to, when the lead holds the number', () => {
    const found = findChatForNumber({
      ...base,
      phone: '0164655564',
      leads: [lead(237, '60164655564')],
      conversations: [chat(398, '+65983632945371', { crm_lead_id: 237 })],
    })

    expect(found?.id).toBe(398)
  })

  it('finds a hidden-ID chat through the student it is tied to', () => {
    const found = findChatForNumber({
      ...base,
      phone: '0164655564',
      students: [student(56, '60164655564')],
      conversations: [chat(398, '+65983632945371', { crm_student_ids: [56] })],
    })

    expect(found?.id).toBe(398)
  })

  it('finds the chat tied to the lead that was opened, whatever number it has', () => {
    const found = findChatForNumber({
      ...base,
      phone: '',
      leadId: 174,
      conversations: [chat(5, '+65983632945371', { crm_lead_id: 174 })],
    })

    expect(found?.id).toBe(5)
  })

  it('prefers the chat with messages over an empty one made by an earlier click', () => {
    const found = findChatForNumber({
      ...base,
      phone: '0164655564',
      leads: [lead(237, '60164655564')],
      conversations: [
        chat(481, '+60164655564', {}, { empty: true, lastActivity: 900 }),
        chat(398, '+65983632945371', { crm_lead_id: 237 }, { lastActivity: 100 }),
      ],
    })

    expect(found?.id).toBe(398)
  })

  it('finds nothing for a number nobody holds', () => {
    const found = findChatForNumber({
      ...base,
      phone: '0123456789',
      leads: [lead(1, '60199999999')],
      conversations: [chat(1, '+60199999999', { crm_lead_id: 1 })],
    })

    expect(found).toBeNull()
  })
})
