import { supabase } from './supabase'

// The families' Zoom checks before class (20261024210000_student_live_feedback.sql):
// the latest answer of each child, for the live class console.

export type ZoomCheck = { ok: boolean; checkedAt: string; platform: string | null }

export async function fetchZoomChecks(studentIds: number[]): Promise<Map<number, ZoomCheck>> {
  if (!supabase || studentIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('student_zoom_checks')
    .select('student_id, ok, checked_at, platform')
    .in('student_id', studentIds.slice(0, 500))
    .order('checked_at', { ascending: false })
    .limit(2000)
  if (error) return new Map()
  const latest = new Map<number, ZoomCheck>()
  for (const row of data ?? []) {
    if (!latest.has(row.student_id)) latest.set(row.student_id, { ok: row.ok, checkedAt: row.checked_at, platform: row.platform })
  }
  return latest
}
