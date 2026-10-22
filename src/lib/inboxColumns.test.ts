import { describe, expect, it } from 'vitest'
import { CHAT_MIN, DEFAULT_COLUMNS, DETAILS_WIDTH, LIST_WIDTH, dragDetails, dragList, fitColumns, readColumns, saveColumns } from './inboxColumns'

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value
    },
    removeItem: (key: string) => {
      delete data[key]
    },
  }
}

describe('fitColumns', () => {
  it('keeps the chosen widths when there is room', () => {
    expect(fitColumns({ list: 420, details: 300 }, 1600, true)).toEqual({ list: 420, details: 300 })
  })

  it('keeps each column inside its smallest and largest width', () => {
    expect(fitColumns({ list: 9999, details: 1 }, null, true)).toEqual({ list: LIST_WIDTH.max, details: DETAILS_WIDTH.min })
  })

  it('shrinks the details panel first, then the list, when the window gets narrow', () => {
    const fitted = fitColumns({ list: 500, details: 400 }, 1200, true)
    expect(fitted.list + fitted.details + CHAT_MIN).toBeLessThanOrEqual(1200)
    expect(fitted).toEqual({ list: 500, details: 1200 - CHAT_MIN - 500 })
    const narrower = fitColumns({ list: 500, details: 400 }, 1000, true)
    expect(narrower.details).toBe(DETAILS_WIDTH.min)
    expect(narrower.list).toBe(1000 - CHAT_MIN - DETAILS_WIDTH.min)
  })

  it('never goes under the smallest widths, even in a tiny box', () => {
    expect(fitColumns({ list: 500, details: 400 }, 300, true)).toEqual({ list: LIST_WIDTH.min, details: DETAILS_WIDTH.min })
  })

  it('ignores the details panel when it is not shown', () => {
    expect(fitColumns({ list: 560, details: 480 }, 1100, false)).toEqual({ list: 560, details: 480 })
  })
})

describe('dragging the lines', () => {
  it('moves the list line both ways, inside its limits', () => {
    expect(dragList(DEFAULT_COLUMNS, 40, 1600, true)).toBe(420)
    expect(dragList(DEFAULT_COLUMNS, -5000, 1600, true)).toBe(LIST_WIDTH.min)
    expect(dragList(DEFAULT_COLUMNS, 5000, 1600, true)).toBe(LIST_WIDTH.max)
  })

  it('never squeezes the chat under its smallest width', () => {
    expect(dragList(DEFAULT_COLUMNS, 5000, 1100, true)).toBe(1100 - CHAT_MIN - DEFAULT_COLUMNS.details)
    expect(dragDetails(DEFAULT_COLUMNS, -5000, 1100)).toBe(1100 - CHAT_MIN - DEFAULT_COLUMNS.list)
  })

  it('makes the details panel wider when its line goes left', () => {
    expect(dragDetails(DEFAULT_COLUMNS, -60, 1600)).toBe(340)
    expect(dragDetails(DEFAULT_COLUMNS, 5000, 1600)).toBe(DETAILS_WIDTH.min)
  })

  it('stays put when the box is too small to move at all', () => {
    expect(dragList(DEFAULT_COLUMNS, 200, 700, true)).toBe(LIST_WIDTH.min)
  })
})

describe('keeping the widths', () => {
  it('reads back what was saved', () => {
    const storage = memory()
    saveColumns(storage, { list: 450, details: 320 })
    expect(readColumns(storage)).toEqual({ list: 450, details: 320 })
  })

  it('forgets the widths when they are back to the defaults', () => {
    const storage = memory()
    saveColumns(storage, { list: 450, details: 320 })
    saveColumns(storage, DEFAULT_COLUMNS)
    expect(Object.keys(storage.data)).toHaveLength(0)
  })

  it('gives the defaults for missing, broken or odd values', () => {
    expect(readColumns(null)).toEqual(DEFAULT_COLUMNS)
    expect(readColumns(memory({ 'inbox-columns-v1': '{oops' }))).toEqual(DEFAULT_COLUMNS)
    expect(readColumns(memory({ 'inbox-columns-v1': '{"list":"wide","details":99999}' }))).toEqual({ list: LIST_WIDTH.initial, details: DETAILS_WIDTH.max })
  })

  it('does not break when the browser blocks storage', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readColumns(blocked)).toEqual(DEFAULT_COLUMNS)
    expect(() => saveColumns(blocked, { list: 400, details: 300 })).not.toThrow()
  })
})
