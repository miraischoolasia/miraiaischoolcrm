import { supabase } from './supabase'
import { isMissingDatabaseThing } from './studentExtras'
import type { Json } from '../types/database'
import { fetchFollowUpCompletion, type FollowUpCompletionRow } from './followUpCompletion'

// The Data Center (20261101400000 + 20261101410000): whole-school overview and EC performance. The database adds
// everything up (no 1000-row cut-off); here are the shapes, the small sums the screen needs, and the calls.
// Money: real = paid quotations (in the month paid); estimated = a conversion without one, from the price tables.

export type Bucket = { key: string; label: string }
export type Weight = { fromMonths: number; toMonths: number | null; times: number }
export type DataCenterSettings = {
  buckets: Bucket[]
  defaultBucket: string
  weights: Weight[]
  targets: { people: number; subjects: number }
}

export const DEFAULT_DATA_CENTER_SETTINGS: DataCenterSettings = {
  buckets: [
    { key: 'walkin', label: 'Walk-in' },
    { key: 'mkt', label: 'MKT' },
    { key: 'rearm', label: 'Rearm' },
    { key: 'cold', label: 'Cold List' },
  ],
  defaultBucket: 'mkt',
  weights: [
    { fromMonths: 3, toMonths: 5, times: 1.1 },
    { fromMonths: 6, toMonths: 11, times: 1.2 },
    { fromMonths: 12, toMonths: null, times: 1.3 },
  ],
  targets: { people: 50, subjects: 100 },
}

const num = (value: unknown, fallback = 0) => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isFinite(n) ? n : fallback
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

export function readDataCenterSettings(raw: unknown): DataCenterSettings {
  const d = DEFAULT_DATA_CENTER_SETTINGS
  const v = record(raw)
  const buckets = Array.isArray(v.buckets)
    ? v.buckets
        .map((b) => record(b))
        .filter((b) => typeof b.key === 'string' && typeof b.label === 'string')
        .map((b) => ({ key: b.key as string, label: b.label as string }))
    : []
  const weights = Array.isArray(v.weights)
    ? v.weights.map((w) => record(w)).map((w) => ({
        fromMonths: num(w.fromMonths, 1),
        toMonths: w.toMonths === null || w.toMonths === undefined ? null : num(w.toMonths, 1),
        times: num(w.times, 1),
      }))
    : d.weights
  const targets = record(v.targets)
  const list = buckets.length > 0 ? buckets : d.buckets
  const defaultBucket =
    [v.defaultBucket, d.defaultBucket].find((k): k is string => typeof k === 'string' && list.some((b) => b.key === k)) ?? list[0].key
  return {
    buckets: list,
    defaultBucket,
    weights,
    targets: { people: num(targets.people, d.targets.people), subjects: num(targets.subjects, d.targets.subjects) },
  }
}

// A bucket key from its name: "Walk-in" -> "walk_in". Never empty, never a key already used.
export function bucketKeyFor(label: string, used: string[]): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'bucket'
  let key = base
  for (let i = 2; used.includes(key); i += 1) key = `${base}_${i}`
  return key
}

export type MonthFigures = {
  month: string
  leads: number
  trials: number
  conversions: number
  revenueActual: number
  revenueEstimated: number
  unknownAmounts: number
  students: number
}
export type BucketFigures = { bucket: string; label: string; leads: number; conversions: number }
// historicalConversions: old conversions whose day is not known (boss: shown apart, never in a month or the ranking).
export type Overview = { months: MonthFigures[]; buckets: BucketFigures[]; historicalConversions: number; adSpendConnected: boolean }

export function readOverview(raw: unknown): Overview {
  const v = record(raw)
  const months = (Array.isArray(v.months) ? v.months : []).map((m) => {
    const r = record(m)
    return {
      month: String(r.month ?? ''),
      leads: num(r.leads),
      trials: num(r.trials),
      conversions: num(r.conversions),
      revenueActual: num(r.revenueActual),
      revenueEstimated: num(r.revenueEstimated),
      unknownAmounts: num(r.unknownAmounts),
      students: num(r.students),
    }
  })
  const buckets = (Array.isArray(v.buckets) ? v.buckets : []).map((b) => {
    const r = record(b)
    return { bucket: String(r.bucket ?? ''), label: String(r.label ?? ''), leads: num(r.leads), conversions: num(r.conversions) }
  })
  return { months, buckets, historicalConversions: num(v.historicalConversions), adSpendConnected: v.adSpendConnected === true }
}

