import { describe, expect, it, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: null, isSupabaseConfigured: false }))

import {
  consultantOptions,
  extrasChanges,
  extrasToForm,
  matchesExtrasFilter,
  NO_STUDENT_FIELDS,
  NOT_SET,
  readStudentFieldsSetting,
  sortStudentKinds,
  type StudentFieldsSetting,
} from './studentFields'
import type { Teacher } from '../types/domain'

const allOn: StudentFieldsSetting = { name_zh: true, student_kind: true, consultant: true, second_parent_phone: true }
const current = { nameZh: '小明', kind: '新生', consultantId: 7, secondParentPhone: null }

describe('student fields setting', () => {
  it('is all off unless switched on, ignoring anything else', () => {
    expect(readStudentFieldsSetting(null)).toEqual(NO_STUDENT_FIELDS)
    expect(readStudentFieldsSetting({ name_zh: true, consultant: 'yes', junk: true })).toEqual({ ...NO_STUDENT_FIELDS, name_zh: true })
  })
})

describe('saving the four fields', () => {
  it('sends only what changed', () => {
    const form = { ...extrasToForm(current), studentKind: '续报', secondParentPhone: ' 0123456789 ' }
    expect(extrasChanges(form, current, allOn)).toEqual({ student_kind: '续报', second_parent_phone: '0123456789' })
    expect(extrasChanges(extrasToForm(current), current, allOn)).toBeNull()
  })

  it('clears a field left empty', () => {
    expect(extrasChanges({ ...extrasToForm(current), nameZh: '  ', consultantId: '' }, current, allOn)).toEqual({ name_zh: null, consultant_id: null })
  })

  it('never touches a field the school does not show', () => {
    const form = { ...extrasToForm(current), nameZh: 'Other', studentKind: '续报' }
    expect(extrasChanges(form, current, { ...allOn, name_zh: false })).toEqual({ student_kind: '续报' })
  })

  it('says why a phone number is refused', () => {
    expect(() => extrasChanges({ ...extrasToForm(current), secondParentPhone: '123' }, current, allOn)).toThrow('6 to 30 characters')
  })
})

describe('consultants and filters', () => {
  const people = [
    { id: 1, fullName: 'Teacher Tan', role: 'teacher', isActive: true },
    { id: 2, fullName: 'Crystal', role: 'staff', isActive: true },
    { id: 3, fullName: 'Admin', role: 'admin', isActive: true },
    { id: 4, fullName: 'Left', role: 'staff', isActive: false },
  ] as Teacher[]

  it('offers the active staff and admins only', () => {
    expect(consultantOptions(people).map((teacher) => teacher.fullName)).toEqual(['Admin', 'Crystal'])
  })

  it('filters by kind and consultant, including "not set"', () => {
    expect(matchesExtrasFilter(current, { kind: '新生', consultantId: '7' })).toBe(true)
    expect(matchesExtrasFilter(current, { kind: '续报', consultantId: '' })).toBe(false)
    expect(matchesExtrasFilter(current, { kind: '', consultantId: '8' })).toBe(false)
    expect(matchesExtrasFilter(undefined, { kind: NOT_SET, consultantId: NOT_SET })).toBe(true)
    expect(matchesExtrasFilter(current, { kind: NOT_SET, consultantId: '' })).toBe(false)
  })

  it('lists the shown kinds first, in the school order', () => {
    const kinds = sortStudentKinds([
      { name: '回流生', sortOrder: 30, isActive: true },
      { name: 'Old', sortOrder: 5, isActive: false },
      { name: '新生', sortOrder: 10, isActive: true },
    ])
    expect(kinds.map((kind) => kind.name)).toEqual(['新生', '回流生', 'Old'])
  })
})
