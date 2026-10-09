import { describe, expect, it } from 'vitest'
import type { Lead, Package, Student, TrialBooking } from '../types/domain'
import { describeStudent, getStudentKind, makeStudentResolver } from './studentLink'

const packages = [
  { id: 1, name: 'Trial 1 Month', kind: 'trial' },
  { id: 2, name: '3 Months', kind: 'regular' },
  { id: 3, name: 'Holiday Camp', kind: 'camp' },
] as Package[]

function student(id: number, name: string, over: Partial<Student> = {}): Student {
  return { id, name, phone: null, studentType: 'regular', packageId: null, isActive: true, ...over } as Student
}

function lead(id: number, over: Partial<Lead> = {}): Lead {
  return { id, fullName: 'Parent', phone: null, children: [], convertedStudentId: null, ...over } as Lead
}

describe('getStudentKind', () => {
  it('names a student by their package like the Students page does', () => {
    expect(getStudentKind(student(1, 'A', { studentType: 'trial' }), packages)).toBe('hoa')
    expect(getStudentKind(student(1, 'A', { studentType: 'preview' }), packages)).toBe('hoa')
    expect(getStudentKind(student(1, 'A', { packageId: 1 }), packages)).toBe('trial')
    expect(getStudentKind(student(1, 'A', { packageId: 2 }), packages)).toBe('regular')
    expect(getStudentKind(student(1, 'A', { packageId: 3 }), packages)).toBe('camp')
    expect(getStudentKind(student(1, 'A'), packages)).toBe('regular')
  })

  it('describes a regular student with the package', () => {
    expect(describeStudent(student(1, 'A', { packageId: 2 }), packages)).toBe('Regular · 3 Months')
    expect(describeStudent(student(1, 'A', { packageId: 3 }), packages)).toBe('Camp')
    expect(describeStudent(student(1, 'A', { studentType: 'trial' }), packages)).toBe('HOA')
  })
})

describe('makeStudentResolver', () => {
  const booking = (leadId: number | null, studentId: number | null, phone: string | null = null) =>
    ({ id: 1, leadId, studentId, phone }) as TrialBooking

  it('finds a student by the phone number, however it is written', () => {
    const resolve = makeStudentResolver({
      students: [student(1, 'Amy', { phone: '0123456789' })],
      trialBookings: [],
      packages,
    })
    expect(resolve(null, '60123456789').map((entry) => entry.id)).toEqual([1])
    expect(resolve(null, '60999999999')).toEqual([])
  })

  it('follows the lead to the student it was converted into and to the child who came to HOA', () => {
    const resolve = makeStudentResolver({
      students: [student(1, 'Amy'), student(2, 'Ben', { studentType: 'trial' })],
      trialBookings: [booking(7, 2)],
      packages,
    })
    expect(resolve(lead(7, { convertedStudentId: 1 }), null).map((entry) => entry.id)).toEqual([1, 2])
  })

  it('finds a child through the lead phone when the chat number is hidden', () => {
    const resolve = makeStudentResolver({
      students: [student(1, 'Amy', { phone: '60123456789' })],
      trialBookings: [],
      packages,
    })
    expect(resolve(lead(7, { phone: '012-345 6789' }), null).map((entry) => entry.id)).toEqual([1])
  })

  it('shows one row for a child who did HOA and then joined', () => {
    const resolve = makeStudentResolver({
      students: [
        student(1, 'NG ZE YI', { studentType: 'trial', phone: '60195593237' }),
        student(2, 'Ng  Ze Yi', { packageId: 2, phone: '60195593237' }),
      ],
      trialBookings: [],
      packages,
    })
    expect(resolve(null, '60195593237').map((entry) => entry.id)).toEqual([2])
  })

  it('lists brothers and sisters, regular ones first', () => {
    const resolve = makeStudentResolver({
      students: [
        student(1, 'Zed', { studentType: 'trial', phone: '60123456789' }),
        student(2, 'Amy', { packageId: 2, phone: '60123456789' }),
      ],
      trialBookings: [],
      packages,
    })
    expect(resolve(null, '60123456789').map((entry) => entry.name)).toEqual(['Amy', 'Zed'])
  })
})
