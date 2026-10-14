import { useMemo, useState } from 'react'
import { ArrowLeft, CaretDown, CaretRight, PencilSimple, VideoCamera } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import { formatStudentAge, getStudentAge } from '../../lib/age'
import { addDays, formatClockTime, type AgendaItem } from '../../lib/teacherAgenda'
import { ageRangeText, type TeacherClassCard } from '../../lib/teacherDetails'
import { formatDate, parseLocalDate } from '../../domain/studentStatus'
import type { StudentRow } from '../../lib/studentRows'
import type { Teacher } from '../../types/domain'

export type TeacherDetailsSectionProps = {
  teacher: Teacher
  classes: TeacherClassCard[]
  // Every class of the teacher in the week of weekStart (Monday), with its attendance state.
  weekItems: AgendaItem[]
  weekStart: string
  weekHours: number
  // Past classes with no attendance submitted.
  missingAttendance: number
  todayString: string
  canEditClassroom: boolean
  onBack: () => void
  onEditTeacher: () => void
  onOpenStudent: (studentId: number) => void
  onEditClassroom: (classroomId: number) => void
  onOpenAttendance: (item: AgendaItem) => void
}

const roleLabel: Record<Teacher['role'], string> = { admin: 'Admin', teacher: 'Teacher', staff: 'Staff' }
const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const chip = {
  ok: 'bg-emerald-50 text-emerald-700',
  warn: 'bg-amber-50 text-amber-700',
  bad: 'bg-red-50 text-red-700',
  info: 'bg-slate-100 text-slate-600',
}

