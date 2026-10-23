import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { LiveAnswer, LiveQuestion } from './liveQuestions'

// The lesson report at the end of a class (teacher version A): each child's
// record of the lesson (20261030600000_class_end_report.sql), and the sums the
// report shows. Everything below the fetchers is plain arithmetic, tested in
// classEndReport.test.ts. The functions are not in types/database.ts yet (a
// shared file, filled in when the migration is pushed), so they are called untyped.

export type LeftPeriod = { kind: 'late' | 'away' | 'early'; from: string; to: string }

export type LessonRecord = {
  sessionId: number
  status: 'scheduled' | 'live' | 'ended'
  lessonFrom: string
  lessonTo: string
  studentId: number
  studentName: string
  studentCode: string | null
  attendanceStatus: 'present' | 'absent' | 'leave' | null
  hasZoom: boolean
  zoomMinutes: number | null
  lessonMinutes: number
  participationPercent: number | null
  onlineSpans: { from: string; to: string }[]
  leftPeriods: LeftPeriod[]
  lateMinutes: number | null
  leftEarlyMinutes: number | null
  questionsTotal: number
  answered: number
  correct: number
  wrong: number
  pending: number
  points: number
  pickedCount: number
  isSilent: boolean
}

type RecordRow = {
  session_id: number
  session_status: LessonRecord['status']
  lesson_from: string
  lesson_to: string
  student_id: number
  student_name: string
  student_code: string | null
  attendance_status: LessonRecord['attendanceStatus']
  has_zoom: boolean
  zoom_minutes: number | null
  lesson_minutes: number
  participation_percent: number | null
  online_spans: { from: string; to: string }[] | null
  left_periods: LeftPeriod[] | null
  late_minutes: number | null
  left_early_minutes: number | null
  questions_total: number
  answered: number
  correct: number
  wrong: number
  pending: number
  points: number
  picked_count: number
  is_silent: boolean
}

function client(): SupabaseClient {
  if (!supabase) throw new Error('Not connected to the database.')
  return supabase as unknown as SupabaseClient
}

export function recordFromRow(row: RecordRow): LessonRecord {
  return {
    sessionId: row.session_id,
    status: row.session_status,
    lessonFrom: row.lesson_from,
    lessonTo: row.lesson_to,
    studentId: row.student_id,
    studentName: row.student_name,
    studentCode: row.student_code,
    attendanceStatus: row.attendance_status,
    hasZoom: row.has_zoom,
    zoomMinutes: row.zoom_minutes,
    lessonMinutes: row.lesson_minutes,
    participationPercent: row.participation_percent,
    onlineSpans: row.online_spans ?? [],
    leftPeriods: row.left_periods ?? [],
    lateMinutes: row.late_minutes,
    leftEarlyMinutes: row.left_early_minutes,
    questionsTotal: row.questions_total,
    answered: row.answered,
    correct: row.correct,
    wrong: row.wrong,
    pending: row.pending,
    points: row.points,
    pickedCount: row.picked_count,
    isSilent: row.is_silent,
  }
}

export async function fetchLessonRecords(sessionId: number): Promise<LessonRecord[]> {
  const { data, error } = await client().rpc('lesson_student_records', { p_session_id: sessionId })
  if (error) throw new Error(error.message)
  return ((data ?? []) as RecordRow[]).map(recordFromRow)
}

export async function fetchStudentLessonHistory(studentId: number): Promise<LessonRecord[]> {
  const { data, error } = await client().rpc('student_lesson_history', { p_student_id: studentId })
  if (error) throw new Error(error.message)
  return ((data ?? []) as RecordRow[]).map(recordFromRow)
}

export type CareNote = { studentId: number; note: string }

// Sends each note to the child's Handled by (their Learning Consultant, else
// the PIC of their lead). Returns how many went and who has nobody to send to.
export async function sendCareNotes(sessionId: number, notes: CareNote[]): Promise<{ sent: number; noHandler: number[] }> {
  const { data, error } = await client().rpc('send_lesson_care_notes', {
    p_session_id: sessionId,
    p_items: notes.map((item) => ({ student_id: item.studentId, note: item.note })),
  })
  if (error) throw new Error(error.message)
  const result = (data ?? {}) as { sent?: number; no_handler?: number[] }
  return { sent: result.sent ?? 0, noHandler: result.no_handler ?? [] }
}

// The teacher picked a child in class (for "silent" children in the report).
export async function recordClassPick(sessionId: number, studentId: number | null) {
  if (studentId === null || !supabase) return
  await client().rpc('record_class_pick', { p_session_id: sessionId, p_student_id: studentId })
}

// ---------------------------------------------------------------------------
// The sums

// Time in the lesson as a ring: under 40% red, 40-80% amber, 80-100% teal.
export type ParticipationTone = 'red' | 'amber' | 'teal' | 'none'

