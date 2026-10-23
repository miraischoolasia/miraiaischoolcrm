import { supabase } from './supabase'
import type { LessonReport } from './lessonReportRules'

export * from './lessonReportRules'

// The lesson report after class (20261030600000_class_end_report.sql): only
// once the teacher has ended the lesson. The app opens a report by itself once
// (again when the teacher later sends the attendance and remarks).

export async function fetchLessonReport(studentId: number, sessionId: number): Promise<LessonReport | null> {
  const { data, error } = await supabase.rpc('portal_lesson_report', { p_student_id: studentId, p_session_id: sessionId })
  if (error) throw new Error(error.message)
  return (data ?? null) as LessonReport | null
}

export async function fetchUnseenReports(studentId: number): Promise<{ session_id: number; date: string; updated: boolean }[]> {
  const { data, error } = await supabase.rpc('portal_unseen_lesson_reports', { p_student_id: studentId })
  if (error) return []
  return (data ?? []) as { session_id: number; date: string; updated: boolean }[]
}

export async function markReportSeen(studentId: number, sessionId: number) {
  await supabase.rpc('portal_mark_report_seen', { p_student_id: studentId, p_session_id: sessionId })
}

export type HistoryQuestion = {
  number: number
  kind: string
  prompt: string
  options: { text: string }[] | string[]
  points: number
  result: 'correct' | 'wrong' | 'pending' | 'unanswered'
  my_choices: number[] | null
  my_text: string | null
  my_points: number
  correct_options: number[] | null
  accepted_answers: string[] | null
  explanation: string | null
  feedback: string | null
}

export type HistoryLesson = { session_id: number; date: string; start: string; questions: HistoryQuestion[] }

// A class's questions lesson by lesson, with the child's own answers (only questions the teacher has shown).
export async function fetchClassQuestionHistory(studentId: number, classroomId: number): Promise<HistoryLesson[]> {
  const { data, error } = await supabase.rpc('portal_class_question_history', { p_student_id: studentId, p_classroom_id: classroomId })
  if (error) throw new Error(error.message)
  return (data ?? []) as HistoryLesson[]
}

export function optionText(option: { text: string } | string | undefined) {
  if (option === undefined) return ''
  return typeof option === 'string' ? option : option.text
}
