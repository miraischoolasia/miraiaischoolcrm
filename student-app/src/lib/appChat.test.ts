// Run from the CRM folder: npx vitest run --root student-app
import { describe, expect, it } from 'vitest'

import { type ChatContact, type ChatMessage, mergeMessages, messageTime, roleLabel, seenByStaff, unreadTotal } from './appChatRules'

function contact(extra: Partial<ChatContact> = {}): ChatContact {
  return {
    staff_id: 5,
    staff_name: 'Joey',
    role: 'teacher',
    classes: 'Class A',
    can_send: true,
    thread_id: 1,
    last_message_at: null,
    last_preview: null,
    last_sender: null,
    unread: 0,
    staff_read_at: null,
    ...extra,
  }
}

function message(id: number, sender: ChatMessage['sender'], at: string): ChatMessage {
  return { id, thread_id: 1, sender, body: `m${id}`, created_at: at }
}

describe('student app chat', () => {
  it('adds up unread messages for the tab badge', () => {
    expect(unreadTotal([contact({ unread: 2 }), contact({ staff_id: 6, unread: 3 }), contact({ staff_id: 7 })])).toBe(5)
  })

  it('shows Read when the teacher read the child’s last message', () => {
    const sent = [message(1, 'staff', '2026-10-22T03:00:00Z'), message(2, 'student', '2026-10-22T03:05:00Z')]
    expect(seenByStaff(contact({ staff_read_at: '2026-10-22T03:05:00Z' }), sent)).toBe(true)
    expect(seenByStaff(contact({ staff_read_at: '2026-10-22T03:01:00Z' }), sent)).toBe(false)
    expect(seenByStaff(contact({ staff_read_at: '2026-10-22T03:09:00Z' }), sent.slice(0, 1))).toBe(false)
  })

  it('adds live messages once, in order', () => {
    const current = [message(1, 'student', 'a'), message(3, 'staff', 'c')]
    expect(mergeMessages(current, [message(3, 'staff', 'c')])).toBe(current)
    expect(mergeMessages(current, [message(2, 'student', 'b')]).map((m) => m.id)).toEqual([1, 2, 3])
  })

  it('labels the consultant and class teachers', () => {
    expect(roleLabel({ role: 'consultant' })).toBe('Consultant')
    expect(roleLabel({ role: 'teacher' })).toBe('Class teacher')
  })

  it('shows the time today and the day before that (Malaysia time)', () => {
    const now = new Date('2026-10-22T07:00:00Z')
    expect(messageTime('2026-10-22T06:05:00Z', now)).toBe('2:05 pm')
    expect(messageTime('2026-10-21T06:05:00Z', now)).toBe('21 Oct')
  })
})