export function participationTone(percent: number | null): ParticipationTone {
  if (percent === null) return 'none'
  if (percent < 40) return 'red'
  if (percent < 80) return 'amber'
  return 'teal'
}

export function minutesBetween(from: string, to: string) {
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60000))
}

export type QuestionDiagnosis = {
  id: number
  number: number
  prompt: string
  kind: LiveQuestion['kind']
  answered: number
  right: number
  wrong: number
  toMark: number
  // Of the marked answers, how many were right (null while none is marked).
  rightPercent: number | null
  averageSeconds: number | null
  // Choice questions: the wrong option most children chose (null: none, or not a choice question).
  commonWrong: { option: number; label: string; count: number } | null
}

export function questionDiagnosis(questions: LiveQuestion[], answers: LiveAnswer[], correctOptions: Map<number, number[]> = new Map()) {
  return [...questions]
    .sort((a, b) => a.number - b.number)
    .map((question): QuestionDiagnosis => {
      const own = answers.filter((answer) => answer.liveQuestionId === question.id)
      const right = own.filter((answer) => answer.result === 'correct').length
      const wrong = own.filter((answer) => answer.result === 'wrong').length
      const marked = right + wrong
      const seconds = own.map((answer) => answer.secondsTaken).filter((value) => Number.isFinite(value))
      let commonWrong: QuestionDiagnosis['commonWrong'] = null
      if (question.kind === 'choice') {
        const key = correctOptions.get(question.id) ?? []
        const counts = new Map<number, number>()
        for (const answer of own) {
          if (answer.result !== 'wrong') continue
          for (const option of answer.choices ?? []) {
            if (key.includes(option)) continue
            counts.set(option, (counts.get(option) ?? 0) + 1)
          }
        }
        let best: [number, number] | null = null
        for (const entry of counts) {
          if (!best || entry[1] > best[1] || (entry[1] === best[1] && entry[0] < best[0])) best = entry
        }
        if (best) commonWrong = { option: best[0], label: question.options[best[0]] ?? String.fromCharCode(65 + best[0]), count: best[1] }
      }
      return {
        id: question.id,
        number: question.number,
        prompt: question.prompt,
        kind: question.kind,
        answered: own.length,
        right,
        wrong,
        toMark: own.filter((answer) => answer.result === 'pending').length,
        rightPercent: marked > 0 ? Math.round((right / marked) * 100) : null,
        averageSeconds: seconds.length > 0 ? Math.round(seconds.reduce((sum, value) => sum + value, 0) / seconds.length) : null,
        commonWrong,
      }
    })
}

// The hardest question: the lowest right percentage (ties: the later one).
export function hardestQuestion(diagnosis: QuestionDiagnosis[]) {
  let hardest: QuestionDiagnosis | null = null
  for (const question of diagnosis) {
    if (question.rightPercent === null) continue
    if (!hardest || question.rightPercent <= (hardest.rightPercent ?? 101)) hardest = question
  }
  return hardest
}

export type CurvePoint = { at: string; online: number }
export type CurveDrop = { at: string; lost: number }

// How many children were in Zoom, every `step` minutes from the start to the
// end of the lesson, and the moments most of them left (a drop of 2 or more
// against the point before; the biggest first, at most `keep`).
export function participationCurve(records: LessonRecord[], stepMinutes = 5, keep = 2): { points: CurvePoint[]; drops: CurveDrop[] } {
  const first = records[0]
  if (!first) return { points: [], drops: [] }
  const from = new Date(first.lessonFrom).getTime()
  const to = new Date(first.lessonTo).getTime()
  if (!(to > from)) return { points: [], drops: [] }
  const step = stepMinutes * 60000
  const points: CurvePoint[] = []
  for (let at = from; at <= to; at += step) {
    // At the very end, count who was there just before it ended.
    const moment = at === to ? to - 1000 : at
    const online = new Set(
      records.filter((record) => record.onlineSpans.some((span) => new Date(span.from).getTime() <= moment && moment < new Date(span.to).getTime())).map((record) => record.studentId),
    ).size
    points.push({ at: new Date(at).toISOString(), online })
  }
  if (points[points.length - 1] && new Date(points[points.length - 1].at).getTime() < to) {
    const online = records.filter((record) => record.onlineSpans.some((span) => new Date(span.from).getTime() <= to - 1000 && to - 1000 < new Date(span.to).getTime())).length
    points.push({ at: new Date(to).toISOString(), online })
  }
  const drops = points
    .slice(1)
    .map((point, index) => ({ at: point.at, lost: points[index].online - point.online }))
    .filter((drop) => drop.lost >= 2)
    .sort((a, b) => b.lost - a.lost || a.at.localeCompare(b.at))
    .slice(0, keep)
  return { points, drops }
}

export type CareReason =
  | { kind: 'absent' }
  | { kind: 'late'; minutes: number }
  | { kind: 'away'; from: string; to: string; minutes: number }
  | { kind: 'early'; minutes: number }
  | { kind: 'few_right'; right: number; total: number }
  | { kind: 'silent' }

