import { supabase } from './supabase'
import { isMissingDatabaseThing } from './studentExtras'

// Data Center part 3, the CRM side (20261102400000_meta_ads.sql + the meta-ads-sync edge function): the ad numbers
// Meta gives (spend, conversations), the leads each ad brought (department 5's first advert per lead), and what they
// became. The Meta key never comes here: the CRM only reads the numbers the function wrote.

export type AdRow = {
  adId: string | null
  adName: string | null
  title: string | null
  campaignId: string | null
  campaignName: string | null
  thumbnailUrl: string | null
  status: string | null
  spend: number
  impressions: number
  clicks: number
  conversations: number
  metaLeads: number
  leads: number
  trials: number
  conversions: number
  revenueActual: number
  revenueEstimated: number
}

export type EcAdRow = {
  ecId: number | null
  ecName: string
  adLeads: number
  conversions: number
  revenueActual: number
  revenueEstimated: number
  spendShare: number
}

export type AdMonth = {
  month: string
  spend: number
  conversations: number
  adLeads: number
  adConversions: number
  adRevenueActual: number
  adRevenueEstimated: number
}

export type AdsStatus = {
  accounts: { accountId: string; name: string | null; currency: string | null; timezone: string | null; lastPulledAt: string | null }[]
  lastRun: { startedAt: string; finishedAt: string | null; ok: boolean | null; error: string | null; warnings: string[]; since: string | null; until: string | null } | null
  lastGoodAt: string | null
}

const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : 0
}
const record = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const str = (v: unknown) => (typeof v === 'string' ? v : null)

// Money divided by a count, or null when there is nothing to divide by.
export const per = (money: number, count: number): number | null => (count > 0 ? Math.round((money / count) * 100) / 100 : null)
// Revenue for each ringgit spent.
export const roas = (revenue: number, spend: number): number | null => (spend > 0 ? Math.round((revenue / spend) * 100) / 100 : null)
// CRM leads out of Meta conversations, in percent (under 50%: chats may be missing a lead).
export const registrationRate = (leads: number, conversations: number): number | null =>
  conversations > 0 ? Math.round((leads / conversations) * 100) : null

// The ads of one campaign added up (the campaign's name from any of its ads).
export function byCampaign(rows: AdRow[]): AdRow[] {
  const groups = new Map<string, AdRow>()
  for (const r of rows) {
    const key = r.campaignId ?? r.campaignName ?? (r.adId === null ? 'none' : 'unknown')
    const g = groups.get(key)
    if (!g) {
      groups.set(key, { ...r, adId: null, adName: null, title: null, thumbnailUrl: null, status: null, campaignName: r.campaignName ?? (r.adId === null ? 'Posts / unknown ads' : 'No campaign') })
      continue
    }
    g.spend += r.spend
    g.impressions += r.impressions
    g.clicks += r.clicks
    g.conversations += r.conversations
    g.metaLeads += r.metaLeads
    g.leads += r.leads
    g.trials += r.trials
    g.conversions += r.conversions
    g.revenueActual += r.revenueActual
    g.revenueEstimated += r.revenueEstimated
  }
  return [...groups.values()].sort((a, b) => b.spend - a.spend)
}

export function readAdRow(r: Record<string, unknown>): AdRow {
  return {
    adId: str(r.ad_id),
    adName: str(r.ad_name),
    title: str(r.title),
    campaignId: str(r.campaign_id),
    campaignName: str(r.campaign_name),
    thumbnailUrl: str(r.thumbnail_url),
    status: str(r.status),
    spend: num(r.spend),
    impressions: num(r.impressions),
    clicks: num(r.clicks),
    conversations: num(r.conversations),
    metaLeads: num(r.meta_leads),
    leads: num(r.leads),
    trials: num(r.trials),
    conversions: num(r.conversions),
    revenueActual: num(r.revenue_actual),
    revenueEstimated: num(r.revenue_estimated),
  }
}

