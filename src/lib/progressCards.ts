import { supabase } from './supabase'
import { monthBounds, shiftMonth } from './classQuality'

// The monthly progress card a Learning Consultant sends to a family: the month's lessons (and the three before, for the
// trend), worked out into a few numbers and a text from the school's template.

export type CardLesson = {
  sessionId: number
  date: string
  classroom: string | null
  teacher: string | null
  status: string | null
  attended: boolean | null
  hasZoom: boolean
  participation: number | null
  questions: number
  correct: number
  wrong: number
  points: number
}

export type CardWords = { date: string; teacher: string | null; text: string }

export type CardData = {
  student: {
    id: number
    name: string
    code: string | null
    consultant: string | null
    sendTo: { phone: string | null; name: string | null; contactId: number | null }
  }
  month: string
  lessons: CardLesson[]
  words: CardWords[]
  sentAt: string | null
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  return supabase
}

export async function fetchCard(studentId: number, month: string): Promise<CardData> {
  const { data, error } = await requireSupabase().rpc('progress_card', { p_student: studentId, p_month: month })
  if (error) {
    throw error
  }
  return data as unknown as CardData
}

// Null when recorded, else the reason.
export async function markCardSent(studentId: number, month: string): Promise<string | null> {
  const { error } = await requireSupabase().rpc('mark_progress_card_sent', { p_student: studentId, p_month: month })
  return error ? error.message || 'Could not record that the card was sent.' : null
}

export type CardSummary = {
  lessons: number
  attended: number
  // The quizzes of the month: questions answered right of all the questions in the lessons the child was in.
  correct: number
  questions: number
  // Better than last month (by the share right)? null when either month had no quiz.
  improved: boolean | null
  participation: number | null
  points: number
  classes: string[]
  // One point per quiz (a lesson with questions): right of how many.
  trend: { date: string; correct: number; total: number }[]
  // The teacher's latest words of the month.
  words: CardWords | null
}

function inMonth(lesson: CardLesson, month: string) {
  const { from, to } = monthBounds(month)
  return lesson.date >= from && lesson.date <= to
}

// A lesson counts once the attendance says so; before the attendance, being in the Zoom counts.
const cameTo = (lesson: CardLesson) => lesson.attended === true || (lesson.attended === null && (lesson.participation ?? 0) > 0)
// A quiz the child took: a lesson with questions they came to (or answered in).
const tookQuiz = (lesson: CardLesson) => lesson.questions > 0 && (cameTo(lesson) || lesson.correct + lesson.wrong > 0)

export function summarizeCard(card: CardData): CardSummary {
  const month = card.lessons.filter((lesson) => inMonth(lesson, card.month))
  const before = card.lessons.filter((lesson) => inMonth(lesson, shiftMonth(card.month, -1)))
  const quizzes = month.filter(tookQuiz)
  const previous = before.filter(tookQuiz)
  const sum = (list: CardLesson[], pick: (lesson: CardLesson) => number) => list.reduce((total, lesson) => total + pick(lesson), 0)
  const share = (list: CardLesson[]) => (sum(list, (lesson) => lesson.questions) > 0 ? sum(list, (lesson) => lesson.correct) / sum(list, (lesson) => lesson.questions) : null)
  const now = share(quizzes)
  const then = share(previous)
  const came = month.filter(cameTo)
  const withTime = came.filter((lesson) => lesson.hasZoom && lesson.participation !== null)
  return {
    lessons: month.filter((lesson) => lesson.attended !== null || lesson.hasZoom).length,
    attended: came.length,
    correct: sum(quizzes, (lesson) => lesson.correct),
    questions: sum(quizzes, (lesson) => lesson.questions),
    improved: now !== null && then !== null && now !== then ? now > then : null,
    participation: withTime.length > 0 ? Math.round(sum(withTime, (lesson) => lesson.participation ?? 0) / withTime.length) : null,
    points: sum(month, (lesson) => lesson.points),
    classes: [...new Set(month.map((lesson) => lesson.classroom).filter((name): name is string => Boolean(name)))],
    trend: quizzes.map((lesson) => ({ date: lesson.date, correct: lesson.correct, total: lesson.questions })),
    words: card.words[0] ?? null,
  }
}

// "October 2026"
export function monthName(month: string) {
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}T00:00:00Z`))
}

// The school's template filled in, in the parents' language (zh: "10月", "比上个月进步了"). A line whose blanks have
// nothing to fill (no quiz this month, no words from the teacher) is left out, so the parent never reads an empty
// sentence.
export function cardText(template: string, card: CardData, summary: CardSummary, school: string, language: 'zh' | 'en' = 'zh') {
  const better = summary.improved === true
  const values: Record<string, string | null> = {
    '{child}': card.student.name,
    '{month}': language === 'zh' ? `${Number(card.month.slice(5, 7))}月` : monthName(card.month),
    '{classes}': summary.classes.length > 0 ? summary.classes.join(', ') : null,
    '{attended}': summary.lessons > 0 ? String(summary.attended) : null,
    '{lessons}': summary.lessons > 0 ? String(summary.lessons) : null,
    '{score}': summary.questions > 0 ? `${summary.correct}/${summary.questions}` : null,
    // Only good news is said: no "down from last month" to the parent.
    '{right_change}': better ? (language === 'zh' ? '，比上个月进步了 👍' : ' (better than last month)') : '',
    '{points}': summary.points > 0 ? String(summary.points) : null,
    '{time}': summary.participation !== null ? String(summary.participation) : null,
    '{teacher}': summary.words ? (summary.words.teacher ?? (language === 'zh' ? '老师' : 'Teacher')) : null,
    '{remark}': summary.words?.text ?? null,
    '{school}': school,
  }
  return template
    .split('\n')
    .map((line) => {
      let empty = false
      const filled = line.replace(/\{[a-z_]+\}/g, (token) => {
        if (!(token in values)) return token
        const value = values[token]
        if (value === null) {
          empty = true
          return ''
        }
        return value
      })
      // "({classes})" with no classes: drop the empty brackets rather than the whole first line.
      if (empty && line.includes('{child}')) {
        return filled.replace(/\s*[(（]\s*[)）]/g, '')
      }
      return empty ? null : filled
    })
    .filter((line): line is string => line !== null)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
