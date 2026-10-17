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
export function loginEmail(username: string) {
  return `${username.trim().toLowerCase()}@portal.internal`
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
