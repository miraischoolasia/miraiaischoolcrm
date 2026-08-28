import { describe, expect, it } from 'vitest'
import {
  getLatestLessonLogMap,
  mapClassroomRow,
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
      remaining_hours: 8,
      lesson_expiry_date: '2026-09-01',
      account_fee_expiry_date: '2026-09-15',
      mirai_club_expiry_date: '2026-09-20',
      notes: 'VIP',
      is_active: true,
      student_type: 'trial',
    }

    expect(mapStudentRow(row)).toEqual({
      id: 1,
      teacherId: 2,
      classroomId: 3,
      name: 'Olivia Tan',
      remainingHours: 8,
      lessonExpiryDate: '2026-09-01',
      accountFeeExpiryDate: '2026-09-15',
      miraiClubExpiryDate: '2026-09-20',
      notes: 'VIP',
      isActive: true,
      studentType: 'trial',
    })
  })
})

describe('mapClassroomRow', () => {
  it('preserves nulls for unassigned teacher and archive fields', () => {
    const row: ClassroomRow = {
      id: 5,
      name: 'Tuesday Group A',
      age_group: '6-8 Years Old',
      program_level: 'Coder Foundation',
      teacher_id: null,
      status: 'active',
      notes: null,
      archived_at: null,
    }

    expect(mapClassroomRow(row)).toEqual({
      id: 5,
      name: 'Tuesday Group A',
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
      username: 'admin_demo',
      full_name: 'Admin Demo',
      email: 'admin@example.com',
      phone: null,
      role: 'admin',
      is_active: true,
    }

    expect(mapTeacherRow(row)).toEqual({
      id: 9,
      username: 'admin_demo',
      fullName: 'Admin Demo',
      email: 'admin@example.com',
      phone: null,
      role: 'admin',
      isActive: true,
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
