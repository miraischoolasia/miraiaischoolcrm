import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  setting: vi.fn(),
  codes: vi.fn(),
  update: vi.fn(),
  tables: [] as string[],
}))

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      mocks.tables.push(table)
      if (table === 'app_settings') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => mocks.setting() }) }) }
      }
      return {
        select: () => ({ not: () => ({ order: () => ({ range: () => mocks.codes() }) }) }),
        update: (values: unknown) => ({ eq: () => mocks.update(values) }),
      }
    },
  },
}))

const { fetchStudentCodeEnabled, fetchStudentCodes, latestPlanByClass, monthPlanEndDate, saveStudentCode } = await import(
  './studentExtras'
)

describe('monthPlanEndDate (same rule as the database)', () => {
  it('ends the day before the same date that many months later', () => {
    expect(monthPlanEndDate('2026-11-01', 3)).toBe('2027-01-31')
    expect(monthPlanEndDate('2026-01-15', 1)).toBe('2026-02-14')
    expect(monthPlanEndDate('2026-12-01', 12)).toBe('2027-11-30')
  })

  it('a day the later month lacks falls back to its last day first', () => {
    // 31 Jan + 1 month = 28 Feb, the day before: 27 Feb (as Postgres).
    expect(monthPlanEndDate('2026-01-31', 1)).toBe('2026-02-27')
  })
})

describe('latestPlanByClass', () => {
  it('keeps, for each class, the months that end last', () => {
    const plan = (id: number, classroomId: number, endDate: string) => ({
      id, studentId: 1, classroomId, startDate: '2026-01-01', months: 1, endDate, remark: null, createdAt: '',
    })
    const latest = latestPlanByClass([plan(1, 5, '2026-03-31'), plan(2, 5, '2026-06-30'), plan(3, 6, '2026-02-28')])

    expect(latest.get(5)?.id).toBe(2)
    expect(latest.get(6)?.id).toBe(3)
  })
})

describe('student code', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tables.length = 0
  })

  it('is off, and no code is asked for, before the database update', async () => {
    mocks.setting.mockResolvedValue({ data: null, error: null })

    await expect(fetchStudentCodeEnabled()).resolves.toBe(false)
    expect(mocks.tables).toEqual(['app_settings'])
  })

  it('is on when the school switched it on', async () => {
    mocks.setting.mockResolvedValue({ data: { value: { enabled: true } }, error: null })

    await expect(fetchStudentCodeEnabled()).resolves.toBe(true)
  })

  it('reads the codes, and gives none (not an error) when the column is missing', async () => {
    mocks.codes.mockResolvedValueOnce({ data: [{ id: 4, student_code: 'EH-004' }], error: null })
    expect([...(await fetchStudentCodes())]).toEqual([[4, 'EH-004']])

    mocks.codes.mockResolvedValueOnce({ data: null, error: { code: '42703', message: 'column does not exist' } })
    expect((await fetchStudentCodes()).size).toBe(0)
  })

  it('says plainly when a code is already used', async () => {
    mocks.update.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })

    await expect(saveStudentCode(1, 'EH-004', null)).rejects.toThrow('Student code "EH-004" is already used by another student.')
  })

  it('does not write when the code did not change', async () => {
    await saveStudentCode(1, ' EH-004 ', 'EH-004')

    expect(mocks.update).not.toHaveBeenCalled()
  })
})
