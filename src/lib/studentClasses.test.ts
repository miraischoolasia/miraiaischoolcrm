import { describe, expect, it } from 'vitest'
import { classesOfStudent } from './studentClasses'
import type { Classroom, Schedule, Student, TrialBooking } from '../types/domain'

const student = (over: Partial<Student>) => ({ id: 7, classroomId: null, ...over }) as Student
const classroom = { id: 3, name: 'THUR CODING CLASS C001', teacherId: 2, zoomLink: 'https://zoom.us/j/1' } as Classroom
const weekly = (over: Partial<Schedule>) =>
  ({
    id: 1,
    teacherId: 2,
    classroomId: 3,
    title: 'THUR CODING',
    eventType: 'regular',
    recurrenceType: 'weekly',
    dayOfWeek: 4,
    startTime: '17:00:00',
    endTime: '19:00:00',
    status: 'active',
    ...over,
  }) as Schedule
const teachers = [{ id: 2, fullName: 'Teacher Mei' }]

describe('classesOfStudent', () => {
  it('gives the weekly time, teacher and Zoom link of the class a student is in', () => {
    const lines = classesOfStudent({
      student: student({ classroomId: 3 }),
      classrooms: [classroom],
      schedules: [weekly({})],
      teachers,
      trialBookings: [],
      today: '2026-10-15',
    })
    expect(lines).toEqual([
      { title: 'THUR CODING CLASS C001', when: 'Thu, 17:00 to 19:00', teacher: 'Teacher Mei', zoomLink: 'https://zoom.us/j/1' },
    ])
  })

  it('shows the HOA class a student booked, the next one first', () => {
    const hoa = weekly({
      id: 9,
      classroomId: null,
      title: 'HOA 【12-14 Years Old】',
      recurrenceType: 'none',
      startTime: '10:00:00',
      endTime: '12:00:00',
    })
    const bookings = [
      { id: 1, scheduleId: 9, bookingDate: '2026-10-04', studentId: 7 },
      { id: 2, scheduleId: 9, bookingDate: '2026-10-18', studentId: 7 },
    ] as TrialBooking[]
    const lines = classesOfStudent({
      student: student({}),
      classrooms: [],
      schedules: [hoa],
      teachers,
      trialBookings: bookings,
      today: '2026-10-15',
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].title).toBe('HOA 12-14 Years Old')
    expect(lines[0].when).toContain('18 Oct')
    expect(lines[0].when).toContain('10:00 to 12:00')
    expect(lines[0].teacher).toBe('Teacher Mei')
  })

  it('has nothing for a student with no class and no booking', () => {
    expect(
      classesOfStudent({ student: student({}), classrooms: [], schedules: [], teachers, trialBookings: [], today: '2026-10-15' }),
    ).toEqual([])
  })
})
