import { supabase } from './supabase'

// Everything the app reads comes through the portal_* database functions
// (supabase/migrations/20261021200000_student_portal.sql in the CRM): they
// check who is signed in and return only that child's own data.

export type Branding = { schoolName: string; accentColor: string }

export type Child = { studentId: number; name: string }

export type Sees = { schedule?: boolean; points?: boolean; scores?: boolean; package?: boolean; report?: boolean; recordings?: boolean }

export type UpcomingClass = {
  date: string
  start: string
  end: string
  title: string
  class: string | null
  teacher: string | null
  zoom_link: string | null
}

export type Lesson = {
  date: string
  title: string
  status: string
  attended: boolean
  scores: { criterion: string; score: number; max: number }[]
  // The lesson's Zoom recording, when the school shows recordings.
  recording?: { url: string; passcode: string | null } | null
}

export type Points = {
  total: number
  level: string | null
  next_level: { name: string; min_points: number } | null
  level_start: number
  recent: { reason: string; points: number; kind: string; date: string }[]
}

export type TeacherReport = {
  report: { summary?: string; strengths?: string[]; needs?: string[]; next_steps?: string[]; message?: string }
  shared_at: string
}

export type ConsentKind = 'ai_analysis' | 'class_recording'

export type Consent = {
  kind: ConsentKind
  title: string
  text: string
  required: boolean
  granted: boolean | null
  at: string | null
}

export type Home = {
  viewer: 'student' | 'parent'
  school_name: string
  accent_color: string
  sees: Sees
  student: { id: number; name: string; class: string | null }
  schedule?: UpcomingClass[]
  lessons: Lesson[]
  points?: Points
  package?: { name: string | null; lessons_left: number; expires: string | null }
  // The latest report a teacher shared (null: none yet; missing: not shown to this login).
  report?: TeacherReport | null
  // Only for a parent's login.
  consents?: Consent[]
}

// Login names become an internal email; the school never sees or sends mail.
// A login name such as the student code "S1234567" (any case), or the
// address used on the old recordings site ("s1234567@eduhero-lms.app"),
// whose part before the @ is the code.
export function loginEmail(username: string) {
  const name = username.trim().toLowerCase().split('@')[0]
  return `${name.replace(/[^a-z0-9._-]/g, '_')}@portal.internal`
}

export const defaultBranding: Branding = { schoolName: '', accentColor: '#fc0c97' }

export async function fetchBranding(): Promise<Branding> {
  const { data, error } = await supabase.rpc('portal_branding')
  if (error || !data) return defaultBranding
  const value = data as { school_name?: string; accent_color?: string }
  return {
    schoolName: value.school_name ?? '',
    accentColor: /^#[0-9a-fA-F]{6}$/.test(value.accent_color ?? '') ? (value.accent_color as string) : defaultBranding.accentColor,
  }
}

export async function fetchChildren(): Promise<Child[]> {
  const { data, error } = await supabase.rpc('portal_children')
  if (error) throw new Error(error.message)
  return ((data ?? []) as { student_id: number; full_name: string }[]).map((row) => ({
    studentId: row.student_id,
    name: row.full_name,
  }))
}

export async function fetchHome(studentId: number): Promise<Home> {
  const { data, error } = await supabase.rpc('portal_home', { p_student_id: studentId })
  if (error) throw new Error(error.message)
  return data as Home
}

export async function setConsent(studentId: number, kind: ConsentKind, granted: boolean) {
  const { error } = await supabase.rpc('portal_set_consent', { p_student_id: studentId, p_kind: kind, p_granted: granted })
  return error ? error.message : null
}

// Before the app opens: a parent who has not agreed to the school's current
// terms sees them, with the consent questions.
export type Onboarding =
  | { needs_terms: false }
  | {
      needs_terms: true
      terms: { title: string; text: string; version: number }
      consents: { kind: ConsentKind; title: string; text: string; required: boolean }[]
    }

export async function fetchOnboarding(): Promise<Onboarding> {
  const { data, error } = await supabase.rpc('portal_onboarding')
  if (error) throw new Error(error.message)
  return (data ?? { needs_terms: false }) as Onboarding
}

export async function acceptTerms(version: number, answers: Record<ConsentKind, boolean>) {
  const { error } = await supabase.rpc('portal_accept_terms', { p_version: version, p_consents: answers })
  return error ? error.message : null
}

// A summary of one lesson for the family (portal_lesson_summaries in the
// CRM's 20261024210000_student_live_feedback.sql): time in Zoom (null when
// the lesson had no meeting), questions answered and right (shown ones only),
// and the lesson's points (missing when the school does not show points).
export type LessonSummary = {
  session_id: number
  date: string
  start: string
  title: string
  lesson_minutes: number
  zoom_minutes: number | null
  questions: number
  answered: number
  right: number
  points: number | null
}

export async function fetchLessonSummaries(studentId: number): Promise<LessonSummary[]> {
  const { data, error } = await supabase.rpc('portal_lesson_summaries', { p_student_id: studentId })
  if (error) return []
  return (data ?? []) as LessonSummary[]
}

// The family's Zoom check before class (student_zoom_checks): did Zoom's test
// meeting work on this device? The teacher sees the answer on the console.
export type ZoomCheck = { ok: boolean; checkedAt: string; platform: string | null }

export async function fetchLastZoomCheck(studentId: number): Promise<ZoomCheck | null> {
  const { data, error } = await supabase
    .from('student_zoom_checks')
    .select('ok, checked_at, platform')
    .eq('student_id', studentId)
    .order('checked_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return { ok: data.ok, checkedAt: data.checked_at, platform: data.platform }
}

export async function recordZoomCheck(studentId: number, ok: boolean, platform: 'web' | 'ios' | 'android') {
  const { error } = await supabase.rpc('portal_record_zoom_check', { p_student_id: studentId, p_ok: ok, p_platform: platform })
  return error ? error.message : null
}

// Ask for a check when a class is coming within `days` and there is no good
// check from the last two weeks.
export function needsZoomCheck(check: ZoomCheck | null, nextClassDate: string | null, today: string, days = 3) {
  if (!nextClassDate) return false
  const soon = new Date(`${today}T00:00:00Z`)
  soon.setUTCDate(soon.getUTCDate() + days)
  if (nextClassDate > soon.toISOString().slice(0, 10)) return false
  if (!check || !check.ok) return true
  const fresh = new Date(`${today}T00:00:00Z`)
  fresh.setUTCDate(fresh.getUTCDate() - 14)
  return check.checkedAt.slice(0, 10) < fresh.toISOString().slice(0, 10)
}

// Notes the teacher published for a lesson (portal_lesson_notes in the CRM's
// 20261024610000_lesson_notes.sql), newest lesson first.
export type LessonNote = { id: number; session_id: number; date: string; class: string; title: string; body: string; published_at: string }

export async function fetchLessonNotes(studentId: number): Promise<LessonNote[]> {
  const { data, error } = await supabase.rpc('portal_lesson_notes', { p_student_id: studentId })
  if (error) return []
  return (data ?? []) as LessonNote[]
}
