import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DataCenterSection, type DataCenterApi } from './DataCenterSection'
import { DEFAULT_DATA_CENTER_SETTINGS, type EcRow } from '../../lib/dataCenter'

const ec = (over: Partial<EcRow>): EcRow => ({
  ecId: 1,
  ecName: 'Angel',
  leads: 10,
  leadsByBucket: { mkt: 10 },
  conversions: 2,
  samePeriod: 1,
  crossPeriod: 1,
  subjects: 4,
  weightedSubjects: 4.4,
  revenueActual: 300,
  paidQuotations: 1,
  revenueEstimated: 0,
  unknownAmounts: 0,
  avgDays: 5,
  medianDays: 5,
  targetPeople: 50,
  targetSubjects: 100,
  ...over,
})

function fakeApi(over: Partial<DataCenterApi> = {}): DataCenterApi {
  const month = (m: string, leads: number, conversions: number, actual: number, estimated: number) => ({
    month: m, leads, trials: leads - 4, conversions, revenueActual: actual, revenueEstimated: estimated, unknownAmounts: 0, students: 40,
  })
  return {
    settings: vi.fn(async () => DEFAULT_DATA_CENTER_SETTINGS),
    saveSettings: vi.fn(async () => null),
    overview: vi.fn(async () => ({
      overview: {
        months: [month('2026-09', 10, 2, 100, 0), month('2026-10', 15, 3, 200, 60)],
        buckets: [{ bucket: 'mkt', label: 'MKT', leads: 12, conversions: 3 }],
        historicalConversions: 271,
        adSpendConnected: false,
      },
      error: null,
    })),
    ecReport: vi.fn(async () => ({
      rows: [
        ec({ ecId: 1, ecName: 'Angel', revenueActual: 300 }),
        ec({ ecId: null, ecName: '(no EC)', conversions: 0, revenueActual: 0 }),
        ec({ ecId: 2, ecName: 'Derrick', revenueActual: 0, revenueEstimated: 120, conversions: 1 }),
      ],
      error: null,
    })),
    conversions: vi.fn(async () => ({
      rows: [
        { conversionId: 1, leadId: 1, leadName: 'Mum A', studentId: 1, studentName: 'Kid A', convertedOn: '2026-10-05', salesPersonId: 1, subjects: 2, months: 1, amount: 300, amountKind: 'actual' as const, estimateNote: null },
        { conversionId: 2, leadId: 2, leadName: 'Mum B', studentId: 2, studentName: 'Kid B', convertedOn: '2026-10-06', salesPersonId: 2, subjects: 1, months: 1, amount: null, amountKind: 'unknown' as const, estimateNote: 'no_membership' },
      ],
      error: null,
    })),
    sourcesAndLevels: vi.fn(async () => ({ sources: [{ id: 5, label: 'Walk-in', bucket: 'walkin' }], levels: [{ name: 'P4', feeLevel: null }] })),
    setSourceBucket: vi.fn(async () => null),
    setLevelFeeLevel: vi.fn(async () => null),
    targets: vi.fn(async () => []),
    setTarget: vi.fn(async () => null),
    lcReport: vi.fn(async () => ({
      rows: [
        { lcId: 7, lcName: 'Lily', students: 2, studentsAtStart: 3, studentsStillIn: 2, staysAtStart: 4, staysAdded: 1, staysStopped: 1, atRisk: 2, cardsDue: 3, cardsSent: 1 },
        { lcId: null, lcName: '(nobody)', students: 1, studentsAtStart: 1, studentsStillIn: 1, staysAtStart: 1, staysAdded: 0, staysStopped: 0, atRisk: 0, cardsDue: 1, cardsSent: 0 },
      ],
      error: null,
    })),
    riskStudents: vi.fn(async () => ({
      rows: [
        { studentId: 1, name: 'Kid C', code: 'S0000003', stoppedAll: true, reasons: [], cardSent: false },
        { studentId: 2, name: 'Kid B', code: null, stoppedAll: false, reasons: ['Absent 3 lessons in a row'], cardSent: true },
      ],
      error: null,
    })),
    adsStatus: vi.fn(async () => ({
      status: {
        accounts: [{ accountId: 'act_1', name: 'EduHero Ads', currency: 'MYR', timezone: 'Asia/Kuala_Lumpur', lastPulledAt: '2026-10-23T20:00:00Z' }],
        lastRun: { startedAt: '2026-10-23T20:00:00Z', finishedAt: '2026-10-23T20:01:00Z', ok: true, error: null, warnings: [], since: '2026-10-20', until: '2026-10-22' },
        lastGoodAt: '2026-10-23T20:01:00Z',
      },
      error: null,
    })),
    ads: vi.fn(async () => ({
      rows: [
        { adId: '11', adName: 'Ad A', title: 'P4 Math free trial', campaignId: 'c1', campaignName: 'Oct trial', thumbnailUrl: null, status: 'ACTIVE', spend: 300, impressions: 9000, clicks: 200, conversations: 30, metaLeads: 0, leads: 12, trials: 5, conversions: 3, revenueActual: 600, revenueEstimated: 0 },
        { adId: '12', adName: 'Ad B', title: null, campaignId: 'c1', campaignName: 'Oct trial', thumbnailUrl: null, status: 'ACTIVE', spend: 100, impressions: 3000, clicks: 50, conversations: 10, metaLeads: 0, leads: 2, trials: 0, conversions: 0, revenueActual: 0, revenueEstimated: 0 },
      ],
      error: null,
    })),
    ecAds: vi.fn(async () => ({ rows: [{ ecId: 1, ecName: 'Angel', adLeads: 8, conversions: 2, revenueActual: 400, revenueEstimated: 0, spendShare: 200 }], error: null })),
    pull: vi.fn(async () => ({ ok: true, message: 'Pulled 2026-10-20 to 2026-10-22.' })),
    followUps: vi.fn(async () => [
      { assigneeId: 1, month: '2026-10-01', scheduled: 10, done: 8, onTime: 6, overdue: 2 },
      { assigneeId: 2, month: '2026-10-01', scheduled: 4, done: 4, onTime: 4, overdue: 0 },
    ]),
    adMonths: vi.fn(async () => ({
      connected: true,
      months: [
        { month: '2026-09', spend: 200, conversations: 20, adLeads: 8, adConversions: 1, adRevenueActual: 200, adRevenueEstimated: 0 },
        { month: '2026-10', spend: 400, conversations: 40, adLeads: 14, adConversions: 3, adRevenueActual: 600, adRevenueEstimated: 0 },
      ],
    })),
    ...over,
  }
}

