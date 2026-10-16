import { supabase } from './supabase'
import type { QuestionKind } from './questions'
import type { Database } from '../types/database'

// Questions popped in class (live_questions), their answer keys and the
// children's answers. The teacher's side of 20261022030000_live_questions.sql;
// the children answer in the student app.

type LiveQuestionRow = Database['public']['Tables']['live_questions']['Row']
type LiveKeyRow = Database['public']['Tables']['live_question_keys']['Row']
type LiveAnswerRow = Database['public']['Tables']['live_answers']['Row']

export type LiveQuestion = {
  id: number
  sessionId: number
  questionId: number | null
  number: number
  kind: QuestionKind
  prompt: string
  options: string[]
  points: number
  timeLimitSeconds: number
  scoring: 'speed' | 'fixed'
  status: 'live' | 'closed'
  openedAt: string
  closesAt: string
  revealedAt: string | null
}

export type LiveKey = {
  correctOptions: number[]
  acceptedAnswers: string[]
  explanation: string | null
}

export type LiveAnswer = {
  id: number
  liveQuestionId: number
  studentId: number
  answeredBy: 'student' | 'parent'
  text: string | null
  choices: number[] | null
  filePath: string | null
  submittedAt: string
  secondsTaken: number
  pointsIfCorrect: number
  result: 'correct' | 'wrong' | 'pending'
  points: number
  markedBy: 'auto' | 'teacher' | null
  aiSuggestion: 'right' | 'wrong' | 'unsure' | null
  aiFeedback: string | null
  aiNote: string | null
  aiCheckedAt: string | null
  feedback: string | null
}

export type LiveQuestionSettings = {
  scoring: 'speed' | 'fixed'
  leaderboardTop: number
  aiMarking: boolean
}

export const defaultLiveQuestionSettings: LiveQuestionSettings = { scoring: 'speed', leaderboardTop: 3, aiMarking: true }

export function mapLiveQuestion(row: LiveQuestionRow): LiveQuestion {
  return {
    id: row.id,
    sessionId: row.session_id,
    questionId: row.question_id,
    number: row.position,
    kind: row.kind,
    prompt: row.prompt,
    options: Array.isArray(row.options)
      ? row.options.map((option) => (option && typeof option === 'object' && 'text' in option ? String(option.text) : ''))
      : [],
    points: row.points,
    timeLimitSeconds: row.time_limit_seconds,
    scoring: row.scoring,
    status: row.status,
    openedAt: row.opened_at,
    closesAt: row.closes_at,
    revealedAt: row.revealed_at,
  }
}

function mapKey(row: LiveKeyRow): LiveKey {
  return {
    correctOptions: row.correct_options,
    acceptedAnswers: Array.isArray(row.accepted_answers)
      ? row.accepted_answers.flatMap((entry) =>
          entry && typeof entry === 'object' && 'text' in entry && typeof entry.text === 'string' ? [entry.text] : [],
        )
      : [],
    explanation: row.explanation,
  }
}

export function mapLiveAnswer(row: LiveAnswerRow): LiveAnswer {
  return {
    id: row.id,
    liveQuestionId: row.live_question_id,
    studentId: row.student_id,
    answeredBy: row.answered_by,
    text: row.answer_text,
    choices: row.answer_choices,
    filePath: row.file_path,
    submittedAt: row.submitted_at,
    secondsTaken: Number(row.seconds_taken),
    pointsIfCorrect: row.points_if_correct,
    result: row.result,
    points: row.points,
    markedBy: row.marked_by,
    aiSuggestion: row.ai_suggestion,
    aiFeedback: row.ai_feedback,
    aiNote: row.ai_note,
    aiCheckedAt: row.ai_checked_at,
    feedback: row.feedback,
  }
}

// ---------------------------------------------------------------------------
// Pure helpers

export function choiceLetter(index: number) {
  return String.fromCharCode(65 + index)
}

// Whole seconds until the question closes (0 once it has).
export function secondsLeft(question: Pick<LiveQuestion, 'status' | 'closesAt'>, nowMs: number) {
  if (question.status !== 'live') return 0
  return Math.max(0, Math.ceil((Date.parse(question.closesAt) - nowMs) / 1000))
}

export function isOpen(question: Pick<LiveQuestion, 'status' | 'closesAt'>, nowMs: number) {
  return secondsLeft(question, nowMs) > 0
}

// What a child answered, in a few words.
export function answerText(answer: Pick<LiveAnswer, 'text' | 'choices' | 'filePath'>, question: Pick<LiveQuestion, 'kind' | 'options'>) {
  if (question.kind === 'choice') {
    return (answer.choices ?? []).map((index) => `${choiceLetter(index)}. ${question.options[index] ?? ''}`.trim()).join(', ')
  }
  if (question.kind === 'screenshot') return answer.text ? `Picture · ${answer.text}` : 'Picture'
  return answer.text ?? ''
}

export type BoardRow = { studentId: number; points: number; right: number; answered: number; place: number }

