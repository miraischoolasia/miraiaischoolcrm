import { supabase } from './supabase'
import type { Database } from '../types/database'

export type RewardPreset = {
  id: number
  label: string
  points: number
  emoji: string | null
  sortOrder: number
  isActive: boolean
}

export type RewardLevel = {
  id: number
  name: string
  minPoints: number
}

export type PointsKind = 'attendance' | 'award' | 'redeem' | 'adjust' | 'question' | 'checkin' | 'task' | 'practice'

export type PointsEntry = {
  id: number
  studentId: number
  points: number
  kind: PointsKind
  reason: string
  scheduleId: number | null
  lessonDate: string | null
  reversesId: number | null
  createdBy: number | null
  createdAt: string
}

type PresetRow = Database['public']['Tables']['reward_presets']['Row']
type LevelRow = Database['public']['Tables']['reward_levels']['Row']
type PointsRow = Database['public']['Tables']['student_points']['Row']

const POINTS_COLUMNS = 'id, student_id, points, kind, reason, schedule_id, lesson_date, reverses_id, created_by, created_at'

export function mapPresetRow(row: PresetRow): RewardPreset {
  return {
    id: row.id,
    label: row.label,
    points: row.points,
    emoji: row.emoji,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }
}

function mapLevelRow(row: LevelRow): RewardLevel {
  return { id: row.id, name: row.name, minPoints: row.min_points }
}

function mapPointsRow(row: Pick<PointsRow, 'id' | 'student_id' | 'points' | 'kind' | 'reason' | 'schedule_id' | 'lesson_date' | 'reverses_id' | 'created_by' | 'created_at'>): PointsEntry {
  return {
    id: row.id,
    studentId: row.student_id,
    points: row.points,
    kind: row.kind,
    reason: row.reason,
    scheduleId: row.schedule_id,
    lessonDate: row.lesson_date,
    reversesId: row.reverses_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

// ---------------------------------------------------------------------------
// Pure helpers

export function totalPoints(entries: Array<Pick<PointsEntry, 'points'>>) {
  return entries.reduce((sum, entry) => sum + entry.points, 0)
}

// The level a total reaches, the next one, and how far along to it (0-1).
export function levelFor(total: number, levels: RewardLevel[]) {
  const sorted = [...levels].sort((left, right) => left.minPoints - right.minPoints)
  let current: RewardLevel | null = null
  let next: RewardLevel | null = null
  for (const level of sorted) {
    if (total >= level.minPoints) {
      current = level
    } else {
      next = level
      break
    }
  }
  const from = current?.minPoints ?? 0
  const progress = next ? Math.max(0, Math.min(1, (total - from) / (next.minPoints - from))) : 1
  return { current, next, progress }
}

// Entries that are already undone, and the undo rows themselves.
export function undoneIds(entries: PointsEntry[]) {
  const ids = new Set<number>()
  for (const entry of entries) {
    if (entry.reversesId !== null) {
      ids.add(entry.reversesId)
      ids.add(entry.id)
    }
  }
  return ids
}

// Points each student got in one lesson (attendance and awards, after undos).
export function pointsByStudent(entries: PointsEntry[]) {
  const result = new Map<number, number>()
  for (const entry of entries) {
    result.set(entry.studentId, (result.get(entry.studentId) ?? 0) + entry.points)
  }
  return result
}

// ---------------------------------------------------------------------------
// Reads

export async function fetchRewardPresets(): Promise<RewardPreset[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('reward_presets').select('*').order('sort_order').order('id')
  if (error) throw error
  return data.map(mapPresetRow)
}

export async function fetchRewardLevels(): Promise<RewardLevel[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('reward_levels').select('*').order('min_points')
  if (error) throw error
  return data.map(mapLevelRow)
}

export async function fetchStudentPoints(studentId: number): Promise<PointsEntry[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('student_points')
    .select(POINTS_COLUMNS)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw error
  return data.map(mapPointsRow)
}

export async function fetchLessonPoints(scheduleId: number, lessonDate: string): Promise<PointsEntry[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('student_points')
    .select(POINTS_COLUMNS)
    .eq('schedule_id', scheduleId)
    .eq('lesson_date', lessonDate)
    .order('id')
  if (error) throw error
  return data.map(mapPointsRow)
}

// ---------------------------------------------------------------------------
// Changes; each resolves to an error message, or null when done.

function message(error: { message?: string } | null, fallback: string) {
  return error ? error.message || fallback : null
}

// New points in one lesson as they are given (the live class console cheers
// them). Staff read them through RLS like the rest of the ledger.
export function watchLessonPoints(scheduleId: number, lessonDate: string, onEntry: (entry: PointsEntry) => void) {
  if (!supabase) return () => {}
  const client = supabase
  const channel = client
    .channel(`lesson-points-${scheduleId}-${lessonDate}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'student_points', filter: `schedule_id=eq.${scheduleId}` }, (change) => {
      const row = change.new as Parameters<typeof mapPointsRow>[0]
      if (row && row.lesson_date === lessonDate) onEntry(mapPointsRow(row))
    })
    .subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}

export async function awardPoints(input: {
  studentIds: number[]
  points?: number | null
  reason?: string | null
  presetId?: number | null
  scheduleId?: number | null
  lessonDate?: string | null
}) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('award_points', {
    p_student_ids: input.studentIds,
    p_points: input.points ?? null,
    p_reason: input.reason ?? null,
    p_preset_id: input.presetId ?? null,
    p_schedule_id: input.scheduleId ?? null,
    p_lesson_date: input.lessonDate ?? null,
  })
  return message(error, 'Failed to give the points.')
}

export async function redeemPoints(studentId: number, points: number, reason: string) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('redeem_points', { p_student_id: studentId, p_points: points, p_reason: reason })
  return message(error, 'Failed to redeem the points.')
}

export async function undoPoints(entryId: number) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('undo_points', { p_points_id: entryId })
  return message(error, 'Failed to undo.')
}

export async function saveRewardPreset(
  preset: RewardPreset | null,
  changes: Partial<Pick<RewardPreset, 'label' | 'points' | 'emoji' | 'sortOrder' | 'isActive'>>,
) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('save_reward_preset', {
    p_id: preset?.id ?? null,
    p_label: changes.label ?? preset?.label ?? '',
    p_points: changes.points ?? null,
    p_emoji: changes.emoji === undefined ? null : (changes.emoji ?? ''),
    p_sort_order: changes.sortOrder ?? null,
    p_is_active: changes.isActive ?? null,
  })
  return message(error, 'Failed to save this reward.')
}

export async function setRewardLevels(levels: Array<Pick<RewardLevel, 'name' | 'minPoints'>>) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_reward_levels', {
    p_levels: levels.map((level) => ({ name: level.name, min_points: level.minPoints })),
  })
  return message(error, 'Failed to save the levels.')
}

export async function setAttendanceStatusPoints(key: string, points: number) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_attendance_status_points', { p_key: key, p_points: points })
  return message(error, 'Failed to save the points.')
}
