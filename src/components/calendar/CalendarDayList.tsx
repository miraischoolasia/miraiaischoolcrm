import { useMemo, useState } from 'react'
import { CaretLeft, CaretRight, Funnel, UsersThree, CalendarBlank, CaretDown, Check } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { parseLocalDate } from '../../domain/studentStatus'
import { describeClassTiming, formatClockTime, getWeekRange, addDays } from '../../lib/teacherAgenda'
import {
  busyLevel,
  groupBySlot,
  matchesFilter,
  monthWeeks,
  NO_FILTER,
  shiftMonth,
  shortGrade,
  subjectTone,
  type DayListFilter,
  type DayListItem,
  type DayListLesson,
} from '../../lib/calendarDayList'

export type CalendarView = 'dayGridMonth' | 'timeGridWeek' | 'listWeek'

type CalendarDayListProps = {
  today: string
  now: Date
  date: string
  onSelectDate: (date: string) => void
  monthKey: string
  onMonthChange: (monthKey: string) => void
  // Every class on the days shown (the month's weeks and the chosen day's week); the filters work here.
  lessons: DayListLesson[]
  // The school's grades in its own order (Class Settings > Class options).
  grades: string[]
  // Tasks, meetings, events and follow-ups on the same days (already filtered by the Calendar's filters).
  items?: DayListItem[]
  onOpenItem?: (item: DayListItem) => void
  // The Calendar's own filters (only mine, people, kinds) are narrowing what is shown.
  filteredOutside?: boolean
  onOpenLesson: (lesson: DayListLesson) => void
  onTakeAttendance: (lesson: DayListLesson) => void
  onRunLive?: (lesson: DayListLesson) => void
  onShowCalendar: (view: CalendarView) => void
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const chip = 'rounded-full border px-3 py-1 text-xs font-semibold transition'
const chipOn = 'border-[#fc0c97] bg-[#fff1f8] text-[#be185d]'
const chipOff = 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
const smallButton = 'rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50'

const ITEM_KIND: Record<DayListItem['kind'], { label: string; tag: string }> = {
  task: { label: 'Task', tag: 'bg-slate-100 text-slate-700' },
  meeting: { label: 'Meeting', tag: 'bg-sky-100 text-sky-800' },
  event: { label: 'Event', tag: 'bg-amber-100 text-amber-800' },
  follow_up: { label: 'Follow-up', tag: 'bg-pink-100 text-pink-800' },
  orphan: { label: 'No class', tag: 'bg-red-100 text-red-800' },
}

const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? '' : word.endsWith('s') ? 'es' : 's'}`

function longDate(date: string) {
  const day = parseLocalDate(date)
  return `${WEEKDAY[day.getDay()]}, ${day.getDate()} ${MONTHS[day.getMonth()].slice(0, 3)}`
}

// The Calendar page of a school with many classes a day: a small month with how many classes each day,
// filters, and the chosen day's classes by start time as small cards. A card names no students; the class
// window has the list, attendance, Live class, Zoom and the Facebook group.
export function CalendarDayList({
  today,
  now,
  date,
  onSelectDate,
  monthKey,
  onMonthChange,
  lessons,
  grades,
  items = [],
  onOpenItem,
  filteredOutside = false,
  onOpenLesson,
  onTakeAttendance,
  onRunLive,
  onShowCalendar,
}: CalendarDayListProps) {
  const [filter, setFilter] = useState<DayListFilter>(NO_FILTER)
  const [openEnded, setOpenEnded] = useState<string[]>([])
  const [phonePanel, setPhonePanel] = useState<'month' | 'filters' | null>(null)

  const shown = useMemo(() => lessons.filter((lesson) => matchesFilter(lesson, filter)), [lessons, filter])
  // Each day: how many classes, and how many tasks, meetings, events and follow-ups.
  const countByDay = useMemo(() => {
    const counts = new Map<string, number>()
    for (const entry of [...shown, ...items]) counts.set(entry.date, (counts.get(entry.date) ?? 0) + 1)
    return counts
  }, [shown, items])
  const othersByDay = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of items) counts.set(item.date, (counts.get(item.date) ?? 0) + 1)
    return counts
  }, [items])
  const dayLabel = (day: string) => {
    const others = othersByDay.get(day) ?? 0
    const classes = (countByDay.get(day) ?? 0) - others
    return `${longDate(day)}: ${plural(classes, 'class')}${others ? `, ${others} other` : ''}`
  }
  const weeks = useMemo(() => monthWeeks(monthKey), [monthKey])
  const most = Math.max(0, ...weeks.flat().map((day) => (day.slice(0, 7) === monthKey ? countByDay.get(day) ?? 0 : 0)))
  const dayLessons = shown.filter((lesson) => lesson.date === date)
  const dayItems = items
    .filter((item) => item.date === date)
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.title.localeCompare(b.title))
  const slots = groupBySlot(dayLessons, grades)
  const subjects = [...new Set(lessons.map((lesson) => lesson.subject).filter((subject): subject is string => Boolean(subject)))].sort()
  const usedGrades = grades.filter((grade) => lessons.some((lesson) => lesson.grade === grade))
  const week = getWeekRange(date)
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(week.start, index))
  const filtered = filter.grade !== null || filter.subject !== null || filter.teacherId !== null
  const [year, month] = monthKey.split('-').map(Number)

  const monthPanel = (
    <section aria-label="Month" className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">
          {MONTHS[month - 1]} {year}
        </h3>
        <div className="flex gap-1">
          <button type="button" aria-label="Previous month" onClick={() => onMonthChange(shiftMonth(monthKey, -1))} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <CaretLeft size={14} aria-hidden="true" />
          </button>
          <button type="button" aria-label="Next month" onClick={() => onMonthChange(shiftMonth(monthKey, 1))} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
            <CaretRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAY.map((day) => (
          <div key={day} className="py-0.5 text-[10px] font-bold text-slate-400">
            {day[0]}
          </div>
        ))}
        {weeks.flat().map((day) => {
          const inMonth = day.slice(0, 7) === monthKey
          const count = inMonth ? countByDay.get(day) ?? 0 : 0
          const level = busyLevel(count, most)
          return (
            <button
              key={day}
              type="button"
              aria-label={inMonth ? dayLabel(day) : longDate(day)}
              aria-pressed={day === date}
              onClick={() => {
                onSelectDate(day)
                setPhonePanel(null)
              }}
              className={cn(
                'flex flex-col items-center rounded-lg py-1 transition',
                level === 1 && 'bg-pink-50',
                level === 2 && 'bg-pink-100',
                level === 3 && 'bg-pink-200',
                day === date && 'ring-2 ring-[#fc0c97]',
                !inMonth && 'opacity-40',
              )}
            >
              <span className={cn('text-xs font-semibold', day === today ? 'text-[#be185d]' : 'text-slate-700')}>{parseLocalDate(day).getDate()}</span>
              <span className={cn('min-h-[13px] text-[10px] font-bold', count ? 'text-[#be185d]' : 'text-transparent')}>{count || '·'}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">The number is how many things are on; darker is busier.</p>
    </section>
  )

  const filterPanel = (
    <section aria-label="Filters" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
      {usedGrades.length > 1 && (
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Grade</div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by grade">
            <button type="button" aria-pressed={filter.grade === null} onClick={() => setFilter({ ...filter, grade: null })} className={cn(chip, filter.grade === null ? chipOn : chipOff)}>
              All
            </button>
            {usedGrades.map((grade) => (
              <button key={grade} type="button" aria-pressed={filter.grade === grade} onClick={() => setFilter({ ...filter, grade })} className={cn(chip, filter.grade === grade ? chipOn : chipOff)}>
                {shortGrade(grade)}
              </button>
            ))}
          </div>
        </div>
      )}
      {subjects.length > 1 && (
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">Subject</div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by subject">
            {subjects.map((subject) => (
              <button
                key={subject}
                type="button"
                aria-pressed={filter.subject === subject}
                onClick={() => setFilter({ ...filter, subject: filter.subject === subject ? null : subject })}
                className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-bold', subjectTone(subject).tag, filter.subject === subject && 'ring-2 ring-[#fc0c97]')}
              >
                {subject}
              </button>
            ))}
          </div>
        </div>
      )}
      {filtered && (
        <button type="button" onClick={() => setFilter(NO_FILTER)} className="text-xs font-semibold text-[#be185d]">
          Clear filters
        </button>
      )}
    </section>
  )

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
      <aside className="hidden space-y-3 lg:sticky lg:top-3 lg:block">
        {monthPanel}
        {filterPanel}
      </aside>

      <div className="min-w-0">
        {/* Phone: the week as a strip, and the month and filters behind two buttons. */}
        <div className="lg:hidden">
          <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Week">
            {weekDays.map((day) => (
              <button
                key={day}
                type="button"
                aria-pressed={day === date}
                onClick={() => onSelectDate(day)}
                className={cn(
                  'min-w-[52px] shrink-0 rounded-xl border px-2 py-1.5 text-center',
                  day === date ? 'border-[#fc0c97] bg-[#fff1f8]' : 'border-slate-200 bg-white',
                )}
              >
                <span className="block text-[11px] font-semibold text-slate-500">{WEEKDAY[parseLocalDate(day).getDay()]}</span>
                <span className={cn('block text-base font-extrabold', day === date ? 'text-[#be185d]' : 'text-slate-900')}>{parseLocalDate(day).getDate()}</span>
                <span className="block text-[10px] font-bold text-[#be185d]">{countByDay.get(day) ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="mb-3 flex items-center gap-2">
            <button type="button" aria-expanded={phonePanel === 'month'} onClick={() => setPhonePanel(phonePanel === 'month' ? null : 'month')} className={smallButton}>
              <CalendarBlank size={14} className="mr-1 inline" aria-hidden="true" />
              Month
            </button>
            <button type="button" aria-expanded={phonePanel === 'filters'} onClick={() => setPhonePanel(phonePanel === 'filters' ? null : 'filters')} className={smallButton}>
              <Funnel size={14} className="mr-1 inline" aria-hidden="true" />
              Filters{filtered ? ' (on)' : ''}
            </button>
            {date !== today && (
              <button type="button" onClick={() => onSelectDate(today)} className={cn(smallButton, 'ml-auto')}>
                Today
              </button>
            )}
          </div>
          {phonePanel === 'month' && <div className="mb-3">{monthPanel}</div>}
          {phonePanel === 'filters' && <div className="mb-3">{filterPanel}</div>}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 className="text-lg font-bold text-slate-900 sm:text-xl">{longDate(date)}</h3>
          <span className="text-lg font-extrabold text-[#be185d] sm:text-xl">{plural(dayLessons.length, 'class')}</span>
          {dayItems.length > 0 && <span className="text-sm font-semibold text-slate-500">+ {dayItems.length} to do &amp; events</span>}
          <div className="ml-auto flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Calendar view">
            <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-900 shadow-sm">Day list</span>
            <button type="button" onClick={() => onShowCalendar('dayGridMonth')} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
              Month
            </button>
            <button type="button" onClick={() => onShowCalendar('timeGridWeek')} className="hidden rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800 sm:block">
              Week
            </button>
            <button type="button" onClick={() => onShowCalendar('listWeek')} className="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
              Agenda
            </button>
          </div>
        </div>

        {dayItems.length > 0 && (
          <section aria-label="To do and events" className="mb-4">
            <div className="mb-2 flex items-center gap-2 border-b border-slate-200 py-2">
              <span className="text-base font-extrabold text-slate-900">To do &amp; events</span>
              <span className="text-xs font-semibold text-slate-500">{dayItems.length}</span>
            </div>
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
              {dayItems.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <button
                    type="button"
                    onClick={() => onOpenItem?.(item)}
                    className="flex w-full items-center gap-3 bg-white px-4 py-2.5 text-left hover:bg-slate-50"
                  >
                    <span className="w-16 shrink-0 text-xs font-semibold text-slate-500">{item.startTime ? formatClockTime(item.startTime) : 'All day'}</span>
                    <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold', ITEM_KIND[item.kind].tag)}>{ITEM_KIND[item.kind].label}</span>
                    <span className={cn('min-w-0 flex-1 truncate text-sm font-semibold text-slate-800', item.isDone && 'text-slate-400 line-through')}>{item.title}</span>
                    {item.assigneeName && <span className="hidden shrink-0 text-xs text-slate-500 sm:block">{item.assigneeName}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {slots.length === 0 && dayItems.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Nothing on this day{filtered || filteredOutside ? ' with these filters' : ''}.</p>
        )}

        {slots.map((slot) => {
          const timing = date === today ? describeClassTiming({ date, startTime: slot.startTime, endTime: slot.endTime }, now) : null
          // Today only: a time that is over folds away, so what is next is at the top.
          const ended = timing?.phase === 'ended'
          const collapsed = ended && !openEnded.includes(slot.startTime)
          return (
            <section key={slot.startTime} aria-label={`${formatClockTime(slot.startTime)} classes`} className="mb-4">
              <div className="sticky top-0 z-[1] mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-200 bg-white/95 py-2 backdrop-blur">
                <span className="text-base font-extrabold text-slate-900">{formatClockTime(slot.startTime)}</span>
                <span className="text-xs font-semibold text-slate-500">
                  – {formatClockTime(slot.endTime)} · {plural(slot.lessons.length, 'class')} · {slot.places.toLocaleString()} on the lists
                </span>
                {timing && timing.phase === 'upcoming' && <span className="rounded-full bg-[#fff1f8] px-2 py-0.5 text-[11px] font-bold text-[#be185d]">{timing.text}</span>}
                {timing && timing.phase === 'running' && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">In progress</span>}
                {ended && (
                  <button
                    type="button"
                    aria-expanded={!collapsed}
                    onClick={() => setOpenEnded(collapsed ? [...openEnded, slot.startTime] : openEnded.filter((time) => time !== slot.startTime))}
                    className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600"
                  >
                    Ended {collapsed ? '· show' : '· hide'}
                    <CaretDown size={10} className={cn('ml-0.5 inline transition', !collapsed && 'rotate-180')} aria-hidden="true" />
                  </button>
                )}
              </div>
              {!collapsed && (
                <ul className="grid grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] sm:gap-2.5 sm:overflow-visible sm:rounded-none sm:border-0">
                  {slot.lessons.map((lesson) => (
                    <LessonCard
                      key={lesson.key}
                      lesson={lesson}
                      isToday={date === today}
                      onOpen={() => onOpenLesson(lesson)}
                      onTakeAttendance={() => onTakeAttendance(lesson)}
                      onRunLive={onRunLive ? () => onRunLive(lesson) : undefined}
                    />
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function LessonCard({
  lesson,
  isToday,
  onOpen,
  onTakeAttendance,
  onRunLive,
}: {
  lesson: DayListLesson
  isToday: boolean
  onOpen: () => void
  onTakeAttendance: () => void
  onRunLive?: () => void
}) {
  const tone = subjectTone(lesson.subject)
  const submitted = lesson.state === 'submitted'
  return (
    <li className="relative border-b border-slate-200 bg-white last:border-b-0 sm:rounded-2xl sm:border">
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1 sm:rounded-l-2xl', tone.bar)} />
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${lesson.title}, ${lesson.teacherName}, ${plural(lesson.studentCount, 'student')}`}
        className="flex w-full items-center gap-3 py-2.5 pl-4 pr-3 text-left sm:flex-col sm:items-stretch sm:gap-1 sm:pb-1"
      >
        <span className="flex min-w-[48px] flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-1.5">
          {lesson.subject && <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-bold', tone.tag)}>{lesson.subject}</span>}
          {lesson.grade && <span className="text-[11px] font-bold text-slate-500">{shortGrade(lesson.grade)}</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-slate-900">{lesson.title}</span>
          <span className="flex items-center gap-2 text-xs text-slate-500">
            <span className="truncate">{lesson.teacherName}</span>
            <span className="flex shrink-0 items-center gap-0.5">
              <UsersThree size={12} aria-hidden="true" />
              {lesson.studentCount}
            </span>
            {submitted && (
              <span className="flex shrink-0 items-center gap-0.5 font-semibold text-emerald-700">
                <Check size={12} weight="bold" aria-hidden="true" />
                Taken
              </span>
            )}
            {lesson.state === 'missing' && <span className="shrink-0 font-semibold text-amber-700">Not taken</span>}
          </span>
        </span>
        <CaretRight size={14} className="shrink-0 text-slate-300 sm:hidden" aria-hidden="true" />
      </button>
      {lesson.state !== 'later' && (
        <div className="hidden gap-1.5 px-4 pb-2.5 sm:flex">
          <button type="button" onClick={onTakeAttendance} className={smallButton}>
            {submitted ? 'View' : 'Attendance'}
          </button>
          {onRunLive && isToday && (
            <button type="button" onClick={onRunLive} className={smallButton}>
              Live
            </button>
          )}
        </div>
      )}
    </li>
  )
}
