import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { LcTab } from './DataCenterLcTab'
import type { FollowUpCompletionRow } from '../../lib/followUpCompletion'
import { AdsTab } from './DataCenterAdsTab'
import { fetchAdMonths, fetchAds, fetchAdsStatus, fetchEcAds, per, pullAds, roas, type AdMonth } from '../../lib/metaAds'
import {
  bucketKeyFor,
  changePercent,
  conversionRate,
  DEFAULT_DATA_CENTER_SETTINGS,
  ESTIMATE_NOTES,
  fetchConversions,
  fetchDataCenterSettings,
  fetchEcReport,
  fetchOverview,
  fetchSourcesAndLevels,
  fetchTargets,
  fetchLcReport,
  fetchDataCenterFollowUps,
  fetchRiskStudents,
  lcTotal,
  stayRate,
  type LcRow,

  monthRange,
  progressPercent,
  ringgit,
  saveDataCenterSettings,
  setLevelFeeLevel,
  setSourceBucket,
  setTarget,
  shiftMonth,
  teamTotal,
  todayKL,
  type Conversion,
  type DataCenterSettings,
  type EcRow,

  type LevelOption,
  type Overview,
  type SourceOption,
  type TargetRow,
} from '../../lib/dataCenter'

// The Data Center (boss 2026-10-23): the whole school's month and every EC's numbers (open ranking: everyone with the
// tick sees all ECs). Money: paid quotations are real (in the month paid); conversions without one are estimated from
// the price tables and marked 估. Facebook ads come in part 3.

export type DataCenterApi = {
  settings: typeof fetchDataCenterSettings
  saveSettings: typeof saveDataCenterSettings
  overview: typeof fetchOverview
  ecReport: typeof fetchEcReport
  conversions: typeof fetchConversions
  sourcesAndLevels: typeof fetchSourcesAndLevels
  setSourceBucket: typeof setSourceBucket
  setLevelFeeLevel: typeof setLevelFeeLevel
  targets: typeof fetchTargets
  setTarget: typeof setTarget
  lcReport: typeof fetchLcReport
  riskStudents: typeof fetchRiskStudents
  adsStatus: typeof fetchAdsStatus
  ads: typeof fetchAds
  ecAds: typeof fetchEcAds
  pull: typeof pullAds
  adMonths: typeof fetchAdMonths
  // Department 1's automatic follow-ups per person and month (view followup_completion, 20261102500000).
  followUps: typeof fetchDataCenterFollowUps
}

const databaseApi: DataCenterApi = {
  settings: fetchDataCenterSettings,
  saveSettings: saveDataCenterSettings,
  overview: fetchOverview,
  ecReport: fetchEcReport,
  conversions: fetchConversions,
  sourcesAndLevels: fetchSourcesAndLevels,
  setSourceBucket,
  setLevelFeeLevel,
  targets: fetchTargets,
  setTarget,
  lcReport: fetchLcReport,
  riskStudents: fetchRiskStudents,
  adsStatus: fetchAdsStatus,
  ads: fetchAds,
  ecAds: fetchEcAds,
  pull: pullAds,
  adMonths: fetchAdMonths,
  followUps: fetchDataCenterFollowUps,
}

type Tab = 'overview' | 'ec' | 'lc' | 'ads' | 'settings'
type Period = 'this' | 'last' | 'custom'

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-MY', { month: 'short', year: 'numeric', timeZone: 'UTC' })

