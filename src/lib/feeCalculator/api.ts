import { supabase } from '../supabase'
import { isMissingDatabaseThing } from '../studentExtras'
import type { Json } from '../../types/database'
import { DEFAULT_INVOICE_TEMPLATE, type CohortEntry, type CycleTier, type GlobalRates, type InvoiceTemplate, type SubjectKind, type SubjectOption } from './types'
import { buildCohortRates, type FeeLevel, type FeeRateRow, type FeeTrack } from './quote'
import { DEFAULT_GLOBAL_RATES, type FeeSubjectLevel } from './seed'

// Reading and saving the Fee Calculator's prices (20261030300000_fee_calculator.sql). Everything is read with the
// fee_calculator tick and saved through the database functions, which check the edit tick themselves.

export type FeeCohort = { id: number; name: string; sortOrder: number; isActive: boolean; materialsIncluded: boolean }
export type FeeSubject = {
  id: number
  level: FeeSubjectLevel
  code: string
  label: string
  kind: SubjectKind
  sortOrder: number
  isActive: boolean
  // Which of the school's subjects it is (to list its classes in a quotation); null before 20261031100000.
  subjectId: number | null
}
export type MembershipLevel = { name: string; isActive: boolean }

export type FeeCalculatorData = {
  cohorts: FeeCohort[]
  rates: FeeRateRow[]
  subjects: FeeSubject[]
  globalRates: GlobalRates
  invoiceTemplate: InvoiceTemplate
  // The school's membership levels (Student fields), to start a price group from.
  membershipLevels: MembershipLevel[]
}

// SEJ, BIP and BIK: the maths finds them by code, so their code and kind stay.
export const LOCKED_SUBJECT_CODES = ['SEJ', 'BIP', 'BIK']

export async function fetchFeeCalculatorEnabled(): Promise<boolean> {
  if (!supabase) return false
  try {
    const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'fee_calculator').maybeSingle()
    if (error || !data) return false
    return (data.value as { enabled?: unknown } | null)?.enabled === true
  } catch {
    return false
  }
}

// Null when saved, else the reason.
export async function setFeeCalculatorEnabled(enabled: boolean) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_fee_calculator_enabled', { p_enabled: enabled })
  return error ? reason(error, 'Could not switch the Fee Calculator.') : null
}

function reason(error: { code?: string; message?: string }, fallback: string) {
  return isMissingDatabaseThing(error)
    ? 'The Fee Calculator needs its database update first.'
    : error.message || fallback
}

function bySort<T extends { sortOrder: number; isActive: boolean }>(rows: T[]) {
  return [...rows].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder)
}

