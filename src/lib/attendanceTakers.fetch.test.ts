import { beforeEach, describe, expect, it, vi } from 'vitest'

// Reading who takes attendance before the migration is pushed must never stop the page from loading.

const mocks = vi.hoisted(() => ({
  setting: vi.fn(),
  substitutes: vi.fn(),
  tables: [] as string[],
}))

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      mocks.tables.push(table)
      if (table === 'app_settings') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => mocks.setting() }) }) }
      }
      return { select: () => mocks.substitutes() }
    },
  },
}))

const { fetchAttendanceTakers } = await import('./attendanceTakers')

const defaults = { rules: { assistants: true, substitutes: true }, substitutes: [] }

describe('fetchAttendanceTakers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tables.length = 0
  })

  it('before the migration (no setting row): the defaults, without asking for the missing table', async () => {
    mocks.setting.mockResolvedValue({ data: null, error: null })

    await expect(fetchAttendanceTakers()).resolves.toEqual(defaults)
    expect(mocks.tables).toEqual(['app_settings'])
  })

  it('a missing table (404) gives no substitutes, not an error', async () => {
    mocks.setting.mockResolvedValue({ data: { value: { assistants: false } }, error: null })
    mocks.substitutes.mockResolvedValue({ data: null, error: { code: 'PGRST205', message: 'Not found' } })

    await expect(fetchAttendanceTakers()).resolves.toEqual({
      rules: { assistants: false, substitutes: true },
      substitutes: [],
    })
  })

  it('a request that throws gives the defaults', async () => {
    mocks.setting.mockRejectedValue(new Error('Failed to fetch'))

    await expect(fetchAttendanceTakers()).resolves.toEqual(defaults)
  })

  it('after the migration: the school setting and each substitute', async () => {
    mocks.setting.mockResolvedValue({ data: { value: { assistants: true, substitutes: true } }, error: null })
    mocks.substitutes.mockResolvedValue({
      data: [{ schedule_id: 10, lesson_date: '2026-10-21', teacher_id: 4 }],
      error: null,
    })

    await expect(fetchAttendanceTakers()).resolves.toEqual({
      rules: { assistants: true, substitutes: true },
      substitutes: [{ scheduleId: 10, lessonDate: '2026-10-21', teacherId: 4 }],
    })
  })
})
