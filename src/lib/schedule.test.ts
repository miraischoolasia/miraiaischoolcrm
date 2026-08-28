import { describe, expect, it } from 'vitest'
import { buildScheduleEvents, calculateDuration, getDateKeyFromDate } from './schedule'
import type { Classroom, Schedule, Student, Teacher } from '../types/domain'

describe('calculateDuration', () => {
  it('computes hours and minutes between two times', () => {
    expect(calculateDuration('19:30', '21:30')).toBe('02:00')
  })

  it('handles a sub-hour duration', () => {
    expect(calculateDuration('09:00', '09:45')).toBe('00:45')
  })
})

describe('getDateKeyFromDate', () => {
  it('formats a Date as YYYY-MM-DD with zero-padding', () => {
    expect(getDateKeyFromDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('buildScheduleEvents', () => {
  const teacher: Teacher = {
    id: 1,
    username: 't1',
    fullName: 'Jane Teacher',
    email: null,
    phone: null,
    role: 'teacher',
    isActive: true,
  }
  const classroom: Classroom = {
    id: 1,
    name: 'Group A',
    ageGroup: '6-8 Years Old',
    programLevel: 'Coder Foundation',
    teacherId: 1,
    status: 'active',
    notes: null,
    archivedAt: null,
  }
  const student: Student = {
    id: 1,
    teacherId: 1,
    classroomId: 1,
    name: 'Olivia Tan',
    remainingHours: 5,
    lessonExpiryDate: '2026-09-01',
    accountFeeExpiryDate: '2026-09-01',
    miraiClubExpiryDate: '2026-09-01',
    notes: null,
    isActive: true,
    studentType: 'regular',
  }

  const teacherMap = new Map([[teacher.id, teacher]])
  const classroomMap = new Map([[classroom.id, classroom]])
  const classroomStudentMap = new Map([[classroom.id, [student]]])
  const studentMap = new Map([[student.id, student]])

  it('builds an rrule-based event for a regular schedule using the classroom roster', () => {
    const schedule: Schedule = {
      id: 100,
      teacherId: 1,
      classroomId: 1,
      title: 'Group A',
      eventType: 'regular',
      recurrenceType: 'weekly',
      dayOfWeek: 2,
      scheduledDate: null,
      startTime: '19:30',
      endTime: '21:30',
      startRecur: '2026-08-01',
      endRecur: null,
      status: 'active',
      notes: null,
    }

    const [event] = buildScheduleEvents(
      [schedule],
      classroomMap,
      classroomStudentMap,
      teacherMap,
      new Map(),
      studentMap,
    )

    expect(event.title).toBe('Group A')
    expect(event.duration).toBe('02:00')
    expect(event.extendedProps?.participantNames).toBe('Olivia Tan')
    expect(event.rrule).toMatchObject({ freq: 'weekly', byweekday: ['tu'] })
  })

  it('builds a fixed start/end event for a replacement schedule using the participant map', () => {
    const schedule: Schedule = {
      id: 101,
      teacherId: 1,
      classroomId: null,
      title: 'Makeup Class',
      eventType: 'replacement',
      recurrenceType: 'none',
      dayOfWeek: null,
      scheduledDate: '2026-08-15',
      startTime: '10:00',
      endTime: '11:00',
      startRecur: null,
      endRecur: null,
      status: 'active',
      notes: null,
    }
    const scheduleParticipantMap = new Map([[schedule.id, [student.id]]])

    const [event] = buildScheduleEvents(
      [schedule],
      classroomMap,
      classroomStudentMap,
      teacherMap,
      scheduleParticipantMap,
      studentMap,
    )

    expect(event.title).toBe('Makeup Class')
    expect(event.start).toBe('2026-08-15T10:00')
    expect(event.end).toBe('2026-08-15T11:00')
    expect(event.extendedProps?.participantNames).toBe('Olivia Tan')
  })

  it('excludes cancelled schedules', () => {
    const schedule: Schedule = {
      id: 102,
      teacherId: 1,
      classroomId: 1,
      title: 'Cancelled',
      eventType: 'regular',
      recurrenceType: 'weekly',
      dayOfWeek: 2,
      scheduledDate: null,
      startTime: '19:30',
      endTime: '21:30',
      startRecur: '2026-08-01',
      endRecur: null,
      status: 'cancelled',
      notes: null,
    }

    const events = buildScheduleEvents(
      [schedule],
      classroomMap,
      classroomStudentMap,
      teacherMap,
      new Map(),
      studentMap,
    )

    expect(events).toHaveLength(0)
  })
})
