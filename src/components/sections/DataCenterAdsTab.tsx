import { useEffect, useMemo, useState } from 'react'
import { cn } from '../../lib/cn'
import { monthRange, ringgit, shiftMonth } from '../../lib/dataCenter'
import {
  byCampaign,
  per,
  registrationRate,
  roas,
  type AdRow,
  type AdsStatus,
  type EcAdRow,
  type fetchAds,
  type fetchAdsStatus,
  type fetchEcAds,
  type pullAds,
} from '../../lib/metaAds'

// Data Center part 3: Facebook ads. Meta's numbers (pulled each morning by meta-ads-sync with the school's own key,
// which never comes to the browser) against the leads each ad brought and what they became.

export type AdsApi = {
  adsStatus: typeof fetchAdsStatus
  ads: typeof fetchAds
  ecAds: typeof fetchEcAds
  pull: typeof pullAds
}

type Period = 'this' | 'last' | 'custom'
type View = 'ads' | 'campaigns' | 'ecs'

const money = (n: number | null) => (n === null ? '—' : ringgit(n))
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' }) : 'never')

export function AdsTab({ api, thisMonth, today, isAdmin }: { api: AdsApi; thisMonth: string; today: string; isAdmin: boolean }) {
  const [period, setPeriod] = useState<Period>('this')
  const [custom, setCustom] = useState({ from: `${thisMonth}-01`, to: today })
  const range = useMemo(() => {
    if (period === 'this') return { from: `${thisMonth}-01`, to: today }
    if (period === 'last') return monthRange(shiftMonth(thisMonth, -1))
    return custom
  }, [period, custom, thisMonth, today])
  const [view, setView] = useState<View>('ads')
  const [status, setStatus] = useState<AdsStatus | null>(null)
  const [rows, setRows] = useState<AdRow[]>([])
  const [ecRows, setEcRows] = useState<EcAdRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [pullFrom, setPullFrom] = useState('')
  const [pullMessage, setPullMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pulling, setPulling] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    void Promise.all([api.adsStatus(), api.ads(range.from, range.to), api.ecAds(range.from, range.to)]).then(([s, a, e]) => {
      if (!alive) return
      setStatus(s.status)
      setRows(a.rows)
      setEcRows(e.rows)
      setError(s.error ?? a.error ?? e.error)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [api, range.from, range.to, reload])

  const pull = async (since?: string) => {
    setPulling(true)
    const result = await api.pull(since ? { since } : {})
    setPulling(false)
    setPullMessage({ ok: result.ok, text: result.message })
    setReload((n) => n + 1)
  }

  const shown = view === 'campaigns' ? byCampaign(rows) : rows
  const total = byCampaign(rows.map((r) => ({ ...r, campaignId: 'all', campaignName: 'All ads' })))[0]
  const lastRun = status?.lastRun ?? null
  const failed = lastRun !== null && lastRun.ok === false

  return (
    <div className="space-y-4">
      {failed && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          The last Facebook pull failed ({when(lastRun.startedAt)}): {lastRun.error ?? 'no reason given'}. Next step: check the Meta key and the ad account ids in
          Supabase secrets, then press “Pull now”.
        </p>
      )}
      {(lastRun?.warnings ?? []).map((w) => (
        <p key={w} className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {w}
        </p>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm">
        <p className="text-slate-600">
          {status && status.accounts.length > 0 ? (
            <>
              Ad accounts: {status.accounts.map((a) => `${a.name ?? a.accountId}${a.currency ? ` (${a.currency})` : ''}`).join(', ')} · last good pull{' '}
              {when(status.lastGoodAt)}
            </>
          ) : (
            'Facebook ads are not connected yet: the boss puts the Meta key in Supabase, then an admin presses “Pull now”.'
          )}
        </p>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={pulling} onClick={() => void pull()} className="rounded-lg bg-[#fc0c97] px-3 py-1.5 font-semibold text-white disabled:opacity-50">
              {pulling ? 'Pulling…' : 'Pull now'}
            </button>
            <input type="date" aria-label="Pull from" value={pullFrom} max={today} onChange={(e) => setPullFrom(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1" />
            <button
              type="button"
              disabled={pulling || !pullFrom}
              onClick={() => void pull(pullFrom)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold disabled:opacity-50"
            >
              Pull from this day
            </button>
          </div>
        )}
        {pullMessage && <p className={cn('w-full text-sm', pullMessage.ok ? 'text-emerald-700' : 'text-red-700')}>{pullMessage.text}</p>}
      </div>

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
            className={cn('rounded-full border px-3 py-1 font-semibold', period === key ? 'border-[#fc0c97] bg-pink-50 text-slate-900' : 'border-slate-200 text-slate-600')}
          >
            {label}
          </button>
        ))}
        {period === 'custom' && (
          <>
            <input type="date" aria-label="Ads from" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} className="rounded-lg border border-slate-200 px-2 py-1" />
            <span>to</span>
            <input type="date" aria-label="Ads to" value={custom.to} min={custom.from} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} className="rounded-lg border border-slate-200 px-2 py-1" />
          </>
        )}
        <span className="mx-2 h-5 w-px bg-slate-200" />
        {(
          [
            ['ads', 'By ad'],
            ['campaigns', 'By campaign'],
            ['ecs', 'By EC'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => setView(key)}
            className={cn('rounded-full border px-3 py-1 font-semibold', view === key ? 'border-[#fc0c97] bg-pink-50 text-slate-900' : 'border-slate-200 text-slate-600')}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {!loading && !error && view !== 'ecs' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">{view === 'campaigns' ? 'Campaign' : 'Ad'}</th>
                <th className="px-3 py-2 text-right font-semibold">Spend</th>
                <th className="px-3 py-2 text-right font-semibold" title="Messaging conversations started (Meta)">Chats</th>
                <th className="px-3 py-2 text-right font-semibold" title="Leads whose first ad was this one, clicked in these days">Leads</th>
                <th className="px-3 py-2 text-right font-semibold" title="Leads ÷ chats. Under 50%: some chats may have no lead.">Registered</th>
                <th className="px-3 py-2 text-right font-semibold" title="Cost per result: spend ÷ chats (as in Ads Manager)">CPR</th>
                <th className="px-3 py-2 text-right font-semibold" title="Spend ÷ leads">CPL</th>
                <th className="px-3 py-2 text-right font-semibold">Trials</th>
                <th className="px-3 py-2 text-right font-semibold" title="Those leads who became regular students">Enrolled</th>
                <th className="px-3 py-2 text-right font-semibold" title="Spend ÷ enrolled">CPA</th>
                <th className="px-3 py-2 text-right font-semibold" title="Paid quotations + 估 estimates of those enrolments">Revenue</th>
                <th className="px-3 py-2 text-right font-semibold" title="Revenue ÷ spend">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {total && <AdLine row={{ ...total, campaignName: 'All ads' }} label="All ads" strong />}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-6 text-center text-slate-500">
                    No ad numbers for these days.
                  </td>
                </tr>
              )}
              {shown.map((r, i) => (
                <AdLine
                  key={`${r.adId ?? r.campaignId ?? 'x'}-${i}`}
                  row={r}
                  label={
                    view === 'campaigns'
                      ? r.campaignName ?? 'No campaign'
                      : r.adId !== null
                        ? r.title ?? r.adName ?? r.adId
                        : r.campaignId !== null
                          ? `${r.campaignName ?? r.campaignId} (no ad id)`
                          : 'Posts / unknown ads'
                  }
                  sub={view === 'ads' && r.adId !== null ? r.campaignName : null}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && view === 'ecs' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">EC</th>
                <th className="px-3 py-2 text-right font-semibold">Leads from ads</th>
                <th className="px-3 py-2 text-right font-semibold" title="Each ad's spend split by how many of its leads this EC got">Share of spend</th>
                <th className="px-3 py-2 text-right font-semibold">Enrolled</th>
                <th className="px-3 py-2 text-right font-semibold">CPA</th>
                <th className="px-3 py-2 text-right font-semibold">Revenue</th>
                <th className="px-3 py-2 text-right font-semibold">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {ecRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    No leads from ads in these days.
                  </td>
                </tr>
              )}
              {ecRows.map((r) => {
                const revenue = r.revenueActual + r.revenueEstimated
                return (
                  <tr key={r.ecId ?? 'none'} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold">{r.ecName}</td>
                    <td className="px-3 py-2 text-right">{r.adLeads}</td>
                    <td className="px-3 py-2 text-right">{ringgit(r.spendShare)}</td>
                    <td className="px-3 py-2 text-right">{r.conversions}</td>
                    <td className="px-3 py-2 text-right">{money(per(r.spendShare, r.conversions))}</td>
                    <td className="px-3 py-2 text-right">
                      {ringgit(revenue)}
                      {r.revenueEstimated > 0 && <span className="ml-1 rounded bg-amber-100 px-1 text-xs font-semibold text-amber-800">估</span>}
                    </td>
                    <td className="px-3 py-2 text-right">{roas(revenue, r.spendShare) ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AdLine({ row, label, sub, strong }: { row: AdRow; label: string; sub?: string | null; strong?: boolean }) {
  const revenue = row.revenueActual + row.revenueEstimated
  const reg = registrationRate(row.leads, row.conversations)
  return (
    <tr className={cn('border-t border-slate-100', strong && 'bg-pink-50/40 font-semibold')}>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          {row.thumbnailUrl && <img src={row.thumbnailUrl} alt="" className="h-9 w-9 rounded object-cover" />}
          <div>
            <p className="font-semibold text-slate-900">{label}</p>
            {sub && <p className="text-xs text-slate-500">{sub}</p>}
          </div>
        </div>
      </td>
      <td className="px-3 py-2 text-right">{ringgit(row.spend)}</td>
      <td className="px-3 py-2 text-right">{row.conversations}</td>
      <td className="px-3 py-2 text-right">{row.leads}</td>
      <td className={cn('px-3 py-2 text-right', reg !== null && reg < 50 && 'font-semibold text-red-600')}>{reg === null ? '—' : `${reg}%`}</td>
      <td className="px-3 py-2 text-right">{money(per(row.spend, row.conversations))}</td>
      <td className="px-3 py-2 text-right">{money(per(row.spend, row.leads))}</td>
      <td className="px-3 py-2 text-right">{row.trials}</td>
      <td className="px-3 py-2 text-right">{row.conversions}</td>
      <td className="px-3 py-2 text-right">{money(per(row.spend, row.conversions))}</td>
      <td className="px-3 py-2 text-right">
        {ringgit(revenue)}
        {row.revenueEstimated > 0 && <span className="ml-1 rounded bg-amber-100 px-1 text-xs font-semibold text-amber-800">估</span>}
      </td>
      <td className="px-3 py-2 text-right">{roas(revenue, row.spend) ?? '—'}</td>
    </tr>
  )
}
