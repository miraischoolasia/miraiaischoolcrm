import { describe, expect, it } from 'vitest'
import { ageRangeText, buildTeacherClasses } from './teacherDetails'
import type { StudentRow } from './studentRows'
import type { Classroom, Schedule, TrialBooking } from '../types/domain'

const today = '2026-10-14'

function room(id: number, name: string, extra: Partial<Classroom> = {}): Classroom {
  return {
    id, name, category: 'regular', ageGroup: '9-11 Years Old', programLevel: 'Coder Pro', teacherId: 9,
    status: 'active', notes: null, archivedAt: null, ...extra,
  }
}
function weekly(id: number, classroomId: number, dayOfWeek: number, start: string, end: string, extra: Partial<Schedule> = {}): Schedule {
  return {
    id, teacherId: 9, classroomId, title: `S${id}`, eventType: 'regular', recurrenceType: 'weekly', dayOfWeek,
    scheduledDate: null, startTime: start, endTime: end, startRecur: '2026-01-01', endRecur: null, status: 'active', notes: null, ...extra,
  }
}
function row(id: number, name: string, classroomId: number | null, isActive = true): StudentRow {
  return { student: { id, name, classroomId, isActive }, issues: [], needsFollowUp: false, rank: 10 } as unknown as StudentRow
}

describe('buildTeacherClasses', () => {
  it("lists the teacher's classes with their weekly times and who is in them", () => {
    const cards = buildTeacherClasses({
      teacherId: 9,
      classrooms: [room(1, 'TUE C004'), room(2, 'THU C001', { teacherId: 3 }), room(3, 'OLD', { status: 'archived' })],
      schedules: [
        weekly(10, 1, 2, '20:30', '22:00'),
        // Teaches a class that belongs to someone else on Thursday: still one of this teacher's classes.
        weekly(11, 2, 4, '16:00', '17:30'),
        weekly(12, 3, 1, '10:00', '11:00'),
      ],
      studentRows: [row(1, 'Zoe', 1), row(2, 'Ben', 1), row(3, 'Gone', 1, false), row(4, 'Mia', 2)],
      trialBookings: [],
      todayString: today,
    })

    // Tuesday comes before Thursday.
    expect(cards.map((card) => [card.classroom.name, card.slots])).toEqual([
      ['TUE C004', ['Tue 8:30 pm-10:00 pm']],
      ['THU C001', ['Thu 4:00 pm-5:30 pm']],
    ])
    expect(cards[0].students.map((entry) => entry.student.name)).toEqual(['Ben', 'Zoe'])
  })

  it('lists the children booked into a trial slot from today on, once each', () => {
    const booking = (id: number, date: string, studentId: number | null): TrialBooking => ({
      id, scheduleId: 20, bookingDate: date, leadId: null, studentId, childName: 'x', childAge: 7, phone: null, notes: null,
    })
    const cards = buildTeacherClasses({
      teacherId: 9,
      classrooms: [room(7, 'HOA 6-8', { category: 'trial', ageGroup: '6-8 Years Old' })],
      schedules: [weekly(20, 7, 6, '10:00', '12:00')],
      studentRows: [row(5, 'Jayden', null), row(6, 'Old kid', null)],
      trialBookings: [booking(1, '2026-10-17', 5), booking(2, '2026-10-24', 5), booking(3, '2026-10-03', 6), booking(4, '2026-10-17', null)],
      todayString: today,
    })

    expect(cards[0].isTrialSlot).toBe(true)
    expect(cards[0].students.map((entry) => entry.student.name)).toEqual(['Jayden'])
  })
})

describe('buildTeacherClasses order', () => {
  it('puts regular classes first, then the other courses, each through the week', () => {
    const cards = buildTeacherClasses({
      teacherId: 9,
      classrooms: [
        room(1, 'SUN C008'),
        room(2, 'MON C002'),
        room(3, 'HOA 6-8', { category: 'trial' }),
        room(4, 'Holiday camp', { category: 'camp' }),
        room(5, 'WED C003'),
      ],
      schedules: [
        weekly(10, 1, 0, '11:00', '12:30'),
        weekly(11, 2, 1, '16:00', '17:30'),
        weekly(12, 3, 6, '10:00', '12:00'),
        weekly(13, 4, 3, '09:00', '12:00'),
        weekly(14, 5, 3, '16:00', '17:30'),
      ],
      studentRows: [],
      trialBookings: [],
      todayString: today,
    })

    expect(cards.map((card) => [card.group, card.classroom.name])).toEqual([
      ['regular', 'MON C002'],
      ['regular', 'WED C003'],
      ['regular', 'SUN C008'],
      ['other', 'Holiday camp'],
      ['other', 'HOA 6-8'],
    ])
  })

  it('puts the fuller class first when two meet at the same time', () => {
    const cards = buildTeacherClasses({
      teacherId: 9,
      classrooms: [room(1, 'A small'), room(2, 'B full')],
      schedules: [weekly(10, 1, 2, '16:00', '17:00'), weekly(11, 2, 2, '16:00', '17:00')],
      studentRows: [row(1, 'x', 1), row(2, 'y', 2), row(3, 'z', 2)],
      trialBookings: [],
      todayString: today,
    })

    expect(cards.map((card) => card.classroom.name)).toEqual(['B full', 'A small'])
  })
})

describe('ageRangeText', () => {
  it('writes one age or a range, or nothing', () => {
    expect([[], [9], [11, 9, 10]].map(ageRangeText)).toEqual([null, '9', '9-11'])
  })
})