function Chip({ tone, children }: { tone: keyof typeof chip; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold', chip[tone])}>
      {children}
    </span>
  )
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

// A class with many weekly times (an HOA slot) shows the first three and how many more there are.
function slotsText(slots: string[]) {
  return slots.length > 3 ? `${slots.slice(0, 3).join(', ')} +${slots.length - 3} more` : slots.join(', ')
}

function isHttpLink(value: string | null | undefined): value is string {
  return Boolean(value && /^https?:\/\/\S+$/i.test(value))
}

function statusOf(row: StudentRow): { tone: keyof typeof chip; label: string } {
  const issue = row.issues[0]
  if (issue) {
    return { tone: issue.tone === 'critical' ? 'bad' : 'warn', label: issue.label }
  }
  return row.kind === 'hoa' ? { tone: 'info', label: 'Booked' } : { tone: 'ok', label: 'On track' }
}

export function TeacherDetailsSection({
  teacher,
  classes,
  weekItems,
  weekStart,
  weekHours,
  missingAttendance,
  todayString,
  canEditClassroom,
  onBack,
  onEditTeacher,
  onOpenStudent,
  onEditClassroom,
  onOpenAttendance,
}: TeacherDetailsSectionProps) {
  // Only one class is open at a time; they all start closed.
  const [openClassId, setOpenClassId] = useState<number | null>(null)
  const [followUpOnly, setFollowUpOnly] = useState(false)

  const everyone = useMemo(() => {
    const seen = new Map<number, StudentRow>()
    for (const card of classes) {
      for (const row of card.students) {
        seen.set(row.student.id, row)
      }
    }
    return [...seen.values()]
  }, [classes])
  const withoutBirthDate = everyone.filter(
    (row) => row.kind !== 'hoa' && getStudentAge(row.student, todayString)?.source !== 'birth',
  ).length
  // Regular classes, then the other courses (HOA slots and camps); the order inside is the week's.
  const groups = [
    { key: 'regular', title: 'Regular classes', cards: classes.filter((card) => card.group === 'regular') },
    { key: 'other', title: 'Other courses (HOA and camps)', cards: classes.filter((card) => card.group === 'other') },
  ]
    .filter((group) => group.cards.length > 0)
    .map((group) => ({
      ...group,
      studentCount: new Set(group.cards.flatMap((card) => card.students.map((row) => row.student.id))).size,
    }))
  const days = dayNames.map((name, index) => {
    const date = addDays(weekStart, index)
    return { name, date, items: weekItems.filter((item) => item.date === date) }
  })

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#be185d] underline-offset-4 hover:underline"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        My Team
      </button>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#fbcfe8] bg-[#fff1f8] text-sm font-bold text-[#be185d]"
          >
            {initials(teacher.fullName)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-slate-900">{teacher.fullName}</h2>
              <Chip tone="info">{roleLabel[teacher.role]}</Chip>
              <Chip tone={teacher.authUserId ? 'ok' : 'warn'}>{teacher.authUserId ? 'Login active' : 'No login'}</Chip>
              {!teacher.isActive && <Chip tone="bad">Archived</Chip>}
            </div>
            <div className="mt-0.5 text-sm text-slate-500">
              {[...new Set([teacher.username, teacher.email, teacher.phone].filter(Boolean))].join(' · ')}
            </div>
          </div>
          <button
            type="button"
            onClick={onEditTeacher}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <PencilSimple size={16} aria-hidden="true" />
            Edit account
          </button>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Classes', value: classes.length, tone: '' },
          { label: 'Students', value: everyone.length, tone: '' },
          { label: 'Hours this week', value: weekHours, tone: '' },
          { label: 'Attendance missing', value: missingAttendance, tone: missingAttendance > 0 ? 'text-amber-700' : '' },
        ].map((metric) => (
          <div key={metric.label} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{metric.label}</div>
            <div className={cn('mt-1 text-2xl font-semibold text-slate-900', metric.tone)}>{metric.value}</div>
          </div>
        ))}
      </div>

      <section aria-labelledby="teacher-week-title" className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 id="teacher-week-title" className="text-base font-semibold text-slate-900">
            This week
          </h3>
          <span className="text-xs text-slate-500">
            {formatDate(weekStart)} - {formatDate(addDays(weekStart, 6))}
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((day) => (
            <div
              key={day.date}
              className={cn(
                'min-h-[76px] rounded-lg bg-slate-50 p-1.5',
                day.date === todayString && 'ring-2 ring-[#fc0c97]/60',
              )}
            >
              <div className="text-[11px] font-semibold text-slate-500">
                {day.name} {parseLocalDate(day.date).getDate()}
              </div>
              {day.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onOpenAttendance(item)}
                  title={`${item.title} · ${formatClockTime(item.startTime)}-${formatClockTime(item.endTime)}`}
                  className={cn(
                    'mt-1 block w-full rounded-md px-1 py-1 text-left text-[11px] font-semibold leading-tight',
                    item.state === 'submitted'
                      ? 'bg-emerald-50 text-emerald-800'
                      : item.state === 'missing'
                        ? 'bg-amber-50 text-amber-800'
                        : 'bg-sky-50 text-sky-800',
                  )}
                >
                  {formatClockTime(item.startTime)}
                  <span className="block truncate font-medium">{item.title}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
          <span>Blue: coming up</span>
          <span>Green: attendance submitted</span>
          <span>Yellow: attendance missing</span>
        </div>
      </section>

      <section aria-labelledby="teacher-classes-title" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="teacher-classes-title" className="text-base font-semibold text-slate-900">
            Classes and students
          </h3>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={followUpOnly}
              onChange={(event) => setFollowUpOnly(event.target.checked)}
            />
            Needs follow-up only
          </label>
        </div>

        {withoutBirthDate > 0 && (
          <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
            {withoutBirthDate} {withoutBirthDate === 1 ? 'student has' : 'students have'} no date of birth yet. Add it
            on the student so the age stays right every year.
          </p>
        )}

        {classes.length === 0 && (
          <p className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
            This account has no classes.
          </p>
        )}

        {groups.map((group) => (
          <div key={group.key} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 pt-1">
              <h4 className="text-sm font-semibold text-slate-900">{group.title}</h4>
              <span className="text-xs text-slate-500">
                {group.cards.length === 1 ? '1 class' : `${group.cards.length} classes`} ·{' '}
                {group.studentCount === 1 ? '1 student' : `${group.studentCount} students`}
              </span>
            </div>
            {group.cards.map((card) => {
          const { classroom } = card
          const isOpen = openClassId === classroom.id
          const ages = card.students
            .map((row) => getStudentAge(row.student, todayString)?.years)
            .filter((years): years is number => years !== undefined)
          const range = ageRangeText(ages)
          const needing = card.students.filter((row) => row.needsFollowUp).length
          const rows = followUpOnly ? card.students.filter((row) => row.needsFollowUp) : card.students
          return (
            <div key={classroom.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpenClassId(isOpen ? null : classroom.id)}
                className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
              >
                {isOpen ? (
                  <CaretDown size={16} aria-hidden="true" className="text-slate-500" />
                ) : (
                  <CaretRight size={16} aria-hidden="true" className="text-slate-500" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{classroom.name}</span>
                  <span className="block text-xs text-slate-500" title={card.slots.join(', ')}>
                    {[classroom.ageGroup, classroom.programLevel, slotsText(card.slots)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {card.group === 'other' && (
                  <Chip tone="info">{classroom.category === 'camp' ? 'Camp' : 'HOA'}</Chip>
                )}
                <Chip tone="info">{card.students.length === 1 ? '1 student' : `${card.students.length} students`}</Chip>
                {range && <Chip tone="info">Ages {range}</Chip>}
                {needing > 0 && <Chip tone="warn">{needing} to follow up</Chip>}
              </button>

              {isOpen && (
                <div className="border-t border-slate-200">
                  <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-sm">
                    <VideoCamera size={16} aria-hidden="true" className="text-slate-500" />
                    {isHttpLink(classroom.zoomLink) ? (
                      <a
                        href={classroom.zoomLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 truncate font-semibold text-[#be185d] underline underline-offset-4"
                      >
                        {classroom.zoomLink}
                      </a>
                    ) : (
                      <span className="text-slate-500">No Zoom link yet</span>
                    )}
                    {canEditClassroom && (
                      <button
                        type="button"
                        onClick={() => onEditClassroom(classroom.id)}
                        className="ml-auto text-sm font-semibold text-slate-700 underline underline-offset-4"
                      >
                        {isHttpLink(classroom.zoomLink) ? 'Edit class' : 'Add link'}
                      </button>
                    )}
                  </div>

                  {rows.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-slate-500">
                      {card.students.length === 0
                        ? card.isTrialSlot
                          ? 'Nobody is booked into this slot yet.'
                          : 'No students in this class.'
                        : 'Everyone in this class is on track.'}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm">
                        <thead className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-500">
                          <tr>
                            <th className="px-4 py-2">Student</th>
                            <th className="px-3 py-2">Age</th>
                            <th className="px-3 py-2">Package</th>
                            <th className="px-3 py-2 text-right">Left</th>
                            <th className="px-3 py-2">Ends</th>
                            <th className="px-3 py-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {rows.map((row) => {
                            const age = getStudentAge(row.student, todayString)
                            const status = statusOf(row)
                            const hoa = row.kind === 'hoa'
                            return (
                              <tr key={row.student.id} className="align-top">
                                <td className="px-4 py-2.5">
                                  <button
                                    type="button"
                                    onClick={() => onOpenStudent(row.student.id)}
                                    className="text-left font-semibold text-slate-900 underline-offset-4 hover:text-[#be185d] hover:underline"
                                  >
                                    {row.student.name}
                                  </button>
                                  {row.parent && (row.parent.name || row.parent.phone) && (
                                    <div className="text-xs text-slate-500">
                                      {[row.parent.name, row.parent.phone].filter(Boolean).join(' · ')}
                                    </div>
                                  )}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5">
                                  {age ? (
                                    <span title={age.source === 'booking' ? 'Age written when the child was booked' : undefined}>
                                      {formatStudentAge(age)}
                                    </span>
                                  ) : (
                                    <Chip tone="warn">Add</Chip>
                                  )}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                                  {hoa ? 'HOA' : (row.pkg?.name ?? '—')}
                                </td>
                                <td className="px-3 py-2.5 text-right text-slate-700">
                                  {hoa ? '—' : row.student.remainingHours}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2.5 text-slate-700">
                                  {hoa ? '—' : formatDate(row.student.lessonExpiryDate)}
                                </td>
                                <td className="px-3 py-2.5">
                                  <Chip tone={status.tone}>{status.label}</Chip>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
            })}
          </div>
        ))}
      </section>
    </div>
  )
}
