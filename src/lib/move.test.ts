import { describe, expect, it } from 'vitest'
import { getDragBlockReason, getTimeFromDate, getTrialSlotsOnDate, type DragCheck } from './move'
import type { Classroom, Schedule } from '../types/domain'

const base: DragCheck = {
  classKind: 'regular',
  fromDate: '2026-10-07',
  toDate: '2026-10-09',
  todayString: '2026-09-29',
  droppedAllDay: false,
  hasAttendance: false,
  trialBookingCount: 0,
  trialSlotsOnTarget: 0,
}

describe('getDragBlockReason', () => {
  it('allows a class without attendance moving to a later date', () => {
    expect(getDragBlockReason(base)).toBeNull()
  })

  it('allows a past class nobody took attendance for', () => {
    expect(getDragBlockReason({ ...base, fromDate: '2026-09-23' })).toBeNull()
  })

  it('refuses today, past dates, attendance and the all-day row', () => {
    expect(getDragBlockReason({ ...base, toDate: '2026-09-29' })).toMatch(/after today/)
    expect(getDragBlockReason({ ...base, hasAttendance: true })).toMatch(/Attendance/)
    expect(getDragBlockReason({ ...base, droppedAllDay: true })).toMatch(/all-day/)
  })

  it('needs bookings and a target slot for a trial', () => {
    const trial = { ...base, classKind: 'trial' as const }
    expect(getDragBlockReason(trial)).toMatch(/Nobody is booked/)
    expect(getDragBlockReason({ ...trial, trialBookingCount: 2 })).toMatch(/no trial slot/)
    expect(
      getDragBlockReason({ ...trial, trialBookingCount: 2, trialSlotsOnTarget: 1 }),
    ).toBeNull()
  })
})

describe('getTrialSlotsOnDate', () => {
  const classroom = (id: number, category: 'trial' | 'regular'): Classroom =>
    ({ id, name: `Room ${id}`, category, status: 'active' }) as Classroom
  const schedule = (id: number, classroomId: number, dayOfWeek: number, startTime: string) =>
    ({
      id,
      teacherId: 1,
      classroomId,
      title: 'x',
      eventType: 'regular',
      recurrenceType: 'weekly',
      dayOfWeek,
      scheduledDate: null,
      startTime,
      endTime: '23:00',
      startRecur: '2026-08-01',
      endRecur: null,
      status: 'active',
      notes: null,
    }) as Schedule
  const classroomMap = new Map([
    [1, classroom(1, 'trial')],
    [2, classroom(2, 'regular')],
  ])

  it('lists trial slots on that weekday, earliest first, 31st included', () => {
    const slots = getTrialSlotsOnDate(
      [schedule(10, 1, 6, '14:00'), schedule(11, 1, 6, '10:00'), schedule(12, 2, 6, '09:00')],
      classroomMap,
      [],
      '2026-10-31',
    )
    expect(slots.map((slot) => slot.id)).toEqual([11, 10])
  })

  it('skips a slot cancelled that day', () => {
    const slots = getTrialSlotsOnDate(
      [schedule(10, 1, 6, '14:00')],
      classroomMap,
      [{ id: 1, scheduleId: 10, exceptionDate: '2026-10-03', reason: null }],
      '2026-10-03',
    )
    expect(slots).toEqual([])
  })
})

describe('getTimeFromDate', () => {
  it('formats local time as HH:mm', () => {
    expect(getTimeFromDate(new Date(2026, 9, 9, 7, 5))).toBe('07:05')
  })
})
