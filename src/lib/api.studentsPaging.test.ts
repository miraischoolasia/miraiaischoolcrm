import { describe, expect, it, vi } from 'vitest'

// 2500 students; Supabase gives at most 1000 per request.
const all = Array.from({ length: 2500 }, (_, i) => ({
  id: i + 1,
  teacher_id: null,
  classroom_id: 7,
  full_name: `Student ${String(i + 1).padStart(4, '0')}`,
  phone: null,
  age: null,
  remaining_hours: 0,
  lesson_expiry_date: '2099-12-31',
  account_fee_expiry_date: '2099-12-31',
  mirai_club_expiry_date: '2099-12-31',
  notes: null,
  is_active: true,
  student_type: 'regular',
  date_of_birth: null,
  package_id: null,
  student_classroom_periods: [{ classroom_id: 7, start_date: null, end_date: null }],
}))
const ranges: Array<[number, number]> = []

vi.mock('./supabase', () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        order: () => query,
        range: (from: number, to: number) => {
          ranges.push([from, to])
          return Promise.resolve({ data: all.slice(from, Math.min(to + 1, from + 1000)), error: null })
        },
      }
      return query
    },
  },
}))

describe('fetchStudentsFromSupabase', () => {
  it('reads every student of a big school, page by page', async () => {
    const { fetchStudentsFromSupabase } = await import('./api')
    const students = await fetchStudentsFromSupabase()
    expect(students).toHaveLength(2500)
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ])
    expect(students[2499].classPeriods).toEqual([{ classroomId: 7, startDate: null, endDate: null }])
  })
})
