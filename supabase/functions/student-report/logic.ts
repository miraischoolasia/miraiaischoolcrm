// Pure parts of the student-report function (no Deno, no network), so the
// CRM's tests can check them.

export type Audience = 'teacher' | 'parent'

export type ReportSources = {
  reviews: boolean
  remarks: boolean
  attendance: boolean
  points: boolean
}

export type ReportSettings = {
  sources: ReportSources
  language: string
  instructions: string
}

export const defaultReportSettings: ReportSettings = {
  sources: { reviews: true, remarks: true, attendance: true, points: true },
  language: 'English',
  instructions: '',
}

export type LessonFact = {
  date: string
  status: string
  attended: boolean
  // criterion name -> score out of its top score
  scores: Array<{ criterion: string; score: number; max: number; remark: string | null }>
  lessonRemark: string | null
}

export type StudentFacts = {
  firstName: string
  age: number | null
  className: string | null
  lessons: LessonFact[]
  points: { total: number; recent: string[] } | null
}

export type StudentReport = {
  summary: string
  strengths: string[]
  needs: string[]
  next_steps: string[]
  message: string
}

export function readSettings(value: unknown): ReportSettings {
  const raw = (value && typeof value === 'object' ? value : {}) as Partial<ReportSettings>
  const sources = { ...defaultReportSettings.sources, ...(raw.sources ?? {}) }
  return {
    sources,
    language: typeof raw.language === 'string' && raw.language.trim() ? raw.language.trim() : 'English',
    instructions: typeof raw.instructions === 'string' ? raw.instructions.slice(0, 1000) : '',
  }
}

// Only the first word of the name goes to the AI service.
export function firstNameOf(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || 'The student'
}

function average(values: number[]) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
}

// The facts the AI reads, as plain lines, using only the sources the school
// switched on. Lessons are oldest first so trends read naturally.
export function buildFacts(facts: StudentFacts, sources: ReportSources) {
  const lines: string[] = []
  lines.push(`Student: ${facts.firstName}${facts.age !== null ? `, ${facts.age} years old` : ''}`)
  if (facts.className) lines.push(`Class: ${facts.className}`)

  const lessons = [...facts.lessons].sort((left, right) => left.date.localeCompare(right.date))

  if (sources.attendance) {
    const counts = new Map<string, number>()
    for (const lesson of lessons) counts.set(lesson.status, (counts.get(lesson.status) ?? 0) + 1)
    lines.push(
      `Attendance over the last ${lessons.length} lessons: ` +
        (lessons.length === 0 ? 'none recorded' : Array.from(counts, ([status, count]) => `${status} ${count}`).join(', ')),
    )
  }

  if (sources.reviews) {
    const byCriterion = new Map<string, { max: number; first: number[]; second: number[] }>()
    const attended = lessons.filter((lesson) => lesson.attended && lesson.scores.length > 0)
    const half = Math.ceil(attended.length / 2)
    attended.forEach((lesson, index) => {
      for (const entry of lesson.scores) {
        const bucket = byCriterion.get(entry.criterion) ?? { max: entry.max, first: [], second: [] }
        ;(index < half ? bucket.first : bucket.second).push(entry.score)
        byCriterion.set(entry.criterion, bucket)
      }
    })
    if (byCriterion.size > 0) {
      lines.push('Teacher ratings (average; earlier half -> later half of the lessons):')
      for (const [criterion, bucket] of byCriterion) {
        const all = average([...bucket.first, ...bucket.second])
        const before = average(bucket.first)
        const after = average(bucket.second)
        const trend = before !== null && after !== null ? `, ${before.toFixed(1)} -> ${after.toFixed(1)}` : ''
        lines.push(`- ${criterion}: ${all?.toFixed(1)} out of ${bucket.max}${trend}`)
      }
    }
  }

  if (sources.remarks) {
    const remarks = lessons.flatMap((lesson) => [
      ...(lesson.lessonRemark ? [`${lesson.date}: ${lesson.lessonRemark}`] : []),
      ...lesson.scores.flatMap((entry) => (entry.remark ? [`${lesson.date} (${entry.criterion}): ${entry.remark}`] : [])),
    ])
    if (remarks.length > 0) {
      lines.push("Teacher's notes:")
      for (const remark of remarks.slice(-20)) lines.push(`- ${remark.slice(0, 300)}`)
    }
  }

  if (sources.points && facts.points) {
    lines.push(`Reward points: ${facts.points.total}`)
    if (facts.points.recent.length > 0) lines.push(`Recent rewards: ${facts.points.recent.slice(0, 10).join('; ')}`)
  }

  return lines.join('\n')
}

export function buildSystemPrompt(audience: Audience, settings: ReportSettings, schoolName: string) {
  const reader =
    audience === 'teacher'
      ? 'the class teacher, who wants a short, honest, practical picture to plan the next lessons'
      : "the student's parent; write warmly and simply, start with something good, never compare with other children, and make the message ready to send on WhatsApp"
  return [
    `You analyse one student's progress for ${schoolName}. The reader is ${reader}.`,
    `Write everything in ${settings.language}.`,
    'Use only the facts given. Do not invent lessons, scores or events. If there is little data, say so briefly.',
    'Answer with JSON only: {"summary": string (2-3 sentences), "strengths": string[] (up to 3), "needs": string[] (up to 3), "next_steps": string[] (up to 3 concrete actions), "message": string}.',
    audience === 'parent'
      ? '"message" is the note to the parent (4-6 short lines).'
      : '"message" is one sentence the teacher could say to the student to encourage them.',
    settings.instructions.trim() ? `The school's own guidance: ${settings.instructions.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '').map((entry) => entry.trim()).slice(0, 5)
    : []
}

// The model's JSON, cleaned; null when it is not usable.
export function parseReport(text: string): StudentReport | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const raw = parsed as Record<string, unknown>
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : ''
  if (!summary) return null
  return {
    summary: summary.slice(0, 1500),
    strengths: stringList(raw.strengths),
    needs: stringList(raw.needs),
    next_steps: stringList(raw.next_steps),
    message: typeof raw.message === 'string' ? raw.message.trim().slice(0, 2000) : '',
  }
}
