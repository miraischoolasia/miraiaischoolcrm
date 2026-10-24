// Data Center part 3: pulls the school's Facebook ad numbers from Meta's Marketing API (20261102400000_meta_ads.sql).
//
//   POST /functions/v1/meta-ads-sync   { "days": 3 } | { "since": "YYYY-MM-DD" }, optional "dry": true
//
// Who may call it:
//   - the WhatsApp server's daily job (04:00 Malaysia time): header x-sync-key = the secret META_ADS_SYNC_KEY
//   - an admin in the CRM ("Pull now" / "Pull from a day"): signed in, and an admin
// Secrets (Supabase, each school its own): META_ADS_ACCESS_TOKEN (a System User token: ads_read + read_insights),
// META_AD_ACCOUNT_IDS ("123,act_456"), META_ADS_SYNC_KEY. Optional META_API_VERSION.
// The token is only ever used here: never written to the database, never sent back, never in an error (cleaned).
// Each run re-reads the days asked (Meta revises recent days) and replaces them, account by account; dry only counts.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import {
  accountUrl,
  accountWarning,
  adsUrl,
  cleanError,
  insightsUrl,
  META_API_VERSION,
  pullRange,
  readAccount,
  readAccountIds,
  readAd,
  readAllPages,
  readInsight,
  todayInKL,
  withToken,
  type InsightRow,
} from '../_shared/metaAds/logic.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } })

function sameText(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !serviceKey) return json({ ok: false, error: 'The function is not set up.' }, 500)

  // Who is calling.
  let trigger: 'schedule' | 'admin'
  const syncKey = Deno.env.get('META_ADS_SYNC_KEY') ?? ''
  const given = req.headers.get('x-sync-key') ?? ''
  if (given) {
    if (!sameText(given, syncKey)) return json({ ok: false, error: 'Not allowed.' }, 401)
    trigger = 'schedule'
  } else {
    const auth = req.headers.get('authorization') ?? ''
    if (!auth.startsWith('Bearer ') || !anonKey) return json({ ok: false, error: 'Sign in first.' }, 401)
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
    const { data: admin, error } = await asUser.rpc('is_admin')
    if (error || admin !== true) return json({ ok: false, error: 'Only an admin can pull the ad numbers.' }, 403)
    trigger = 'admin'
  }

  let body: { days?: number; since?: string; dry?: boolean } = {}
  try {
    body = (await req.json()) ?? {}
  } catch {
    body = {}
  }

  const token = Deno.env.get('META_ADS_ACCESS_TOKEN') ?? ''
  const accounts = readAccountIds(Deno.env.get('META_AD_ACCOUNT_IDS'))
  if (!token || accounts.length === 0) {
    return json({ ok: false, configured: false, error: 'The Meta key or ad account ids are not set yet (Supabase secrets META_ADS_ACCESS_TOKEN, META_AD_ACCOUNT_IDS).' })
  }

  const range = pullRange(todayInKL(), { days: body.days, since: body.since ?? null })
  if (!range) return json({ ok: false, error: 'Pick a start day before today.' }, 400)
  const dry = body.dry === true
  const version = Deno.env.get('META_API_VERSION') || META_API_VERSION
  const db = createClient(url, serviceKey, { auth: { persistSession: false } })

  const { data: run } = await db
    .from('meta_sync_runs')
    .insert({ trigger, dry_run: dry, since: range.since, until: range.until })
    .select('id')
    .single()

  // Every request: the token added here only; a page Meta links to already carries it.
  const get = async (target: string) => {
    const res = await fetch(target.includes('access_token=') ? target : withToken(target, token), { signal: AbortSignal.timeout(30_000) })
    const body = await res.json().catch(() => ({}))
    if (!res.ok && !body?.error) return { error: { message: `Meta answered ${res.status}.` } }
    return body
  }

  const results: { account: string; rows: number; spend: number; warning: string | null; error?: string }[] = []
  const warnings: string[] = []
  let read = 0
  let written = 0

  for (const account of accounts) {
    try {
      const info = readAccount(await get(withToken(accountUrl(account, version), token)).then((r) => {
        if (r?.error) throw new Error(r.error.message ?? 'Meta refused the account.')
        return r
      }), account)
      const warning = accountWarning(info)
      if (warning) warnings.push(warning)

      const insights = await readAllPages<InsightRow>(insightsUrl(account, range, version), get)
      const rows = insights.map((row) => readInsight(row, account)).filter((row): row is NonNullable<typeof row> => row !== null)
      read += insights.length
      const spend = Math.round(rows.reduce((t, r) => t + r.spend, 0) * 100) / 100

      if (!dry) {
        await db.from('meta_ad_accounts').upsert({ ...info, updated_at: new Date().toISOString() })
        const del = await db.from('ad_spend_daily').delete().eq('account_id', account).gte('day', range.since).lte('day', range.until)
        if (del.error) throw new Error(del.error.message)
        for (let i = 0; i < rows.length; i += 500) {
          const ins = await db.from('ad_spend_daily').upsert(rows.slice(i, i + 500))
          if (ins.error) throw new Error(ins.error.message)
        }
        written += rows.length

        const ads = (await readAllPages(adsUrl(account, version), get)).map((ad) => readAd(ad, account)).filter((ad): ad is NonNullable<typeof ad> => ad !== null)
        for (let i = 0; i < ads.length; i += 500) {
          const up = await db.from('meta_ads').upsert(ads.slice(i, i + 500).map((ad) => ({ ...ad, updated_at: new Date().toISOString() })))
          if (up.error) throw new Error(up.error.message)
        }
        await db.from('meta_ad_accounts').update({ last_pulled_at: new Date().toISOString() }).eq('account_id', account)
      }
      results.push({ account, rows: rows.length, spend, warning })
    } catch (error) {
      results.push({ account, rows: 0, spend: 0, warning: null, error: cleanError(error, token) })
    }
  }

  const failed = results.filter((r) => r.error)
  const errorText = failed.length ? failed.map((r) => `${r.account}: ${r.error}`).join(' | ').slice(0, 1000) : null
  if (run?.id) {
    await db
      .from('meta_sync_runs')
      .update({ finished_at: new Date().toISOString(), rows_read: read, rows_written: written, ok: failed.length === 0, error: errorText, warnings })
      .eq('id', run.id)
  }

  return json({ ok: failed.length === 0, configured: true, dry, since: range.since, until: range.until, results, warnings })
})
