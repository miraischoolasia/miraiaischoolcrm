import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: null, isSupabaseConfigured: false }))

import { extrasChanges, extrasToForm, NO_STUDENT_FIELDS, readStudentFieldsSetting, type StudentFieldsSetting } from './studentFields'
import { classCounts, readRosterCounts, sortFieldOptions, subjectCounts, type RosterCounts } from './studentRoster'
import type { ClassCategory } from './classCategories'
import type { Classroom, ClassroomPeriod } from '../types/domain'

const categories: ClassCategory[] = [
  { name: '正课', kind: 'regular', sortOrder: 10, isActive: true },
  { name: '免费课', kind: 'regular', sortOrder: 20, isActive: true },
  { name: '短期课', kind: 'camp', sortOrder: 30, isActive: true },
]
const room = (id: number, categoryName: string, subjectId: number | null) =>
  ({ id, name: `C${id}`, category: categoryName === '短期课' ? 'camp' : 'regular', categoryName, subjectId }) as unknown as Classroom
const classrooms = new Map([
  [1, room(1, '正课', 10)],
  [2, room(2, '正课', 10)], // the same subject as class 1
  [3, room(3, '正课', 11)],
  [4, room(4, '免费课', 12)],
  [5, room(5, '短期课', 13)],
  [6, room(6, '正课', null)],
])
const none: RosterCounts = { countCategories: [], changesFrom: null }
const only正课: RosterCounts = { countCategories: ['正课'], changesFrom: null }
const open = (classroomId: number): ClassroomPeriod => ({ classroomId, startDate: null, endDate: null })

describe('which classes count', () => {
  it('counts the ticked categories, or every regular-like category when none is ticked', () => {
    expect(classCounts(classrooms.get(4)!, categories, none)).toBe(true)
    expect(classCounts(classrooms.get(5)!, categories, none)).toBe(false)
    expect(classCounts(classrooms.get(4)!, categories, only正课)).toBe(false)
    expect(classCounts(classrooms.get(1)!, categories, only正课)).toBe(true)
  })
})

describe('number of subjects', () => {
  const count = (periods: ClassroomPeriod[], rule = only正课) =>
    subjectCounts({ classroomId: null, classPeriods: periods }, classrooms, categories, rule, '2026-10-22').subjects

  it('counts the subjects of the counted classes the student is in now', () => {
    expect(count([open(1), open(3)])).toBe(2)
  })

  it('counts two classes of one subject once', () => {
    expect(count([open(1), open(2)])).toBe(1)
  })

  it('leaves out free and short-term classes, and classes the student left', () => {
    expect(count([open(1), open(4), open(5), { classroomId: 3, startDate: null, endDate: '2026-03-01' }])).toBe(1)
  })

  it('counts a class with no subject on its own', () => {
    expect(count([open(6), open(1)])).toBe(2)
  })
})

describe('stopped and added subjects', () => {
  const result = (periods: { classroomId: number; startDate: string | null; endDate: string | null }[], rule = only正课) =>
    subjectCounts({ classroomId: null, classPeriods: periods }, classrooms, categories, rule, '2026-10-22')

  it('counts the classes left and joined this year, and a move as one stopped and one added', () => {
    const moved = [
      { classroomId: 1, startDate: null, endDate: '2026-05-10' },
      { classroomId: 2, startDate: '2026-05-10', endDate: null },
    ]
    expect(result(moved)).toEqual({ subjects: 1, stopped: 1, added: 1 })
  })

  it('ignores last year, and classes of categories that do not count', () => {
    const old = [
      { classroomId: 1, startDate: '2025-02-01', endDate: '2025-12-20' },
      { classroomId: 4, startDate: '2026-02-01', endDate: '2026-06-01' },
    ]
    expect(result(old)).toEqual({ subjects: 0, stopped: 0, added: 0 })
  })

  it('counts from the date the school gives', () => {
    const periods = [
      { classroomId: 3, startDate: '2026-10-20', endDate: null },
      { classroomId: 1, startDate: null, endDate: '2026-10-25' },
      { classroomId: 1, startDate: '2026-11-01', endDate: null },
    ]
    expect(result(periods, { countCategories: ['正课'], changesFrom: '2026-10-21' })).toEqual({ subjects: 2, stopped: 0, added: 0 })
    expect(result(periods)).toEqual({ subjects: 2, stopped: 0, added: 1 })
  })
})

describe('the counting rule and the choices', () => {
  it('reads what is saved and ignores anything else', () => {
    expect(readRosterCounts({ count_categories: ['正课', 3], changes_from: '2026-10-21' })).toEqual({ countCategories: ['正课'], changesFrom: '2026-10-21' })
    expect(readRosterCounts({ changes_from: 'soon' })).toEqual({ countCategories: [], changesFrom: null })
    expect(readRosterCounts(null)).toEqual({ countCategories: [], changesFrom: null })
  })

  it('lists the shown choices first, in the school order', () => {
    const sorted = sortFieldOptions([
      { name: 'B', sortOrder: 20, isActive: true },
      { name: 'Old', sortOrder: 1, isActive: false },
      { name: 'A', sortOrder: 10, isActive: true },
    ])
    expect(sorted.map((option) => option.name)).toEqual(['A', 'B', 'Old'])
  })
})

describe('saving the roster fields', () => {
  const on: StudentFieldsSetting = {
    ...NO_STUDENT_FIELDS,
    sales_person: true,
    membership: true,
    fb_name: true,
    region: true,
    enrol_method: true,
    payment_mode: true,
    hero_member: true,
    fee_month: true,
  }

  it('reads the new switches and ignores anything else', () => {
    expect(readStudentFieldsSetting({ sales_person: true, roster_table: true, fee_month: 'yes', junk: true })).toEqual({
      ...NO_STUDENT_FIELDS,
      sales_person: true,
      roster_table: true,
    })
  })

  it('sends only what changed', () => {
    const form = { ...extrasToForm(undefined), salesPersonId: '5', membership: 'GOLD', fbName: ' Mum Tan ', feeMonth: '7' }
    expect(extrasChanges(form, undefined, on)).toEqual({ sales_person_id: 5, membership: 'GOLD', fb_name: 'Mum Tan', fee_month: 7 })
  })

  it('clears a value left empty, and never touches a field the school does not show', () => {
    const current = { nameZh: null, kind: null, consultantId: null, secondParentPhone: null, membership: 'GOLD', region: '西马', feeMonth: 7 }
    expect(extrasChanges({ ...extrasToForm(current), membership: '', feeMonth: '' }, current, on)).toEqual({ membership: null, fee_month: null })
    expect(extrasChanges({ ...extrasToForm(current), region: '东马' }, current, { ...on, region: false })).toBeNull()
  })
})