export type CareEntry = { studentId: number; name: string; code: string | null; percent: number | null; reasons: CareReason[] }

const LATE_MINUTES = 5
const EARLY_MINUTES = 5
const AWAY_MINUTES = 3

// Who needs the teacher after class, and why (all the reasons, most serious first):
// absent, few answers right, silent, left early, away, late.
export function careList(records: LessonRecord[]): CareEntry[] {
  const order: CareReason['kind'][] = ['absent', 'few_right', 'silent', 'early', 'away', 'late']
  return records
    .map((record): CareEntry => {
      const reasons: CareReason[] = []
      const absent = record.attendanceStatus === 'absent' || (record.attendanceStatus !== 'present' && record.hasZoom && (record.zoomMinutes ?? 0) === 0)
      if (absent) {
        reasons.push({ kind: 'absent' })
      } else {
        if (record.lateMinutes !== null && record.lateMinutes >= LATE_MINUTES) reasons.push({ kind: 'late', minutes: record.lateMinutes })
        for (const period of record.leftPeriods) {
          const minutes = minutesBetween(period.from, period.to)
          if (period.kind === 'away' && minutes >= AWAY_MINUTES) reasons.push({ kind: 'away', from: period.from, to: period.to, minutes })
        }
        if (record.leftEarlyMinutes !== null && record.leftEarlyMinutes >= EARLY_MINUTES) reasons.push({ kind: 'early', minutes: record.leftEarlyMinutes })
        const marked = record.correct + record.wrong
        if (record.questionsTotal >= 2 && marked >= 2 && record.correct / record.questionsTotal < 0.4) {
          reasons.push({ kind: 'few_right', right: record.correct, total: record.questionsTotal })
        }
        if (record.isSilent) reasons.push({ kind: 'silent' })
      }
      return { studentId: record.studentId, name: record.studentName, code: record.studentCode, percent: record.participationPercent, reasons }
    })
    .filter((entry) => entry.reasons.length > 0)
    .sort((a, b) => {
      const rank = (entry: CareEntry) => Math.min(...entry.reasons.map((reason) => order.indexOf(reason.kind)))
      return rank(a) - rank(b) || a.name.localeCompare(b.name)
    })
}

export function careReasonText(reason: CareReason, timeOf: (iso: string) => string) {
  switch (reason.kind) {
    case 'absent':
      return 'Absent · not in Zoom'
    case 'late':
      return `Late · ${reason.minutes} min`
    case 'away':
      return `Away ${timeOf(reason.from)}–${timeOf(reason.to)} · ${reason.minutes} min`
    case 'early':
      return `Left early · ${reason.minutes} min before the end`
    case 'few_right':
      return `${reason.right} of ${reason.total} right`
    case 'silent':
      return 'Silent · no answer, not picked'
  }
}

export type LessonTotals = {
  roster: number
  came: number
  absent: number
  late: number
  leftEarly: number
  rightPercent: number | null
  marked: number
  answers: number
  toMark: number
  points: number
}

export function lessonTotals(records: LessonRecord[], diagnosis: QuestionDiagnosis[]): LessonTotals {
  const came = records.filter((record) => (record.zoomMinutes ?? 0) > 0 || record.attendanceStatus === 'present').length
  const right = diagnosis.reduce((sum, question) => sum + question.right, 0)
  const marked = diagnosis.reduce((sum, question) => sum + question.right + question.wrong, 0)
  return {
    roster: records.length,
    came,
    absent: records.length - came,
    late: records.filter((record) => (record.lateMinutes ?? 0) >= LATE_MINUTES).length,
    leftEarly: records.filter((record) => (record.leftEarlyMinutes ?? 0) >= EARLY_MINUTES).length,
    rightPercent: marked > 0 ? Math.round((right / marked) * 100) : null,
    marked,
    answers: diagnosis.reduce((sum, question) => sum + question.answered, 0),
    toMark: diagnosis.reduce((sum, question) => sum + question.toMark, 0),
    points: records.reduce((sum, record) => sum + record.points, 0),
  }
}

// The sentence at the top, from the numbers (not AI).
export function lessonSummary(totals: LessonTotals, hardest: QuestionDiagnosis | null) {
  const parts = [`${totals.came} of ${totals.roster} came`]
  if (totals.rightPercent !== null) parts.push(`${totals.rightPercent}% of answers were right`)
  const mood = totals.rightPercent === null ? 'Lesson done' : totals.rightPercent >= 70 ? 'A good lesson' : totals.rightPercent >= 50 ? 'An OK lesson' : 'A hard lesson'
  const hard = hardest && hardest.rightPercent !== null && hardest.rightPercent < 70 ? ` Question ${hardest.number} was hard (${hardest.rightPercent}% right).` : ''
  return { lead: `${mood}: ${parts.join(' and ')}.`, hard }
}