// Everyone's points in the lesson, best first (same points share a place).
export function lessonBoard(answers: LiveAnswer[]): BoardRow[] {
  const byStudent = new Map<number, BoardRow>()
  for (const answer of answers) {
    const row = byStudent.get(answer.studentId) ?? { studentId: answer.studentId, points: 0, right: 0, answered: 0, place: 0 }
    row.points += answer.points
    row.answered += 1
    if (answer.result === 'correct') row.right += 1
    byStudent.set(answer.studentId, row)
  }
  const rows = Array.from(byStudent.values()).sort((left, right) => right.points - left.points || right.right - left.right)
  rows.forEach((row, index) => {
    row.place = index > 0 && rows[index - 1].points === row.points ? rows[index - 1].place : index + 1
  })
  return rows
}

export function readLiveQuestionSettings(value: unknown): LiveQuestionSettings {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const top = Number(raw.leaderboard_top)
  return {
    scoring: raw.scoring === 'fixed' ? 'fixed' : 'speed',
    leaderboardTop: Number.isInteger(top) && top >= 0 && top <= 10 ? top : defaultLiveQuestionSettings.leaderboardTop,
    aiMarking: typeof raw.ai_marking === 'boolean' ? raw.ai_marking : defaultLiveQuestionSettings.aiMarking,
  }
}

// ---------------------------------------------------------------------------
// Reads and changes; changes resolve to an error message, or null when done.

function message(error: { message?: string } | null, fallback: string) {
  return error ? error.message || fallback : null
}

export async function openClassSession(scheduleId: number, lessonDate: string) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.rpc('open_class_session', { p_schedule_id: scheduleId, p_lesson_date: lessonDate })
  if (error) throw new Error(error.message || 'Could not open the lesson.')
  return data
}

export async function fetchLessonLive(sessionId: number) {
  if (!supabase) return { questions: [] as LiveQuestion[], keys: new Map<number, LiveKey>(), answers: [] as LiveAnswer[] }
  const [questions, answers] = await Promise.all([
    supabase.from('live_questions').select('*').eq('session_id', sessionId).order('position'),
    supabase.from('live_answers').select('*').eq('session_id', sessionId).order('submitted_at'),
  ])
  if (questions.error) throw questions.error
  if (answers.error) throw answers.error
  const ids = questions.data.map((row) => row.id)
  const keys = new Map<number, LiveKey>()
  if (ids.length > 0) {
    const { data, error } = await supabase.from('live_question_keys').select('*').in('live_question_id', ids)
    if (error) throw error
    for (const row of data) keys.set(row.live_question_id, mapKey(row))
  }
  return { questions: questions.data.map(mapLiveQuestion), keys, answers: answers.data.map(mapLiveAnswer) }
}

export async function pushLiveQuestion(sessionId: number, questionId: number, timeLimitSeconds: number | null) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('push_live_question', {
    p_session_id: sessionId,
    p_question_id: questionId,
    p_time_limit_seconds: timeLimitSeconds,
  })
  return message(error, 'Could not pop the question.')
}

export async function closeLiveQuestion(liveQuestionId: number) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('close_live_question', { p_live_question_id: liveQuestionId })
  return message(error, 'Could not close the question.')
}

export async function revealLiveQuestion(liveQuestionId: number) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('reveal_live_question', { p_live_question_id: liveQuestionId })
  return message(error, 'Could not show the answer.')
}

export async function markLiveAnswer(answerId: number, correct: boolean, feedback: string | null) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('mark_live_answer', { p_answer_id: answerId, p_correct: correct, p_feedback: feedback })
  return message(error, 'Could not mark the answer.')
}

// Asks the AI to look at the answers of one question that wait for the teacher.
export async function askAiToMark(liveQuestionId: number): Promise<{ error: string | null; checked: number }> {
  if (!supabase) return { error: 'Supabase is not configured.', checked: 0 }
  const { data, error } = await supabase.functions.invoke('live-answer-mark', { body: { liveQuestionId } })
  if (error) {
    let reason = error.message || 'The AI did not answer.'
    try {
      const body = await (error as { context?: Response }).context?.json()
      if (body?.error) reason = body.error
    } catch {
      // keep the general reason
    }
    return { error: reason, checked: 0 }
  }
  if (!data?.ok) return { error: data?.error ?? 'The AI did not answer.', checked: 0 }
  return { error: null, checked: Number(data.checked) || 0 }
}

// A short-lived link to a child's picture.
export async function liveAnswerFileUrl(path: string) {
  if (!supabase) return null
  const { data } = await supabase.storage.from('live-answers').createSignedUrl(path, 60 * 30)
  return data?.signedUrl ?? null
}

export async function fetchLiveQuestionSettings(): Promise<LiveQuestionSettings> {
  if (!supabase) return defaultLiveQuestionSettings
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'live_questions').maybeSingle()
  return readLiveQuestionSettings(data?.value)
}

export async function saveLiveQuestionSettings(settings: LiveQuestionSettings) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_live_question_settings', {
    p_settings: { scoring: settings.scoring, leaderboard_top: settings.leaderboardTop, ai_marking: settings.aiMarking },
  })
  return message(error, 'Could not save the settings.')
}

// Calls onChange whenever a question or an answer of the lesson changes.
export function watchLesson(sessionId: number, onChange: () => void) {
  if (!supabase) return () => {}
  const client = supabase
  const channel = client
    .channel(`live-lesson-${sessionId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'live_questions', filter: `session_id=eq.${sessionId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'live_answers', filter: `session_id=eq.${sessionId}` }, onChange)
    .subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}
