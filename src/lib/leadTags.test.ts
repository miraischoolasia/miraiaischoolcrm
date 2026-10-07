import { describe, expect, it } from 'vitest'
import { TAG_COLORS, getCheckColumns, isTagColor, nextTagColor } from './leadTags'
import type { LeadOption } from '../types/domain'

function option(patch: Partial<LeadOption>): LeadOption {
  return {
    id: 1,
    kind: 'tag',
    label: 'Tag',
    isActive: true,
    legacyKey: null,
    color: null,
    ...patch,
  }
}

describe('nextTagColor', () => {
  it('starts with the first colour', () => {
    expect(nextTagColor([])).toBe(TAG_COLORS[0])
  })

  it('skips the colours tags already use, whatever their letter case', () => {
    const used = [option({ color: TAG_COLORS[0].toUpperCase() }), option({ id: 2, color: TAG_COLORS[1] })]
    expect(nextTagColor(used)).toBe(TAG_COLORS[2])
  })

  it('goes round again once every colour is taken', () => {
    const all = TAG_COLORS.map((color, index) => option({ id: index, color }))
    expect(TAG_COLORS).toContain(nextTagColor(all))
  })
})

describe('isTagColor', () => {
  it('only accepts #rrggbb', () => {
    expect(isTagColor('#fc0c97')).toBe(true)
    expect(isTagColor('#FC0C97')).toBe(true)
    expect(isTagColor('red')).toBe(false)
    expect(isTagColor('#fff')).toBe(false)
    expect(isTagColor('url(javascript:x)')).toBe(false)
  })
})

describe('getCheckColumns', () => {
  const check = (slot: number, label: string) =>
    option({ id: 100 + slot, kind: 'check', label, legacyKey: `check_${slot}` })

  it('gives the three columns in order with the names the admin chose', () => {
    const columns = getCheckColumns([
      check(3, 'Paid deposit'),
      option({ id: 5, kind: 'source', label: 'Walk-in' }),
      check(1, 'RM99 pack'),
      check(2, 'Joined event'),
    ])

    expect(columns.map((column) => [column.slot, column.label])).toEqual([
      [1, 'RM99 pack'],
      [2, 'Joined event'],
      [3, 'Paid deposit'],
    ])
  })

  it('shows no columns before the database has them', () => {
    expect(getCheckColumns([option({ kind: 'source' })])).toEqual([])
  })
})
