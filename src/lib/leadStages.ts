import { supabase } from './supabase'

// The stages a lead goes through, set up by the school itself (the Leads page: Manage stages). The six the
// CRM was made with stay, and the school can rename, recolour and reorder them, turn off the optional ones, and
// add stages of its own. A lead holds the key of its stage.

export type StageColor = 'slate' | 'sky' | 'amber' | 'violet' | 'emerald' | 'red' | 'pink' | 'orange' | 'teal' | 'indigo'

export type LeadStage = {
  key: string
  label: string
  color: StageColor
  sortOrder: number
  isActive: boolean
  // One of the six the CRM was made with: it cannot be deleted, and the automatic moves use it.
  isSystem: boolean
}

export const MAX_STAGE_LABEL = 40
export const MAX_STAGES = 40
// The stages that are always on (the CRM moves leads into them by itself); the others can be turned off.
export const REQUIRED_STAGE_KEYS = ['new', 'converted', 'lost']

// The classes of each colour are written out whole, so Tailwind finds them.
export const STAGE_COLORS: Record<StageColor, { name: string; badge: string; accent: string; chart: string; dot: string }> = {
  slate: { name: 'Grey', badge: 'bg-slate-100 text-slate-700', accent: 'border-t-slate-400', chart: '#94a3b8', dot: 'bg-slate-400' },
  sky: { name: 'Blue', badge: 'bg-sky-50 text-sky-700', accent: 'border-t-sky-400', chart: '#0ea5e9', dot: 'bg-sky-500' },
  amber: { name: 'Yellow', badge: 'bg-amber-50 text-amber-700', accent: 'border-t-amber-400', chart: '#f59e0b', dot: 'bg-amber-500' },
  violet: { name: 'Purple', badge: 'bg-violet-50 text-violet-700', accent: 'border-t-violet-400', chart: '#8b5cf6', dot: 'bg-violet-500' },
  emerald: { name: 'Green', badge: 'bg-emerald-50 text-emerald-700', accent: 'border-t-emerald-400', chart: '#10b981', dot: 'bg-emerald-500' },
  red: { name: 'Red', badge: 'bg-red-50 text-red-700', accent: 'border-t-red-400', chart: '#ef4444', dot: 'bg-red-500' },
  pink: { name: 'Pink', badge: 'bg-pink-50 text-pink-700', accent: 'border-t-pink-400', chart: '#ec4899', dot: 'bg-pink-500' },
  orange: { name: 'Orange', badge: 'bg-orange-50 text-orange-700', accent: 'border-t-orange-400', chart: '#f97316', dot: 'bg-orange-500' },
  teal: { name: 'Teal', badge: 'bg-teal-50 text-teal-700', accent: 'border-t-teal-400', chart: '#14b8a6', dot: 'bg-teal-500' },
  indigo: { name: 'Indigo', badge: 'bg-indigo-50 text-indigo-700', accent: 'border-t-indigo-400', chart: '#6366f1', dot: 'bg-indigo-500' },
}

export const STAGE_COLOR_KEYS = Object.keys(STAGE_COLORS) as StageColor[]

export function isStageColor(value: unknown): value is StageColor {
  return typeof value === 'string' && value in STAGE_COLORS
}

// What a database without the stages table (or before it is read) has: the six the CRM was made with.
export const DEFAULT_STAGES: LeadStage[] = [
  { key: 'new', label: 'New', color: 'slate', sortOrder: 10, isActive: true, isSystem: true },
  { key: 'contacted', label: 'Contacted', color: 'sky', sortOrder: 20, isActive: true, isSystem: true },
  { key: 'trial_scheduled', label: 'Trial Scheduled', color: 'amber', sortOrder: 30, isActive: true, isSystem: true },
  { key: 'trial_completed', label: 'Trial Completed', color: 'violet', sortOrder: 40, isActive: true, isSystem: true },
  { key: 'converted', label: 'Converted', color: 'emerald', sortOrder: 50, isActive: true, isSystem: true },
  { key: 'lost', label: 'Lost', color: 'red', sortOrder: 60, isActive: true, isSystem: true },
]

// The stages that can be picked, in order. The array is the same one for the whole app: loading the school's
// stages replaces what is in it, so everything that lists stages shows the school's own.
export const leadStatusOptions: Array<{ key: string; label: string }> = []

let allStages: LeadStage[] = []

function ordered(stages: LeadStage[]) {
  return [...stages].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
}

