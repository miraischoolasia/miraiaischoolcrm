// Data Center part 3 (Facebook ads): reading the Meta Marketing API's answers. Shared by the meta-ads-sync edge
// function and the CRM's tests. Nothing here holds or returns the access token: requests are built with it by the
// caller, and every error message is cleaned of URLs and tokens before it is kept or shown.

export const META_API_VERSION = 'v23.0'
export const GRAPH = 'https://graph.facebook.com'

// "Messaging conversations started" (click-to-WhatsApp / Messenger ads) and Meta's own lead forms.
export const CONVERSATION_ACTION = 'onsite_conversion.messaging_conversation_started_7d'
export const LEAD_ACTIONS = ['lead', 'onsite_conversion.lead_grouped']

// "123, act_456,," -> ['act_123', 'act_456'] (no doubles, digits only).
export function readAccountIds(raw: string | undefined | null): string[] {
  const ids = (raw ?? '')
    .split(',')
    .map((part) => part.trim().replace(/^act_/i, ''))
    .filter((part) => /^\d{3,25}$/.test(part))
  return [...new Set(ids)].map((id) => `act_${id}`)
}

// The days to pull, Malaysia time: the last `days` complete days up to yesterday, or from `since` to yesterday.
// Meta keeps at most 37 months.
export function pullRange(today: string, opts: { days?: number; since?: string | null }): { since: string; until: string } | null {
  const until = addDays(today, -1)
  let since: string
  if (opts.since) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.since)) return null
    since = opts.since
  } else {
    const days = Math.min(Math.max(Math.trunc(opts.days ?? 3), 1), 90)
    since = addDays(until, -(days - 1))
  }
  const earliest = addDays(today, -(37 * 30))
  if (since < earliest) since = earliest
  if (since > until) return null
  return { since, until }
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function todayInKL(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
}

// Insights for one ad account, per ad per day. The token is added by the caller (never kept in a URL we log).
export function insightsUrl(accountId: string, range: { since: string; until: string }, version = META_API_VERSION): string {
  const params = new URLSearchParams({
    level: 'ad',
    time_increment: '1',
    fields: 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,inline_link_clicks,actions,date_start',
    time_range: JSON.stringify(range),
    limit: '500',
  })
  return `${GRAPH}/${version}/${accountId}/insights?${params.toString()}`
}

export function accountUrl(accountId: string, version = META_API_VERSION): string {
  return `${GRAPH}/${version}/${accountId}?${new URLSearchParams({ fields: 'name,currency,timezone_name,account_status' })}`
}

export function adsUrl(accountId: string, version = META_API_VERSION): string {
  const params = new URLSearchParams({
    fields: 'id,name,effective_status,adset{id,name},campaign{id,name},creative{title,body,thumbnail_url}',
    limit: '200',
  })
  return `${GRAPH}/${version}/${accountId}/ads?${params.toString()}`
}

