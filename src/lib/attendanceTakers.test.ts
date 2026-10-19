import { describe, expect, it } from 'vitest'
import {
  attendanceTakerRole,
  buildSubstituteMap,
  canTakeAttendance,
  coveredLessons,
  defaultAttendanceTakerRules,
  parseAttendanceTakerRules,
  teachesSchedule,
  type AttendanceTakerContext,
} from './attendanceTakers'
import { getAgendaItems, type AgendaSources } from './teacherAgenda'
import type { Classroom, Schedule } from '../types/domain'

// Class 5: main teacher 9, assistant 4. Teacher 7 covers Wed Oct 14 only.
const classroom: Pick<Classroom, 'teacherId' | 'teacherIds'> = { teacherId: 9, teacherIds: [9, 4] }
const schedule: Schedule = {
  id: 1, teacherId: 9, classroomId: 5, title: 'WED C002', eventType: 'regular', recurrenceType: 'weekly', dayOfWeek: 3,
  scheduledDate: null, startTime: '16:00', endTime: '17:30', startRecur: '2026-01-01', endRecur: null, status: 'active', notes: null,
}
const substitutes = [{ scheduleId: 1, lessonDate: '2026-10-14', teacherId: 7 }]

function context(teacherId: number | null, overrides: Partial<AttendanceTakerContext> = {}): AttendanceTakerContext {
  return {
    isAdmin: false,
    teacherId,
    rules: defaultAttendanceTakerRules,
    substitutes: buildSubstituteMap(substitutes),
    classroomMap: new Map([[5, classroom]]),
    ...overrides,
  }
}

describe('who takes attendance', () => {
  it('admin and the class teacher always', () => {
    expect(attendanceTakerRole(context(null, { isAdmin: true }), schedule, '2026-10-07')).toBe('admin')
    expect(attendanceTakerRole(context(9), schedule, '2026-10-07')).toBe('teacher')
    const off = { rules: { assistants: false, substitutes: false } }
    expect(canTakeAttendance(context(9, off), schedule, '2026-10-07')).toBe(true)
  })

  it("the class's other teachers (assistants), every week, unless the school switches it off", () => {
    expect(attendanceTakerRole(context(4), schedule, '2026-10-07')).toBe('assistant')
    expect(attendanceTakerRole(context(4), schedule, '2026-10-21')).toBe('assistant')
    expect(canTakeAttendance(context(4, { rules: { assistants: false, substitutes: true } }), schedule, '2026-10-07')).toBe(false)
  })

  it('a substitute only on the day they cover, unless the school switches it off', () => {
    expect(attendanceTakerRole(context(7), schedule, '2026-10-14')).toBe('substitute')
    expect(canTakeAttendance(context(7), schedule, '2026-10-07')).toBe(false)
    expect(canTakeAttendance(context(7, { rules: { assistants: true, substitutes: false } }), schedule, '2026-10-14')).toBe(false)
  })

  it('nobody else', () => {
    expect(canTakeAttendance(context(8), schedule, '2026-10-14')).toBe(false)
    expect(canTakeAttendance(context(null), schedule, '2026-10-14')).toBe(false)
  })

  it('reads the school setting, both on when missing', () => {
    expect(parseAttendanceTakerRules(null)).toEqual({ assistants: true, substitutes: true })
    expect(parseAttendanceTakerRules({ assistants: false })).toEqual({ assistants: false, substitutes: true })
    expect(parseAttendanceTakerRules({ assistants: true, substitutes: false })).toEqual({ assistants: true, substitutes: false })
  })

  it('a teacher teaches the schedules of every class they are a teacher of', () => {
    expect(teachesSchedule(schedule, classroom, 9)).toBe(true)
    expect(teachesSchedule(schedule, classroom, 4)).toBe(true)
    expect(teachesSchedule(schedule, classroom, 7)).toBe(false)
    expect(teachesSchedule(schedule, null, 4)).toBe(false)
  })

  it('lists the days a teacher covers on classes that are not theirs', () => {
    expect(coveredLessons(substitutes, 7, () => false)).toEqual(substitutes)
    expect(coveredLessons(substitutes, 7, (id) => id === 1)).toEqual([])
    expect(coveredLessons(substitutes, 4, () => false)).toEqual([])
  })
})

describe("a teacher's Today with assistants and substitutes", () => {
  function agendaFor(teacherId: number) {
    const ctx = context(teacherId)
    const sources: AgendaSources = {
      teacherId,
      schedules: [schedule],
      exceptions: [],
      classroomMap: new Map([[5, { id: 5, name: 'WED C002', category: 'regular', ageGroup: '9-11', programLevel: 'Pro', status: 'active', notes: null, archivedAt: null, ...classroom }]]),
      lessonLogs: [],
      makeupEntries: [],
      getRosterIds: () => [1, 2],
      takes: (entry, date) => canTakeAttendance(ctx, entry, date),
    }
    return getAgendaItems(sources, '2026-10-16', '2026-10-05', '2026-10-25').map((item) => item.date)
  }

  it('lists every class day for the class teacher and the assistant', () => {
    expect(agendaFor(9)).toEqual(['2026-10-07', '2026-10-14', '2026-10-21'])
    expect(agendaFor(4)).toEqual(['2026-10-07', '2026-10-14', '2026-10-21'])
  })

  it('lists only the covered day for the substitute, and nothing for anyone else', () => {
    expect(agendaFor(7)).toEqual(['2026-10-14'])
    expect(agendaFor(8)).toEqual([])
  })
})
