import { describe, expect, it } from 'vitest'
import {
  getLatestLessonLogMap,
  mapClassroomRow,
  mapLeadOptionRow,
  mapLeadRow,
  mapStudentRow,
  mapTeacherRow,
  normalizeTimeInput,
} from './mappers'
import type { ClassroomRow, LessonLogSummary, StudentRow, TeacherRow } from '../types/domain'

describe('mapStudentRow', () => {
  it('converts snake_case row fields to camelCase', () => {
    const row: StudentRow = {
      id: 1,
      teacher_id: 2,
      classroom_id: 3,
      full_name: 'Olivia Tan',
      phone: '+60 12-345 6789',
      age: 9,
      remaining_hours: 8,
      lesson_expiry_date: '2026-09-01',
      account_fee_expiry_date: '2026-09-15',
      mirai_club_expiry_date: '2026-09-20',
      notes: 'VIP',
      is_active: true,
      student_type: 'trial',
      package_id: null,
    }

    expect(mapStudentRow(row)).toEqual({
      id: 1,
      teacherId: 2,
      classroomId: 3,
      name: 'Olivia Tan',
      phone: '+60 12-345 6789',
      age: 9,
      remainingHours: 8,
      lessonExpiryDate: '2026-09-01',
      accountFeeExpiryDate: '2026-09-15',
      miraiClubExpiryDate: '2026-09-20',
      notes: 'VIP',
      isActive: true,
      studentType: 'trial',
      packageId: null,
    })
  })
})

describe('mapClassroomRow', () => {
  it('preserves nulls for unassigned teacher and archive fields', () => {
    const row: ClassroomRow = {
      id: 5,
      name: 'Tuesday Group A',
      category: 'regular',
      age_group: '6-8 Years Old',
      program_level: 'Coder Foundation',
      teacher_id: null,
      status: 'active',
      notes: null,
      archived_at: null,
    }

    expect(mapClassroomRow({ ...row, category: 'trial', name: '周六 AI 体验班' })).toMatchObject({ category: 'trial', name: '周六 AI 体验班' })

    expect(mapClassroomRow(row)).toEqual({
      id: 5,
      name: 'Tuesday Group A',
      category: 'regular',
      ageGroup: '6-8 Years Old',
      programLevel: 'Coder Foundation',
      teacherId: null,
      status: 'active',
      notes: null,
      archivedAt: null,
    })
  })
})

describe('mapTeacherRow', () => {
  it('maps role and active flag through unchanged', () => {
    const row: TeacherRow = {
      id: 9,
      auth_user_id: 'auth-uuid-9',
      username: 'admin_demo',
      full_name: 'Admin Demo',
      email: 'admin@example.com',
      phone: null,
      role: 'admin',
      is_active: true,
      permissions: { leads: { level: 'edit', delete: true }, forms: { level: 'own' }, money: { level: 'view' } },
    }

    expect(mapTeacherRow(row)).toEqual({
      id: 9,
      authUserId: 'auth-uuid-9',
      username: 'admin_demo',
      fullName: 'Admin Demo',
      email: 'admin@example.com',
      phone: null,
      role: 'admin',
      isActive: true,
      // Unknown modules and levels are dropped.
      permissions: { leads: { level: 'edit', delete: true } },
    })
  })
})

describe('normalizeTimeInput', () => {
  it('truncates a Postgres HH:MM:SS time to HH:MM', () => {
    expect(normalizeTimeInput('19:30:00')).toBe('19:30')
  })

  it('leaves an already-short time string alone', () => {
    expect(normalizeTimeInput('19:30')).toBe('19:30')
  })
})

describe('getLatestLessonLogMap', () => {
  const baseLog: LessonLogSummary = {
    id: 1,
    scheduleId: 10,
    teacherId: 1,
    lessonDate: '2026-08-20',
    lessonRemark: null,
    submittedAt: '2026-08-20T12:00:00Z',
    revisionNumber: 1,
    parentLogId: null,
  }

  it('keeps only the highest revision per schedule/date pair', () => {
    const logs: LessonLogSummary[] = [
      baseLog,
      { ...baseLog, id: 2, revisionNumber: 2, parentLogId: 1 },
      { ...baseLog, id: 3, revisionNumber: 3, parentLogId: 2 },
    ]

    const result = getLatestLessonLogMap(logs)

    expect(result.size).toBe(1)
    expect(result.get('10:2026-08-20')?.id).toBe(3)
  })

  it('tracks separate schedule/date keys independently', () => {
    const logs: LessonLogSummary[] = [
      baseLog,
      { ...baseLog, id: 4, scheduleId: 11, lessonDate: '2026-08-21' },
    ]

    const result = getLatestLessonLogMap(logs)

    expect(result.size).toBe(2)
    expect(result.get('10:2026-08-20')?.id).toBe(1)
    expect(result.get('11:2026-08-21')?.id).toBe(4)
  })
})

describe('lead rows', () => {
  const row = {
    id: 1,
    full_name: 'Mrs Lim',
    phone: '60123456789',
    source_id: 2,
    pic_id: null,
    tag_ids: [7, 9],
    checks: {
      '1': { at: '2026-10-05T03:00:00+00:00', by: 4 },
      '3': true,
      '2': false,
      '9': { at: 'x', by: 1 },
    },
    status: 'new' as const,
    children: [],
    notes: null,
    follow_ups: [],
    tasks: [],
    converted_student_id: null,
    added_date: '2026-10-05',
    created_at: '',
    updated_at: '',
  }

  it('reads the tags and the ticked boxes with who ticked them and when', () => {
    // The database only ever holds stamps, but a plain true is read as ticked too.
    const lead = mapLeadRow(row as never)

    expect(lead.tagIds).toEqual([7, 9])
    expect(lead.checks).toEqual({
      1: { at: '2026-10-05T03:00:00+00:00', by: 4 },
      3: { at: null, by: null },
    })
  })

  it('copes with a database that has no tags or ticks yet', () => {
    const lead = mapLeadRow({ ...row, tag_ids: undefined, checks: undefined } as never)

    expect(lead.tagIds).toEqual([])
    expect(lead.checks).toEqual({})
  })

  it('reads a tag colour, and none for other options', () => {
    const base = { id: 1, label: 'Hot', is_active: true, legacy_key: null }

    expect(mapLeadOptionRow({ ...base, kind: 'tag', color: '#ef4444' }).color).toBe('#ef4444')
    expect(mapLeadOptionRow({ ...base, kind: 'source', color: null }).color).toBeNull()
    expect(mapLeadOptionRow({ ...base, kind: 'source' } as never).color).toBeNull()
  })
})