export function withToken(url: string, token: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`
}

// Never keep or show a URL or a token: Meta's error text and fetch errors can carry both.
export function cleanError(message: unknown, token?: string): string {
  let text = typeof message === 'string' ? message : message instanceof Error ? message.message : 'Meta did not answer.'
  if (token) text = text.split(token).join('[key]')
  text = text.replace(/https?:\/\/\S+/g, '[link]').replace(/access_token=[^&\s]+/gi, 'access_token=[key]')
  return text.slice(0, 300)
}

type MetaAction = { action_type?: string; value?: string | number }
export type InsightRow = {
  ad_id?: string
  ad_name?: string
  adset_id?: string
  adset_name?: string
  campaign_id?: string
  campaign_name?: string
  spend?: string | number
  impressions?: string | number
  clicks?: string | number
  inline_link_clicks?: string | number
  actions?: MetaAction[]
  date_start?: string
}

export type SpendRow = {
  ad_id: string
  day: string
  account_id: string
  ad_name: string | null
  adset_id: string | null
  adset_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  spend: number
  impressions: number
  clicks: number
  link_clicks: number
  conversations: number
  meta_leads: number
}

const n = (v: unknown) => {
  const x = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(x) ? x : 0
}
const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

export function actionValue(actions: MetaAction[] | undefined, types: string[]): number {
  return (actions ?? []).filter((a) => a.action_type && types.includes(a.action_type)).reduce((max, a) => Math.max(max, n(a.value)), 0)
}

// One day of one ad. Rows with nothing in them (no spend, no conversations, no leads) are dropped.
export function readInsight(row: InsightRow, accountId: string): SpendRow | null {
  if (!row.ad_id || !/^\d{1,30}$/.test(row.ad_id) || !row.date_start || !/^\d{4}-\d{2}-\d{2}$/.test(row.date_start)) return null
  const spend = Math.round(n(row.spend) * 100) / 100
  const conversations = actionValue(row.actions, [CONVERSATION_ACTION])
  const leads = actionValue(row.actions, LEAD_ACTIONS)
  if (spend === 0 && conversations === 0 && leads === 0 && n(row.impressions) === 0) return null
  return {
    ad_id: row.ad_id,
    day: row.date_start,
    account_id: accountId,
    ad_name: text(row.ad_name, 300),
    adset_id: text(row.adset_id, 40),
    adset_name: text(row.adset_name, 300),
    campaign_id: text(row.campaign_id, 40),
    campaign_name: text(row.campaign_name, 300),
    spend,
    impressions: Math.trunc(n(row.impressions)),
    clicks: Math.trunc(n(row.clicks)),
    link_clicks: Math.trunc(n(row.inline_link_clicks)),
    conversations: Math.trunc(conversations),
    meta_leads: Math.trunc(leads),
  }
}

export type AdRow = {
  ad_id: string
  account_id: string
  name: string | null
  status: string | null
  adset_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  title: string | null
  body: string | null
  thumbnail_url: string | null
}

type MetaAd = {
  id?: string
  name?: string
  effective_status?: string
  adset?: { id?: string; name?: string }
  campaign?: { id?: string; name?: string }
  creative?: { title?: string; body?: string; thumbnail_url?: string }
}

export function readAd(ad: MetaAd, accountId: string): AdRow | null {
  if (!ad.id || !/^\d{1,30}$/.test(ad.id)) return null
  const thumb = text(ad.creative?.thumbnail_url, 1000)
  return {
    ad_id: ad.id,
    account_id: accountId,
    name: text(ad.name, 300),
    status: text(ad.effective_status, 40),
    adset_name: text(ad.adset?.name, 300),
    campaign_id: text(ad.campaign?.id, 40),
    campaign_name: text(ad.campaign?.name, 300),
    title: text(ad.creative?.title, 300),
    body: text(ad.creative?.body, 1000),
    thumbnail_url: thumb && thumb.startsWith('https://') ? thumb : null,
  }
}

export type AccountInfo = { account_id: string; name: string | null; currency: string | null; timezone: string | null; status: number | null }

export function readAccount(raw: unknown, accountId: string): AccountInfo {
  const v = (raw ?? {}) as { name?: string; currency?: string; timezone_name?: string; account_status?: number }
  return {
    account_id: accountId,
    name: text(v.name, 200),
    currency: text(v.currency, 10),
    timezone: text(v.timezone_name, 60),
    status: typeof v.account_status === 'number' ? v.account_status : null,
  }
}

// A warning to show (not a stop): numbers are kept as Meta gives them, never converted.
export function accountWarning(a: AccountInfo): string | null {
  const notes: string[] = []
  if (a.currency && a.currency !== 'MYR') notes.push(`its money is ${a.currency}, not MYR (amounts are not converted)`)
  if (a.timezone && a.timezone !== 'Asia/Kuala_Lumpur') notes.push(`its days are ${a.timezone} time, not Malaysia's`)
  return notes.length ? `Ad account ${a.name ?? a.account_id}: ${notes.join('; ')}.` : null
}

type Page<T> = { data?: T[]; paging?: { next?: string }; error?: { message?: string } }

// Reads every page (Meta gives at most `limit` a page). `get` does the request; at most `maxPages` pages.
export async function readAllPages<T>(firstUrl: string, get: (url: string) => Promise<Page<T>>, maxPages = 60): Promise<T[]> {
  const rows: T[] = []
  let url: string | undefined = firstUrl
  for (let page = 0; url && page < maxPages; page++) {
    const json: Page<T> = await get(url)
    if (json.error) throw new Error(json.error.message ?? 'Meta refused the request.')
    rows.push(...(json.data ?? []))
    url = json.paging?.next
  }
  return rows
}