export function readAdMonths(raw: unknown): { months: AdMonth[]; connected: boolean } {
  const v = record(raw)
  return {
    connected: v.connected === true,
    months: (Array.isArray(v.months) ? v.months : []).map((m) => {
      const r = record(m)
      return {
        month: String(r.month ?? ''),
        spend: num(r.spend),
        conversations: num(r.conversations),
        adLeads: num(r.adLeads),
        adConversions: num(r.adConversions),
        adRevenueActual: num(r.adRevenueActual),
        adRevenueEstimated: num(r.adRevenueEstimated),
      }
    }),
  }
}

export function readAdsStatus(raw: unknown): AdsStatus {
  const v = record(raw)
  const run = v.lastRun ? record(v.lastRun) : null
  return {
    accounts: (Array.isArray(v.accounts) ? v.accounts : []).map((a) => {
      const r = record(a)
      return { accountId: String(r.accountId ?? ''), name: str(r.name), currency: str(r.currency), timezone: str(r.timezone), lastPulledAt: str(r.lastPulledAt) }
    }),
    lastRun: run
      ? {
          startedAt: String(run.startedAt ?? ''),
          finishedAt: str(run.finishedAt),
          ok: typeof run.ok === 'boolean' ? run.ok : null,
          error: str(run.error),
          warnings: Array.isArray(run.warnings) ? run.warnings.filter((w): w is string => typeof w === 'string') : [],
          since: str(run.since),
          until: str(run.until),
        }
      : null,
    lastGoodAt: str(v.lastGoodAt),
  }
}

// ---- calls ----

const reason = (error: { message?: string; code?: string } | null) =>
  error && isMissingDatabaseThing(error) ? 'Facebook ads need their database update first.' : error?.message || 'Could not load.'

export async function fetchAdsStatus(): Promise<{ status: AdsStatus | null; error: string | null }> {
  if (!supabase) return { status: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('meta_ads_status')
  return error ? { status: null, error: reason(error) } : { status: readAdsStatus(data), error: null }
}

export async function fetchAds(from: string, to: string): Promise<{ rows: AdRow[]; error: string | null }> {
  if (!supabase) return { rows: [], error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('data_center_ads', { p_from: from, p_to: to })
  return error ? { rows: [], error: reason(error) } : { rows: ((data ?? []) as Record<string, unknown>[]).map(readAdRow), error: null }
}

export async function fetchEcAds(from: string, to: string): Promise<{ rows: EcAdRow[]; error: string | null }> {
  if (!supabase) return { rows: [], error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('data_center_ec_ads', { p_from: from, p_to: to })
  if (error) return { rows: [], error: reason(error) }
  return {
    rows: (data ?? []).map((r) => ({
      ecId: r.ec_id,
      ecName: r.ec_name,
      adLeads: num(r.ad_leads),
      conversions: num(r.conversions),
      revenueActual: num(r.revenue_actual),
      revenueEstimated: num(r.revenue_estimated),
      spendShare: num(r.spend_share),
    })),
    error: null,
  }
}

export async function fetchAdMonths(month: string): Promise<{ months: AdMonth[]; connected: boolean } | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('data_center_ad_months', { p_month: `${month}-01` })
  return error ? null : readAdMonths(data)
}

// "Pull now" (the last 3 days) or "Pull from a day": the edge function does it with the school's own Meta key.
export async function pullAds(opts: { since?: string }): Promise<{ ok: boolean; message: string }> {
  if (!supabase) return { ok: false, message: 'Supabase is not configured.' }
  const { data, error } = await supabase.functions.invoke('meta-ads-sync', { body: opts.since ? { since: opts.since } : { days: 3 } })
  if (error) return { ok: false, message: 'The pull did not run. Try again in a minute.' }
  const r = record(data)
  if (r.configured === false) return { ok: false, message: 'The Meta key is not set yet: the boss puts META_ADS_ACCESS_TOKEN and META_AD_ACCOUNT_IDS in Supabase.' }
  if (r.ok !== true) {
    const results = Array.isArray(r.results) ? r.results.map((x) => record(x)) : []
    const failed = results.filter((x) => typeof x.error === 'string').map((x) => `${x.account}: ${x.error}`)
    return { ok: false, message: failed.length ? failed.join(' | ') : String(r.error ?? 'Meta did not answer.') }
  }
  return { ok: true, message: `Pulled ${String(r.since)} to ${String(r.until)}.` }
}
