import { supabase } from './supabase'

// How subjects are counted for retention (the same setting the Students roster uses, app_settings 'student_roster').
// No categories ticked: every class category that works like a regular class. changesFrom null: 1 January of this year.
export type RosterCounts = { countCategories: string[]; changesFrom: string | null }

function readRosterCounts(value: unknown): RosterCounts {
  const raw = (value ?? {}) as { count_categories?: unknown; changes_from?: unknown }
  return {
    countCategories: Array.isArray(raw.count_categories) ? raw.count_categories.filter((name): name is string => typeof name === 'string') : [],
    changesFrom: typeof raw.changes_from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.changes_from) ? raw.changes_from : null,
  }
}

// Teacher quality: the scorecard (one row per teacher and month), retention (stayed / stopped / added, the roster
// table's rule) and the school's alert settings. The database gives one row per lesson (quality_lessons) and the stays
// in counted classes (quality_periods); the adding up is done here so it can be tested.

export const ALERT_KINDS = [
  'low_score',
  'attendance_drop',
  'late_start',
  'absent_streak',
  'low_participation',
  'leaves_early',
  'first_place',
  'all_correct',
  'high_rating',
] as const
export type AlertKind = (typeof ALERT_KINDS)[number]

export const RED_KEYS = ['attendance', 'participation', 'right', 'on_time', 'recording', 'feedback'] as const
export type RedKey = (typeof RED_KEYS)[number]

export type QualitySettings = {
  alerts: Record<AlertKind, boolean>
  low_score_percent: number
  low_score_lessons: number
  attendance_drop_lessons: number
  late_start_minutes: number
  absent_lessons: number
  participation_percent: number
  early_minutes: number
  early_lessons: number
  early_window: number
  all_correct_min: number
  high_rating_percent: number
  feedback_hours: number
  recording_hours: number
  red: Record<RedKey, number>
  // What parents read (the progress card, the good news message): Malaysian Chinese or English.
  parent_language: ParentLanguage
  good_news_draft: string
  card_text: string
}

export type ParentLanguage = 'zh' | 'en'

// The default texts for parents, per language (the school can change them).
export const PARENT_TEXTS: Record<ParentLanguage, { card: string; goodNews: string }> = {
  zh: {
    card: '📚 {child}（{classes}）{month}学习报告\n✅ 出席：{attended}/{lessons} 堂课\n📝 Quiz 成绩：答对 {score} 题{right_change}\n⏱️ 上课时间：{time}%\n💬 {teacher}：「{remark}」\n\n谢谢您的支持，我们一起继续加油！— {school}',
    goodNews: '{parent}您好！跟您分享一个好消息：{child}{news} 🎉 继续加油哦！',
  },
  en: {
    card: '📚 {child} — {month} progress ({classes})\n✅ Attended {attended} of {lessons} classes\n📝 Quiz: {score} answers right{right_change}\n⏱️ Time in class: {time}%\n💬 {teacher}: "{remark}"\n\nKeep it up! — {school}',
    goodNews: 'Hi {parent}, great news! {child} {news} 🎉 Well done!',
  },
}

export const DEFAULT_QUALITY_SETTINGS: QualitySettings = {
  alerts: Object.fromEntries(ALERT_KINDS.map((kind) => [kind, true])) as Record<AlertKind, boolean>,
  low_score_percent: 50,
  low_score_lessons: 2,
  attendance_drop_lessons: 3,
  late_start_minutes: 5,
  absent_lessons: 2,
  participation_percent: 40,
  early_minutes: 5,
  early_lessons: 2,
  early_window: 3,
  all_correct_min: 3,
  high_rating_percent: 90,
  feedback_hours: 24,
  recording_hours: 24,
  red: { attendance: 80, participation: 60, right: 50, on_time: 90, recording: 90, feedback: 90 },
  parent_language: 'zh',
  good_news_draft: PARENT_TEXTS.zh.goodNews,
  card_text: PARENT_TEXTS.zh.card,
}

