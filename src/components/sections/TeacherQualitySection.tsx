import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { cn } from '../../lib/cn'
import {
  fetchQualityLessons,
  fetchQualityPeriods,
  fetchQualitySettings,
  fetchRosterCounts,
  lessonIsOver,
  monthBounds,
  qualityErrorMessage,
  retentionByTeacher,
  scoreTeachers,
  shiftMonth,
  DEFAULT_QUALITY_SETTINGS,
  type MonthRetention,
  type QualityLesson,
  type QualityPeriod,
  type QualitySettings,
  type Ratio,
  type RedKey,
  type TeacherScore,
} from '../../lib/classQuality'
import { monthName } from '../../lib/progressCards'
import { QualitySettingsForm } from '../quality/QualitySettingsForm'

// Teacher quality (management): each teacher's month in numbers, how many of their students stay, and the settings of
// the alerts that Automations sends (the flows "Class alerts", "Student care", "Good news").

type Tab = 'scorecard' | 'retention' | 'settings'

export type TeacherQualitySectionProps = {
  teachers: { id: number; fullName: string }[]
  canEdit: boolean
  // Fixed "today" for tests.
  today?: string
}

const thisMonth = (today: string) => `${today.slice(0, 7)}-01`

const COLUMNS: { key: keyof Omit<TeacherScore, 'teacherId' | 'lessons'>; label: string; red: RedKey | null; hint: string }[] = [
  { key: 'attendance', label: 'Attendance', red: 'attendance', hint: 'Children marked present of all marked' },
  { key: 'participation', label: 'Time in class', red: 'participation', hint: 'Average % of the lesson in Zoom, of those who came' },
  { key: 'right', label: 'Answers right', red: 'right', hint: 'Right of all answers marked' },
  { key: 'onTime', label: 'Started on time', red: 'on_time', hint: 'Teacher in the Zoom by the start (plus the minutes allowed)' },
  { key: 'recording', label: 'Recording on time', red: 'recording', hint: 'Zoom lessons with a recording in time' },
  { key: 'feedback', label: 'Attendance sent on time', red: 'feedback', hint: 'Attendance sent within the hours allowed after the lesson' },
  { key: 'comments', label: 'Comments', red: null, hint: 'Children present who got a rating or remark' },
]

// showCount: an average (time in class) has no "x of y" to show.
function Cell({ value, previous, red, showCount }: { value: Ratio; previous: Ratio | undefined; red: number | null; showCount: boolean }) {
  if (value.percent === null) {
    return <span className="text-slate-400">–</span>
  }
  const change = previous?.percent !== null && previous?.percent !== undefined ? value.percent - previous.percent : null
  const low = red !== null && value.percent < red
  return (
    <span className={cn('inline-flex flex-col rounded-md px-1.5 py-0.5', low && 'bg-red-50 text-red-800')}>
      <span className="font-semibold">
        {value.percent}%
        {change !== null && change !== 0 && (
          <span className={cn('ml-1 text-[11px] font-semibold', change > 0 ? 'text-emerald-700' : 'text-red-700')}>
            {change > 0 ? '▲' : '▼'}
            {Math.abs(change)}
          </span>
        )}
      </span>
      {showCount && <span className="text-[11px] text-slate-500">{`${value.part}/${value.whole}`}</span>}
    </span>
  )
}

const mark = (value: boolean | null) => (value === null ? '–' : value ? '✓' : '✗')