export type EcRow = {
  ecId: number | null
  ecName: string
  leads: number
  leadsByBucket: Record<string, number>
  conversions: number
  samePeriod: number
  crossPeriod: number
  subjects: number
  weightedSubjects: number
  revenueActual: number
  paidQuotations: number
  revenueEstimated: number
  unknownAmounts: number
  avgDays: number | null
  medianDays: number | null
  targetPeople: number
  targetSubjects: number
}

type EcRowRaw = {
  ec_id: number | null
  ec_name: string
  leads: number
  leads_by_bucket: Json
  conversions: number
  same_period: number
  cross_period: number
  subjects: number
  weighted_subjects: number | string
  revenue_actual: number | string
  paid_quotations: number
  revenue_estimated: number | string
  unknown_amounts: number
  avg_days: number | string | null
  median_days: number | string | null
  target_people: number
  target_subjects: number
}

export function readEcRow(r: EcRowRaw): EcRow {
  const buckets = record(r.leads_by_bucket)
  return {
    ecId: r.ec_id,
    ecName: r.ec_name,
    leads: num(r.leads),
    leadsByBucket: Object.fromEntries(Object.entries(buckets).map(([k, n]) => [k, num(n)])),
    conversions: num(r.conversions),
    samePeriod: num(r.same_period),
    crossPeriod: num(r.cross_period),
    subjects: num(r.subjects),
    weightedSubjects: num(r.weighted_subjects),
    revenueActual: num(r.revenue_actual),
    paidQuotations: num(r.paid_quotations),
    revenueEstimated: num(r.revenue_estimated),
    unknownAmounts: num(r.unknown_amounts),
    avgDays: r.avg_days === null ? null : num(r.avg_days),
    medianDays: r.median_days === null ? null : num(r.median_days),
    targetPeople: num(r.target_people),
    targetSubjects: num(r.target_subjects),
  }
}

// The whole team in one row. Days to convert: the conversion-weighted average of the ECs' averages; no median.
export function teamTotal(rows: EcRow[]): EcRow {
  const sum = (pick: (r: EcRow) => number) => rows.reduce((t, r) => t + pick(r), 0)
  const byBucket: Record<string, number> = {}
  for (const r of rows) for (const [k, n] of Object.entries(r.leadsByBucket)) byBucket[k] = (byBucket[k] ?? 0) + n
  const timed = rows.filter((r) => r.avgDays !== null && r.conversions > 0)
  const timedCount = timed.reduce((t, r) => t + r.conversions, 0)
  return {
    ecId: null,
    ecName: 'Whole team',
    leads: sum((r) => r.leads),
    leadsByBucket: byBucket,
    conversions: sum((r) => r.conversions),
    samePeriod: sum((r) => r.samePeriod),
    crossPeriod: sum((r) => r.crossPeriod),
    subjects: sum((r) => r.subjects),
    weightedSubjects: Math.round(sum((r) => r.weightedSubjects) * 10) / 10,
    revenueActual: sum((r) => r.revenueActual),
    paidQuotations: sum((r) => r.paidQuotations),
    revenueEstimated: sum((r) => r.revenueEstimated),
    unknownAmounts: sum((r) => r.unknownAmounts),
    avgDays: timedCount > 0 ? Math.round((timed.reduce((t, r) => t + (r.avgDays ?? 0) * r.conversions, 0) / timedCount) * 10) / 10 : null,
    medianDays: null,
    targetPeople: rows.filter((r) => r.ecId !== null).reduce((t, r) => t + r.targetPeople, 0),
    targetSubjects: rows.filter((r) => r.ecId !== null).reduce((t, r) => t + r.targetSubjects, 0),
  }
}

// Conversions out of leads, as a whole percent; null with no leads.
export function conversionRate(conversions: number, leads: number): number | null {
  return leads > 0 ? Math.round((conversions / leads) * 1000) / 10 : null
}

// This month against last: the change in percent, null when last month was 0.
export function changePercent(now: number, before: number): number | null {
  if (before === 0) return null
  return Math.round(((now - before) / before) * 1000) / 10
}

export function progressPercent(done: number, target: number): number | null {
  return target > 0 ? Math.min(999, Math.round((done / target) * 100)) : null
}

