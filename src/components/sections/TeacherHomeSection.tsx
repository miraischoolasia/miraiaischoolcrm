import { useState } from 'react'
import { useNow } from '../../hooks/useNow'
import { cn } from '../../lib/cn'
import {
  describeClassTiming,
  formatClockTime,
  type AgendaItem,
  type TeacherAgenda,
} from '../../lib/teacherAgenda'
import { parseLocalDate } from '../../domain/studentStatus'
import mascotGordo from '../../assets/mascot-gordo.png'

export type TeacherHomeClass = {
  id: number
  name: string
  subtitle: string
  studentCount: number
  // "Wed 16:00-17:30"
  slots: string[]
  // Classes that already ran with no attendance submitted.
  missing: number
}

type TeacherHomeSectionProps = {
  teacherName: string
  todayString: string
  agenda: TeacherAgenda
  classes: TeacherHomeClass[]
  // An admin has switched on late editing: submitted attendance never locks.
  lateEditOpen?: boolean
  // For tests; otherwise the time moves on by itself.
  now?: Date
  onTakeAttendance: (item: AgendaItem) => void
  onOpenCalendar: () => void
  onOpenClass: (classroomId: number) => void
}

function greeting(now: Date) {
  const hour = now.getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

function dayLabel(dateKey: string) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(
    parseLocalDate(dateKey),
  )
}

function hoursLeftText(editableUntil: number, now: Date) {
  const hours = Math.max(1, Math.ceil((editableUntil - now.getTime()) / 3600000))
  return `editable for ${hours} h`
}

const chipClass = {
  ok: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-50 text-amber-700',
  info: 'bg-slate-100 text-slate-600',
  pink: 'bg-[#fff1f8] text-[#be185d]',
}

function Chip({ tone, children }: { tone: keyof typeof chipClass; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold', chipClass[tone])}>
      {children}
    </span>
  )
}

function TodoTile({ count }: { count: number }) {
  const body = (
    <>
      <div className={cn('text-[11px] font-bold uppercase tracking-[0.08em]', count > 0 ? 'text-amber-800' : 'text-slate-500')}>
        To do
      </div>
      <div className="mt-1 text-2xl font-semibold">
        {count}{' '}
        <span className={cn('text-sm font-medium', count > 0 ? 'text-amber-800' : 'text-slate-500')}>
          attendance missing
        </span>
      </div>
    </>
  )
  if (count === 0) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-900">{body}</div>
  }
  return (
    <button
      type="button"
      onClick={() => document.getElementById('teacher-todo')?.scrollIntoView({ behavior: 'smooth' })}
      className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-left text-amber-800 transition hover:bg-amber-100"
    >
      {body}
    </button>
  )
}

const TODO_PREVIEW = 5

function studentsText(count: number) {
  return `${count} ${count === 1 ? 'student' : 'students'}`
}

const primaryButton =
  'rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]'
const secondaryButton =
  'rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50'

