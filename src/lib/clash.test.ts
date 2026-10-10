import { describe, expect, it } from 'vitest'
import { findTeacherClashes } from './clash'
import type { Classroom, Schedule, ScheduleException } from '../types/domain'

const regularRoom = { id: 1, category: 'regular' } as Classroom
const trialRoom = { id: 2, category: 'trial' } as Classroom
const classrooms = new Map<number, Classroom>([
  [1, regularRoom],
  [2, trialRoom],
])

// Wednesday 7:30-9:30pm, running since 1 Sep 2026, teacher 1.
const wednesday: Schedule = {
  id: 10,
  teacherId: 1,
  classroomId: 1,
  title: 'Coding A',
  eventType: 'regular',
  recurrenceType: 'weekly',
  dayOfWeek: 3,
  scheduledDate: null,
  startTime: '19:30',
  endTime: '21:30',
  startRecur: '2026-09-01',
  endRecur: null,
  status: 'active',
  notes: null,
}

const replacement: Schedule = {
  ...wednesday,
  id: 20,
  classroomId: null,
  title: 'Makeup Kid',
  eventType: 'replacement',
  recurrenceType: 'none',
  dayOfWeek: null,
  scheduledDate: '2026-10-14', // a Wednesday
  startRecur: null,
}

function weekly(overrides: Partial<{ teacherId: number; dayOfWeek: number; startTime: string; endTime: string; startRecur: string; endRecur: string | null; excludeScheduleId: number }> = {}) {
  return {
    kind: 'weekly' as const,
    teacherId: 1,
    dayOfWeek: 3,
    startTime: '20:00',
    endTime: '21:00',
    startRecur: '2026-10-01',
    endRecur: null,
    ...overrides,
  }
}

function single(overrides: Partial<{ teacherId: number; date: string; startTime: string; endTime: string; excludeScheduleId: number }> = {}) {
  return {
    kind: 'single' as const,
    teacherId: 1,
    date: '2026-10-14',
    startTime: '20:00',
    endTime: '21:00',
    ...overrides,
  }
}

const find = (
  candidate: Parameters<typeof findTeacherClashes>[0],
  schedules: Schedule[],
  exceptions: ScheduleException[] = [],
) => findTeacherClashes(candidate, schedules, exceptions, classrooms)

describe('findTeacherClashes', () => {
  it('flags a weekly class that overlaps the same teacher on the same weekday', () => {
    const clashes = find(weekly(), [wednesday])

    expect(clashes).toEqual([
      { scheduleId: 10, title: 'Coding A', when: 'Wednesday 7:30pm-9:30pm' },
    ])
  })

  it('does not flag a different teacher, weekday, or a back-to-back class', () => {
    expect(find(weekly({ teacherId: 2 }), [wednesday])).toEqual([])
    expect(find(weekly({ dayOfWeek: 4 }), [wednesday])).toEqual([])
    // Ends exactly when the other starts: no overlap.
    expect(find(weekly({ startTime: '18:30', endTime: '19:30' }), [wednesday])).toEqual([])
    expect(find(weekly({ startTime: '21:30', endTime: '22:30' }), [wednesday])).toEqual([])
  })

  it('ignores a series whose dates never overlap', () => {
    const ended = { ...wednesday, endRecur: '2026-09-30' }
    expect(find(weekly({ startRecur: '2026-10-01' }), [ended])).toEqual([])
    expect(find(weekly({ startRecur: '2026-09-15' }), [ended])).toHaveLength(1)
    // A new series that ends before the existing one starts.
    expect(find(weekly({ startRecur: '2026-07-01', endRecur: '2026-08-31' }), [wednesday])).toEqual([])
  })

  it('does not flag the schedule being edited against itself', () => {
    expect(find(weekly({ excludeScheduleId: 10 }), [wednesday])).toEqual([])
  })

  it('ignores cancelled schedules', () => {
    expect(find(weekly(), [{ ...wednesday, status: 'cancelled' } as Schedule])).toEqual([])
  })

  it('flags a one-off class on a day the teacher already teaches', () => {
    expect(find(single(), [wednesday])).toHaveLength(1)
    expect(find(single({ date: '2026-10-15' }), [wednesday])).toEqual([])
  })

  it('lets a replacement take over a day that was cancelled', () => {
    const cancelled: ScheduleException = {
      id: 1,
      scheduleId: 10,
      exceptionDate: '2026-10-14',
      reason: null,
    }

    expect(find(single(), [wednesday], [cancelled])).toEqual([])
  })

  it('does not count the 29th-31st for a regular class, but does for a trial slot', () => {
    // 2026-12-30 is a Wednesday.
    expect(find(single({ date: '2026-12-30' }), [wednesday])).toEqual([])
    expect(
      find(single({ date: '2026-12-30' }), [{ ...wednesday, classroomId: 2 }]),
    ).toHaveLength(1)
  })

  it('flags two one-off classes on the same date, and a weekly series covering a one-off', () => {
    expect(find(single(), [replacement])).toEqual([
      { scheduleId: 20, title: 'Makeup Kid', when: '2026-10-14 7:30pm-9:30pm' },
    ])
    expect(find(single({ date: '2026-10-21' }), [replacement])).toEqual([])
    // The weekly series would cover the replacement's Wednesday.
    expect(find(weekly(), [replacement])).toHaveLength(1)
    expect(find(weekly({ startRecur: '2026-10-21' }), [replacement])).toEqual([])
  })

  it('does not count a series that ended, or an overlap that is already over', () => {
    // Wednesday series that ran 1 Sep to 11 Oct.
    const ended = { ...wednesday, endRecur: '2026-10-11' }
    // The new series starts on Wednesday 7 Oct: the only shared Wednesday is 7 Oct, which is past.
    const candidate = weekly({ startRecur: '2026-10-07' })
    expect(find(candidate, [ended])).toHaveLength(1)
    expect(find({ ...candidate, today: '2026-10-10' }, [ended])).toEqual([])
    // Still a clash when a shared Wednesday (14 Oct) is yet to come.
    expect(find({ ...candidate, today: '2026-10-08' }, [{ ...ended, endRecur: '2026-10-18' }])).toHaveLength(1)
  })

  it('does not count a one-off class that is already over', () => {
    expect(find({ ...weekly(), today: '2026-10-20' }, [replacement])).toEqual([])
    expect(find({ ...weekly(), today: '2026-10-14' }, [replacement])).toHaveLength(1)
  })

  it('returns nothing for an incomplete or backwards time range', () => {
    expect(find(weekly({ startTime: '', endTime: '' }), [wednesday])).toEqual([])
    expect(find(weekly({ startTime: '21:00', endTime: '20:00' }), [wednesday])).toEqual([])
  })
})
