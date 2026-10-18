import { supabase } from './supabase'
import { csvCell, parseCsvTable } from './leadCsv'
import { ageGroupOptions } from './constants'
import { shortAgeGroup } from './ageGroups'
import type { Subject } from './subjects'
import type { Database } from '../types/database'
import type { AgeGroup } from '../types/domain'

export type QuestionKind = 'choice' | 'fill' | 'short' | 'screenshot' | 'link'
export type MatchRule = 'exact' | 'contains' | 'close'

export type ChoiceOption = { text: string; correct: boolean }
export type AcceptedAnswer = { text: string; match: MatchRule }

export type Question = {
  id: number
  ownerId: number
  isShared: boolean
  kind: QuestionKind
  prompt: string
  options: ChoiceOption[]
  acceptedAnswers: AcceptedAnswer[]
  caseSensitive: boolean
  points: number
  timeLimitSeconds: number
  topic: string | null
  explanation: string | null
  // Empty: any subject.
  subjectId: number | null
  // Empty: every age.
  ageGroups: AgeGroup[]
  isArchived: boolean
  updatedAt: string
}

// What a question is made of when it is written or imported.
export type QuestionDraft = Pick<
  Question,
  | 'kind'
  | 'prompt'
  | 'options'
  | 'acceptedAnswers'
  | 'caseSensitive'
  | 'points'
  | 'timeLimitSeconds'
  | 'topic'
  | 'explanation'
  | 'isShared'
  | 'subjectId'
  | 'ageGroups'
>

export const questionKindLabels: Record<QuestionKind, string> = {
  choice: 'Multiple choice',
  fill: 'Fill in',
  short: 'Short answer',
  screenshot: 'Screenshot of work',
  link: 'Link to work',
}

export const matchRuleLabels: Record<MatchRule, string> = {
  exact: 'Exactly',
  contains: 'Contains',
  close: 'Close (spelling)',
}

export function emptyQuestionDraft(kind: QuestionKind = 'choice'): QuestionDraft {
  return {
    kind,
    prompt: '',
    options: [
      { text: '', correct: true },
      { text: '', correct: false },
    ],
    acceptedAnswers: [{ text: '', match: 'exact' }],
    caseSensitive: false,
    points: 10,
    timeLimitSeconds: 60,
    topic: null,
    explanation: null,
    isShared: false,
    subjectId: null,
    ageGroups: [],
  }
}

type QuestionRow = Database['public']['Tables']['questions']['Row']

function mapQuestionRow(row: QuestionRow): Question {
  return {
    id: row.id,
    ownerId: row.owner_id,
    isShared: row.is_shared,
    kind: row.kind,
    prompt: row.prompt,
    options: Array.isArray(row.options) ? (row.options as ChoiceOption[]) : [],
    acceptedAnswers: Array.isArray(row.accepted_answers) ? (row.accepted_answers as AcceptedAnswer[]) : [],
    caseSensitive: row.case_sensitive,
    points: row.points,
    timeLimitSeconds: row.time_limit_seconds,
    topic: row.topic,
    explanation: row.explanation,
    subjectId: row.subject_id ?? null,
    ageGroups: (row.age_groups ?? []) as AgeGroup[],
    isArchived: row.is_archived,
    updatedAt: row.updated_at,
  }
}

function toPayload(draft: QuestionDraft) {
  return {
    kind: draft.kind,
    prompt: draft.prompt.trim(),
    options: draft.kind === 'choice' ? draft.options.map((option) => ({ text: option.text.trim(), correct: option.correct })) : [],
    accepted_answers:
      draft.kind === 'fill' || draft.kind === 'short'
        ? draft.acceptedAnswers
            .filter((answer) => answer.text.trim() !== '')
            .map((answer) => ({ text: answer.text.trim(), match: answer.match }))
        : [],
    case_sensitive: draft.caseSensitive,
    points: draft.points,
    time_limit_seconds: draft.timeLimitSeconds,
    topic: draft.topic?.trim() || null,
    explanation: draft.explanation?.trim() || null,
    is_shared: draft.isShared,
    subject_id: draft.subjectId,
    age_groups: draft.ageGroups,
  }
}

// Does a question suit a class: the same subject (or either has none) and
// the class's age group (or the question is for every age). Same rule as
// question_fits_classroom() in the database.
export function fitsClassroom(
  question: Pick<Question, 'subjectId' | 'ageGroups'>,
  classroom: { subjectId?: number | null; ageGroup: AgeGroup },
) {
  const subjectOk = question.subjectId === null || !classroom.subjectId || question.subjectId === classroom.subjectId
  const ageOk = question.ageGroups.length === 0 || question.ageGroups.includes(classroom.ageGroup)
  return subjectOk && ageOk
}

// "9-11" or "9-11 Years Old" -> the school's age group of that name, or null.
export function readAgeGroup(text: string, names: AgeGroup[] = ageGroupOptions): AgeGroup | null {
  const key = (value: string) => shortAgeGroup(value.trim()).toLowerCase().replace(/\s+/g, '')
  const wanted = key(text)
  return names.find((name) => key(name) === wanted) ?? null
}