// Null when the tables are not there yet (before the migration) or cannot be read.
export async function fetchFeeCalculatorData(): Promise<FeeCalculatorData | null> {
  if (!supabase) return null
  const [cohorts, rates, subjects, settings, levels] = await Promise.all([
    supabase.from('fee_cohorts').select('id, membership_name, sort_order, is_active, materials_included_in_tuition'),
    supabase.from('fee_rates').select('cohort_id, level, track, subject_count, cycle_tier, amount'),
    supabase.from('fee_subjects').select('id, level, code, label, kind, sort_order, is_active'),
    supabase.from('fee_settings').select('key, value'),
    supabase.from('student_field_options').select('name, sort_order, is_active').eq('field', 'membership'),
  ])
  if (cohorts.error || rates.error || subjects.error || settings.error) return null
  // The class subject of each (20261031100000); left out when that update is not there yet.
  const links = await supabase.from('fee_subjects').select('id, subject_id')
  const subjectIdOf = new Map((links.error ? [] : (links.data ?? [])).map((row) => [row.id, row.subject_id]))
  const setting = (key: string) => settings.data?.find((row) => row.key === key)?.value ?? null
  return {
    cohorts: bySort(
      (cohorts.data ?? []).map((row) => ({
        id: row.id,
        name: row.membership_name,
        sortOrder: row.sort_order,
        isActive: row.is_active,
        materialsIncluded: row.materials_included_in_tuition,
      })),
    ),
    rates: (rates.data ?? []).map((row) => ({
      cohortId: row.cohort_id,
      level: row.level as FeeLevel,
      track: row.track as FeeTrack,
      subjectCount: row.subject_count,
      cycleTier: row.cycle_tier as CycleTier,
      amount: Number(row.amount),
    })),
    subjects: bySort(
      (subjects.data ?? []).map((row) => ({
        id: row.id,
        level: row.level as FeeSubjectLevel,
        code: row.code,
        label: row.label,
        kind: row.kind as SubjectKind,
        sortOrder: row.sort_order,
        isActive: row.is_active,
        subjectId: subjectIdOf.get(row.id) ?? null,
      })),
    ),
    globalRates: (setting('global_rates') as GlobalRates | null) ?? DEFAULT_GLOBAL_RATES,
    invoiceTemplate: { ...DEFAULT_INVOICE_TEMPLATE, ...((setting('invoice_template') as Partial<InvoiceTemplate> | null) ?? {}) },
    membershipLevels: [...(levels.data ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((row) => ({ name: row.name, isActive: row.is_active })),
  }
}

// The groups a consultant picks from (hidden ones left out), in the shape the maths reads.
export function cohortEntries(data: FeeCalculatorData): CohortEntry[] {
  return data.cohorts
    .filter((cohort) => cohort.isActive)
    .map((cohort) => ({
      key: String(cohort.id),
      label: cohort.name,
      primary: buildCohortRates(data.rates, cohort.id, 'primary'),
      secondary: buildCohortRates(data.rates, cohort.id, 'secondary'),
      materialsIncludedInTuition: cohort.materialsIncluded,
    }))
}

export function subjectOptions(data: FeeCalculatorData, level: FeeSubjectLevel): SubjectOption[] {
  return data.subjects
    .filter((subject) => subject.level === level && subject.isActive)
    .map((subject) => ({ id: subject.code, label: subject.label, kind: subject.kind }))
}

export async function saveFeeCohort(
  id: number | null,
  changes: { name?: string; sortOrder?: number; isActive?: boolean; materialsIncluded?: boolean },
) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('save_fee_cohort', {
    p_id: id,
    p_membership_name: changes.name ?? null,
    p_sort_order: changes.sortOrder ?? null,
    p_is_active: changes.isActive ?? null,
    p_materials_included: changes.materialsIncluded ?? null,
  })
  return error ? reason(error, 'Could not save the price group.') : null
}

export async function saveFeeCohortRates(cohortId: number, materialsIncluded: boolean, rates: Omit<FeeRateRow, 'cohortId'>[]) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('save_fee_cohort_rates', {
    p_cohort_id: cohortId,
    p_materials_included: materialsIncluded,
    p_rates: rates.map((rate) => ({
      level: rate.level,
      track: rate.track,
      subject_count: rate.subjectCount,
      cycle_tier: rate.cycleTier,
      amount: rate.amount,
    })) as Json,
  })
  return error ? reason(error, 'Could not save the prices.') : null
}

export async function saveFeeSubject(
  id: number | null,
  changes: { level?: FeeSubjectLevel; code?: string; label?: string; kind?: SubjectKind; sortOrder?: number; isActive?: boolean },
) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('save_fee_subject', {
    p_id: id,
    p_level: changes.level ?? null,
    p_code: changes.code ?? null,
    p_label: changes.label ?? null,
    p_kind: changes.kind ?? null,
    p_sort_order: changes.sortOrder ?? null,
    p_is_active: changes.isActive ?? null,
  })
  return error ? reason(error, 'Could not save the subject.') : null
}

export async function saveFeeSettings(key: 'global_rates', value: GlobalRates): Promise<string | null>
export async function saveFeeSettings(key: 'invoice_template', value: InvoiceTemplate): Promise<string | null>
export async function saveFeeSettings(key: 'global_rates' | 'invoice_template', value: GlobalRates | InvoiceTemplate) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('save_fee_settings', { p_key: key, p_value: value as unknown as Json })
  return error ? reason(error, 'Could not save.') : null
}

// A price group's name is its membership level's name: renaming renames the level for every student too
// (Student fields, admin only), and the group follows.
export async function renameMembershipLevel(name: string, newName: string) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('save_student_field_option', {
    p_field: 'membership',
    p_name: name,
    p_new_name: newName,
    p_sort_order: null,
    p_is_active: null,
  })
  return error ? reason(error, 'Could not rename the membership level.') : null
}

// A new membership level (admin only), for a price group that has none yet.
export async function addMembershipLevel(name: string) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('save_student_field_option', {
    p_field: 'membership',
    p_name: null,
    p_new_name: name,
    p_sort_order: null,
    p_is_active: null,
  })
  return error ? reason(error, 'Could not add the membership level.') : null
}

// Which of the school's subjects (Class Settings > Subjects) a Fee Calculator subject is. Null when saved.
export async function setFeeSubjectClassSubject(feeSubjectId: number, subjectId: number | null) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_fee_subject_class_subject', { p_fee_subject_id: feeSubjectId, p_subject_id: subjectId })
  return error ? reason(error, 'Could not save.') : null
}

export async function fetchClassSubjects(): Promise<{ id: number; name: string }[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('subjects').select('id, name').order('name')
  return error ? [] : (data ?? []).map((row) => ({ id: row.id, name: row.name }))
}