const NUMBER_KEYS = [
  'low_score_percent',
  'low_score_lessons',
  'attendance_drop_lessons',
  'late_start_minutes',
  'absent_lessons',
  'participation_percent',
  'early_minutes',
  'early_lessons',
  'early_window',
  'all_correct_min',
  'high_rating_percent',
  'feedback_hours',
  'recording_hours',
] as const
export type QualityNumberKey = (typeof NUMBER_KEYS)[number]

// What the page shows from what the database gave (anything odd falls back to the default).
export function readQualitySettings(raw: unknown): QualitySettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const number = (key: QualityNumberKey) =>
    typeof value[key] === 'number' && Number.isInteger(value[key]) ? (value[key] as number) : DEFAULT_QUALITY_SETTINGS[key]
  const alerts = (value.alerts && typeof value.alerts === 'object' ? value.alerts : {}) as Record<string, unknown>
  const red = (value.red && typeof value.red === 'object' ? value.red : {}) as Record<string, unknown>
  return {
    ...(Object.fromEntries(NUMBER_KEYS.map((key) => [key, number(key)])) as Pick<QualitySettings, QualityNumberKey>),
    alerts: Object.fromEntries(
      ALERT_KINDS.map((kind) => [kind, typeof alerts[kind] === 'boolean' ? alerts[kind] : true]),
    ) as Record<AlertKind, boolean>,
    red: Object.fromEntries(
      RED_KEYS.map((key) => [key, typeof red[key] === 'number' ? (red[key] as number) : DEFAULT_QUALITY_SETTINGS.red[key]]),
    ) as Record<RedKey, number>,
    parent_language: value.parent_language === 'en' ? 'en' : 'zh',
    good_news_draft:
      typeof value.good_news_draft === 'string' && value.good_news_draft.trim() !== ''
        ? value.good_news_draft
        : DEFAULT_QUALITY_SETTINGS.good_news_draft,
    card_text:
      typeof value.card_text === 'string' && value.card_text.trim() !== '' ? value.card_text : DEFAULT_QUALITY_SETTINGS.card_text,
  }
}

// What changed, as the database takes it (only the keys that are different).
export function settingsChange(before: QualitySettings, after: QualitySettings): Partial<QualitySettings> {
  const change: Record<string, unknown> = {}
  for (const key of Object.keys(after) as (keyof QualitySettings)[]) {
    if (JSON.stringify(after[key]) !== JSON.stringify(before[key])) {
      change[key] = after[key]
    }
  }
  return change as Partial<QualitySettings>
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  return supabase
}

export function qualityErrorMessage(error: unknown, fallback: string) {
  const { code, message } = (error ?? {}) as { code?: string; message?: string }
  if (code === '42883' || code === 'PGRST202') {
    return "This page can't be used until the database update for it is applied."
  }
  return message || fallback
}

export async function fetchQualitySettings(): Promise<QualitySettings> {
  const { data, error } = await requireSupabase().rpc('class_quality_settings')
  if (error) {
    throw error
  }
  return readQualitySettings(data)
}

// Saves only what changed: the new settings, or the reason it was not saved.
export async function saveQualitySettings(change: Partial<QualitySettings>): Promise<QualitySettings | string> {
  const { data, error } = await requireSupabase().rpc('set_class_quality', { p_value: change })
  if (error) {
    return qualityErrorMessage(error, 'Could not save the settings.')
  }
  return readQualitySettings(data)
}

// How the roster table counts subjects (department 3): which classes count, and from which day stays are counted.
export async function fetchRosterCounts(): Promise<RosterCounts> {
  const { data } = await requireSupabase().from('app_settings').select('value').eq('key', 'student_roster').maybeSingle()
  return readRosterCounts(data?.value)
}

// ---- one row per lesson

export type QualityLesson = {
  sessionId: number
  lessonDate: string
  status: string | null
  startsAt: string
  endsAt: string
  classroomId: number | null
  classroomName: string | null
  teacherId: number
  substitute: boolean
  hasZoom: boolean
  marked: number
  attended: number
  participationSum: number
  participationCount: number
  correct: number
  wrong: number
  questions: number
  teacherJoinedAt: string | null
  startedOnTime: boolean | null
  recordingAt: string | null
  recordingOnTime: boolean | null
  attendanceSentAt: string | null
  attendanceOnTime: boolean | null
  presentLogged: number
  commented: number
}