export { shortAgeGroup }

// The problem with a draft, or null. Same rules as question_problem() in the
// database, so the form can say it before saving.
export function draftProblem(draft: QuestionDraft): string | null {
  if (!draft.prompt.trim()) return 'Write the question.'
  if (draft.prompt.trim().length > 2000) return 'The question is longer than 2000 letters.'
  if (!Number.isInteger(draft.points) || draft.points < 1 || draft.points > 100) return 'Points must be from 1 to 100.'
  if (!Number.isInteger(draft.timeLimitSeconds) || draft.timeLimitSeconds < 5 || draft.timeLimitSeconds > 1800) {
    return 'Time must be from 5 to 1800 seconds.'
  }
  if (draft.kind === 'choice') {
    if (draft.options.length < 2 || draft.options.length > 8) return 'A choice question needs 2 to 8 options.'
    if (draft.options.some((option) => !option.text.trim())) return 'Every option needs its text.'
    if (!draft.options.some((option) => option.correct)) return 'Mark at least one option as correct.'
  }
  if (draft.kind === 'fill' && !draft.acceptedAnswers.some((answer) => answer.text.trim())) {
    return 'A fill-in question needs at least one accepted answer.'
  }
  return null
}

// ---------------------------------------------------------------------------
// Checking an answer (after Oppia's answer rules)

export type AnswerResult = 'correct' | 'wrong' | 'teacher'

function normalize(text: string, caseSensitive: boolean) {
  const squeezed = text.trim().replace(/\s+/g, ' ')
  return caseSensitive ? squeezed : squeezed.toLowerCase()
}

// Letters to add, drop or change to turn one text into the other.
export function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j]
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1))
      diagonal = above
    }
  }
  return previous[right.length]
}

export function matchesAnswer(answer: string, accepted: AcceptedAnswer, caseSensitive: boolean) {
  const given = normalize(answer, caseSensitive)
  const wanted = normalize(accepted.text, caseSensitive)
  if (!given || !wanted) return false
  if (accepted.match === 'exact') return given === wanted
  if (accepted.match === 'contains') return given.includes(wanted)
  // Close: one letter off for short words, two for longer ones.
  return editDistance(given, wanted) <= (wanted.length <= 6 ? 1 : 2)
}

// A typed answer (fill / short), or the picked option numbers (choice).
// Screenshots, links and a short answer that matches nothing go to the teacher.
export function checkAnswer(question: Pick<Question, 'kind' | 'options' | 'acceptedAnswers' | 'caseSensitive'>, answer: string | number[]): AnswerResult {
  if (question.kind === 'choice') {
    const picked = new Set(Array.isArray(answer) ? answer : [])
    const correct = question.options.flatMap((option, index) => (option.correct ? [index] : []))
    return correct.length === picked.size && correct.every((index) => picked.has(index)) ? 'correct' : 'wrong'
  }
  if (question.kind === 'fill' || question.kind === 'short') {
    const text = typeof answer === 'string' ? answer : ''
    if (question.acceptedAnswers.some((accepted) => matchesAnswer(text, accepted, question.caseSensitive))) {
      return 'correct'
    }
    return question.kind === 'fill' ? 'wrong' : 'teacher'
  }
  return 'teacher'
}

// ---------------------------------------------------------------------------
// Import: CSV, or rows pasted from Excel / Google Sheets (tab-separated)

export const importColumns = [
  'type',
  'question',
  'options',
  'answers',
  'match',
  'points',
  'seconds',
  'topic',
  'explanation',
  'subject',
  'ages',
] as const

const kindByWord: Record<string, QuestionKind> = {
  choice: 'choice',
  mcq: 'choice',
  'multiple choice': 'choice',
  fill: 'fill',
  'fill in': 'fill',
  short: 'short',
  'short answer': 'short',
  screenshot: 'screenshot',
  link: 'link',
}

export function buildImportTemplate() {
  const rows = [
    [...importColumns],
    ['choice', 'What does a loop do?', '*Repeats steps | Stops the game | Draws a picture', '', '', '10', '30', 'Coding basics', '', '', '9-11 | 12-14'],
    ['fill', 'What is 6 x 7?', '', '42', 'exact', '5', '20', 'Times tables', '', '', '6-8'],
    ['fill', 'Capital of Malaysia?', '', 'Kuala Lumpur | KL', 'close', '5', '30', '', '', '', ''],
    ['short', 'Why do we test our code?', '', 'find bugs | mistakes', 'contains', '10', '120', '', 'Testing finds mistakes early.', '', '12-14 | 15-17'],
    ['screenshot', 'Show the start screen of your game', '', '', '', '10', '300', 'Project', '', '', ''],
    ['link', 'Send the link to your website', '', '', '', '10', '300', 'Project', '', '', ''],
  ]
  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}

function splitTable(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  if (firstLine.includes('\t')) {
    return text
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '')
      .map((line) => line.split('\t'))
  }
  return parseCsvTable(text)
}

