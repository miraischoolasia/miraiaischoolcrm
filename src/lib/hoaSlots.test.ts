import { describe, expect, it } from 'vitest'
import type { Classroom, Schedule, ScheduleException, Teacher, TrialBooking } from '../types/domain'
import {
  cleanHoaTitle,
  describeHoaSlot,
  formatClockForParent,
  hoaAgeRange,
  hoaSlotFitsAge,
  hoaSlotLinesForAi,
  upcomingHoaSlots,
  type HoaSlot,
} from './hoaSlots'

const classrooms = new Map<number, Classroom>([
  [1, { id: 1, name: 'HOA Saturday', category: 'trial' } as Classroom],
  [2, { id: 2, name: 'Coding A', category: 'regular' } as Classroom],
])
const teachers = [{ id: 7, fullName: 'Amy Lim' } as Teacher]

function weekly(id: number, classroomId: number, dayOfWeek: number, over: Partial<Schedule> = {}): Schedule {
  return {
    id,
    teacherId: 7,
    classroomId,
    title: 'x',
    eventType: 'regular',
    recurrenceType: 'weekly',
    dayOfWeek,
    scheduledDate: null,
    startTime: '10:00:00',
    endTime: '12:00:00',
    startRecur: '2026-01-01',
    endRecur: null,
    status: 'active',
    notes: null,
    ...over,
  }
}

const base = { classroomMap: classrooms, teachers, exceptions: [] as ScheduleException[], bookings: [] as TrialBooking[] }

describe('upcomingHoaSlots', () => {
  // 2026-10-09 is a Friday; the next Saturday is the 10th.
  it('lists the trial classes of the coming weeks, earliest first, and leaves regular classes out', () => {
    const slots = upcomingHoaSlots({
      ...base,
      schedules: [weekly(1, 1, 6), weekly(2, 2, 6)],
      today: '2026-10-09',
      nowTime: '09:00',
      days: 16,
    })

    expect(slots.map((slot) => slot.date)).toEqual(['2026-10-10', '2026-10-17', '2026-10-24'])
    expect(slots[0]).toMatchObject({ scheduleId: 1, startTime: '10:00', endTime: '12:00', title: 'HOA Saturday', teacherName: 'Amy Lim' })
  })

  it('skips a cancelled day, a cancelled class and a class that has already started today', () => {
    const slots = upcomingHoaSlots({
      ...base,
      schedules: [weekly(1, 1, 6), weekly(3, 1, 5), weekly(4, 1, 6, { status: 'cancelled' })],
      exceptions: [{ id: 1, scheduleId: 1, exceptionDate: '2026-10-10', reason: null } as ScheduleException],
      today: '2026-10-09',
      nowTime: '10:30',
      days: 9,
    })

    // Friday's class began at 10:00 and it is 10:30; the first Saturday is cancelled.
    expect(slots.map((slot) => `${slot.scheduleId}:${slot.date}`)).toEqual(['3:2026-10-16', '1:2026-10-17'])
  })

  it('counts the children already booked into a class', () => {
    const slots = upcomingHoaSlots({
      ...base,
      schedules: [weekly(1, 1, 6)],
      bookings: [
        { id: 1, scheduleId: 1, bookingDate: '2026-10-10' } as TrialBooking,
        { id: 2, scheduleId: 1, bookingDate: '2026-10-10' } as TrialBooking,
      ],
      today: '2026-10-09',
      nowTime: '09:00',
      days: 3,
    })

    expect(slots).toHaveLength(1)
    expect(slots[0].bookedCount).toBe(2)
  })
})

describe('describeHoaSlot', () => {
  it('writes the time the way a parent reads it', () => {
    expect(describeHoaSlot({ date: '2026-10-18', startTime: '10:00', endTime: '12:00' })).toBe('Sun 18 Oct, 10:00 to 12:00')
  })
})

describe('HOA age groups', () => {
  it('reads the ages from the class name', () => {
    expect(hoaAgeRange('HOA 【9-11 Years Old 】')).toEqual({ min: 9, max: 11 })
    expect(hoaAgeRange('HOA Saturday')).toBeNull()
  })

  it('fits a child to the class for their age, and anyone to a class with no age', () => {
    expect(hoaSlotFitsAge({ title: 'HOA 【9-11 Years Old 】' }, 9)).toBe(true)
    expect(hoaSlotFitsAge({ title: 'HOA 【9-11 Years Old 】' }, 12)).toBe(false)
    expect(hoaSlotFitsAge({ title: 'HOA 【9-11 Years Old 】' }, null)).toBe(true)
    expect(hoaSlotFitsAge({ title: 'HOA Saturday' }, 5)).toBe(true)
  })

  it('writes the class name without the brackets', () => {
    expect(cleanHoaTitle('HOA 【9-11 Years Old 】')).toBe('HOA 9-11 Years Old')
  })
})

describe('the classes given to the AI reply suggestion', () => {
  const slot = (over: Partial<HoaSlot>): HoaSlot => ({
    scheduleId: 1,
    date: '2026-10-17',
    startTime: '14:00',
    endTime: '16:00',
    title: 'HOA 【9-11 Years Old 】',
    teacherName: 'Amy',
    bookedCount: 0,
    ...over,
  })

  it('writes a time the way the school writes it to a parent', () => {
    expect(formatClockForParent('14:00')).toBe('2pm')
    expect(formatClockForParent('16:30')).toBe('4.30pm')
    expect(formatClockForParent('10:00')).toBe('10am')
    expect(formatClockForParent('12:00')).toBe('12pm')
    expect(formatClockForParent('00:15')).toBe('12.15am')
  })

  it('lists the classes that fit the age of the child, soonest first, one line each', () => {
    const slots = [
      slot({ title: 'HOA 【6-8 Years Old 】', startTime: '10:00', endTime: '12:00' }),
      slot({ date: '2026-10-18', startTime: '16:30', endTime: '18:30' }),
    ]
    expect(hoaSlotLinesForAi(slots, [10])).toEqual(['Sun 18 Oct, 4.30pm to 6.30pm, HOA 9-11 Years Old'])
    expect(hoaSlotLinesForAi(slots, [null])).toHaveLength(2)
    expect(hoaSlotLinesForAi(slots, [10, 7])).toHaveLength(2)
    expect(hoaSlotLinesForAi(slots, [], 1)).toHaveLength(1)
  })
})
