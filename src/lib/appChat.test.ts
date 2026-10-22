import { describe, expect, it } from 'vitest'
import {
  appChatSeenByStudent,
  appChatStudentLabel,
  appChatUnread,
  filterAppChatThreads,
  mergeAppChatMessages,
  type AppChatMessage,
  type AppChatThread,
} from './appChat'

function thread(extra: Partial<AppChatThread> = {}): AppChatThread {
  return {
    thread_id: 1,
    student_id: 10,
    student_name: 'Ali',
    student_code: 'S1234567',
    staff_id: 5,
    staff_name: 'Joey',
    role: 'teacher',
    mine: true,
    last_message_at: '2026-10-22T03:00:00Z',
    last_preview: 'hi',
    last_sender: 'student',
    unread_for_staff: 2,
    student_read_at: null,
    ...extra,
  }
}

function message(id: number, sender: AppChatMessage['sender'], at: string): AppChatMessage {
  return { id, thread_id: 1, sender, sender_staff_id: null, body: `m${id}`, created_at: at }
}

describe('app chat (CRM)', () => {
  it('counts unread only in chats written to me', () => {
    expect(appChatUnread([thread(), thread({ thread_id: 2, mine: false, unread_for_staff: 7 })])).toBe(2)
  })

  it('shows the student code before the name', () => {
    expect(appChatStudentLabel(thread())).toBe('S1234567 · Ali')
    expect(appChatStudentLabel(thread({ student_code: ' ' }))).toBe('Ali')
  })

  it('marks Read only when the student read the last staff reply', () => {
    const replies = [message(1, 'student', '2026-10-22T03:00:00Z'), message(2, 'staff', '2026-10-22T03:05:00Z')]
    expect(appChatSeenByStudent(thread({ student_read_at: '2026-10-22T03:06:00Z' }), replies)).toBe(true)
    expect(appChatSeenByStudent(thread({ student_read_at: '2026-10-22T03:04:00Z' }), replies)).toBe(false)
    expect(appChatSeenByStudent(thread({ student_read_at: '2026-10-22T03:06:00Z' }), replies.slice(0, 1))).toBe(false)
  })

  it('adds live messages once, in order', () => {
    const current = [message(1, 'student', 'a'), message(3, 'staff', 'c')]
    expect(mergeAppChatMessages(current, [message(3, 'staff', 'c')])).toBe(current)
    expect(mergeAppChatMessages(current, [message(2, 'student', 'b')]).map((m) => m.id)).toEqual([1, 2, 3])
  })

  it('searches code, student and teacher; admins can keep only their own', () => {
    const rows = [thread(), thread({ thread_id: 2, student_name: 'Siti', student_code: null, staff_name: 'Mei', mine: false })]
    expect(filterAppChatThreads(rows, 's1234', false).map((t) => t.thread_id)).toEqual([1])
    expect(filterAppChatThreads(rows, 'mei', false).map((t) => t.thread_id)).toEqual([2])
    expect(filterAppChatThreads(rows, '', true).map((t) => t.thread_id)).toEqual([1])
  })
})
