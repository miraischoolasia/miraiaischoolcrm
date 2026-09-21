import { describe, expect, it } from 'vitest'
import { RRule, RRuleSet } from 'rrule'
import type { Weekday } from 'rrule'
import {
  buildScheduleEvents,
  calculateDuration,
  filterSchedulesByClassKind,
  getDateKeyFromDate,
  getScheduleClassKind,
} from './schedule'
import type { Classroom, Schedule, ScheduleException, Student, Teacher } from '../types/domain'

const weekdayConstants: Record<string, Weekday> = {
  su: RRule.SU,
  mo: RRule.MO,
  tu: RRule.TU,
  we: RRule.WE,
  th: RRule.TH,
  fr: RRule.FR,
  sa: RRule.SA,
}

// Mirrors the string -> constant conversion @fullcalendar/rrule performs on
// the plain rrule/exrule objects buildScheduleEvents returns, so the test
// can expand the real rrule.js RRuleSet FullCalendar will render.
function toRRule(input: {
  freq: string
  byweekday?: string[]
  bymonthday?: number[]
  dtstart: string
  until?: string
}) {
  return new RRule({
    freq: input.freq === 'weekly' ? RRule.WEEKLY : RRule.DAILY,
    ...(input.byweekday ? { byweekday: input.byweekday.map((day) => weekdayConstants[day]) } : {}),
    ...(input.bymonthday ? { bymonthday: input.bymonthday } : {}),
    dtstart: new Date(input.dtstart),
    ...(input.until ? { until: new Date(input.until) } : {}),
  })
}

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
    authUserId: null,
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
    category: 'regular',
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
    phone: null,
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
    expect(event.exrule).toMatchObject({ freq: 'daily', bymonthday: [29, 30, 31] })
  })

  it('caps every regular class at 4 occurrences per month with no class on the 29th/30th/31st', () => {
    const schedule: Schedule = {
      id: 103,
      teacherId: 1,
      classroomId: 1,
      title: 'Group A',
      eventType: 'regular',
      recurrenceType: 'weekly',
      dayOfWeek: 2, // Tuesday
      scheduledDate: null,
      startTime: '19:30',
      endTime: '21:30',
      startRecur: '2026-01-01',
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

    const set = new RRuleSet()
    set.rrule(toRRule(event.rrule as Parameters<typeof toRRule>[0]))
    set.exrule(toRRule(event.exrule as Parameters<typeof toRRule>[0]))

    for (let month = 0; month < 12; month++) {
      const monthStart = new Date(2026, month, 1)
      const monthEnd = new Date(2026, month + 1, 1)
      const occurrences = set.between(monthStart, monthEnd, true)

      for (const occurrence of occurrences) {
        expect([29, 30, 31]).not.toContain(occurrence.getDate())
      }
      expect(occurrences.length).toBeLessThanOrEqual(4)
    }
  })

  describe('class kind filter', () => {
    const trialClassroom: Classroom = { ...classroom, id: 2, name: 'Trial A', category: 'trial' }
    const kindClassroomMap = new Map([
      [classroom.id, classroom],
      [trialClassroom.id, trialClassroom],
    ])
    const base: Schedule = {
      id: 200,
      teacherId: 1,
      classroomId: 1,
      title: 'Group A',
      eventType: 'regular',
      recurrenceType: 'weekly',
      dayOfWeek: 2,
      scheduledDate: null,
      startTime: '19:30',
      endTime: '21:30',
      startRecur: '2026-09-01',
      endRecur: null,
      status: 'active',
      notes: null,
    }
    const regularSchedule = base
    const trialSchedule: Schedule = { ...base, id: 201, classroomId: 2, title: 'Trial A' }
    const replacementSchedule: Schedule = {
      ...base,
      id: 202,
      classroomId: null,
      eventType: 'replacement',
      recurrenceType: 'none',
      dayOfWeek: null,
      scheduledDate: '2026-09-10',
      startRecur: null,
    }
    const all = [regularSchedule, trialSchedule, replacementSchedule]

    it('classifies schedules as regular, trial or replacement', () => {
      expect(getScheduleClassKind(regularSchedule, kindClassroomMap)).toBe('regular')
      expect(getScheduleClassKind(trialSchedule, kindClassroomMap)).toBe('trial')
      expect(getScheduleClassKind(replacementSchedule, kindClassroomMap)).toBe('replacement')
    })

    it('returns everything for the all filter', () => {
      expect(filterSchedulesByClassKind(all, kindClassroomMap, 'all')).toHaveLength(3)
    })

    it.each([
      ['regular', 200],
      ['trial', 201],
      ['replacement', 202],
    ] as const)('keeps only %s schedules', (filter, expectedId) => {
      const result = filterSchedulesByClassKind(all, kindClassroomMap, filter)
      expect(result.map((schedule) => schedule.id)).toEqual([expectedId])
    })

    it('tags calendar events with their class kind', () => {
      const events = buildScheduleEvents(
        all,
        kindClassroomMap,
        classroomStudentMap,
        teacherMap,
        new Map(),
        studentMap,
      )

      expect(events.map((event) => event.extendedProps?.classKind)).toEqual([
        'regular',
        'trial',
        'replacement',
      ])
    })
  })

  describe('single-day cancellation', () => {
    const weeklySchedule: Schedule = {
      id: 104,
      teacherId: 1,
      classroomId: 1,
      title: 'Group A',
      eventType: 'regular',
      recurrenceType: 'weekly',
      dayOfWeek: 2, // Tuesday
      scheduledDate: null,
      startTime: '19:30',
      endTime: '21:30',
      startRecur: '2026-09-01',
      endRecur: null,
      status: 'active',
      notes: null,
    }

    function buildWithExceptions(exceptions: ScheduleException[]) {
      return buildScheduleEvents(
        [weeklySchedule],
        classroomMap,
        classroomStudentMap,
        teacherMap,
        new Map(),
        studentMap,
        exceptions,
      )
    }

    it('leaves the series untouched when there are no exceptions', () => {
      const events = buildWithExceptions([])

      expect(events).toHaveLength(1)
      expect(events[0].exdate).toBeUndefined()
    })

    it('adds an exdate that removes only the cancelled Tuesday from the rrule expansion', () => {
      const events = buildWithExceptions([
        { id: 1, scheduleId: 104, exceptionDate: '2026-09-08', reason: 'Teacher on leave' },
      ])
      const [series] = events

      expect(series.exdate).toEqual(['2026-09-08T19:30'])

      const set = new RRuleSet()
      set.rrule(toRRule(series.rrule as Parameters<typeof toRRule>[0]))
      set.exrule(toRRule(series.exrule as Parameters<typeof toRRule>[0]))
      for (const exdate of series.exdate as string[]) {
        set.exdate(new Date(exdate))
      }

      const septemberDays = set
        .between(new Date(2026, 8, 1), new Date(2026, 9, 1), true)
        .map((occurrence) => occurrence.getDate())

      // Tuesdays in Sep 2026 are 1, 8, 15, 22, 29 (29th is capped out already).
      expect(septemberDays).toEqual([1, 15, 22])
    })

    it('emits a cancelled-occurrence card carrying the date and reason', () => {
      const events = buildWithExceptions([
        { id: 1, scheduleId: 104, exceptionDate: '2026-09-08', reason: 'Teacher on leave' },
      ])

      expect(events).toHaveLength(2)
      expect(events[1]).toMatchObject({
        id: 'schedule-104-cancelled-2026-09-08',
        title: 'Group A',
        start: '2026-09-08T19:30',
        end: '2026-09-08T21:30',
        extendedProps: {
          scheduleId: 104,
          isCancelledOccurrence: true,
          occurrenceDate: '2026-09-08',
          cancelReason: 'Teacher on leave',
        },
      })
    })

    it('ignores exceptions that belong to a different schedule', () => {
      const events = buildWithExceptions([
        { id: 2, scheduleId: 999, exceptionDate: '2026-09-08', reason: null },
      ])

      expect(events).toHaveLength(1)
      expect(events[0].exdate).toBeUndefined()
    })
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
