import { describe, expect, it } from 'vitest'
import {
  defaultStudentIdentityLabels,
  readStudentIdentityLabels,
  studentGroupOptions,
  studentGroups,
  studentLabel,
  studentLabels,
  type StudentLabelContext,
} from './studentLabel'
import type { ClassCategory } from './classCategories'
import type { Classroom, Package, Student } from '../types/domain'

function student(id: number, overrides: Partial<Student> = {}): Student {
  return {
    id, name: `Student ${id}`, isActive: true, teacherId: null, classroomId: null, phone: null, age: null,
    remainingHours: 10, lessonExpiryDate: '2027-03-01', accountFeeExpiryDate: '2027-03-01',
    miraiClubExpiryDate: '2027-03-01', notes: '', studentType: 'regular', ...overrides,
  }
}

const packages: Package[] = [
  { id: 1, name: 'Trial 1 Month', kind: 'trial', classCount: 4, durationMonths: 1, includesFees: false, isActive: true, sortOrder: 1 },
  { id: 2, name: '6 Months', kind: 'regular', classCount: 24, durationMonths: 6, includesFees: true, isActive: true, sortOrder: 2 },
]

// EduHero-like: 正课 / 免费课 are regular-kind, 短期课 is camp-kind.
const categories: ClassCategory[] = [
  { name: '正课', kind: 'regular', sortOrder: 10, isActive: true },
  { name: '免费课', kind: 'regular', sortOrder: 20, isActive: true },
  { name: '短期课', kind: 'camp', sortOrder: 30, isActive: true },
  { name: '旧课', kind: 'trial', sortOrder: 40, isActive: false },
]
const classrooms = [
  { id: 1, category: 'regular', categoryName: '正课' },
  { id: 2, category: 'regular', categoryName: '免费课' },
  { id: 3, category: 'camp', categoryName: '短期课' },
] as Pick<Classroom, 'id' | 'category' | 'categoryName'>[]

const eduhero: StudentLabelContext = { classrooms, categories, packages, identityLabels: defaultStudentIdentityLabels, byCategory: true }
const mirai: StudentLabelContext = { ...eduhero, byCategory: false }

describe('studentLabels', () => {
  it('names the categories of the classes the student is in now', () => {
    const child = student(1, { classroomId: 1, classPeriods: [{ classroomId: 2, endDate: null }, { classroomId: 3, endDate: '2026-09-01' }] } as Partial<Student>)
    expect(studentLabels(child, eduhero)).toEqual(['正课', '免费课'])
    expect(studentLabel(child, eduhero)).toBe('正课 / 免费课')
  })

  it('gives a student in no class their identity label, renamed by the school', () => {
    const labels = readStudentIdentityLabels({ trial: '试听', hoa: '' })
    const context = { ...eduhero, identityLabels: labels }
    expect(studentLabels(student(1, { studentType: 'trial' }), context)).toEqual(['HOA'])
    expect(studentLabels(student(2, { packageId: 1 }), context)).toEqual(['试听'])
    expect(studentLabels(student(3, { packageId: 2 }), context)).toEqual(['Regular · 6 Months'])
  })

  it('keeps the old labels for a school that does not group students by category', () => {
    expect(studentLabels(student(1, { classroomId: 1, packageId: 2 }), mirai)).toEqual(['Regular · 6 Months'])
    expect(studentLabels(student(2, { classroomId: 3, studentType: 'preview' }), mirai)).toEqual(['HOA'])
    expect(studentGroups(student(1, { classroomId: 1, packageId: 2 }), mirai)).toEqual(['Regular'])
  })
})

describe('readStudentIdentityLabels', () => {
  it('falls back to the English labels when the setting is missing or odd', () => {
    expect(readStudentIdentityLabels(null)).toEqual(defaultStudentIdentityLabels)
    expect(readStudentIdentityLabels({ regular: 42, camp: ' 营 ' })).toEqual({ ...defaultStudentIdentityLabels, camp: '营' })
  })
})

describe('studentGroupOptions', () => {
  it('lists the shown categories, a hidden one still used, then the identity labels once each', () => {
    expect(studentGroupOptions(categories, ['旧课', 'HOA'], defaultStudentIdentityLabels, true)).toEqual([
      '正课', '免费课', '短期课', '旧课', 'HOA',
    ])
    expect(studentGroupOptions(categories, [], defaultStudentIdentityLabels, false)).toEqual(['Regular', 'Trial', 'Camp', 'HOA'])
  })

  it('adds a renamed preview label only when a student has it', () => {
    const labels = { ...defaultStudentIdentityLabels, preview: 'Preview' }
    expect(studentGroupOptions([], [], labels, false)).not.toContain('Preview')
    expect(studentGroupOptions([], ['Preview'], labels, false)).toContain('Preview')
  })
})