type LessonRow = {
  session_id: number
  lesson_date: string
  status: string | null
  starts_at: string
  ends_at: string
  classroom_id: number | null
  classroom_name: string | null
  teacher_id: number
  substitute: boolean
  has_zoom: boolean
  marked: number
  attended: number
  participation_sum: number
  participation_count: number
  correct: number
  wrong: number
  questions: number
  teacher_joined_at: string | null
  started_on_time: boolean | null
  recording_at: string | null
  recording_on_time: boolean | null
  attendance_sent_at: string | null
  attendance_on_time: boolean | null
  present_logged: number
  commented: number
}

export function mapQualityLesson(row: LessonRow): QualityLesson {
  return {
    sessionId: row.session_id,
    lessonDate: row.lesson_date,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    classroomId: row.classroom_id,
    classroomName: row.classroom_name,
    teacherId: row.teacher_id,
    substitute: row.substitute,
    hasZoom: row.has_zoom,
    marked: row.marked,
    attended: row.attended,
    participationSum: row.participation_sum,
    participationCount: row.participation_count,
    correct: row.correct,
    wrong: row.wrong,
    questions: row.questions,
    teacherJoinedAt: row.teacher_joined_at,
    startedOnTime: row.started_on_time,
    recordingAt: row.recording_at,
    recordingOnTime: row.recording_on_time,
    attendanceSentAt: row.attendance_sent_at,
    attendanceOnTime: row.attendance_on_time,
    presentLogged: row.present_logged,
    commented: row.commented,
  }
}

export async function fetchQualityLessons(from: string, to: string): Promise<QualityLesson[]> {
  const { data, error } = await requireSupabase().rpc('quality_lessons', { p_from: from, p_to: to })
  if (error) {
    throw error
  }
  return ((data ?? []) as LessonRow[]).map(mapQualityLesson)
}

// ---- the scorecard

export type Ratio = { part: number; whole: number; percent: number | null }

const ratio = (part: number, whole: number): Ratio => ({
  part,
  whole,
  percent: whole > 0 ? Math.round((part / whole) * 100) : null,
})

export type TeacherScore = {
  teacherId: number
  lessons: number
  attendance: Ratio
  // The average % of the lesson the children who came spent in it (a mean, so part/whole are the sum and count).
  participation: Ratio
  right: Ratio
  onTime: Ratio
  recording: Ratio
  feedback: Ratio
  comments: Ratio
}

// A lesson counts once it is over (ended by the teacher, or past its end time).
export function lessonIsOver(lesson: QualityLesson, now = Date.now()) {
  return lesson.status === 'ended' || Date.parse(lesson.endsAt) < now
}

// One row per teacher: the lessons they taught (a substitute's lessons count for the substitute).
export function scoreTeachers(lessons: QualityLesson[], now = Date.now()): TeacherScore[] {
  const byTeacher = new Map<number, QualityLesson[]>()
  for (const lesson of lessons) {
    if (!lessonIsOver(lesson, now)) continue
    byTeacher.set(lesson.teacherId, [...(byTeacher.get(lesson.teacherId) ?? []), lesson])
  }
  const sum = (list: QualityLesson[], pick: (lesson: QualityLesson) => number) => list.reduce((total, lesson) => total + pick(lesson), 0)
  const count = (list: QualityLesson[], test: (lesson: QualityLesson) => boolean) => list.filter(test).length
  return [...byTeacher.entries()].map(([teacherId, list]) => {
    const started = list.filter((lesson) => lesson.startedOnTime !== null)
    const recorded = list.filter((lesson) => lesson.recordingOnTime !== null)
    const sent = list.filter((lesson) => lesson.attendanceOnTime !== null)
    const participationCount = sum(list, (lesson) => lesson.participationCount)
    return {
      teacherId,
      lessons: list.length,
      attendance: ratio(sum(list, (lesson) => lesson.attended), sum(list, (lesson) => lesson.marked)),
      participation: {
        part: sum(list, (lesson) => lesson.participationSum),
        whole: participationCount,
        percent: participationCount > 0 ? Math.round(sum(list, (lesson) => lesson.participationSum) / participationCount) : null,
      },
      right: ratio(sum(list, (lesson) => lesson.correct), sum(list, (lesson) => lesson.correct + lesson.wrong)),
      onTime: ratio(count(started, (lesson) => lesson.startedOnTime === true), started.length),
      recording: ratio(count(recorded, (lesson) => lesson.recordingOnTime === true), recorded.length),
      feedback: ratio(count(sent, (lesson) => lesson.attendanceOnTime === true), sent.length),
      comments: ratio(sum(list, (lesson) => lesson.commented), sum(list, (lesson) => lesson.presentLogged)),
    }
  })
}

