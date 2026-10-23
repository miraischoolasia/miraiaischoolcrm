import { describe, expect, it } from 'vitest'
import { TAG_COLORS, isTagColor, moveLeadOption, nextTagColor, orderLeadOptions } from './leadTags'
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

describe('the school order of names', () => {
  const option = (id: number, isActive: boolean, sortOrder: number | null) => ({ id, isActive, sortOrder })

  it('puts shown names first, then hidden ones; dragged order first, never-moved ones by id', () => {
    const ordered = orderLeadOptions([option(1, true, null), option(2, false, 1), option(3, true, 2), option(4, true, 1), option(5, true, null)])
    expect(ordered.map((entry) => entry.id)).toEqual([4, 3, 1, 5, 2])
  })

  it('moves one name onto another place', () => {
    expect(moveLeadOption([1, 2, 3], 3, 1)).toEqual([3, 1, 2])
    expect(moveLeadOption([1, 2, 3], 1, 3)).toEqual([2, 3, 1])
    expect(moveLeadOption([1, 2, 3], 9, 1)).toEqual([1, 2, 3])
  })
})