export type ImportRow = { row: number; draft: QuestionDraft | null; error: string | null }

// One draft (or the reason it cannot be one) per data row. Options are split
// by "|", a "*" in front marks a correct one; answers and ages are split by
// "|"; a subject is named as the school wrote it (empty = any).
export function parseQuestionImport(text: string, subjects: Subject[] = [], ageGroupsAllowed: AgeGroup[] = ageGroupOptions): ImportRow[] {
  const table = splitTable(text)
  if (table.length === 0) return []
  const header = table[0].map((cell) => cell.trim().toLowerCase())
  const column = (name: (typeof importColumns)[number]) => header.indexOf(name)
  if (column('type') < 0 || column('question') < 0) {
    return [{ row: 1, draft: null, error: 'The first row must name the columns: type, question, options, answers, …' }]
  }
  const cell = (cells: string[], name: (typeof importColumns)[number]) => {
    const index = column(name)
    return index < 0 ? '' : (cells[index] ?? '').trim()
  }
  const parts = (value: string) =>
    value
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean)

  return table.slice(1).map((cells, index) => {
    const row = index + 2
    const kind = kindByWord[cell(cells, 'type').toLowerCase()]
    if (!kind) {
      return { row, draft: null, error: `Unknown type "${cell(cells, 'type')}" (use choice, fill, short, screenshot or link).` }
    }
    const match = (cell(cells, 'match').toLowerCase() || 'exact') as MatchRule
    if (!['exact', 'contains', 'close'].includes(match)) {
      return { row, draft: null, error: `Unknown match "${cell(cells, 'match')}" (use exact, contains or close).` }
    }
    const subjectName = cell(cells, 'subject')
    const subject = subjectName
      ? subjects.find((entry) => entry.isActive && entry.name.trim().toLowerCase() === subjectName.toLowerCase())
      : null
    if (subjectName && !subject) {
      return { row, draft: null, error: `Unknown subject "${subjectName}" (an admin adds subjects in Class Settings).` }
    }
    const ageTexts = parts(cell(cells, 'ages'))
    const ageGroups = ageTexts.map((ageText) => readAgeGroup(ageText, ageGroupsAllowed))
    const badAge = ageTexts.find((_, at) => ageGroups[at] === null)
    if (badAge !== undefined) {
      return { row, draft: null, error: `Unknown age group "${badAge}" (use ${ageGroupsAllowed.map(shortAgeGroup).join(', ')}).` }
    }
    const pointsText = cell(cells, 'points')
    const secondsText = cell(cells, 'seconds')
    const draft: QuestionDraft = {
      kind,
      prompt: cell(cells, 'question'),
      options: parts(cell(cells, 'options')).map((option) => ({
        text: option.replace(/^\*\s*/, ''),
        correct: option.startsWith('*'),
      })),
      acceptedAnswers: parts(cell(cells, 'answers')).map((answer) => ({ text: answer, match })),
      caseSensitive: false,
      points: pointsText ? Number(pointsText) : 10,
      timeLimitSeconds: secondsText ? Number(secondsText) : 60,
      topic: cell(cells, 'topic') || null,
      explanation: cell(cells, 'explanation') || null,
      isShared: false,
      subjectId: subject?.id ?? null,
      ageGroups: Array.from(new Set(ageGroups.filter((group): group is AgeGroup => group !== null))),
    }
    const problem = draftProblem(draft)
    return { row, draft: problem ? null : draft, error: problem }
  })
}

// ---------------------------------------------------------------------------
// Reads and changes; changes resolve to an error message, or null when done.

export async function fetchQuestions(): Promise<Question[]> {
  if (!supabase) return []
  const rows: QuestionRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) return rows.map(mapQuestionRow)
  }
}

export async function saveQuestion(id: number | null, draft: QuestionDraft) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('save_question', { p_id: id, p_question: toPayload(draft) })
  return error ? error.message || 'Failed to save the question.' : null
}

// A new bank question, giving back its id (to pop it or plan it at once).
export async function saveNewQuestion(draft: QuestionDraft): Promise<{ id: number | null; error: string | null }> {
  if (!supabase) return { id: null, error: 'Supabase is not configured.' }
  const { data, error } = await supabase.rpc('save_question', { p_id: null, p_question: toPayload(draft) })
  if (error) return { id: null, error: error.message || 'Failed to save the question.' }
  const row = (Array.isArray(data) ? data[0] : data) as { id?: number } | null
  return { id: typeof row?.id === 'number' ? row.id : null, error: null }
}

export async function importQuestions(drafts: QuestionDraft[], share: boolean) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('import_questions', { p_questions: drafts.map(toPayload), p_share: share })
  return error ? error.message || 'Failed to import.' : null
}

export async function setQuestionArchived(id: number, archived: boolean) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_question_archived', { p_id: id, p_archived: archived })
  return error ? error.message || 'Failed to archive.' : null
}

export async function copyQuestion(id: number) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('copy_question', { p_id: id })
  return error ? error.message || 'Failed to copy.' : null
}
