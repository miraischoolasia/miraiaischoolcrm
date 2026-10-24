import { describe, expect, it } from 'vitest'
import { keepIfSame, sameData } from './sameData'

describe('sameData', () => {
  it('compares what was read, not which object it is', () => {
    expect(sameData([{ id: 1, tags: [2, 3], at: null }], [{ id: 1, tags: [2, 3], at: null }])).toBe(true)
    expect(sameData([{ id: 1, tags: [2, 3] }], [{ id: 1, tags: [3, 2] }])).toBe(false)
    expect(sameData({ a: 1 }, { a: 1, b: undefined })).toBe(false)
    expect(sameData(new Map([[1, { x: 1 }]]), new Map([[1, { x: 1 }]]))).toBe(true)
    expect(sameData(new Set([1, 2]), new Set([2, 1]))).toBe(true)
    expect(sameData([], {})).toBe(false)
    expect(sameData(NaN, NaN)).toBe(true)
  })

  it('keeps the old value when nothing changed, so React does not redraw', () => {
    const old = [{ id: 1 }]
    expect(keepIfSame([{ id: 1 }])(old)).toBe(old)
    const changed = [{ id: 2 }]
    expect(keepIfSame(changed)(old)).toBe(changed)
  })
})