export function TeacherHomeSection({
  teacherName,
  todayString,
  agenda,
  classes,
  lateEditOpen = false,
  now: nowProp,
  onTakeAttendance,
  onOpenCalendar,
  onOpenClass,
}: TeacherHomeSectionProps) {
  const [showAllTodo, setShowAllTodo] = useState(false)
  const tick = useNow(30_000)
  const now = nowProp ?? tick
  const { today, todo, upcoming, week } = agenda
  const nextDay = upcoming[0]?.date ?? null
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(now).toLowerCase()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">
          {greeting(now)}, {teacherName}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">
          {new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(
            parseLocalDate(todayString),
          )}{' '}
          · {time}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">Today</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">
            {today.length} <span className="text-sm font-medium text-slate-500">{today.length === 1 ? 'class' : 'classes'}</span>
          </div>
        </div>
        <TodoTile count={todo.length} />
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">This week</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">
            {week.classes}{' '}
            <span className="text-sm font-medium text-slate-500">
              {week.classes === 1 ? 'class' : 'classes'} · {week.hours} h
            </span>
          </div>
        </div>
      </div>

      {todo.length > 0 && (
        <section id="teacher-todo" aria-labelledby="teacher-todo-title">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="teacher-todo-title" className="text-lg font-semibold text-slate-900">
              To do
            </h3>
            <span className="text-sm text-slate-500">
              Parents get no report until attendance is submitted. A class that did not run? Ask the
              admin to cancel that day.
            </span>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <ul className="divide-y divide-slate-200">
              {(showAllTodo ? todo : todo.slice(0, TODO_PREVIEW)).map((item) => (
                <li key={item.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {item.title} · {dayLabel(item.date)} · {formatClockTime(item.startTime)}-{formatClockTime(item.endTime)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {studentsText(item.studentCount)} · attendance not submitted
                    </div>
                  </div>
                  <button type="button" onClick={() => onTakeAttendance(item)} className={primaryButton}>
                    Take attendance
                  </button>
                </li>
              ))}
            </ul>
            {todo.length > TODO_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAllTodo((current) => !current)}
                className="w-full border-t border-slate-200 px-4 py-2.5 text-sm font-semibold text-[#be185d] transition hover:bg-[#fff8fc]"
              >
                {showAllTodo ? 'Show fewer' : `Show all ${todo.length}`}
              </button>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="teacher-today-title">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="teacher-today-title" className="text-lg font-semibold text-slate-900">
            Today
          </h3>
          <button
            type="button"
            onClick={onOpenCalendar}
            className="text-sm font-semibold text-[#be185d] underline underline-offset-4"
          >
            Open full calendar
          </button>
        </div>
        {today.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-8 text-center">
            <img src={mascotGordo} alt="" aria-hidden="true" className="h-20 w-auto" />
            <p className="text-sm text-slate-500">
              No classes today.
              {nextDay ? ` Next class: ${dayLabel(nextDay)}.` : ''}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {today.map((item) => (
              <TodayRow
                key={item.key}
                item={item}
                now={now}
                lateEditOpen={lateEditOpen}
                onTakeAttendance={onTakeAttendance}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="teacher-upcoming-title">
        <h3 id="teacher-upcoming-title" className="mb-2 text-lg font-semibold text-slate-900">
          Coming up
        </h3>
        {upcoming.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-500">
            Nothing else in the next 7 days.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {upcoming.map((item) => (
              <li key={item.key} className="grid grid-cols-[88px_1fr_auto] items-center gap-3 px-4 py-2.5">
                <div className="text-sm font-semibold text-slate-900">{dayLabel(item.date)}</div>
                <div className="min-w-0 text-sm">
                  <span className="font-semibold text-slate-900">{item.title}</span>{' '}
                  <span className="text-slate-500">
                    · {formatClockTime(item.startTime)}-{formatClockTime(item.endTime)} · {studentsText(item.studentCount)}
                  </span>{' '}
                  {item.makeupMinutes > 0 && <Chip tone="pink">Make-up +{item.makeupMinutes} min</Chip>}
                </div>
                <button type="button" onClick={() => onTakeAttendance(item)} className={secondaryButton}>
                  Roster
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {classes.length > 0 && (
        <section aria-labelledby="teacher-classes-title">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 id="teacher-classes-title" className="text-lg font-semibold text-slate-900">
              My classes
            </h3>
            <span className="text-sm text-slate-500">Only the classes you teach</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {classes.map((entry) => (
              <div key={entry.id} className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-4">
                <div>
                  <div className="text-base font-semibold text-slate-900">{entry.name}</div>
                  {entry.subtitle && <div className="text-xs text-slate-500">{entry.subtitle}</div>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Chip tone="info">{studentsText(entry.studentCount)}</Chip>
                  {entry.slots.map((slot) => (
                    <Chip key={slot} tone="info">
                      {slot}
                    </Chip>
                  ))}
                  {entry.missing > 0 && <Chip tone="warn">{entry.missing} not submitted</Chip>}
                </div>
                <button
                  type="button"
                  onClick={() => onOpenClass(entry.id)}
                  aria-label={`Open class ${entry.name}`}
                  className={cn(secondaryButton, 'justify-self-start py-1.5')}
                >
                  Open class
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function TodayRow({
  item,
  now,
  lateEditOpen,
  onTakeAttendance,
}: {
  item: AgendaItem
  now: Date
  lateEditOpen: boolean
  onTakeAttendance: (item: AgendaItem) => void
}) {
  const timing = describeClassTiming(item, now)
  const submitted = item.state === 'submitted'
  const editable = submitted && (lateEditOpen || (item.editableUntil !== null && now.getTime() < item.editableUntil))
  // Attendance opens all day, but the button stands out once the class is on.
  const emphasise = !submitted && timing.phase !== 'upcoming'

  return (
    <li className={cn('grid gap-3 px-4 py-3.5 sm:grid-cols-[120px_1fr_auto] sm:items-center', emphasise && 'bg-[#fff8fc]')}>
      <div>
        <div className="text-base font-semibold text-slate-900">{formatClockTime(item.startTime)}</div>
        <div className="text-xs text-slate-500">
          to {formatClockTime(item.endTime)}
          {!submitted && timing.phase === 'upcoming' ? ` · ${timing.text}` : ''}
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900">
          {item.title}
          {item.subtitle && item.kind !== 'regular' ? ` · ${item.subtitle}` : ''}
        </div>
        <div className="text-xs text-slate-500">
          {studentsText(item.studentCount)}
          {item.kind === 'regular' && item.subtitle ? ` · ${item.subtitle}` : ''}
          {item.makeupMinutes > 0 ? ` · Make-up +${item.makeupMinutes} min` : ''}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        {submitted ? (
          <>
            <Chip tone="ok">✓ Submitted</Chip>
            <span className="text-xs text-slate-500">
              {lateEditOpen
                ? 'late editing is on'
                : editable && item.editableUntil !== null
                  ? hoursLeftText(item.editableUntil, now)
                  : 'locked'}
            </span>
            <button type="button" onClick={() => onTakeAttendance(item)} className={secondaryButton}>
              {editable ? 'Edit' : 'View'}
            </button>
          </>
        ) : (
          <>
            <Chip tone={timing.phase === 'upcoming' ? 'info' : 'warn'}>
              {timing.phase === 'upcoming' ? 'Later today' : 'Attendance not taken'}
            </Chip>
            <button
              type="button"
              onClick={() => onTakeAttendance(item)}
              className={emphasise ? primaryButton : secondaryButton}
            >
              Take attendance
            </button>
          </>
        )}
      </div>
    </li>
  )
}
