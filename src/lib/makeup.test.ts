import { describe, expect, it } from 'vitest'
import {
  addMinutesToTime,
  buildMakeupMap,
  flattenMakeupPlans,
  getUpcomingClassDates,
  isScheduleMeetingDate,
  makeupKey,
} from './makeup'
import { buildScheduleEvents } from './schedule'
import type { Classroom, MakeupPlan, Schedule, ScheduleException, Teacher } from '../types/domain'

// Wednesdays, 8:30-9:30pm, from 2 Sep 2026.
const schedule: Schedule = {
  id: 100,
  teacherId: 1,
  classroomId: 10,
  title: 'Wed Class',
  eventType: 'regular',
  recurrenceType: 'weekly',
  dayOfWeek: 3,
  scheduledDate: null,
  startTime: '20:30',
  endTime: '21:30',
  startRecur: '2026-09-02',
  endRecur: null,
  status: 'active',
  notes: null,
}

const classroom: Classroom = {
  category: 'regular',
  id: 10,
  name: 'Wed Class',
  ageGroup: '9-11 Years Old',
  programLevel: 'Coder Pro',
  teacherId: 1,
  status: 'active',
  notes: null,
  archivedAt: null,
}

const teacher: Teacher = {
  id: 1,
  authUserId: null,
  username: 't1',
  fullName: 'Teacher One',
  email: null,
  phone: null,
  role: 'teacher',
  isActive: true,
  permissions: {},
}

const cancelled23: ScheduleException = {
  id: 1,
  scheduleId: 100,
  exceptionDate: '2026-09-23',
  reason: 'Teacher leave',
}

function plan(overrides: Partial<MakeupPlan>): MakeupPlan {
  return {
    id: 1,
    classroomId: 10,
    missedDate: '2026-09-23',
    studentId: null,
    missedMinutes: 60,
    notes: null,
    sessions: [],
    ...overrides,
  }
}

function events(plans: MakeupPlan[]) {
  return buildScheduleEvents(
    [schedule],
    new Map([[classroom.id, classroom]]),
    new Map(),
    new Map([[teacher.id, teacher]]),
    new Map(),
    new Map(),
    [cancelled23],
    flattenMakeupPlans(plans),
  )
}

describe('addMinutesToTime', () => {
  it('adds minutes across the hour', () => {
    expect(addMinutesToTime('21:30:00', 30)).toBe('22:00')
    expect(addMinutesToTime('20:30', 45)).toBe('21:15')
  })
})

describe('isScheduleMeetingDate', () => {
  it('accepts the class weekday and rejects other days', () => {
    expect(isScheduleMeetingDate(schedule, '2026-10-07', [], false)).toBe(true)
    expect(isScheduleMeetingDate(schedule, '2026-10-08', [], false)).toBe(false)
  })

  it('rejects a cancelled day', () => {
    expect(isScheduleMeetingDate(schedule, '2026-09-23', [cancelled23], true)).toBe(false)
  })

  it('only allows the 29th-31st for make-ups', () => {
    expect(isScheduleMeetingDate(schedule, '2026-09-30', [], false)).toBe(false)
    expect(isScheduleMeetingDate(schedule, '2026-09-30', [], true)).toBe(true)
  })
})

describe('getUpcomingClassDates', () => {
  it('returns the next class days, skipping cancelled days and the 29th-31st', () => {
    expect(getUpcomingClassDates([schedule], [cancelled23], '2026-09-16', 3)).toEqual([
      '2026-10-07',
      '2026-10-14',
      '2026-10-21',
    ])
  })
})

describe('buildMakeupMap', () => {
  it('groups sessions by classroom and date', () => {
    const map = buildMakeupMap(
      flattenMakeupPlans([
        plan({ sessions: [{ sessionDate: '2026-10-07', extraMinutes: 30 }] }),
        plan({ id: 2, studentId: 5, sessions: [{ sessionDate: '2026-10-07', extraMinutes: 15 }] }),
      ]),
    )

    expect(map.get(makeupKey(10, '2026-10-07'))).toHaveLength(2)
  })
})

describe('buildScheduleEvents with make-ups', () => {
  it('lengthens a whole-class make-up day and removes it from the weekly series', () => {
    const result = events([
      plan({
        sessions: [
          { sessionDate: '2026-10-07', extraMinutes: 30 },
          { sessionDate: '2026-10-14', extraMinutes: 30 },
        ],
      }),
    ])

    const series = result.find((event) => event.rrule)
    expect(series?.exdate).toEqual(
      expect.arrayContaining(['2026-09-23T20:30', '2026-10-07T20:30', '2026-10-14T20:30']),
    )

    const extended = result.find((event) => event.id === 'schedule-100-extended-2026-10-07')
    expect(extended?.start).toBe('2026-10-07T20:30')
    expect(extended?.end).toBe('2026-10-07T22:00')
  })

  it('leaves the card length alone for a single-student make-up', () => {
    const result = events([
      plan({ studentId: 5, sessions: [{ sessionDate: '2026-10-07', extraMinutes: 30 }] }),
    ])

    expect(result.some((event) => String(event.id).includes('extended'))).toBe(false)
    expect(result.find((event) => event.rrule)?.exdate).toEqual(['2026-09-23T20:30'])
  })

  it('adds a standalone make-up card on the 30th at the class time', () => {
    const result = events([
      plan({ sessions: [{ sessionDate: '2026-09-30', extraMinutes: 60 }] }),
    ])

    const card = result.find((event) => event.id === 'schedule-100-makeup-2026-09-30')
    expect(card?.start).toBe('2026-09-30T20:30')
    expect(card?.end).toBe('2026-09-30T21:30')
    expect(card?.extendedProps?.isMakeupOnly).toBe(true)
  })

  it('ignores a session on a day this class does not meet', () => {
    const result = events([
      plan({ sessions: [{ sessionDate: '2026-10-08', extraMinutes: 30 }] }),
    ])

    expect(result).toHaveLength(2) // the series + the cancelled 23rd
  })
})
