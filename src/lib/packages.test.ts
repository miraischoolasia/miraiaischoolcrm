import { describe, expect, it } from 'vitest'
import { addMonths, getRenewalStartDate, planEnrollment, planFeeChange } from './packages'
import type { Package } from '../types/domain'

const pkg = (overrides: Partial<Package>): Package => ({
  id: 1,
  name: '3 Months',
  kind: 'regular',
  classCount: 12,
  durationMonths: 3,
  includesFees: true,
  isActive: true,
  sortOrder: 0,
  ...overrides,
})
const three = pkg({})
const six = pkg({ name: '6 Months', classCount: 24, durationMonths: 6 })
const trial = pkg({ name: 'Trial 1 Month', kind: 'trial', classCount: 4, durationMonths: 1, includesFees: false })

describe('addMonths', () => {
  it('adds calendar months and clamps to the last day', () => {
    expect(addMonths('2026-01-01', 3)).toBe('2026-04-01')
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-11-15', 12)).toBe('2027-11-15')
  })
})

describe('planEnrollment', () => {
  it('takes the classes and end date from the package', () => {
    expect(planEnrollment(six, '2026-10-05')).toEqual({ classCount: 24, endDate: '2027-04-05' })
  })
})

describe('getRenewalStartDate', () => {
  it('carries on from the current package, or starts today if it ran out', () => {
    expect(getRenewalStartDate('2026-12-01', '2026-10-03')).toBe('2026-12-01')
    expect(getRenewalStartDate('2026-09-01', '2026-10-03')).toBe('2026-10-03')
  })
})

describe('planFeeChange', () => {
  it('starts a year from the package start for a new student', () => {
    expect(planFeeChange(three, '2026-01-01', '2026-04-01', null, [])).toEqual({
      kind: 'new',
      from: null,
      to: '2027-01-01',
    })
  })

  it('counts the Trial 1 Month just before toward the year', () => {
    // Trial from 1 Jan (no fee: expiry left at the trial start), 3 Months from 1 Feb.
    expect(
      planFeeChange(three, '2026-02-01', '2026-05-01', '2026-01-01', [
        { startDate: '2026-01-01', kind: 'trial' },
      ]),
    ).toEqual({ kind: 'new', from: '2026-01-01', to: '2027-01-01' })
  })

  it('does not count a trial the fee year already covered, or an older one', () => {
    expect(
      planFeeChange(three, '2027-03-01', '2027-06-01', '2027-01-01', [
        { startDate: '2026-01-01', kind: 'trial' },
        { startDate: '2026-02-01', kind: 'regular' },
      ]),
    ).toEqual({ kind: 'new', from: '2027-01-01', to: '2028-03-01' })
  })

  it('leaves the fees while the package ends inside the fee year', () => {
    // Trial 1 + 3 + 6 = 10 months of a year that ends 1 Jan 2027.
    expect(planFeeChange(six, '2026-05-01', '2026-11-01', '2027-01-01', [])).toBeNull()
  })

  it('extends by a year from the old expiry once the package runs past it', () => {
    // 11 months used, then 3 more: ends 1 Mar 2027, fee year ended 1 Jan 2027.
    expect(planFeeChange(three, '2026-12-01', '2027-03-01', '2027-01-01', [])).toEqual({
      kind: 'extend',
      from: '2027-01-01',
      to: '2028-01-01',
    })
  })

  it('never touches the fees for trial or camp packages', () => {
    expect(planFeeChange(trial, '2026-01-01', '2026-02-01', null, [])).toBeNull()
  })
})
