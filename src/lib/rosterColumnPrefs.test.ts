import { describe, expect, it } from 'vitest'
import { arrangeAll, arrangeColumns, moveKey, preferenceFrom, readColumnPref } from './rosterColumnPrefs'

const columns = ['sales', 'code', 'name', 'phone', 'fb'].map((key) => ({ key }))

describe('roster column preference', () => {
  it('keeps the usual order, name first, when nothing is chosen', () => {
    expect(arrangeColumns(columns, { order: [], hidden: [] }).map((c) => c.key)).toEqual(['name', 'sales', 'code', 'phone', 'fb'])
  })

  it('follows the chosen order, puts new columns last and ignores columns the school no longer has', () => {
    const arranged = arrangeColumns(columns, { order: ['phone', 'gone', 'sales'], hidden: [] })
    expect(arranged.map((c) => c.key)).toEqual(['name', 'phone', 'sales', 'code', 'fb'])
  })

  it('hides the switched-off columns but never the name', () => {
    const arranged = arrangeColumns(columns, { order: [], hidden: ['fb', 'name', 'code'] })
    expect(arranged.map((c) => c.key)).toEqual(['name', 'sales', 'phone'])
    expect(arrangeAll(columns, { order: [], hidden: ['fb'] }).map((c) => c.key)).toContain('fb')
  })

  it('moves a column to another place, never the name', () => {
    const keys = ['name', 'sales', 'code', 'phone']
    expect(moveKey(keys, 'phone', 'sales')).toEqual(['name', 'phone', 'sales', 'code'])
    expect(moveKey(keys, 'name', 'phone')).toEqual(keys)
    expect(moveKey(keys, 'sales', 'name')).toEqual(keys)
  })

  it('saves the order and what is off, and reads back whatever is stored safely', () => {
    expect(preferenceFrom(['name', 'a', 'b'], new Set(['a']))).toEqual({ order: ['name', 'a', 'b'], hidden: ['b'] })
    expect(readColumnPref(null)).toEqual({ order: [], hidden: [] })
    expect(readColumnPref({ order: ['a', 3], hidden: 'x' })).toEqual({ order: ['a'], hidden: [] })
  })
})