export const ringgit = (n: number) =>
  `RM${n.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

// Malaysia's today, as YYYY-MM-DD.
export function todayKL(now: Date = new Date()): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export type Conversion = {
  conversionId: number
  leadId: number
  leadName: string
  studentId: number
  studentName: string
  convertedOn: string
  salesPersonId: number | null
  subjects: number
  months: number
  amount: number | null
  amountKind: 'actual' | 'estimated' | 'unknown'
  estimateNote: string | null
}

export const ESTIMATE_NOTES: Record<string, string> = {
  no_classes: 'no regular class then',
  no_membership: 'no membership level',
  no_price_group: 'this membership level has no prices in the Fee Calculator',
  no_level: 'class level not set to primary / secondary',
  no_rate: 'no price for this in the fee table',
}

// ---- calls ----

const missing = (error: { message?: string; code?: string } | null) =>
  error && isMissingDatabaseThing(error) ? 'The Data Center needs its database update first.' : error?.message || 'Could not load.'

export async function fetchDataCenterSettings(): Promise<DataCenterSettings> {
  if (!supabase) return DEFAULT_DATA_CENTER_SETTINGS
  const { data, error } = await supabase.rpc('data_center_settings')
  return error ? DEFAULT_DATA_CENTER_SETTINGS : readDataCenterSettings(data)
}

export async function saveDataCenterSettings(value: Partial<DataCenterSettings>): Promise<string | null> {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_data_center', { p_value: value as Json })
  return error ? missing(error) : null
}

export async function fetchOverview(month: string): Promise<{ overview: Overview | null; error: string | null }> {
  if (!supabase) return { overview: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('data_center_overview', { p_month: `${month}-01` })
  return error ? { overview: null, error: missing(error) } : { overview: readOverview(data), error: null }
}

export async function fetchEcReport(from: string, to: string): Promise<{ rows: EcRow[]; error: string | null }> {
  if (!supabase) return { rows: [], error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('data_center_ec_report', { p_from: from, p_to: to })
  return error ? { rows: [], error: missing(error) } : { rows: ((data ?? []) as EcRowRaw[]).map(readEcRow), error: null }
}

export async function fetchConversions(from: string, to: string): Promise<{ rows: Conversion[]; error: string | null }> {
  if (!supabase) return { rows: [], error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('data_center_conversions', { p_from: from, p_to: to })
  if (error) return { rows: [], error: missing(error) }
  return {
    rows: (data ?? []).map((r) => ({
      conversionId: r.conversion_id,
      leadId: r.lead_id,
      leadName: r.lead_name,
      studentId: r.student_id,
      studentName: r.student_name,
      convertedOn: r.converted_on,
      salesPersonId: r.sales_person_id,
      subjects: num(r.subjects),
      months: num(r.months),
      amount: r.amount === null ? null : num(r.amount),
      amountKind: r.amount_kind,
      estimateNote: r.estimate_note,
    })),
    error: null,
  }
}

export type SourceOption = { id: number; label: string; bucket: string | null }
export type LevelOption = { name: string; feeLevel: 'primary' | 'secondary' | null }
export type TargetRow = { teacherId: number; people: number; subjects: number }

export async function fetchSourcesAndLevels(): Promise<{ sources: SourceOption[]; levels: LevelOption[] }> {
  if (!supabase) return { sources: [], levels: [] }
  const [sources, levels] = await Promise.all([
    supabase.from('lead_options').select('id, label, report_bucket, is_active').eq('kind', 'source').order('label'),
    supabase.from('program_levels').select('name, fee_level, is_active, sort_order').order('sort_order'),
  ])
  return {
    sources: (sources.data ?? []).map((s) => ({ id: s.id, label: s.label, bucket: s.report_bucket ?? null })),
    levels: (levels.data ?? []).map((l) => ({ name: l.name, feeLevel: l.fee_level ?? null })),
  }
}

export async function setSourceBucket(optionId: number, bucket: string | null): Promise<string | null> {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_source_bucket', { p_option_id: optionId, p_bucket: bucket })
  return error ? missing(error) : null
}

export async function setLevelFeeLevel(name: string, feeLevel: 'primary' | 'secondary' | null): Promise<string | null> {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_program_level_fee_level', { p_name: name, p_fee_level: feeLevel })
  return error ? missing(error) : null
}

export async function fetchTargets(month: string): Promise<TargetRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('data_center_targets').select('teacher_id, people, subjects').eq('month', `${month}-01`)
  if (error) return []
  return (data ?? []).map((t) => ({ teacherId: t.teacher_id, people: t.people, subjects: t.subjects }))
}

export async function setTarget(teacherId: number, month: string, people: number | null, subjects: number | null): Promise<string | null> {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_data_center_target', {
    p_teacher_id: teacherId,
    p_month: `${month}-01`,
    p_people: people,
    p_subjects: subjects,
  })
  return error ? missing(error) : null
}

// ---- Learning Consultants (part 2, 20261101420000) ----

export type LcRow = {
  lcId: number | null
  lcName: string
  students: number
  studentsAtStart: number
  studentsStillIn: number
  staysAtStart: number
  staysAdded: number
  staysStopped: number
  atRisk: number
  cardsDue: number
  cardsSent: number
}

export type RiskStudent = { studentId: number; name: string; code: string | null; stoppedAll: boolean; reasons: string[]; cardSent: boolean }

// Students still in class at the month's end out of those in class at its start, in percent.
export function stayRate(row: Pick<LcRow, 'studentsAtStart' | 'studentsStillIn'>): number | null {
  return row.studentsAtStart > 0 ? Math.round((row.studentsStillIn / row.studentsAtStart) * 100) : null
}

// Class stays stopped out of those at the start plus those added (Teacher quality's retention base), in percent.
export function stopRate(row: Pick<LcRow, 'staysAtStart' | 'staysAdded' | 'staysStopped'>): number | null {
  const base = row.staysAtStart + row.staysAdded
  return base > 0 ? Math.round((row.staysStopped / base) * 100) : null
}

export function lcTotal(rows: LcRow[]): LcRow {
  const sum = (pick: (r: LcRow) => number) => rows.reduce((t, r) => t + pick(r), 0)
  return {
    lcId: null,
    lcName: 'Whole school',
    students: sum((r) => r.students),
    studentsAtStart: sum((r) => r.studentsAtStart),
    studentsStillIn: sum((r) => r.studentsStillIn),
    staysAtStart: sum((r) => r.staysAtStart),
    staysAdded: sum((r) => r.staysAdded),
    staysStopped: sum((r) => r.staysStopped),
    atRisk: sum((r) => r.atRisk),
    cardsDue: sum((r) => r.cardsDue),
    cardsSent: sum((r) => r.cardsSent),
  }
}

export async function fetchLcReport(month: string): Promise<{ rows: LcRow[]; error: string | null }> {
  if (!supabase) return { rows: [], error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('data_center_lc_report', { p_month: `${month}-01` })
  if (error) return { rows: [], error: missing(error) }
  return {
    rows: (data ?? []).map((r) => ({
      lcId: r.lc_id,
      lcName: r.lc_name,
      students: num(r.students),
      studentsAtStart: num(r.students_at_start),
      studentsStillIn: num(r.students_still_in),
      staysAtStart: num(r.stays_at_start),
      staysAdded: num(r.stays_added),
      staysStopped: num(r.stays_stopped),
      atRisk: num(r.at_risk),
      cardsDue: num(r.cards_due),
      cardsSent: num(r.cards_sent),
    })),
    error: null,
  }
}

export async function fetchRiskStudents(month: string, lcId: number | null): Promise<{ rows: RiskStudent[]; error: string | null }> {
  if (!supabase) return { rows: [], error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('data_center_lc_students', { p_month: `${month}-01`, p_lc_id: lcId })
  if (error) return { rows: [], error: missing(error) }
  return {
    rows: (data ?? []).map((r) => ({
      studentId: r.student_id,
      name: r.student_name,
      code: r.student_code,
      stoppedAll: r.stopped_all,
      reasons: r.reasons ?? [],
      cardSent: r.card_sent,
    })),
    error: null,
  }
}

// Everyone's automatic follow-ups for the month (20261102700000; open ranking like the rest of EC performance).
// Before that update: department 1's own view, where a non-admin sees only their own row.
export async function fetchDataCenterFollowUps(month: string): Promise<FollowUpCompletionRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('data_center_followups', { p_month: month })
  if (error) return fetchFollowUpCompletion(month)
  return (data ?? []).map((r) => ({
    assigneeId: r.assignee_id,
    month,
    scheduled: num(r.scheduled),
    done: num(r.done),
    onTime: num(r.on_time),
    overdue: num(r.overdue),
  }))
}
