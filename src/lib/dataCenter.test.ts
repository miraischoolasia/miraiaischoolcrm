import { describe, expect, it } from 'vitest'
import {
  bucketKeyFor,
  changePercent,
  conversionRate,
  DEFAULT_DATA_CENTER_SETTINGS,
  monthRange,
  progressPercent,
  readDataCenterSettings,
  readEcRow,
  readOverview,
  shiftMonth,
  teamTotal,
  todayKL,
  type EcRow,
} from './dataCenter'

const row = (over: Partial<EcRow>): EcRow => ({
  ecId: 1,
  ecName: 'A',
  leads: 0,
  leadsByBucket: {},
  conversions: 0,
  samePeriod: 0,
  crossPeriod: 0,
  subjects: 0,
  weightedSubjects: 0,
  revenueActual: 0,
  paidQuotations: 0,
  revenueEstimated: 0,
  unknownAmounts: 0,
  avgDays: null,
  medianDays: null,
  targetPeople: 50,
  targetSubjects: 100,
  ...over,
})

describe('Data Center settings', () => {
  it('fills in what is missing and keeps the default bucket one of the buckets', () => {
    expect(readDataCenterSettings(null)).toEqual(DEFAULT_DATA_CENTER_SETTINGS)
    const s = readDataCenterSettings({ buckets: [{ key: 'a', label: 'A' }], defaultBucket: 'gone', targets: { people: '60' } })
    expect(s.buckets).toEqual([{ key: 'a', label: 'A' }])
    expect(s.defaultBucket).toBe('a')
    expect(s.targets).toEqual({ people: 60, subjects: 100 })
    expect(s.weights).toEqual(DEFAULT_DATA_CENTER_SETTINGS.weights)
  })

  it('makes a bucket key from its name, never twice', () => {
    expect(bucketKeyFor('Walk-in', [])).toBe('walk_in')
    expect(bucketKeyFor('Walk in', ['walk_in'])).toBe('walk_in_2')
    expect(bucketKeyFor('学校活动', [])).toBe('bucket')
  })
})

describe('reading the reports', () => {
  it('reads an EC row, numbers from strings, nulls kept', () => {
    const r = readEcRow({
      ec_id: 7, ec_name: 'Angel', leads: 10, leads_by_bucket: { mkt: 8, walkin: 2 }, conversions: 3, same_period: 2,
      cross_period: 1, subjects: 6, weighted_subjects: '6.6', revenue_actual: '540.00', paid_quotations: 2,
      revenue_estimated: '120', unknown_amounts: 1, avg_days: null, median_days: '4.0', target_people: 50, target_subjects: 100,
    })
    expect(r).toMatchObject({ ecId: 7, weightedSubjects: 6.6, revenueActual: 540, revenueEstimated: 120, avgDays: null, medianDays: 4 })
    expect(r.leadsByBucket).toEqual({ mkt: 8, walkin: 2 })
  })

  it('reads the overview, and nothing at all', () => {
    expect(readOverview(null)).toEqual({ months: [], buckets: [], historicalConversions: 0, adSpendConnected: false })
    const o = readOverview({ months: [{ month: '2026-10', leads: 5, revenueActual: '10.5' }], buckets: [{ bucket: 'mkt', label: 'MKT', leads: 3 }] })
    expect(o.months[0]).toEqual({ month: '2026-10', leads: 5, trials: 0, conversions: 0, revenueActual: 10.5, revenueEstimated: 0, unknownAmounts: 0, students: 0 })
    expect(o.buckets[0]).toEqual({ bucket: 'mkt', label: 'MKT', leads: 3, conversions: 0 })
  })
})

describe('the whole team row', () => {
  it('adds the ECs up; targets only for real ECs; days weighted by conversions', () => {
    const t = teamTotal([
      row({ ecId: 1, leads: 10, leadsByBucket: { mkt: 10 }, conversions: 2, revenueActual: 100, avgDays: 4 }),
      row({ ecId: 2, leads: 5, leadsByBucket: { mkt: 3, walkin: 2 }, conversions: 6, revenueEstimated: 50, avgDays: 8 }),
      row({ ecId: null, ecName: '(no EC)', leads: 4, leadsByBucket: { cold: 4 }, targetPeople: 50 }),
    ])
    expect(t.leads).toBe(19)
    expect(t.leadsByBucket).toEqual({ mkt: 13, walkin: 2, cold: 4 })
    expect(t.conversions).toBe(8)
    expect(t.revenueActual + t.revenueEstimated).toBe(150)
    expect(t.targetPeople).toBe(100)
    expect(t.avgDays).toBe(7)
  })
})

describe('small sums', () => {
  it('conversion rate, change, progress', () => {
    expect(conversionRate(3, 0)).toBeNull()
    expect(conversionRate(1, 3)).toBe(33.3)
    expect(changePercent(15, 10)).toBe(50)
    expect(changePercent(5, 0)).toBeNull()
    expect(changePercent(0, 4)).toBe(-100)
    expect(progressPercent(25, 50)).toBe(50)
    expect(progressPercent(5, 0)).toBeNull()
  })

  it('months and Malaysia days', () => {
    expect(monthRange('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(monthRange('2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-10', -5)).toBe('2026-05')
    // 23:30 UTC on the 23rd is already the 24th in Malaysia (EC's system said the 23rd).
    expect(todayKL(new Date('2026-10-23T23:30:00Z'))).toBe('2026-10-24')
    expect(todayKL(new Date('2026-10-23T10:00:00Z'))).toBe('2026-10-23')
  })
})

describe('Learning Consultants', () => {
  it('stay rate, stop rate and the whole school', async () => {
    const { stayRate, stopRate, lcTotal } = await import('./dataCenter')
    const lily = { lcId: 1, lcName: 'Lily', students: 2, studentsAtStart: 3, studentsStillIn: 2, staysAtStart: 4, staysAdded: 1, staysStopped: 1, atRisk: 2, cardsDue: 3, cardsSent: 1 }
    expect(stayRate(lily)).toBe(67)
    expect(stopRate(lily)).toBe(20)
    expect(stayRate({ studentsAtStart: 0, studentsStillIn: 0 })).toBeNull()
    expect(stopRate({ staysAtStart: 0, staysAdded: 0, staysStopped: 0 })).toBeNull()
    const total = lcTotal([lily, { ...lily, lcId: null, lcName: '(nobody)' }])
    expect(total).toMatchObject({ lcName: 'Whole school', students: 4, staysStopped: 2, cardsSent: 2 })
  })
})
