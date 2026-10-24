import { describe, expect, it } from 'vitest'
import { lessonSeatNotes, lessonsOnDate, seatTargets, studentLessons } from './lessonSeats'
import type { Classroom, Schedule, ScheduleException, Student } from '../types/domain'

const classroom = (id: number, name: string, ageGroup: string, category: 'regular' | 'trial' = 'regular'): Classroom =>
  ({ id, name, ageGroup, programLevel: 'Coder Foundation', teacherId: 1, status: 'active', category, notes: null, archivedAt: null }) as Classroom

const weekly = (id: number, classroomId: number, dayOfWeek: number, startTime: string): Schedule => ({
  id,
  teacherId: 1,
  classroomId,
  title: `Slot ${id}`,
  eventType: 'regular',
  recurrenceType: 'weekly',
  dayOfWeek,
  scheduledDate: null,
  startTime,
  endTime: '11:00',
  startRecur: '2026-01-01',
  endRecur: null,
  status: 'active',
  notes: null,
})

const classrooms = [classroom(1, 'Mon A', '6-8 Years Old'), classroom(2, 'Tue B', '6-8 Years Old'), classroom(3, 'Tue C', '12-14 Years Old')]
const schedules = [weekly(1, 1, 1, '10:00'), weekly(2, 2, 2, '12:00'), weekly(3, 3, 2, '09:00')]
const kid = {
  id: 9,
  name: 'Kid',
  isActive: true,
  classroomId: 1,
  classPeriods: [{ classroomId: 1, startDate: null, endDate: null }],
} as unknown as Student

// 2026-11-02 is a Monday.
describe('lesson seats', () => {
  it('finds the classes that meet on a day, not a cancelled one and not the 29th-31st', () => {
    expect(lessonsOnDate('2026-11-03', schedules, [], classrooms).map((lesson) => lesson.className)).toEqual(['Tue C', 'Tue B'])
    const cancelled: ScheduleException[] = [{ id: 1, scheduleId: 2, exceptionDate: '2026-11-03', reason: null }]
    expect(lessonsOnDate('2026-11-03', schedules, cancelled, classrooms).map((lesson) => lesson.className)).toEqual(['Tue C'])
    // 2026-11-30 is a Monday on the 30th.
    expect(lessonsOnDate('2026-11-30', schedules, [], classrooms)).toEqual([])
  })

  it('lists the lessons of the classes the student is in', () => {
    const lessons = studentLessons(kid, '2026-11-01', 14, schedules, [], classrooms)

    expect(lessons.map((lesson) => lesson.date)).toEqual(['2026-11-02', '2026-11-09'])
  })

  it('leaves out a lesson the student has been changed out of', () => {
    const moved = { ...kid, lessonSeats: [{ id: 1, studentId: 9, kind: 'change', fromClassroomId: 1, fromDate: '2026-11-02', toClassroomId: 2, toDate: '2026-11-03', note: null }] } as Student

    expect(studentLessons(moved, '2026-11-01', 14, schedules, [], classrooms).map((lesson) => lesson.date)).toEqual(['2026-11-09'])
  })

  it('offers other lessons, the same age group first', () => {
    const targets = seatTargets(kid, [kid], '2026-11-02', 3, schedules, [], classrooms)

    expect(targets.map((target) => `${target.className} ${target.date}`)).toEqual(['Tue B 2026-11-03', 'Tue C 2026-11-03'])
    expect(targets[0].sameAgeGroup).toBe(true)
    expect(targets[1].sameAgeGroup).toBe(false)
    expect(targets[0].children).toBe(0)
  })
})

describe('lessonSeatNotes', () => {
  const seatKid = (seats: unknown[]) => ({ ...kid, lessonSeats: seats }) as Student
  const replacement = { id: 1, studentId: 9, kind: 'replacement', fromClassroomId: null, fromDate: null, toClassroomId: 2, toDate: '2026-11-03', note: null }
  const change = { id: 2, studentId: 9, kind: 'change', fromClassroomId: 1, fromDate: '2026-11-02', toClassroomId: 2, toDate: '2026-11-03', note: null }

  it('names the children sitting in, and the ones changed out, on that day', () => {
    expect(lessonSeatNotes([seatKid([replacement])], 2, '2026-11-03', false)).toEqual(['Replacement: Kid'])
    expect(lessonSeatNotes([seatKid([change])], 2, '2026-11-03', false)).toEqual(['Changed class in: Kid'])
    expect(lessonSeatNotes([seatKid([change])], 1, '2026-11-02', false)).toEqual(['Changed class out: Kid'])
  })

  it('counts them in the summary view, and says nothing on another day or classroom', () => {
    expect(lessonSeatNotes([seatKid([replacement, change])], 2, '2026-11-03', true)).toEqual(['1 replacement', '1 changed class in'])
    expect(lessonSeatNotes([seatKid([replacement])], 2, '2026-11-10', false)).toEqual([])
    expect(lessonSeatNotes([seatKid([replacement])], 1, '2026-11-03', false)).toEqual([])
    expect(lessonSeatNotes([seatKid([replacement])], null, '2026-11-03', false)).toEqual([])
  })
})
