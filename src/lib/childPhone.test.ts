import { describe, expect, it } from 'vitest'
import type { Lead, Student } from '../types/domain'
import type { ChatAttributes, ChatwootConversation } from './whatsappInbox'
import { findChildPhoneMatches, hasChildPhoneMatches } from './childPhone'

function chat(id: number, phone: string | null, attributes: ChatAttributes = {}): ChatwootConversation {
  return {
    id,
    status: 'open',
    unread_count: 0,
    waiting_since: 0,
    timestamp: 0,
    last_activity_at: id,
    custom_attributes: attributes,
    last_non_activity_message: null,
    meta: { sender: { id, name: 'Kid', phone_number: phone, identifier: null } },
  }
}

const lead = (id: number, phone: string | null, children: Lead['children'] = [], convertedStudentId: number | null = null) =>
  ({ id, phone, children, convertedStudentId }) as Lead
const student = (id: number, phone: string | null) => ({ id, phone }) as Student

const leads = [
  lead(1, '60123456789', [{ name: 'Mia', age: 9, phone: null }], 50),
  lead(2, '60111111111', [{ name: 'Ken', age: 12, phone: '0165550001' }]),
  lead(3, '60165550001'),
]
const students = [student(50, '60165550001'), student(51, '60165550001')]
const conversations = [chat(10, '+60165550001'), chat(11, '+60165550001', { crm_lead_id: 1 })]
const input = { parentPhone: '012-345 6789', currentLeadId: 1, leads, students, conversations }

describe('findChildPhoneMatches', () => {
  it('finds other leads, students and chats with the number, whichever way it is written', () => {
    const found = findChildPhoneMatches({ ...input, phone: '016-555 0001' })

    expect(found.sameAsParent).toBe(false)
    expect(found.leads.map((entry) => entry.id)).toEqual([2, 3])
    // Student 50 is this lead's own student.
    expect(found.students.map((entry) => entry.id)).toEqual([51])
    // Chat 11 is already on this lead.
    expect(found.chats.map((entry) => entry.id)).toEqual([10])
    expect(hasChildPhoneMatches(found)).toBe(true)
  })

  it("says when the number is the parent's own", () => {
    const found = findChildPhoneMatches({ ...input, phone: '+60 12-345 6789' })

    expect(found).toEqual({ sameAsParent: true, leads: [], students: [], chats: [] })
  })

  it('finds nothing while the number is too short to mean anything', () => {
    expect(hasChildPhoneMatches(findChildPhoneMatches({ ...input, phone: '0165' }))).toBe(false)
  })
})
