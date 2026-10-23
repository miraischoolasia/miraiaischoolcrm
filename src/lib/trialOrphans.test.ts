import { describe, expect, it } from 'vitest'
import { bookingsLeftBehind, leftBehindMessage, orphanBookings, slotRunsOn, type SlotDays } from './trialOrphans'
import type { Schedule, TrialBooking } from '../types/domain'

// 2026-10-22 is a Thursday (4), 2026-10-17 a Saturday (6).
const thursday: SlotDays = { eventType: 'regular', dayOfWeek: 4, startRecur: '2026-10-01', endRecur: null, status: 'active' }

const booking = (id: number, scheduleId: number, bookingDate: string): TrialBooking => ({
  id,
  scheduleId,
  bookingDate,
  leadId: null,
  studentId: null,
  childName: `Child ${id}`,
  childAge: 9,
  phone: null,
  notes: null,
})

const schedule = (id: number, change: Partial<Schedule> = {}): Schedule => ({
  id,
  teacherId: 1,
  classroomId: 1,
  title: 'HOA',
  eventType: 'regular',
  recurrenceType: 'weekly',
  dayOfWeek: 4,
  scheduledDate: null,
  startTime: '17:00:00',
  endTime: '19:00:00',
  startRecur: '2026-10-01',
  endRecur: null,
  status: 'active',
  notes: null,
  ...change,
})

describe('slotRunsOn', () => {
  it('runs on its weekday between its first and last day', () => {
    expect(slotRunsOn(thursday, '2026-10-22')).toBe(true)
    expect(slotRunsOn(thursday, '2026-10-23')).toBe(false)
    expect(slotRunsOn(thursday, '2026-09-24')).toBe(false)
    expect(slotRunsOn({ ...thursday, endRecur: '2026-10-15' }, '2026-10-22')).toBe(false)
    expect(slotRunsOn({ ...thursday, endRecur: '2026-10-22' }, '2026-10-22')).toBe(true)
  })

  it('does not run when it is cancelled, not weekly, or has no weekday', () => {
    expect(slotRunsOn({ ...thursday, status: 'cancelled' }, '2026-10-22')).toBe(false)
    expect(slotRunsOn({ ...thursday, eventType: 'replacement' }, '2026-10-22')).toBe(false)
    expect(slotRunsOn({ ...thursday, dayOfWeek: null }, '2026-10-22')).toBe(false)
  })
})

describe('bookingsLeftBehind', () => {
  const bookings = [booking(1, 39, '2026-10-22'), booking(2, 39, '2026-10-29'), booking(3, 40, '2026-10-22'), booking(4, 39, '2026-10-08')]

  it('finds the bookings a weekly slot turned into one single day would lose', () => {
    const oneDay = { ...thursday, startRecur: '2026-10-15', endRecur: '2026-10-15' }
    const lost = bookingsLeftBehind(bookings, 39, thursday, oneDay, '2026-10-13')
    expect(lost.map((entry) => entry.id)).toEqual([1, 2])
  })

  it('leaves the other slots and the days already gone alone', () => {
    const ended = { ...thursday, endRecur: '2026-10-11' }
    expect(bookingsLeftBehind(bookings, 39, thursday, ended, '2026-10-13').map((entry) => entry.id)).toEqual([1, 2])
    // The 8 Oct booking is before today: history.
    expect(bookingsLeftBehind(bookings, 39, thursday, ended, '2026-10-13').map((entry) => entry.id)).not.toContain(4)
  })

  it('finds them when the weekday changes or the slot is cancelled, and not when the edit keeps them', () => {
    expect(bookingsLeftBehind(bookings, 39, thursday, { ...thursday, dayOfWeek: 6 }, '2026-10-13')).toHaveLength(2)
    expect(bookingsLeftBehind(bookings, 39, thursday, { ...thursday, status: 'cancelled' }, '2026-10-13')).toHaveLength(2)
    expect(bookingsLeftBehind(bookings, 39, thursday, { ...thursday, endRecur: '2026-12-31' }, '2026-10-13')).toEqual([])
  })

  it('does not count a day that already has its attendance in', () => {
    const lost = bookingsLeftBehind(bookings, 39, thursday, { ...thursday, dayOfWeek: 6 }, '2026-10-13', (_id, date) => date === '2026-10-22')
    expect(lost.map((entry) => entry.id)).toEqual([2])
  })

  it('does not blame the edit for a booking that was already without a class', () => {
    const alreadyOrphan = [booking(9, 39, '2026-10-24')]
    expect(bookingsLeftBehind(alreadyOrphan, 39, thursday, { ...thursday, dayOfWeek: 1 }, '2026-10-13')).toEqual([])
  })
})

describe('orphanBookings', () => {
  it('lists the bookings whose slot does not run that day, and only those without attendance', () => {
    const schedules = [schedule(39, { startRecur: '2026-10-15', endRecur: '2026-10-15' }), schedule(49)]
    const bookings = [booking(41, 39, '2026-10-22'), booking(42, 49, '2026-10-22'), booking(43, 39, '2026-10-15'), booking(44, 99, '2026-10-22')]
    expect(orphanBookings(bookings, schedules).map((entry) => entry.id)).toEqual([41])
    expect(orphanBookings(bookings, schedules, () => true)).toEqual([])
  })
})

describe('leftBehindMessage', () => {
  it('says how many and the first day', () => {
    expect(leftBehindMessage(1, '2026-10-22')).toBe('1 trial booking would be left without a class (first: 2026-10-22). Move or cancel it first.')
    expect(leftBehindMessage(3, '2026-10-22')).toBe('3 trial bookings would be left without a class (first: 2026-10-22). Move or cancel them first.')
  })
})