function Change({ now, before }: { now: number; before: number }) {
  const change = changePercent(now, before)
  if (change === null) return <span className="text-xs text-slate-400">no last month</span>
  return (
    <span className={cn('text-xs font-semibold', change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-600' : 'text-slate-500')}>
      {change > 0 ? '↑' : change < 0 ? '↓' : '·'} {Math.abs(change)}% vs last month
    </span>
  )
}

function Money({ actual, estimated, unknown }: { actual: number; estimated: number; unknown?: number }) {
  return (
    <span>
      {ringgit(actual + estimated)}
      {estimated > 0 && (
        <span title="Estimated from the price tables (no paid quotation)" className="ml-1 rounded bg-amber-100 px-1 text-xs font-semibold text-amber-800">
          估 {ringgit(estimated)}
        </span>
      )}
      {!!unknown && (
        <span title="Conversions whose amount could not be estimated" className="ml-1 text-xs text-slate-400">
          +{unknown} no amount
        </span>
      )}
    </span>
  )
}

export function DataCenterSection({
  staff,
  isAdmin,
  canSeeAds = false,
  api = databaseApi,
  today = todayKL(),
}: {
  staff: { id: number; fullName: string }[]
  isAdmin: boolean
  // The Ad Spend tick: Facebook ad money (the ads tab and the overview's ad cards).
  canSeeAds?: boolean
  api?: DataCenterApi
  today?: string
}) {
  const thisMonth = today.slice(0, 7)
  const [tab, setTab] = useState<Tab>('overview')
  const [settings, setSettings] = useState<DataCenterSettings>(DEFAULT_DATA_CENTER_SETTINGS)

  useEffect(() => {
    void api.settings().then(setSettings)
  }, [api])

  const tabs: [Tab, string][] = [
    ['overview', 'Overview'],
    ['ec', 'EC performance'],
    ['lc', 'LCs & students'],
    ...(canSeeAds ? ([['ads', 'Facebook ads']] as [Tab, string][]) : []),
    ...(isAdmin ? ([['settings', 'Settings']] as [Tab, string][]) : []),
  ]

  return (
    <section aria-labelledby="data-center-title" className="mx-auto w-full max-w-[1400px] space-y-4">
      <div>
        <h2 id="data-center-title" className="text-lg font-semibold text-slate-900">
          Data Center
        </h2>
        <p className="text-sm text-slate-500">The school's month and every EC's numbers. 估 = estimated from the price tables.</p>
      </div>

      <div role="tablist" aria-label="Data Center" className="flex gap-1 border-b border-slate-200">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-semibold',
              tab === key ? 'border-[#fc0c97] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab api={api} thisMonth={thisMonth} onOpen={setTab} canSeeAds={canSeeAds} />}
      {tab === 'ec' && <EcTab api={api} thisMonth={thisMonth} today={today} settings={settings} />}
      {tab === 'lc' && <LcTab api={api} thisMonth={thisMonth} />}
      {tab === 'ads' && canSeeAds && <AdsTab api={api} thisMonth={thisMonth} today={today} isAdmin={isAdmin} />}
      {tab === 'settings' && isAdmin && (
        <SettingsTab api={api} settings={settings} onSettings={setSettings} staff={staff} thisMonth={thisMonth} />
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------

function OverviewTab({ api, thisMonth, onOpen, canSeeAds }: { api: DataCenterApi; thisMonth: string; onOpen: (tab: Tab) => void; canSeeAds: boolean }) {
  const [month, setMonth] = useState(thisMonth)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [ecRows, setEcRows] = useState<EcRow[]>([])
  const [lcRows, setLcRows] = useState<LcRow[]>([])
  const [ads, setAds] = useState<{ months: AdMonth[]; connected: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    const range = monthRange(month)
    void Promise.all([api.overview(month), api.ecReport(range.from, range.to), api.lcReport(month), canSeeAds ? api.adMonths(month) : Promise.resolve(null)]).then(([o, ec, lc, ad]) => {
      if (!alive) return
      setOverview(o.overview)
      setEcRows(ec.rows)
      setLcRows(lc.rows)
      setAds(ad)
      setError(o.error ?? ec.error ?? lc.error)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [api, month, canSeeAds])

  const now = overview?.months.at(-1)
  const adNow = ads?.months.at(-1)
  const adBefore = ads?.months.at(-2)
  const before = overview?.months.at(-2)
  const maxRevenue = Math.max(1, ...(overview?.months ?? []).map((m) => m.revenueActual + m.revenueEstimated))
  const team = teamTotal(ecRows)
  const bestEc = ecRows.find((r) => r.ecId !== null && r.revenueActual + r.revenueEstimated + r.conversions > 0)
  const school = lcTotal(lcRows)
  const lcMostAtRisk = [...lcRows].filter((r) => r.lcId !== null && r.atRisk > 0).sort((a, b) => b.atRisk - a.atRisk)[0]

  return (
    <div className="space-y-4">
      <label className="flex w-fit items-center gap-2 text-sm text-slate-700">
        Month
        <input
          type="month"
          aria-label="Month"
          value={month}
          max={thisMonth}
          onChange={(event) => event.target.value && setMonth(event.target.value)}
          className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
        />
      </label>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {!loading && overview && now && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card title="New leads" value={String(now.leads)} change={<Change now={now.leads} before={before?.leads ?? 0} />} />
            <Card title="Trial classes" value={String(now.trials)} hint="Trial lessons booked for a day this month" change={<Change now={now.trials} before={before?.trials ?? 0} />} />
            <Card
              title="Conversions"
              value={String(now.conversions)}
              hint={now.leads > 0 ? `${conversionRate(now.conversions, now.leads)}% of this month's leads (any month's leads count)` : undefined}
              change={<Change now={now.conversions} before={before?.conversions ?? 0} />}
            />
            <Card
              title="Revenue"
              value={<Money actual={now.revenueActual} estimated={now.revenueEstimated} unknown={now.unknownAmounts} />}
              hint={`Paid ${ringgit(now.revenueActual)} (counted in the month paid)`}
              change={
                <Change
                  now={now.revenueActual + now.revenueEstimated}
                  before={(before?.revenueActual ?? 0) + (before?.revenueEstimated ?? 0)}
                />
              }
            />
            <Card title="Students in class" value={String(now.students)} hint="Regular students with a class at the month's end" change={<Change now={now.students} before={before?.students ?? 0} />} />
            {overview.historicalConversions > 0 && (
              <Card
                title="Historical conversions"
                value={String(overview.historicalConversions)}
                hint="Students who joined before the Data Center, day unknown: not in any month or the EC ranking."
              />
            )}
            {ads?.connected && adNow ? (
              <>
                <Card title="Ad spend" value={ringgit(adNow.spend)} change={<Change now={adNow.spend} before={adBefore?.spend ?? 0} />} />
                <Card
                  title="Ad cost per lead"
                  value={per(adNow.spend, adNow.adLeads) === null ? '—' : ringgit(per(adNow.spend, adNow.adLeads) as number)}
                  hint={`${adNow.adLeads} leads from ads, ${adNow.conversations} chats started`}
                />
                <Card
                  title="Ad cost per enrolment"
                  value={per(adNow.spend, adNow.adConversions) === null ? '—' : ringgit(per(adNow.spend, adNow.adConversions) as number)}
                  hint={`${adNow.adConversions} enrolled from ads this month`}
                />
                <Card
                  title="Return on ad spend"
                  value={String(roas(adNow.adRevenueActual + adNow.adRevenueEstimated, adNow.spend) ?? '—')}
                  hint="Revenue from ad leads ÷ spend (estimates included)"
                />
              </>
            ) : (
              <Card
                title="Facebook ads"
                value="—"
                hint={
                  canSeeAds
                    ? 'Facebook ads are not connected yet: waiting for the ad tracking on chats and the Meta key. Then ad spend, cost per lead and per conversion, and the best ads show here.'
                    : 'Facebook ads are not connected yet, or you do not have the Ad Spend tick.'
                }
              />
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Last 6 months</h3>
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500">
                  <tr>
                    <th className="py-1 text-left font-semibold">Month</th>
                    <th className="py-1 text-right font-semibold">Leads</th>
                    <th className="py-1 text-right font-semibold">Trials</th>
                    <th className="py-1 text-right font-semibold">Conv.</th>
                    <th className="py-1 pl-3 text-left font-semibold">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.months.map((m) => (
                    <tr key={m.month} className="border-t border-slate-100">
                      <td className="py-1.5">{monthLabel(m.month)}</td>
                      <td className="py-1.5 text-right">{m.leads}</td>
                      <td className="py-1.5 text-right">{m.trials}</td>
                      <td className="py-1.5 text-right">{m.conversions}</td>
                      <td className="py-1.5 pl-3">
                        <div className="flex items-center gap-2">
                          <div
                            aria-hidden
                            className="h-2 rounded bg-[#fc0c97]"
                            style={{ width: `${Math.round(((m.revenueActual + m.revenueEstimated) / maxRevenue) * 120)}px` }}
                          />
                          <Money actual={m.revenueActual} estimated={m.revenueEstimated} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Where this month's leads came from</h3>
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th className="py-1 text-left font-semibold">Bucket</th>
                      <th className="py-1 text-right font-semibold">Leads</th>
                      <th className="py-1 text-right font-semibold">Conversions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.buckets.map((b) => (
                      <tr key={b.bucket} className="border-t border-slate-100">
                        <td className="py-1.5">{b.label}</td>
                        <td className="py-1.5 text-right">{b.leads}</td>
                        <td className="py-1.5 text-right">{b.conversions}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                <h3 className="text-sm font-semibold text-slate-900">ECs and LCs this month</h3>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p>
                    <span className="font-semibold">ECs:</span> {team.conversions} conversions,{' '}
                    <Money actual={team.revenueActual} estimated={team.revenueEstimated} />
                    {bestEc && (
                      <span className="text-slate-600">
                        {' '}
                        · top: {bestEc.ecName} ({bestEc.conversions} conv.)
                      </span>
                    )}
                  </p>
                  <button type="button" onClick={() => onOpen('ec')} className="font-semibold text-[#fc0c97] hover:underline">
                    EC performance →
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p>
                    <span className="font-semibold">LCs:</span> {school.students} students in class
                    {stayRate(school) !== null && `, ${stayRate(school)}% stayed`}, {school.atRisk} at risk
                    {lcMostAtRisk && <span className="text-slate-600"> · most: {lcMostAtRisk.lcName} ({lcMostAtRisk.atRisk})</span>}
                  </p>
                  <button type="button" onClick={() => onOpen('lc')} className="font-semibold text-[#fc0c97] hover:underline">
                    LCs &amp; students →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Card({ title, value, hint, change }: { title: string; value: ReactNode; hint?: string; change?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      {change && <p className="mt-1">{change}</p>}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------

function EcTab({ api, thisMonth, today, settings }: { api: DataCenterApi; thisMonth: string; today: string; settings: DataCenterSettings }) {
  const [period, setPeriod] = useState<Period>('this')
  const [custom, setCustom] = useState({ from: `${thisMonth}-01`, to: today })
  const range = useMemo(() => {
    if (period === 'this') return { from: `${thisMonth}-01`, to: today }
    if (period === 'last') return monthRange(shiftMonth(thisMonth, -1))
    return custom
  }, [period, custom, thisMonth, today])

  const [rows, setRows] = useState<EcRow[]>([])
  const [followUps, setFollowUps] = useState<FollowUpCompletionRow[] | null>(null)
  const [conversions, setConversions] = useState<Conversion[] | null>(null)
  const [open, setOpen] = useState<number | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setConversions(null)
    setOpen(undefined)
    void api.ecReport(range.from, range.to).then((result) => {
      if (!alive) return
      setRows(result.rows)
      setError(result.error)
      setLoading(false)
    })
    // Follow-ups are counted per month: shown when the days are within one month.
    const sameMonth = range.from.slice(0, 7) === range.to.slice(0, 7)
    setFollowUps(null)
    if (sameMonth) {
      void api.followUps(`${range.from.slice(0, 7)}-01`).then((list) => {
        if (alive) setFollowUps(list)
      })
    }
    return () => {
      alive = false
    }
  }, [api, range.from, range.to])

  // One person's follow-ups (none: not shown, e.g. another EC's for a non-admin, who sees only their own).
  const followUpOf = (ecId: number | null): FollowUpCompletionRow | null => followUps?.find((f) => f.assigneeId === ecId) ?? null
  const followUpTotal: FollowUpCompletionRow | null =
    followUps && followUps.length > 0
      ? followUps.reduce(
          (t, f) => ({ ...t, scheduled: t.scheduled + f.scheduled, done: t.done + f.done, onTime: t.onTime + f.onTime, overdue: t.overdue + f.overdue }),
          { assigneeId: null, month: followUps[0].month, scheduled: 0, done: 0, onTime: 0, overdue: 0 },
        )
      : null

  const toggle = useCallback(
    (ecId: number | null) => {
      setOpen((value) => (value === ecId ? undefined : ecId))
      if (conversions === null) void api.conversions(range.from, range.to).then((result) => setConversions(result.rows))
    },
    [api, conversions, range.from, range.to],
  )

  const team = teamTotal(rows)
  const bucketLabel = (key: string) => settings.buckets.find((b) => b.key === key)?.label ?? key

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(
          [
            ['this', 'This month'],
            ['last', 'Last month'],
            ['custom', 'Pick dates'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={period === key}
            onClick={() => setPeriod(key)}
            className={cn(
              'rounded-full border px-3 py-1 font-semibold',
              period === key ? 'border-[#fc0c97] bg-pink-50 text-slate-900' : 'border-slate-200 text-slate-600',
            )}
          >
            {label}
          </button>
        ))}
        {period === 'custom' && (
          <>
            <input type="date" aria-label="From" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} className="rounded-lg border border-slate-200 px-2 py-1" />
            <span>to</span>
            <input type="date" aria-label="To" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} className="rounded-lg border border-slate-200 px-2 py-1" />
          </>
        )}
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">#</th>
                <th className="px-3 py-2 text-left font-semibold">EC</th>
                <th className="px-3 py-2 text-right font-semibold" title="Leads added in these days, by the lead's PIC">Leads</th>
                <th className="px-3 py-2 text-right font-semibold" title="Became regular students in these days">Conversions</th>
                <th className="px-3 py-2 text-right font-semibold" title="From leads of these days / from earlier leads">Same / earlier</th>
                <th className="px-3 py-2 text-right font-semibold" title="Conversions ÷ leads of these days. Can pass 100%: conversions from earlier leads count too.">Rate</th>
                <th className="px-3 py-2 text-right font-semibold" title="Weighted: 3-5 months ×1.1, 6-11 ×1.2, 12+ ×1.3 (Settings)">Subjects (weighted)</th>
                <th className="px-3 py-2 text-left font-semibold" title="Paid quotations in these days, plus estimates for conversions without one">Revenue</th>
                <th className="px-3 py-2 text-left font-semibold" title="Target of the first month in these days">Target</th>
                <th className="px-3 py-2 text-right font-semibold" title="Days from the lead coming in to converting (average / middle)">Days to convert</th>
                <th
                  className="px-3 py-2 text-right font-semibold"
                  title="Automatic follow-ups done of those due this month (on time in brackets), and how many are overdue now. Within one month only."
                >
                  Follow-ups
                </th>
              </tr>
            </thead>
            <tbody>
              <EcLine row={team} rank={null} bucketLabel={bucketLabel} strong followUp={followUpTotal} />
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-center text-slate-500">
                    No leads or conversions in these days.
                  </td>
                </tr>
              )}
              {rows.map((row, i) => (
                <Fragment key={row.ecId ?? 'none'}>
                  <EcLine
                    row={row}
                    rank={row.ecId === null ? null : i + 1 - rows.slice(0, i).filter((r) => r.ecId === null).length}
                    bucketLabel={bucketLabel}
                    onOpen={() => toggle(row.ecId)}
                    open={open === row.ecId}
                    followUp={followUpOf(row.ecId)}
                  />
                  {open === row.ecId && (
                    <tr className="bg-slate-50">
                      <td colSpan={11} className="px-6 py-3">
                        <ConversionList rows={conversions === null ? null : conversions.filter((c) => c.salesPersonId === row.ecId)} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function EcLine({
  row,
  rank,
  bucketLabel,
  strong,
  onOpen,
  open,
  followUp,
}: {
  row: EcRow
  rank: number | null
  bucketLabel: (key: string) => string
  strong?: boolean
  onOpen?: () => void
  open?: boolean
  followUp?: FollowUpCompletionRow | null
}) {
  const rate = conversionRate(row.conversions, row.leads)
  const people = progressPercent(row.conversions, row.targetPeople)
  const subjects = progressPercent(row.weightedSubjects, row.targetSubjects)
  const buckets = Object.entries(row.leadsByBucket)
    .map(([k, n]) => `${bucketLabel(k)} ${n}`)
    .join(' · ')
  return (
    <tr className={cn('border-t border-slate-100', strong && 'bg-pink-50/40 font-semibold')}>
      <td className="px-3 py-2 text-slate-500">{rank ?? ''}</td>
      <td className="px-3 py-2">
        {onOpen ? (
          <button type="button" aria-expanded={open} onClick={onOpen} className="font-semibold text-slate-900 hover:underline">
            {row.ecName}
          </button>
        ) : (
          row.ecName
        )}
      </td>
      <td className="px-3 py-2 text-right" title={buckets}>
        {row.leads}
      </td>
      <td className="px-3 py-2 text-right">{row.conversions}</td>
      <td className="px-3 py-2 text-right text-slate-600">
        {row.samePeriod} / {row.crossPeriod}
      </td>
      <td className="px-3 py-2 text-right">{rate === null ? '—' : `${rate}%`}</td>
      <td className="px-3 py-2 text-right">
        {row.subjects} ({row.weightedSubjects})
      </td>
      <td className="px-3 py-2">
        <Money actual={row.revenueActual} estimated={row.revenueEstimated} unknown={row.unknownAmounts} />
      </td>
      <td className="px-3 py-2 text-xs text-slate-600">
        {row.targetPeople > 0 || row.targetSubjects > 0 ? (
          <>
            {row.conversions}/{row.targetPeople} people{people !== null && ` (${people}%)`} · {row.weightedSubjects}/{row.targetSubjects} subj.
            {subjects !== null && ` (${subjects}%)`}
          </>
        ) : (
          '—'
        )}
      </td>
      <td className="px-3 py-2 text-right text-slate-600">
        {row.avgDays === null ? '—' : row.avgDays}
        {row.medianDays !== null && ` / ${row.medianDays}`}
      </td>
      <td className="px-3 py-2 text-right text-slate-600">
        {followUp && followUp.scheduled > 0 ? (
          <>
            {followUp.done}/{followUp.scheduled} ({Math.round((followUp.onTime / followUp.scheduled) * 100)}% on time)
            {followUp.overdue > 0 && <span className="ml-1 font-semibold text-red-600">{followUp.overdue} overdue</span>}
          </>
        ) : (
          '—'
        )}
      </td>
    </tr>
  )
}

function ConversionList({ rows }: { rows: Conversion[] | null }) {
  if (rows === null) return <p className="text-sm text-slate-500">Loading…</p>
  if (rows.length === 0) return <p className="text-sm text-slate-500">No conversions in these days.</p>
  return (
    <table className="w-full text-xs">
      <thead className="text-slate-500">
        <tr>
          <th className="py-1 text-left font-semibold">Day</th>
          <th className="py-1 text-left font-semibold">Student</th>
          <th className="py-1 text-left font-semibold">Lead</th>
          <th className="py-1 text-right font-semibold">Subjects</th>
          <th className="py-1 text-right font-semibold">Months</th>
          <th className="py-1 pl-3 text-left font-semibold">Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => (
          <tr key={c.conversionId} className="border-t border-slate-200">
            <td className="py-1">{c.convertedOn}</td>
            <td className="py-1">{c.studentName}</td>
            <td className="py-1">{c.leadName}</td>
            <td className="py-1 text-right">{c.subjects}</td>
            <td className="py-1 text-right">{c.months}</td>
            <td className="py-1 pl-3">
              {c.amountKind === 'actual' && c.amount !== null && ringgit(c.amount)}
              {c.amountKind === 'estimated' && c.amount !== null && (
                <span>
                  {ringgit(c.amount)} <span className="rounded bg-amber-100 px-1 font-semibold text-amber-800">估</span>
                </span>
              )}
              {c.amountKind === 'unknown' && <span className="text-slate-400">no amount ({ESTIMATE_NOTES[c.estimateNote ?? ''] ?? 'unknown'})</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------------------------------------------

function SettingsTab({
  api,
  settings,
  onSettings,
  staff,
  thisMonth,
}: {
  api: DataCenterApi
  settings: DataCenterSettings
  onSettings: (s: DataCenterSettings) => void
  staff: { id: number; fullName: string }[]
  thisMonth: string
}) {
  const [draft, setDraft] = useState<DataCenterSettings>(settings)
  const [sources, setSources] = useState<SourceOption[]>([])
  const [levels, setLevels] = useState<LevelOption[]>([])
  const [month, setMonth] = useState(thisMonth)
  const [targets, setTargets] = useState<TargetRow[]>([])
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => setDraft(settings), [settings])
  useEffect(() => {
    void api.sourcesAndLevels().then((r) => {
      setSources(r.sources)
      setLevels(r.levels)
    })
  }, [api])
  useEffect(() => {
    void api.targets(month).then(setTargets)
  }, [api, month])

  const say = (error: string | null, ok: string) => setMessage(error ? { ok: false, text: error } : { ok: true, text: ok })

  const saveMain = async () => {
    const error = await api.saveSettings(draft)
    if (!error) onSettings(draft)
    say(error, 'Settings saved.')
  }

  const changeSource = async (id: number, bucket: string) => {
    const error = await api.setSourceBucket(id, bucket || null)
    if (!error) setSources((list) => list.map((s) => (s.id === id ? { ...s, bucket: bucket || null } : s)))
    say(error, 'Source saved.')
  }

  const changeLevel = async (name: string, value: string) => {
    const feeLevel = value === 'primary' || value === 'secondary' ? value : null
    const error = await api.setLevelFeeLevel(name, feeLevel)
    if (!error) setLevels((list) => list.map((l) => (l.name === name ? { ...l, feeLevel } : l)))
    say(error, 'Level saved.')
  }

  const saveTarget = async (teacherId: number, people: string, subjects: string) => {
    const blank = people.trim() === '' && subjects.trim() === ''
    const error = await api.setTarget(teacherId, month, blank ? null : Number(people), blank ? null : Number(subjects))
    if (!error) void api.targets(month).then(setTargets)
    say(error, blank ? 'Back to the school target.' : 'Target saved.')
  }

  const input = 'rounded-lg border border-slate-200 px-2 py-1 text-sm'

  return (
    <div className="space-y-4">
      {message && (
        <p role="status" className={cn('rounded-xl px-4 py-2 text-sm', message.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700')}>
          {message.text}
        </p>
      )}

      <fieldset className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Source buckets, weights and the school target</legend>
        <div className="space-y-2">
          {draft.buckets.map((b, i) => (
            <div key={b.key} className="flex items-center gap-2 text-sm">
              <input
                aria-label={`Bucket ${i + 1} name`}
                value={b.label}
                maxLength={40}
                onChange={(e) => setDraft((d) => ({ ...d, buckets: d.buckets.map((x) => (x.key === b.key ? { ...x, label: e.target.value } : x)) }))}
                className={input}
              />
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input type="radio" name="default-bucket" checked={draft.defaultBucket === b.key} onChange={() => setDraft((d) => ({ ...d, defaultBucket: b.key }))} />
                sources with no bucket count here
              </label>
              {draft.buckets.length > 1 && draft.defaultBucket !== b.key && (
                <button type="button" onClick={() => setDraft((d) => ({ ...d, buckets: d.buckets.filter((x) => x.key !== b.key) }))} className="text-xs text-red-600 hover:underline">
                  Remove
                </button>
              )}
            </div>
          ))}
          {draft.buckets.length < 12 && (
            <button
              type="button"
              onClick={() =>
                setDraft((d) => ({ ...d, buckets: [...d.buckets, { key: bucketKeyFor(`bucket ${d.buckets.length + 1}`, d.buckets.map((b) => b.key)), label: 'New bucket' }] }))
              }
              className="text-sm font-semibold text-[#fc0c97] hover:underline"
            >
              + Add a bucket
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {draft.weights.map((w, i) => (
            <label key={i} className="flex items-center gap-1">
              {w.fromMonths}
              {w.toMonths === null ? '+' : `–${w.toMonths}`} months ×
              <input
                type="number"
                step="0.1"
                min={0.1}
                max={10}
                aria-label={`Weight for ${w.fromMonths} months`}
                value={w.times}
                onChange={(e) => setDraft((d) => ({ ...d, weights: d.weights.map((x, j) => (j === i ? { ...x, times: Number(e.target.value) } : x)) }))}
                className={cn(input, 'w-20')}
              />
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1">
            School target per EC: people
            <input type="number" min={0} aria-label="Target people" value={draft.targets.people} onChange={(e) => setDraft((d) => ({ ...d, targets: { ...d.targets, people: Number(e.target.value) } }))} className={cn(input, 'w-24')} />
          </label>
          <label className="flex items-center gap-1">
            subjects
            <input type="number" min={0} aria-label="Target subjects" value={draft.targets.subjects} onChange={(e) => setDraft((d) => ({ ...d, targets: { ...d.targets, subjects: Number(e.target.value) } }))} className={cn(input, 'w-24')} />
          </label>
        </div>
        <button type="button" onClick={() => void saveMain()} className="rounded-lg bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white">
          Save settings
        </button>
      </fieldset>

      <div className="grid gap-4 lg:grid-cols-2">
        <fieldset className="rounded-2xl border border-slate-200 bg-white p-4">
          <legend className="px-1 text-sm font-semibold text-slate-900">Which bucket each lead source counts in</legend>
          <table className="w-full text-sm">
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="py-1.5">{s.label}</td>
                  <td className="py-1.5 text-right">
                    <select aria-label={`Bucket for ${s.label}`} value={s.bucket ?? ''} onChange={(e) => void changeSource(s.id, e.target.value)} className={input}>
                      <option value="">(default: {settings.buckets.find((b) => b.key === settings.defaultBucket)?.label})</option>
                      {settings.buckets.map((b) => (
                        <option key={b.key} value={b.key}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>

        <fieldset className="rounded-2xl border border-slate-200 bg-white p-4">
          <legend className="px-1 text-sm font-semibold text-slate-900">Class levels: primary or secondary (for 估 estimates)</legend>
          <table className="w-full text-sm">
            <tbody>
              {levels.map((l) => (
                <tr key={l.name} className="border-t border-slate-100">
                  <td className="py-1.5">{l.name}</td>
                  <td className="py-1.5 text-right">
                    <select aria-label={`Fee level for ${l.name}`} value={l.feeLevel ?? ''} onChange={(e) => void changeLevel(l.name, e.target.value)} className={input}>
                      <option value="">Not set (no estimate)</option>
                      <option value="primary">Primary</option>
                      <option value="secondary">Secondary</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>
      </div>

      <fieldset className="rounded-2xl border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Each EC's own target</legend>
        <label className="mb-2 flex w-fit items-center gap-2 text-sm">
          Month
          <input type="month" aria-label="Target month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={input} />
        </label>
        <p className="mb-2 text-xs text-slate-500">Empty both boxes to use the school target ({settings.targets.people} people / {settings.targets.subjects} subjects).</p>
        <table className="w-full text-sm">
          <tbody>
            {staff.map((person) => (
              <TargetLine key={`${person.id}-${month}`} person={person} target={targets.find((t) => t.teacherId === person.id) ?? null} onSave={saveTarget} input={input} />
            ))}
          </tbody>
        </table>
      </fieldset>
    </div>
  )
}

function TargetLine({
  person,
  target,
  onSave,
  input,
}: {
  person: { id: number; fullName: string }
  target: TargetRow | null
  onSave: (teacherId: number, people: string, subjects: string) => Promise<void>
  input: string
}) {
  const [people, setPeople] = useState(target ? String(target.people) : '')
  const [subjects, setSubjects] = useState(target ? String(target.subjects) : '')
  useEffect(() => {
    setPeople(target ? String(target.people) : '')
    setSubjects(target ? String(target.subjects) : '')
  }, [target])
  return (
    <tr className="border-t border-slate-100">
      <td className="py-1.5">{person.fullName}</td>
      <td className="py-1.5">
        <input type="number" min={0} aria-label={`${person.fullName} people`} placeholder="people" value={people} onChange={(e) => setPeople(e.target.value)} className={cn(input, 'w-24')} />
      </td>
      <td className="py-1.5">
        <input type="number" min={0} aria-label={`${person.fullName} subjects`} placeholder="subjects" value={subjects} onChange={(e) => setSubjects(e.target.value)} className={cn(input, 'w-24')} />
      </td>
      <td className="py-1.5 text-right">
        <button type="button" onClick={() => void onSave(person.id, people, subjects)} className="text-sm font-semibold text-[#fc0c97] hover:underline">
          Save
        </button>
      </td>
    </tr>
  )
}