export function setLeadStages(stages: LeadStage[]) {
  allStages = ordered(stages)
  leadStatusOptions.splice(0, leadStatusOptions.length, ...allStages.filter((stage) => stage.isActive).map((stage) => ({ key: stage.key, label: stage.label })))
}

setLeadStages(DEFAULT_STAGES)

// Every stage, on or off, in order.
export function getLeadStages() {
  return allStages
}

export function stageStyle(key: string) {
  const stage = allStages.find((entry) => entry.key === key)
  return STAGE_COLORS[stage?.color ?? 'slate']
}

function words(value: string) {
  return value.replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase())
}

export function stageLabel(key: string) {
  return allStages.find((entry) => entry.key === key)?.label ?? words(key)
}

// A flow may move a lead to any stage that is on, except Converted (a lead becomes that by becoming a student).
export function isSettableStage(key: string) {
  return key !== 'converted' && allStages.some((entry) => entry.key === key && entry.isActive)
}

// Why a stage name cannot be saved yet, or null when it can.
export function validateStageLabel(label: string, others: LeadStage[]): string | null {
  const text = label.trim()
  if (text === '') {
    return 'Give the stage a name.'
  }
  if (text.length > MAX_STAGE_LABEL) {
    return `The name can be up to ${MAX_STAGE_LABEL} characters.`
  }
  if (others.some((entry) => entry.label.trim().toLowerCase() === text.toLowerCase())) {
    return 'Another stage has this name.'
  }
  return null
}

type Row = { key: string; label: string; color: string; sort_order: number; is_active: boolean; is_system: boolean }

const COLUMNS = 'key, label, color, sort_order, is_active, is_system'

export function stageOf(row: Row): LeadStage {
  return {
    key: row.key,
    label: row.label,
    color: isStageColor(row.color) ? row.color : 'slate',
    sortOrder: row.sort_order,
    isActive: row.is_active,
    isSystem: row.is_system,
  }
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  return supabase
}

// Sentence for a person when the database says no (or has no such table yet).
export function stageErrorMessage(problem: unknown, fallback: string) {
  const text =
    problem instanceof Error
      ? problem.message
      : typeof problem === 'object' && problem && 'message' in problem
        ? String((problem as { message: unknown }).message)
        : ''
  if (/lead_stages/.test(text) && /(does not exist|schema cache|Could not find)/.test(text)) {
    return 'Stages are not set up in the database yet.'
  }
  if (/row-level security|permission denied|Only an admin/i.test(text)) {
    return 'Only an admin can change the stages.'
  }
  // The database's own sentence for a rule it keeps ("3 lead(s) are in ... Move them first.").
  const code = typeof problem === 'object' && problem && 'code' in problem ? String((problem as { code: unknown }).code) : ''
  if (code === 'P0001' && text) {
    return text
  }
  return fallback
}

export async function fetchLeadStages(): Promise<LeadStage[]> {
  const { data, error } = await requireSupabase().from('lead_stages').select(COLUMNS).order('sort_order', { ascending: true })
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => stageOf(row as Row))
}

export async function addLeadStage(label: string, color: StageColor, sortOrder: number): Promise<LeadStage> {
  const { data, error } = await requireSupabase()
    .from('lead_stages')
    .insert({ label: label.trim(), color, sort_order: sortOrder })
    .select(COLUMNS)
    .single()
  if (error) {
    throw error
  }
  return stageOf(data as Row)
}

export async function changeLeadStage(key: string, change: { label?: string; color?: StageColor; isActive?: boolean }): Promise<void> {
  const update: { label?: string; color?: StageColor; is_active?: boolean } = {}
  if (change.label !== undefined) {
    update.label = change.label.trim()
  }
  if (change.color !== undefined) {
    update.color = change.color
  }
  if (change.isActive !== undefined) {
    update.is_active = change.isActive
  }
  const { data, error } = await requireSupabase().from('lead_stages').update(update).eq('key', key).select('key')
  if (error) {
    throw error
  }
  if ((data ?? []).length === 0) {
    // The database hides a row you may not change instead of failing.
    throw new Error('Only an admin can change the stages.')
  }
}

export async function deleteLeadStage(key: string): Promise<void> {
  const { data, error } = await requireSupabase().from('lead_stages').delete().eq('key', key).select('key')
  if (error) {
    throw error
  }
  if ((data ?? []).length === 0) {
    throw new Error('Only an admin can change the stages.')
  }
}

export async function reorderLeadStages(keys: string[]): Promise<void> {
  const { error } = await requireSupabase().rpc('reorder_lead_stages', { p_keys: keys })
  if (error) {
    throw error
  }
}
