import { useState } from 'react'
import { CaretDown, Check, FacebookLogo, Play, UsersThree, VideoCamera, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { cn } from '../../lib/cn'
import { parseLocalDate } from '../../domain/studentStatus'
import { describeClassTiming, formatClockTime } from '../../lib/teacherAgenda'
import { subjectTone, type DayListLesson } from '../../lib/calendarDayList'

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const linkRow = 'flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-sm'

type LessonWindowProps = {
  lesson: DayListLesson
  today: string
  now: Date
  // Other teachers' classes in the same class at the same time (e.g. Science and Sains share a class).
  alongside: DayListLesson[]
  // Who is on the class list that day; only worked out when the list is opened.
  rosterNames: () => string[]
  onTakeAttendance: () => void
  onRunLive?: () => void
  // Admin: the schedule window (change the teacher, move or cancel this day).
  onEdit?: () => void
  onClose: () => void
}

// One class from the Calendar's day list: what it is, who teaches it, how many children are on its list
// (the names only when asked for), attendance, Live class, its Zoom and Facebook group.
export function LessonWindow({ lesson, today, now, alongside, rosterNames, onTakeAttendance, onRunLive, onEdit, onClose }: LessonWindowProps) {
  const [names, setNames] = useState<string[] | null>(null)
  const day = parseLocalDate(lesson.date)
  const timing = lesson.date === today ? describeClassTiming(lesson, now) : null
  const submitted = lesson.state === 'submitted'
  const tone = subjectTone(lesson.subject)

  return (
    <ModalShell onClose={onClose} maxWidth="sm">
      <div className="relative border-b border-slate-200 px-5 pb-4 pt-5">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded-full bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200">
          <X size={14} aria-hidden="true" />
        </button>
        <div className="flex flex-wrap items-center gap-2 pr-10">
          {lesson.subject && <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-bold', tone.tag)}>{lesson.subject}</span>}
          {lesson.grade && <span className="text-xs font-semibold text-slate-500">{lesson.grade}</span>}
          {timing && (
            <span className={cn('text-xs font-bold', timing.phase === 'running' ? 'text-emerald-700' : 'text-[#be185d]')}>
              {timing.text}
            </span>
          )}
        </div>
        <h2 className="mt-1 text-xl font-bold text-slate-900">{lesson.title}</h2>
        <p className="text-sm text-slate-500">
          {WEEKDAY[day.getDay()]}, {day.getDate()} {MONTHS[day.getMonth()]} · {formatClockTime(lesson.startTime)} – {formatClockTime(lesson.endTime)}
        </p>
      </div>

      <div className="space-y-3 px-5 py-4">
        <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-slate-500">Teacher</dt>
          <dd className="font-semibold text-slate-800">{lesson.teacherName}</dd>
          <dt className="text-slate-500">Students</dt>
          <dd className="font-semibold text-slate-800">{lesson.studentCount.toLocaleString()} on the list</dd>
          {submitted && (
            <>
              <dt className="text-slate-500">Attendance</dt>
              <dd className="flex items-center gap-1 font-semibold text-emerald-700">
                <Check size={14} weight="bold" aria-hidden="true" />
                Taken
              </dd>
            </>
          )}
        </dl>

        {alongside.length > 0 && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Same class at the same time: {alongside.map((other) => `${other.subject ?? other.title} · ${other.teacherName}`).join(', ')}. Each teacher takes attendance from the same list.
          </p>
        )}

        {lesson.state !== 'later' && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onTakeAttendance}
              className="col-span-2 rounded-xl bg-[#fc0c97] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
            >
              {submitted ? 'View attendance' : `Take attendance (${lesson.studentCount})`}
            </button>
            {onRunLive && lesson.date === today && (
              <button type="button" onClick={onRunLive} className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Play size={14} weight="fill" aria-hidden="true" />
                Live class
              </button>
            )}
          </div>
        )}

        <div className={linkRow}>
          <span className="flex items-center gap-2 text-slate-700">
            <VideoCamera size={16} aria-hidden="true" />
            Zoom
          </span>
          {lesson.zoomLink ? (
            <a href={lesson.zoomLink} target="_blank" rel="noreferrer" className="font-semibold text-[#be185d] hover:underline">
              Open Zoom
            </a>
          ) : (
            <span className="text-xs text-slate-400">No link</span>
          )}
        </div>
        <div className={linkRow}>
          <span className="flex items-center gap-2 text-slate-700">
            <FacebookLogo size={16} aria-hidden="true" />
            Facebook group
          </span>
          {lesson.fbGroupUrl ? (
            <a href={lesson.fbGroupUrl} target="_blank" rel="noreferrer" className="font-semibold text-[#be185d] hover:underline">
              Open group
            </a>
          ) : (
            <span className="text-xs text-slate-400">No link</span>
          )}
        </div>

        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2.5">
          <button
            type="button"
            aria-expanded={names !== null}
            onClick={() => setNames(names === null ? rosterNames() : null)}
            className="flex w-full items-center justify-between text-sm font-semibold text-slate-700"
          >
            <span className="flex items-center gap-2">
              <UsersThree size={16} aria-hidden="true" />
              Class list
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              {names === null ? `Show ${lesson.studentCount.toLocaleString()}` : 'Hide'}
              <CaretDown size={12} className={cn('transition', names !== null && 'rotate-180')} aria-hidden="true" />
            </span>
          </button>
          {names !== null && (
            <ol className="mt-2 max-h-56 list-decimal space-y-0.5 overflow-y-auto pl-6 text-sm text-slate-700" aria-label="Class list">
              {names.map((name, index) => (
                <li key={`${name}-${index}`}>{name}</li>
              ))}
              {names.length === 0 && <li className="list-none text-slate-500">Nobody on the list this day.</li>}
            </ol>
          )}
        </div>

        {onEdit && (
          <div className="border-t border-slate-200 pt-3">
            <button type="button" onClick={onEdit} className="text-sm font-semibold text-[#be185d] hover:underline">
              Change teacher, move or cancel this day…
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  )
}
