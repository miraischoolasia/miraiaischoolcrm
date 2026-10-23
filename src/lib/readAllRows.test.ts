import { describe, expect, it } from 'vitest'
import { readAllRows, type PageResult } from './readAllRows'

// A fake table of `total` rows that answers like Supabase: pages of at most `size`, a count when asked.
function fakeTable(total: number, size: number, options: { failFrom?: number; countMissing?: boolean } = {}) {
  const calls: { from: number; to: number; withCount: boolean }[] = []
  const page = async (from: number, to: number, withCount: boolean): Promise<PageResult<number>> => {
    calls.push({ from, to, withCount })
    if (options.failFrom !== undefined && from >= options.failFrom) {
      return { data: null, error: { code: 'XX', message: 'boom' } }
    }
    const data = Array.from({ length: Math.max(0, Math.min(to + 1, total) - from) }, (_, index) => from + index)
    return { data, error: null, count: withCount && !options.countMissing ? total : null }
  }
  return { page, calls, size }
}

describe('reading every row in pages', () => {
  it('reads a small table with one request', async () => {
    const table = fakeTable(40, 100)
    const result = await readAllRows(table.page, 100)
    expect(result.data).toHaveLength(40)
    expect(table.calls).toHaveLength(1)
    expect(table.calls[0].withCount).toBe(true)
  })

  it('reads the other pages together, in order, once the count is known', async () => {
    const table = fakeTable(950, 100)
    const result = await readAllRows(table.page, 100)
    expect(result.data).toEqual(Array.from({ length: 950 }, (_, index) => index))
    expect(table.calls).toHaveLength(10)
    expect(table.calls.filter((call) => call.withCount)).toHaveLength(1)
  })

  it('does not lose a row when the table is an exact number of pages', async () => {
    const table = fakeTable(300, 100)
    const result = await readAllRows(table.page, 100)
    expect(result.data).toHaveLength(300)
  })

  it('falls back to page after page when no count comes', async () => {
    const table = fakeTable(250, 100, { countMissing: true })
    const result = await readAllRows(table.page, 100)
    expect(result.data).toHaveLength(250)
    expect(table.calls.map((call) => call.from)).toEqual([0, 100, 200])
  })

  it('reports the failure of any page', async () => {
    const table = fakeTable(500, 100, { failFrom: 300 })
    const result = await readAllRows(table.page, 100)
    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('XX')
  })
})