describe('Facebook ads in the Data Center', () => {
  it('without the Ad Spend tick: no ads tab, the overview only says it is not connected', async () => {
    const api = fakeApi()
    render(<DataCenterSection staff={[]} isAdmin={false} api={api} today="2026-10-23" />)
    expect(await screen.findByText(/Facebook ads are not connected yet/)).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Facebook ads' })).not.toBeInTheDocument()
    expect(api.adMonths).not.toHaveBeenCalled()
  })

  it('with it: the overview shows spend, cost per lead / enrolment and return; the tab ranks the ads', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    render(<DataCenterSection staff={[]} isAdmin canSeeAds api={api} today="2026-10-23" />)
    expect(await screen.findByText('Ad spend')).toBeInTheDocument()
    expect(screen.getByText('Ad cost per lead').nextSibling).toHaveTextContent('RM28.57')
    expect(screen.getByText('Ad cost per enrolment').nextSibling).toHaveTextContent('RM133.33')
    expect(screen.getByText('Return on ad spend').nextSibling).toHaveTextContent('1.5')
    await user.click(screen.getByRole('tab', { name: 'Facebook ads' }))
    expect(await screen.findByText('P4 Math free trial')).toBeInTheDocument()
    const all = screen.getByText('All ads').closest('tr') as HTMLElement
    expect(within(all).getByText('RM400')).toBeInTheDocument()
    expect(within(screen.getByText('Ad B').closest('tr') as HTMLElement).getByText('20%')).toHaveClass('text-red-600')
    await user.click(screen.getByRole('button', { name: 'By campaign' }))
    expect(screen.getByText('Oct trial')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'By EC' }))
    expect(screen.getByText('Angel').closest('tr')).toHaveTextContent('RM200')
    await user.click(screen.getByRole('button', { name: 'Pull now' }))
    expect(api.pull).toHaveBeenCalledWith({})
    expect(await screen.findByText('Pulled 2026-10-20 to 2026-10-22.')).toBeInTheDocument()
  })

  it('a failed pull shows a red line with the next step', async () => {
    const user = userEvent.setup()
    const api = fakeApi({
      adsStatus: vi.fn(async () => ({
        status: { accounts: [], lastRun: { startedAt: '2026-10-23T20:00:00Z', finishedAt: null, ok: false, error: 'act_1: Invalid OAuth access token.', warnings: [], since: null, until: null }, lastGoodAt: null },
        error: null,
      })),
    })
    render(<DataCenterSection staff={[]} isAdmin canSeeAds api={api} today="2026-10-23" />)
    await user.click(await screen.findByRole('tab', { name: 'Facebook ads' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/Invalid OAuth access token.*check the Meta key/)
  })
})