function LessonRows({ lessons, now }: { lessons: QualityLesson[]; now: number }) {
  const over = lessons.filter((lesson) => lessonIsOver(lesson, now))
  if (over.length === 0) {
    return <p className="px-3 py-2 text-sm text-slate-500">No lessons this month.</p>
  }
  return (
    <table className="w-full text-xs">
      <thead className="text-slate-500">
        <tr>
          <th className="px-2 py-1 text-left font-medium">Date</th>
          <th className="px-2 py-1 text-left font-medium">Class</th>
          <th className="px-2 py-1 text-left font-medium">Attendance</th>
          <th className="px-2 py-1 text-left font-medium">Time in class</th>
          <th className="px-2 py-1 text-left font-medium">Answers right</th>
          <th className="px-2 py-1 text-left font-medium">On time</th>
          <th className="px-2 py-1 text-left font-medium">Recording</th>
          <th className="px-2 py-1 text-left font-medium">Sent</th>
        </tr>
      </thead>
      <tbody>
        {over.map((lesson) => (
          <tr key={lesson.sessionId} className="border-t border-slate-100">
            <td className="px-2 py-1">{lesson.lessonDate}</td>
            <td className="px-2 py-1">
              {lesson.classroomName ?? '–'}
              {lesson.substitute && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">substitute</span>}
            </td>
            <td className="px-2 py-1">{lesson.marked > 0 ? `${lesson.attended}/${lesson.marked}` : '–'}</td>
            <td className="px-2 py-1">
              {lesson.participationCount > 0 ? `${Math.round(lesson.participationSum / lesson.participationCount)}%` : '–'}
            </td>
            <td className="px-2 py-1">
              {lesson.correct + lesson.wrong > 0 ? `${Math.round((lesson.correct / (lesson.correct + lesson.wrong)) * 100)}%` : '–'}
            </td>
            <td className="px-2 py-1">{mark(lesson.startedOnTime)}</td>
            <td className="px-2 py-1">{mark(lesson.recordingOnTime)}</td>
            <td className="px-2 py-1">{mark(lesson.attendanceOnTime)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function RetentionCell({ value, onOpen, open }: { value: MonthRetention; onOpen: () => void; open: boolean }) {
  if (value.rate === null) {
    return <span className="text-slate-400">–</span>
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-expanded={open}
      className={cn('rounded-md px-1.5 py-0.5 text-left hover:bg-slate-100', open && 'bg-slate-100')}
    >
      <span className="block font-semibold">{value.rate}%</span>
      <span className="block text-[11px] text-slate-500">
        −{value.stopped.length} +{value.added.length}
      </span>
    </button>
  )
}

function PeopleList({ title, people }: { title: string; people: QualityPeriod[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-slate-600">
        {title} ({people.length})
      </h4>
      {people.length === 0 ? (
        <p className="text-xs text-slate-400">Nobody.</p>
      ) : (
        <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
          {people.map((period) => (
            <li key={`${title}-${period.periodId}`}>
              {period.studentCode ? `${period.studentCode} · ` : ''}
              {period.studentName} — {period.classroomName} ({title === 'Stopped' ? period.endDate : period.startDate})
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function TeacherQualitySection({ teachers, canEdit, today }: TeacherQualitySectionProps) {
  const now = useMemo(() => (today ? Date.parse(`${today}T23:59:59+08:00`) : Date.now()), [today])
  const todayDate = today ?? new Date(now + 8 * 3600_000).toISOString().slice(0, 10)
  const [tab, setTab] = useState<Tab>('scorecard')
  const [month, setMonth] = useState(thisMonth(todayDate))
  const [lessons, setLessons] = useState<QualityLesson[]>([])
  const [periods, setPeriods] = useState<QualityPeriod[]>([])
  const [changesFrom, setChangesFrom] = useState<string | null>(null)
  const [settings, setSettings] = useState<QualitySettings>(DEFAULT_QUALITY_SETTINGS)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [openTeacher, setOpenTeacher] = useState<number | null>(null)
  const [openCell, setOpenCell] = useState<{ teacherId: number; month: string } | null>(null)

  const months = useMemo(() => Array.from({ length: 6 }, (_, index) => shiftMonth(month, index - 5)), [month])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const previous = shiftMonth(month, -1)
      const [rows, stays, counts, saved] = await Promise.all([
        fetchQualityLessons(monthBounds(previous).from, monthBounds(month).to),
        fetchQualityPeriods(monthBounds(months[0]).from, monthBounds(month).to),
        fetchRosterCounts(),
        fetchQualitySettings(),
      ])
      setLessons(rows)
      setPeriods(stays)
      setChangesFrom(counts.changesFrom)
      setSettings(saved)
    } catch (problem) {
      setError(qualityErrorMessage(problem, 'Could not load the numbers.'))
    } finally {
      setLoading(false)
    }
  }, [month, months])

  useEffect(() => {
    void load()
  }, [load])

  const name = (id: number) => teachers.find((teacher) => teacher.id === id)?.fullName ?? `Teacher #${id}`
  const { from } = monthBounds(month)
  const thisMonthLessons = lessons.filter((lesson) => lesson.lessonDate >= from)
  const scores = scoreTeachers(thisMonthLessons, now).sort((a, b) => name(a.teacherId).localeCompare(name(b.teacherId)))
  const previous = new Map(scoreTeachers(lessons.filter((lesson) => lesson.lessonDate < from), now).map((score) => [score.teacherId, score]))
  const retention = retentionByTeacher(periods, months, changesFrom)
  const retentionTeachers = [...retention.keys()].sort((a, b) => name(a).localeCompare(name(b)))

  return (
    <section aria-labelledby="teacher-quality-title" className="mx-auto w-full max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="teacher-quality-title" className="text-lg font-semibold text-slate-900">
            Teacher quality
          </h2>
          <p className="text-sm text-slate-500">Each teacher's month, and how many of their students stay.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Month
          <input
            type="month"
            aria-label="Month"
            value={month.slice(0, 7)}
            max={todayDate.slice(0, 7)}
            onChange={(event) => event.target.value && setMonth(`${event.target.value}-01`)}
            className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
        </label>
      </div>

      <div role="tablist" aria-label="Teacher quality" className="flex gap-1 border-b border-slate-200">
        {(
          [
            ['scorecard', 'Scorecard'],
            ['retention', 'Retention'],
            ['settings', 'Alert settings'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-semibold',
              tab === key ? 'border-[#fc0c97] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="text-sm text-slate-500">Loading…</p>}

      {!loading && !error && tab === 'scorecard' && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Teacher</th>
                <th className="px-3 py-2 text-left font-semibold">Lessons</th>
                {COLUMNS.map((column) => (
                  <th key={column.key} title={column.hint} className="px-3 py-2 text-left font-semibold">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {scores.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length + 2} className="px-3 py-6 text-center text-slate-500">
                    No lessons in {monthName(month)} yet.
                  </td>
                </tr>
              )}
              {scores.map((score) => (
                <Fragment key={score.teacherId}>
                  <tr className="border-t border-slate-100 align-top">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        aria-expanded={openTeacher === score.teacherId}
                        onClick={() => setOpenTeacher((value) => (value === score.teacherId ? null : score.teacherId))}
                        className="font-semibold text-slate-900 hover:underline"
                      >
                        {name(score.teacherId)}
                      </button>
                    </td>
                    <td className="px-3 py-2">{score.lessons}</td>
                    {COLUMNS.map((column) => (
                      <td key={column.key} className="px-3 py-2">
                        <Cell
                          value={score[column.key]}
                          showCount={column.key !== 'participation'}
                          previous={previous.get(score.teacherId)?.[column.key]}
                          red={column.red ? settings.red[column.red] : null}
                        />
                      </td>
                    ))}
                  </tr>
                  {openTeacher === score.teacherId && (
                    <tr className="bg-slate-50">
                      <td colSpan={COLUMNS.length + 2} className="px-3 py-2">
                        <LessonRows lessons={thisMonthLessons.filter((lesson) => lesson.teacherId === score.teacherId)} now={now} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-xs text-slate-500">
            ▲▼ compare with the month before. Red is below the line set in Alert settings. A substitute's lessons count for the
            substitute.
          </p>
        </div>
      )}

      {!loading && !error && tab === 'retention' && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Teacher</th>
                  {months.map((entry) => (
                    <th key={entry} className="px-3 py-2 text-left font-semibold">
                      {monthName(entry)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {retentionTeachers.length === 0 && (
                  <tr>
                    <td colSpan={months.length + 1} className="px-3 py-6 text-center text-slate-500">
                      No students in counted classes.
                    </td>
                  </tr>
                )}
                {retentionTeachers.map((teacherId) => (
                  <tr key={teacherId} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-900">{name(teacherId)}</td>
                    {(retention.get(teacherId) ?? []).map((value) => (
                      <td key={value.month} className="px-3 py-2">
                        <RetentionCell
                          value={value}
                          open={openCell?.teacherId === teacherId && openCell.month === value.month}
                          onOpen={() =>
                            setOpenCell((current) =>
                              current?.teacherId === teacherId && current.month === value.month ? null : { teacherId, month: value.month },
                            )
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-xs text-slate-500">
              % = students still in class at the end of the month, of those in class during it. −stopped +added, counted the
              way the Students roster counts them (a class change is one stopped and one added
              {changesFrom ? `; changes from ${changesFrom}` : ''}). Only the class categories ticked for the roster count.
            </p>
          </div>
          {openCell &&
            (() => {
              const value = retention.get(openCell.teacherId)?.find((entry) => entry.month === openCell.month)
              return value ? (
                <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
                  <PeopleList title="Stopped" people={value.stopped} />
                  <PeopleList title="Added" people={value.added} />
                </div>
              ) : null
            })()}
        </div>
      )}

      {!loading && !error && tab === 'settings' && (
        <QualitySettingsForm settings={settings} canEdit={canEdit} onSaved={setSettings} />
      )}
    </section>
  )
}
