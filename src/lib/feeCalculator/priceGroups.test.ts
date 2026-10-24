import { describe, expect, it } from 'vitest'
import { followPriceGroups } from '../../../supabase/functions/_shared/quotation/priceGroups.ts'

// Price groups that use another group's prices (20261101520000): LATEST follows 26002, NORMAL has its own copy.

const groups = [
  { id: 1, name: '26002', materialsIncluded: true, usesCohortId: null },
  { id: 2, name: '26001', materialsIncluded: false, usesCohortId: null },
  { id: 3, name: 'LATEST', materialsIncluded: false, usesCohortId: 1 },
  { id: 4, name: 'NORMAL', materialsIncluded: false, usesCohortId: null },
]
const rates = [
  { cohortId: 1, subjectCount: 1, amount: 65 },
  { cohortId: 1, subjectCount: 2, amount: 120 },
  { cohortId: 2, subjectCount: 1, amount: 60 },
  { cohortId: 3, subjectCount: 1, amount: 999 },
]

describe('a price group that follows another', () => {
  it('uses the followed group’s rows and its "materials in tuition"; its own rows are not used', () => {
    const out = followPriceGroups(groups, rates)
    expect(out.rates.filter((r) => r.cohortId === 3).map((r) => r.amount).sort()).toEqual([120, 65].sort())
    expect(out.rates.some((r) => r.amount === 999)).toBe(false)
    expect(out.cohorts.find((c) => c.id === 3)?.materialsIncluded).toBe(true)
    expect(out.rates.filter((r) => r.cohortId === 1)).toHaveLength(2)
    expect(out.rates.filter((r) => r.cohortId === 4)).toHaveLength(0)
  })

  it('one step only: following a group that itself follows does nothing', () => {
    const chained = [...groups.slice(0, 3), { id: 5, name: 'X', materialsIncluded: false, usesCohortId: 3 }]
    const out = followPriceGroups(chained, rates)
    expect(out.rates.filter((r) => r.cohortId === 5)).toHaveLength(0)
  })

  it('no followers: the same rows back', () => {
    const plain = groups.map((g) => ({ ...g, usesCohortId: null }))
    expect(followPriceGroups(plain, rates)).toEqual({ cohorts: plain, rates })
  })
})
