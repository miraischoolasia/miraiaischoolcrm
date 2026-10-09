import { describe, expect, it } from 'vitest'
import { addDays, buildTeacherAgenda, getWeekRange, type AgendaSources } from './teacherAgenda'
import type { Classroom, LessonLogSummary, Schedule, ScheduleException } from '../types/domain'
import type { MakeupEntry } from './makeup'

// Friday, Oct 9 2026.
const today = '2026-10-09'

function room(id: number, name: string, category: Classroom['category'] = 'regular'): Classroom {
  return { id, name, category, ageGroup: '9-11 Years Old', programLevel: 'Coder Pro', teacherId: 9, status: 'active', notes: null, archivedAt: null }
}

function weekly(id: number, classroomId: number, dayOfWeek: number, startTime: string, endTime: string, overrides: Partial<Schedule> = {}): Schedule {
  return {
    id, teacherId: 9, classroomId, title: `Class ${id}`, eventType: 'regular', recurrenceType: 'weekly', dayOfWeek,
    scheduledDate: null, startTime, endTime, startRecur: '2026-01-01', endRecur: null, status: 'active', notes: null, ...overrides,
  }
}

function log(id: number, scheduleId: number, lessonDate: string, submittedAt = `${lessonDate}T10:00:00Z`): LessonLogSummary {
  return { id, scheduleId, teacherId: 9, lessonDate, lessonRemark: null, submittedAt, revisionNumber: 1, parentLogId: null }
}

function sources(overrides: Partial<AgendaSources> = {}): AgendaSources {
  return {
    teacherId: 9,
    schedules: [],
    exceptions: [],
    classroomMap: new Map([[5, room(5, 'WED C002')], [6, room(6, 'FRI C006')], [7, room(7, 'HOA slot', 'trial')]]),
    lessonLogs: [],
    makeupEntries: [],
    getRosterIds: () => [1, 2, 3],
    ...overrides,
  }
}

const wednesday = weekly(1, 5, 3, '16:00', '17:30')
const friday = weekly(2, 6, 5, '16:00', '17:30')

describe('buildTeacherAgenda', () => {
  it('lists today open, the coming week, and counts the Monday-Sunday week', () => {
    const agenda = buildTeacherAgenda(sources({ schedules: [wednesday, friday] }), today)

    expect(agenda.today.map((item) => [item.title, item.state, item.studentCount])).toEqual([['FRI C006', 'open', 3]])
    expect(agenda.upcoming.map((item) => item.date)).toEqual(['2026-10-14', '2026-10-16'])
    expect(agenda.upcoming.every((item) => item.state === 'later')).toBe(true)
    // Mon Oct 5 - Sun Oct 11: Wed Oct 7 and Fri Oct 9, 1.5 h each.
    expect(agenda.week).toEqual({ classes: 2, hours: 3 })
  })

  it('puts a past class with no attendance in To do, and not one that was submitted', () => {
    const agenda = buildTeacherAgenda(
      sources({ schedules: [wednesday], lessonLogs: [log(1, 1, '2026-10-07')] }),
      today,
    )
    // Oct 7 was submitted; Sep 25 is the first day of the 14-day look-back.
    expect(agenda.todo.map((item) => item.date)).toEqual([])

    const wide = buildTeacherAgenda(sources({ schedules: [wednesday] }), today, { lookbackDays: 30 })
    // Sep 30 is a 30th, so there is no class.
    expect(wide.todo.map((item) => item.date)).toEqual(['2026-09-09', '2026-09-16', '2026-09-23', '2026-10-07'])

    const none = buildTeacherAgenda(sources({ schedules: [wednesday] }), today, { lookbackDays: 3 })
    expect(none.todo.map((item) => item.date)).toEqual(['2026-10-07'])
    expect(none.todo[0].state).toBe('missing')
  })

  it('marks today submitted, with when it locks', () => {
    const agenda = buildTeacherAgenda(
      sources({ schedules: [friday], lessonLogs: [log(1, 2, today, '2026-10-09T08:00:00Z')] }),
      today,
    )

    expect(agenda.today[0].state).toBe('submitted')
    expect(agenda.today[0].editableUntil).toBe(new Date('2026-10-10T08:00:00Z').getTime())
  })

  it('skips another teacher, a cancelled day, a cancelled schedule and a class nobody is in', () => {
    const exception = { id: 1, scheduleId: 2, exceptionDate: today, reason: null } as ScheduleException
    const agenda = buildTeacherAgenda(
      sources({
        schedules: [
          friday,
          weekly(3, 6, 5, '18:00', '19:30', { teacherId: 4 }),
          weekly(4, 6, 5, '20:00', '21:00', { status: 'cancelled' }),
          weekly(5, 7, 5, '10:00', '11:30'),
        ],
        exceptions: [exception],
        getRosterIds: (scheduleId) => (scheduleId === 5 ? [] : [1]),
      }),
      today,
    )

    expect(agenda.today).toEqual([])
  })

  it('shows a trial slot only on a day someone is booked', () => {
    const trial = weekly(5, 7, 5, '10:00', '11:30')
    const booked = buildTeacherAgenda(sources({ schedules: [trial], getRosterIds: () => [8, 9] }), today)
    expect(booked.today.map((item) => [item.kind, item.subtitle, item.studentCount])).toEqual([['trial', 'Trial class', 2]])

    const empty = buildTeacherAgenda(sources({ schedules: [trial], getRosterIds: () => [] }), today)
    expect(empty.today).toEqual([])
  })

  it('does not run regular classes on the 29th-31st, but does for a make-up there', () => {
    const lateDay = '2026-10-30'
    const empty = buildTeacherAgenda(sources({ schedules: [friday] }), lateDay)
    expect(empty.today).toEqual([])

    const makeup: MakeupEntry = { planId: 1, classroomId: 6, missedDate: '2026-10-02', studentId: null, sessionDate: lateDay, extraMinutes: 30 }
    const withMakeup = buildTeacherAgenda(sources({ schedules: [friday], makeupEntries: [makeup] }), lateDay)
    expect(withMakeup.today.map((item) => [item.isMakeupOnly, item.startTime, item.endTime])).toEqual([[true, '16:00', '16:30']])
  })

  it('lengthens a normal day for a whole-class make-up', () => {
    const makeup: MakeupEntry = { planId: 1, classroomId: 6, missedDate: '2026-10-02', studentId: null, sessionDate: today, extraMinutes: 30 }
    const agenda = buildTeacherAgenda(sources({ schedules: [friday], makeupEntries: [makeup] }), today)

    expect(agenda.today[0]).toMatchObject({ endTime: '18:00', makeupMinutes: 30, minutes: 120 })
  })

  it('includes a one-off replacement class on its date', () => {
    const replacement = weekly(6, 6, 5, '12:00', '13:00', { eventType: 'replacement', recurrenceType: 'none', dayOfWeek: null, scheduledDate: today, startRecur: null })
    const agenda = buildTeacherAgenda(sources({ schedules: [replacement] }), today)

    expect(agenda.today.map((item) => [item.kind, item.subtitle])).toEqual([['replacement', 'Replacement class']])
  })
})

describe('date helpers', () => {
  it('finds the Monday-Sunday week and adds days across months', () => {
    expect(getWeekRange('2026-10-09')).toEqual({ start: '2026-10-05', end: '2026-10-11' })
    expect(getWeekRange('2026-10-11')).toEqual({ start: '2026-10-05', end: '2026-10-11' })
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
  })
})
