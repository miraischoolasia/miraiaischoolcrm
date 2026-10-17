import { supabase } from './supabase'
import {
  defaultReportSettings,
  readSettings,
  type Audience,
  type ReportSettings,
  type StudentReport,
} from '../../supabase/functions/student-report/logic'

export type { Audience, ReportSettings, StudentReport }
export { defaultReportSettings }

export type SavedReport = {
  id: number | null
  audience: Audience
  report: StudentReport
  lessonCount: number
  createdAt: string
  // When a teacher shared it in the student app (reports for parents only).
  sharedAt: string | null
}

// The newest analysis for the teacher and for the parent.
export async function fetchLatestReports(studentId: number): Promise<Partial<Record<Audience, SavedReport>>> {
  if (!supabase) return {}
  const { data, error } = await supabase
    .from('student_ai_reports')
    .select('id, audience, report, lesson_count, created_at, shared_at')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  const result: Partial<Record<Audience, SavedReport>> = {}
  for (const row of data) {
    if (!result[row.audience]) {
      result[row.audience] = {
        id: row.id,
        audience: row.audience,
        report: row.report as StudentReport,
        lessonCount: row.lesson_count,
        createdAt: row.created_at,
        sharedAt: row.shared_at,
      }
    }
  }
  return result
}

// Asks the student-report function for a fresh analysis.
export async function requestReport(
  studentId: number,
  audience: Audience,
): Promise<{ ok: true; saved: SavedReport } | { ok: false; error: string }> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.functions.invoke('student-report', { body: { studentId, audience } })
  if (error) {
    // The function's own reason is in the response body.
    let reason = error.message
    try {
      const context = (error as { context?: Response }).context
      const body = context ? await context.json() : null
      if (body?.error) reason = body.error
    } catch {
      // keep the general message
    }
    return { ok: false, error: reason || 'The analysis failed.' }
  }
  if (!data?.ok) return { ok: false, error: data?.error ?? 'The analysis failed.' }
  return {
    ok: true,
    saved: { id: data.id, audience, report: data.report, lessonCount: data.lessonCount, createdAt: data.createdAt, sharedAt: null },
  }
}

// Shows (or stops showing) a parent report in the student app. The database
// stamps the time and who shared it. Resolves to the new time, or an error.
export async function setReportShared(reportId: number, shared: boolean): Promise<{ sharedAt: string | null; error: string | null }> {
  if (!supabase) return { sharedAt: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase
    .from('student_ai_reports')
    .update({ shared_at: shared ? new Date().toISOString() : null })
    .eq('id', reportId)
    .select('shared_at')
    .maybeSingle()
  if (error) return { sharedAt: null, error: error.message || 'Failed to share.' }
  if (!data) return { sharedAt: null, error: 'Only reports for parents, of students you teach, can be shared.' }
  return { sharedAt: data.shared_at, error: null }
}

export async function fetchReportSettings(): Promise<ReportSettings> {
  if (!supabase) return defaultReportSettings
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'ai_student_report').maybeSingle()
  if (error) throw error
  return readSettings(data?.value)
}

export async function saveReportSettings(settings: ReportSettings) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_ai_report_settings', { p_settings: settings })
  return error ? error.message || 'Failed to save.' : null
}

// The report as plain text, to paste into WhatsApp or a document.
export function reportAsText(report: StudentReport, audience: Audience) {
  if (audience === 'parent' && report.message) return report.message
  const list = (title: string, items: string[]) => (items.length ? `${title}\n${items.map((item) => `• ${item}`).join('\n')}` : '')
  return [report.summary, list('Strengths', report.strengths), list('To work on', report.needs), list('Next steps', report.next_steps)]
    .filter(Boolean)
    .join('\n\n')
}