describe('the Data Center', () => {
  it('overview: this month against last, money with the estimated part marked 估, the top ECs', async () => {
    render(<DataCenterSection staff={[]} isAdmin={false} api={fakeApi()} today="2026-10-23" />)
    expect(await screen.findByText('New leads')).toBeInTheDocument()
    expect(screen.getAllByText('↑ 50% vs last month', { exact: false }).length).toBe(2)
    expect(screen.getAllByText(/估 RM60/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Facebook ads are not connected yet/)).toBeInTheDocument()
    expect(screen.getByText('Historical conversions').nextSibling).toHaveTextContent('271')
    expect(screen.getByText('Trial classes').nextSibling).toHaveTextContent('11')
    expect(screen.getByText(/top: Angel \(2 conv\.\)/)).toBeInTheDocument()
    expect(screen.getByText(/3 students in class, 75% stayed, 2 at risk/)).toBeInTheDocument()
    expect(screen.getByText(/most: Lily \(2\)/)).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Settings' })).not.toBeInTheDocument()
  })

  it('EC performance: a ranking with the whole team first; no EC has no rank; opening an EC lists its conversions', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    render(<DataCenterSection staff={[]} isAdmin={false} api={api} today="2026-10-23" />)
    await user.click(screen.getByRole('tab', { name: 'EC performance' }))
    expect(api.ecReport).toHaveBeenLastCalledWith('2026-10-01', '2026-10-23')
    const rows = await screen.findAllByRole('row')
    expect(within(rows[1]).getByText('Whole team')).toBeInTheDocument()
    expect(within(rows[2]).getByText('1')).toBeInTheDocument()
    expect(within(rows[4]).getByText('2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Derrick' }))
    expect(await screen.findByText('Kid B')).toBeInTheDocument()
    expect(screen.queryByText('Kid A')).not.toBeInTheDocument()
    expect(screen.getByText(/no membership level/)).toBeInTheDocument()
    expect(within(rows[2]).getByText(/8\/10 \(60% on time\)/)).toBeInTheDocument()
    expect(within(rows[2]).getByText('2 overdue')).toBeInTheDocument()
    expect(within(rows[1]).getByText(/12\/14/)).toBeInTheDocument()
    expect(api.followUps).toHaveBeenLastCalledWith('2026-10-01')
    await user.click(screen.getByRole('button', { name: 'Last month' }))
    expect(api.ecReport).toHaveBeenLastCalledWith('2026-09-01', '2026-09-30')
    expect(api.followUps).toHaveBeenLastCalledWith('2026-09-01')
  })

  it('LCs & students: each LC with stayed / stop rate / cards, the whole school first; "at risk" lists who and why', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    render(<DataCenterSection staff={[]} isAdmin={false} api={api} today="2026-10-23" />)
    await user.click(screen.getByRole('tab', { name: 'LCs & students' }))
    expect(api.lcReport).toHaveBeenLastCalledWith('2026-10')
    const rows = await screen.findAllByRole('row')
    expect(within(rows[1]).getByText('Whole school')).toBeInTheDocument()
    const lily = within(rows[2])
    expect(lily.getByText('67%')).toBeInTheDocument()
    expect(lily.getByText('20%')).toBeInTheDocument()
    expect(lily.getByText('1 / 3')).toBeInTheDocument()
    await user.click(lily.getByRole('button', { name: '2 at risk' }))
    expect(api.riskStudents).toHaveBeenCalledWith('2026-10', 7)
    expect(await screen.findByText(/stopped every class this month/)).toBeInTheDocument()
    expect(screen.getByText(/Absent 3 lessons in a row/)).toBeInTheDocument()
    expect(screen.getByText('S0000003 · Kid C')).toBeInTheDocument()
  })

  it('settings (admin): saves the school settings, a source bucket, a level and an EC target', async () => {
    const user = userEvent.setup()
    const api = fakeApi()
    render(<DataCenterSection staff={[{ id: 9, fullName: 'Angel' }]} isAdmin api={api} today="2026-10-23" />)
    await user.click(screen.getByRole('tab', { name: 'Settings' }))
    await user.clear(screen.getByRole('spinbutton', { name: 'Target people' }))
    await user.type(screen.getByRole('spinbutton', { name: 'Target people' }), '60')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    expect(api.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ targets: { people: 60, subjects: 100 } }))
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Bucket for Walk-in' }), 'cold')
    expect(api.setSourceBucket).toHaveBeenCalledWith(5, 'cold')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Fee level for P4' }), 'primary')
    expect(api.setLevelFeeLevel).toHaveBeenCalledWith('P4', 'primary')
    await user.type(screen.getByRole('spinbutton', { name: 'Angel people' }), '40')
    await user.type(screen.getByRole('spinbutton', { name: 'Angel subjects' }), '80')
    const targetRow = screen.getByRole('spinbutton', { name: 'Angel people' }).closest('tr') as HTMLElement
    await user.click(within(targetRow).getByRole('button', { name: 'Save' }))
    expect(api.setTarget).toHaveBeenCalledWith(9, '2026-10', 40, 80)
  })
})

describe('the overview links', () => {
  it('"EC performance →" and "LCs & students →" open those tabs', async () => {
    const user = userEvent.setup()
    render(<DataCenterSection staff={[]} isAdmin={false} api={fakeApi()} today="2026-10-23" />)
    await user.click(await screen.findByRole('button', { name: 'EC performance →' }))
    expect(screen.getByRole('tab', { name: 'EC performance' })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('tab', { name: 'Overview' }))
    await user.click(await screen.findByRole('button', { name: 'LCs & students →' }))
    expect(screen.getByRole('tab', { name: 'LCs & students' })).toHaveAttribute('aria-selected', 'true')
  })
})