// ---- retention

export type QualityPeriod = {
  periodId: number
  studentId: number
  studentName: string
  studentCode: string | null
  classroomId: number
  classroomName: string
  teacherId: number | null
  startDate: string | null
  endDate: string | null
}

type PeriodRow = {
  period_id: number
  student_id: number
  student_name: string
  student_code: string | null
  classroom_id: number
  classroom_name: string
  teacher_id: number | null
  start_date: string | null
  end_date: string | null
}

export async function fetchQualityPeriods(from: string, to: string): Promise<QualityPeriod[]> {
  const { data, error } = await requireSupabase().rpc('quality_periods', { p_from: from, p_to: to })
  if (error) {
    throw error
  }
  return ((data ?? []) as PeriodRow[]).map((row) => ({
    periodId: row.period_id,
    studentId: row.student_id,
    studentName: row.student_name,
    studentCode: row.student_code,
    classroomId: row.classroom_id,
    classroomName: row.classroom_name,
    teacherId: row.teacher_id,
    startDate: row.start_date,
    endDate: row.end_date,
  }))
}

export type MonthRetention = {
  month: string
  atStart: number
  added: QualityPeriod[]
  stopped: QualityPeriod[]
  // In class at the start or added, and not stopped by the end of the month.
  stayed: number
  // stayed ÷ (at the start + added); null when nobody was in class.
  rate: number | null
}

// "2026-10-01" → the first and last day of that month.
export function monthBounds(month: string) {
  const [year, number] = month.split('-').map(Number)
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate()
  const mm = String(number).padStart(2, '0')
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, '0')}` }
}

// The month before / after "2026-10-01".
export function shiftMonth(month: string, by: number) {
  const [year, number] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, number - 1 + by, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
}

// The roster table's rule (department 3): a stay that ended in the month is one stopped, one that began is one added
// (a class change is both), both counted only from `changesFrom` (1 January of the month's year when not set).
export function retentionFor(periods: QualityPeriod[], month: string, changesFrom: string | null): MonthRetention {
  const { from, to } = monthBounds(month)
  const countFrom = changesFrom ?? `${month.slice(0, 4)}-01-01`
  const counts = (date: string | null) => date !== null && date >= from && date <= to && date >= countFrom
  const atStart = periods.filter(
    (period) => (period.startDate === null || period.startDate < from) && (period.endDate === null || period.endDate >= from),
  )
  const added = periods.filter((period) => counts(period.startDate))
  const stopped = periods.filter((period) => counts(period.endDate))
  const base = atStart.length + added.length
  const stayed = Math.max(base - stopped.length, 0)
  return { month, atStart: atStart.length, added, stopped, stayed, rate: base > 0 ? Math.round((stayed / base) * 100) : null }
}

// Per teacher (the class's main teacher), month by month.
export function retentionByTeacher(periods: QualityPeriod[], months: string[], changesFrom: string | null) {
  const byTeacher = new Map<number, QualityPeriod[]>()
  for (const period of periods) {
    if (period.teacherId === null) continue
    byTeacher.set(period.teacherId, [...(byTeacher.get(period.teacherId) ?? []), period])
  }
  return new Map(
    [...byTeacher.entries()].map(([teacherId, list]) => [teacherId, months.map((month) => retentionFor(list, month, changesFrom))]),
  )
}
