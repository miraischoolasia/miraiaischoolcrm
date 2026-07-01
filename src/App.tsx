import { useEffect, useMemo, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin, { type DateClickArg } from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import rrulePlugin from '@fullcalendar/rrule'
import timeGridPlugin from '@fullcalendar/timegrid'
import type {
  EventClickArg,
  EventContentArg,
  EventInput,
} from '@fullcalendar/core'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { Database } from './types/database'

type AppSection = 'calendar' | 'students'
type FilterKey = 'all' | 'hours' | 'accountFee' | 'mirai' | 'normal'

type Student = {
  id: number
  teacherId: number | null
  name: string
  remainingHours: number
  lessonExpiryDate: string
  accountFeeExpiryDate: string
  miraiClubExpiryDate: string
}

type Teacher = {
  id: number
  username: string
  fullName: string
  role: 'admin' | 'teacher'
}

type Schedule = {
  id: number
  teacherId: number
  studentId: number | null
  title: string
  eventType: 'regular' | 'replacement'
  recurrenceType: 'weekly' | 'none'
  dayOfWeek: number | null
  scheduledDate: string | null
  startTime: string
  endTime: string
  startRecur: string | null
  endRecur: string | null
  status: 'active' | 'cancelled'
  notes: string | null
}

type RenewalFormState = {
  addHours: string
  lessonExpiryDate: string
  accountFeeExpiryDate: string
  miraiClubExpiryDate: string
}

type ScheduleFormState = {
  title: string
  teacherId: string
  studentId: string
  eventType: 'regular' | 'replacement'
  dayOfWeek: string
  scheduledDate: string
  startTime: string
  endTime: string
  startRecur: string
  endRecur: string
  notes: string
}

type StatusTag = {
  label: string
  tone: 'critical' | 'healthy'
}

type UserSession = {
  key: string
  role: 'admin' | 'teacher'
  label: string
  teacherId: number | null
}

type StudentRow = Pick<
  Database['public']['Tables']['students']['Row'],
  | 'id'
  | 'teacher_id'
  | 'full_name'
  | 'remaining_hours'
  | 'lesson_expiry_date'
  | 'account_fee_expiry_date'
  | 'mirai_club_expiry_date'
>

type TeacherRow = Pick<
  Database['public']['Tables']['teachers']['Row'],
  'id' | 'username' | 'full_name' | 'role'
>

type ScheduleRow = Pick<
  Database['public']['Tables']['schedules']['Row'],
  | 'id'
  | 'teacher_id'
  | 'student_id'
  | 'title'
  | 'event_type'
  | 'recurrence_type'
  | 'day_of_week'
  | 'scheduled_date'
  | 'start_time'
  | 'end_time'
  | 'start_recur'
  | 'end_recur'
  | 'status'
  | 'notes'
>

const warningWindowDays = 14
const weekdayLabels = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const
const weekdayToRRule = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'] as const

const studentFilterOptions: Array<{ key: FilterKey; label: string }> = [
  { key: 'hours', label: 'Hours Low / Expired' },
  { key: 'accountFee', label: 'Account Fee Due' },
  { key: 'mirai', label: 'Mirai Club Due' },
  { key: 'normal', label: 'All Normal' },
]

function getTodayString() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parseLocalDate(dateString))
}

function formatTime(timeString: string) {
  const normalized = timeString.slice(0, 5)
  const [hours, minutes] = normalized.split(':').map(Number)
  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function getDayDifference(dateString: string, todayString: string) {
  const current = parseLocalDate(todayString).getTime()
  const target = parseLocalDate(dateString).getTime()
  return Math.round((target - current) / 86400000)
}

function getDateMeta(dateString: string, todayString: string) {
  const daysUntil = getDayDifference(dateString, todayString)
  const expired = daysUntil < 0
  const dueSoon = !expired && daysUntil < warningWindowDays

  return { daysUntil, expired, dueSoon }
}

function getStudentStatus(student: Student, todayString: string) {
  const hoursLow = student.remainingHours <= 2
  const lessonExpiry = getDateMeta(student.lessonExpiryDate, todayString)
  const accountFeeExpiry = getDateMeta(student.accountFeeExpiryDate, todayString)
  const miraiClubExpiry = getDateMeta(student.miraiClubExpiryDate, todayString)

  const tags: StatusTag[] = []

  if (hoursLow) {
    tags.push({ label: 'Hours Low', tone: 'critical' })
  }

  if (lessonExpiry.expired) {
    tags.push({ label: 'Lesson Expired', tone: 'critical' })
  }

  if (accountFeeExpiry.expired || accountFeeExpiry.dueSoon) {
    tags.push({ label: 'Renew Account Fee', tone: 'critical' })
  }

  if (miraiClubExpiry.expired || miraiClubExpiry.dueSoon) {
    tags.push({ label: 'Renew Mirai Club', tone: 'critical' })
  }

  if (tags.length === 0) {
    tags.push({ label: 'Normal', tone: 'healthy' })
  }

  return {
    hoursLow,
    lessonExpired: lessonExpiry.expired,
    accountFeeNeedsAttention: accountFeeExpiry.expired || accountFeeExpiry.dueSoon,
    miraiClubNeedsAttention:
      miraiClubExpiry.expired || miraiClubExpiry.dueSoon,
    lessonExpiry,
    accountFeeExpiry,
    miraiClubExpiry,
    tags,
    isNormal: tags.length === 1 && tags[0].label === 'Normal',
  }
}

function mapStudentRow(row: StudentRow): Student {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    name: row.full_name,
    remainingHours: row.remaining_hours,
    lessonExpiryDate: row.lesson_expiry_date,
    accountFeeExpiryDate: row.account_fee_expiry_date,
    miraiClubExpiryDate: row.mirai_club_expiry_date,
  }
}

function mapTeacherRow(row: TeacherRow): Teacher {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: row.role,
  }
}

function normalizeTimeInput(timeString: string) {
  return timeString.slice(0, 5)
}

function mapScheduleRow(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    studentId: row.student_id,
    title: row.title,
    eventType: row.event_type,
    recurrenceType: row.recurrence_type,
    dayOfWeek: row.day_of_week,
    scheduledDate: row.scheduled_date,
    startTime: normalizeTimeInput(row.start_time),
    endTime: normalizeTimeInput(row.end_time),
    startRecur: row.start_recur,
    endRecur: row.end_recur,
    status: row.status,
    notes: row.notes,
  }
}

async function fetchStudentsFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('students')
    .select(
      'id, teacher_id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date',
    )
    .order('full_name')

  if (error) {
    throw error
  }

  return data.map(mapStudentRow)
}

async function fetchTeachersFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('teachers')
    .select('id, username, full_name, role')
    .eq('is_active', true)
    .order('role', { ascending: true })
    .order('full_name')

  if (error) {
    throw error
  }

  return data.map(mapTeacherRow)
}

async function fetchSchedulesFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('schedules')
    .select(
      'id, teacher_id, student_id, title, event_type, recurrence_type, day_of_week, scheduled_date, start_time, end_time, start_recur, end_recur, status, notes',
    )
    .order('title')

  if (error) {
    throw error
  }

  return data.map(mapScheduleRow)
}

function calculateDuration(startTime: string, endTime: string) {
  const [startHour, startMinute] = startTime.split(':').map(Number)
  const [endHour, endMinute] = endTime.split(':').map(Number)
  const totalMinutes = endHour * 60 + endMinute - (startHour * 60 + startMinute)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function buildScheduleFormState(
  schedule: Schedule | null,
  todayString: string,
  defaultTeacherId: number | null,
): ScheduleFormState {
  if (!schedule) {
    return {
      title: '',
      teacherId: defaultTeacherId ? String(defaultTeacherId) : '',
      studentId: '',
      eventType: 'regular',
      dayOfWeek: String(parseLocalDate(todayString).getDay()),
      scheduledDate: todayString,
      startTime: '19:30',
      endTime: '21:30',
      startRecur: todayString,
      endRecur: '',
      notes: '',
    }
  }

  return {
    title: schedule.title,
    teacherId: String(schedule.teacherId),
    studentId: schedule.studentId ? String(schedule.studentId) : '',
    eventType: schedule.eventType,
    dayOfWeek:
      schedule.dayOfWeek !== null ? String(schedule.dayOfWeek) : String(parseLocalDate(todayString).getDay()),
    scheduledDate: schedule.scheduledDate ?? todayString,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    startRecur: schedule.startRecur ?? todayString,
    endRecur: schedule.endRecur ?? '',
    notes: schedule.notes ?? '',
  }
}

function buildScheduleEvents(
  schedules: Schedule[],
  teacherMap: Map<number, Teacher>,
  studentMap: Map<number, Student>,
): EventInput[] {
  return schedules
    .filter((schedule) => schedule.status === 'active')
    .map((schedule) => {
      const teacher = teacherMap.get(schedule.teacherId)
      const student = schedule.studentId ? studentMap.get(schedule.studentId) : null
      const shared = {
        id: `schedule-${schedule.id}`,
        title: schedule.title,
        duration: calculateDuration(schedule.startTime, schedule.endTime),
        extendedProps: {
          scheduleId: schedule.id,
          teacherName: teacher?.fullName ?? 'Unknown Teacher',
          studentName: student?.name ?? 'Unassigned Student',
          eventType: schedule.eventType,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          status: schedule.status,
          notes: schedule.notes ?? '',
        },
      }

      if (schedule.eventType === 'regular') {
        return {
          ...shared,
          rrule: {
            freq: 'weekly',
            byweekday:
              schedule.dayOfWeek !== null
                ? [weekdayToRRule[schedule.dayOfWeek]]
                : [],
            dtstart: `${schedule.startRecur}T${schedule.startTime}`,
            ...(schedule.endRecur
              ? { until: `${schedule.endRecur}T23:59:59` }
              : {}),
          },
        }
      }

      return {
        ...shared,
        start: `${schedule.scheduledDate}T${schedule.startTime}`,
        end: `${schedule.scheduledDate}T${schedule.endTime}`,
      }
    })
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  )

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return isMobile
}

function StatusChip({ label, tone }: StatusTag) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide',
        tone === 'critical' && 'border-[#fecdd3] bg-[#fff1f8] text-[#be185d]',
        tone === 'healthy' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
      )}
    >
      {label}
    </span>
  )
}

function ExpiryCell({
  date,
  meta,
}: {
  date: string
  meta: ReturnType<typeof getDateMeta>
}) {
  return (
    <div className="space-y-1">
      <div className="font-medium text-slate-800">{formatDate(date)}</div>
      <div
        className={cn(
          'text-xs font-medium',
          meta.expired && 'text-red-600',
          !meta.expired && meta.dueSoon && 'text-amber-600',
          !meta.expired && !meta.dueSoon && 'text-slate-500',
        )}
      >
        {meta.expired
          ? `Expired ${Math.abs(meta.daysUntil)}d ago`
          : meta.dueSoon
            ? `Due in ${meta.daysUntil}d`
            : 'Active'}
      </div>
    </div>
  )
}

function CalendarEventContent(eventInfo: EventContentArg) {
  const eventType = eventInfo.event.extendedProps.eventType as
    | 'regular'
    | 'replacement'
  const teacherName = eventInfo.event.extendedProps.teacherName as string
  const studentName = eventInfo.event.extendedProps.studentName as string
  const badgeClass =
    eventType === 'regular'
      ? 'bg-sky-100 text-sky-700'
      : 'bg-orange-100 text-orange-700'

  return (
    <div
      className={cn(
        'rounded-xl border px-2.5 py-2 shadow-sm',
        eventType === 'regular' && 'border-sky-200 bg-sky-500 text-white',
        eventType === 'replacement' &&
          'border-orange-200 bg-orange-500 text-white',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]',
            badgeClass,
          )}
        >
          {eventType === 'regular' ? 'Regular' : 'Replacement'}
        </span>
        <span className="text-[10px] font-medium text-white/90">
          {eventInfo.timeText}
        </span>
      </div>
      <div className="mt-2 text-xs font-semibold leading-snug text-white">
        {eventInfo.event.title}
      </div>
      <div className="mt-1 text-[11px] text-white/90">{teacherName}</div>
      <div className="mt-0.5 text-[11px] text-white/80">{studentName}</div>
    </div>
  )
}

type StudentDashboardSectionProps = {
  activeFilter: FilterKey
  isLoading: boolean
  students: Student[]
  todayString: string
  onOpenRenewal: (studentId: number) => void
  onToggleFilter: (filter: FilterKey) => void
}

function StudentDashboardSection({
  activeFilter,
  isLoading,
  students,
  todayString,
  onOpenRenewal,
  onToggleFilter,
}: StudentDashboardSectionProps) {
  const studentsWithStatus = students.map((student) => ({
    student,
    status: getStudentStatus(student, todayString),
  }))

  const filteredStudents = studentsWithStatus.filter(({ status }) => {
    if (activeFilter === 'hours') {
      return status.hoursLow || status.lessonExpired
    }

    if (activeFilter === 'accountFee') {
      return status.accountFeeNeedsAttention
    }

    if (activeFilter === 'mirai') {
      return status.miraiClubNeedsAttention
    }

    if (activeFilter === 'normal') {
      return status.isNormal
    }

    return true
  })

  const totalStudents = studentsWithStatus.length
  const hoursAlertCount = studentsWithStatus.filter(
    ({ status }) => status.hoursLow || status.lessonExpired,
  ).length
  const accountFeeAlertCount = studentsWithStatus.filter(
    ({ status }) => status.accountFeeNeedsAttention,
  ).length
  const miraiAlertCount = studentsWithStatus.filter(
    ({ status }) => status.miraiClubNeedsAttention,
  ).length

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-500">Total Students</div>
          <div className="mt-3 text-3xl font-semibold text-slate-900">
            {totalStudents}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-500">Hours Attention</div>
          <div className="mt-3 text-3xl font-semibold text-[#fc0c97]">
            {hoursAlertCount}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-500">Account Fee Due</div>
          <div className="mt-3 text-3xl font-semibold text-[#fc0c97]">
            {accountFeeAlertCount}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-500">Mirai Club Due</div>
          <div className="mt-3 text-3xl font-semibold text-[#fc0c97]">
            {miraiAlertCount}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-[#f8fafc] px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Student Hours & Expiry Board
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Admin-only table for hours balance and renewal control.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {studentFilterOptions.map((option) => {
                const selected = activeFilter === option.key
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => onToggleFilter(option.key)}
                    className={cn(
                      'rounded-xl border px-4 py-2 text-sm font-medium transition',
                      selected
                        ? 'border-[#fc0c97] bg-[#fff1f8] text-[#fc0c97]'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1120px] divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <th className="px-6 py-4">Student Name</th>
                <th className="px-6 py-4">Remaining Hours</th>
                <th className="px-6 py-4">Lesson Expiry</th>
                <th className="px-6 py-4">Account Fee Expiry</th>
                <th className="px-6 py-4">Mirai Club Expiry</th>
                <th className="px-6 py-4">Global Status</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-16 text-center text-sm text-slate-500"
                  >
                    Loading students from Supabase...
                  </td>
                </tr>
              )}

              {!isLoading &&
                filteredStudents.map(({ student, status }) => (
                  <tr
                    key={student.id}
                    className="align-top transition hover:bg-[#fff8fc]"
                  >
                    <td className="px-6 py-5">
                      <div className="space-y-1">
                        <div className="text-base font-semibold text-slate-900">
                          {student.name}
                        </div>
                        <div className="text-sm text-slate-500">
                          Student ID #{student.id.toString().padStart(3, '0')}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="space-y-2">
                        <div
                          className={cn(
                            'inline-flex min-w-20 items-center justify-center rounded-xl px-3 py-2 text-lg font-semibold',
                            status.hoursLow
                              ? 'bg-[#fff1f8] text-[#be185d] ring-1 ring-inset ring-[#fecdd3]'
                              : 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
                          )}
                        >
                          {student.remainingHours}
                        </div>
                        <div className="text-xs font-medium text-slate-500">
                          {status.hoursLow
                            ? 'Immediate action needed'
                            : 'Healthy balance'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <ExpiryCell
                        date={student.lessonExpiryDate}
                        meta={status.lessonExpiry}
                      />
                    </td>
                    <td className="px-6 py-5">
                      <ExpiryCell
                        date={student.accountFeeExpiryDate}
                        meta={status.accountFeeExpiry}
                      />
                    </td>
                    <td className="px-6 py-5">
                      <ExpiryCell
                        date={student.miraiClubExpiryDate}
                        meta={status.miraiClubExpiry}
                      />
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex max-w-[320px] flex-wrap gap-2">
                        {status.tags.map((tag) => (
                          <StatusChip
                            key={`${student.id}-${tag.label}`}
                            label={tag.label}
                            tone={tag.tone}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <button
                        type="button"
                        onClick={() => onOpenRenewal(student.id)}
                        className="inline-flex items-center justify-center rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
                      >
                        Renew
                      </button>
                    </td>
                  </tr>
                ))}

              {!isLoading && filteredStudents.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-16 text-center text-sm text-slate-500"
                  >
                    No students found. Create records in Supabase Table Editor or
                    run the seed rows from the SQL file.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function App() {
  const isMobile = useIsMobile()
  const todayString = getTodayString()

  const [students, setStudents] = useState<Student[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSavingStudent, setIsSavingStudent] = useState(false)
  const [studentSaveError, setStudentSaveError] = useState<string | null>(null)
  const [isSavingSchedule, setIsSavingSchedule] = useState(false)
  const [scheduleSaveError, setScheduleSaveError] = useState<string | null>(null)
  const [studentFilter, setStudentFilter] = useState<FilterKey>('all')
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)
  const [studentFormState, setStudentFormState] = useState<RenewalFormState>({
    addHours: '0',
    lessonExpiryDate: '',
    accountFeeExpiryDate: '',
    miraiClubExpiryDate: '',
  })
  const [activeSection, setActiveSection] = useState<AppSection>('calendar')
  const [selectedSessionKey, setSelectedSessionKey] = useState<string>('')
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null)
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false)
  const [scheduleFormState, setScheduleFormState] = useState<ScheduleFormState>({
    title: '',
    teacherId: '',
    studentId: '',
    eventType: 'regular',
    dayOfWeek: '2',
    scheduledDate: todayString,
    startTime: '19:30',
    endTime: '21:30',
    startRecur: todayString,
    endRecur: '',
    notes: '',
  })

  const teacherMap = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.id, teacher])),
    [teachers],
  )
  const studentMap = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students],
  )

  const sessionOptions = useMemo<UserSession[]>(() => {
    if (teachers.length === 0) {
      return [
        {
          key: 'local-admin',
          role: 'admin',
          label: 'Local Admin Preview',
          teacherId: null,
        },
      ]
    }

    return teachers.map((teacher) => ({
      key: `teacher-${teacher.id}`,
      role: teacher.role,
      label:
        teacher.role === 'admin'
          ? `${teacher.fullName} (Admin)`
          : `${teacher.fullName} (Teacher)`,
      teacherId: teacher.id,
    }))
  }, [teachers])

  const currentSession =
    sessionOptions.find((session) => session.key === selectedSessionKey) ??
    sessionOptions[0]

  useEffect(() => {
    if (!selectedSessionKey && sessionOptions[0]) {
      setSelectedSessionKey(sessionOptions[0].key)
      return
    }

    if (
      selectedSessionKey &&
      !sessionOptions.some((session) => session.key === selectedSessionKey) &&
      sessionOptions[0]
    ) {
      setSelectedSessionKey(sessionOptions[0].key)
    }
  }, [selectedSessionKey, sessionOptions])

  useEffect(() => {
    if (currentSession?.role === 'teacher' && activeSection !== 'calendar') {
      setActiveSection('calendar')
    }
  }, [activeSection, currentSession])

  const selectedStudent =
    students.find((student) => student.id === selectedStudentId) ?? null
  const editingSchedule =
    schedules.find((schedule) => schedule.id === editingScheduleId) ?? null

  useEffect(() => {
    if (!selectedStudent) {
      return
    }

    setStudentFormState({
      addHours: '0',
      lessonExpiryDate: selectedStudent.lessonExpiryDate,
      accountFeeExpiryDate: selectedStudent.accountFeeExpiryDate,
      miraiClubExpiryDate: selectedStudent.miraiClubExpiryDate,
    })
  }, [selectedStudent])

  useEffect(() => {
    if (!isCreatingSchedule && !editingSchedule) {
      return
    }

    setScheduleFormState(
      buildScheduleFormState(
        editingSchedule,
        todayString,
        currentSession?.teacherId ?? teachers[0]?.id ?? null,
      ),
    )
  }, [
    currentSession,
    editingSchedule,
    isCreatingSchedule,
    teachers,
    todayString,
  ])

  useEffect(() => {
    let cancelled = false

    async function loadCoreData() {
      if (!isSupabaseConfigured) {
        setLoadError(
          'Supabase is not configured yet. Fill in .env.local, then restart npm run dev.',
        )
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        setLoadError(null)

        const [nextTeachers, nextStudents, nextSchedules] = await Promise.all([
          fetchTeachersFromSupabase(),
          fetchStudentsFromSupabase(),
          fetchSchedulesFromSupabase(),
        ])

        if (!cancelled) {
          setTeachers(nextTeachers)
          setStudents(nextStudents)
          setSchedules(nextSchedules)
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Failed to load Supabase data.',
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadCoreData()

    return () => {
      cancelled = true
    }
  }, [])

  const visibleSchedules = useMemo(() => {
    if (!currentSession) {
      return schedules
    }

    if (currentSession.role === 'teacher' && currentSession.teacherId !== null) {
      return schedules.filter(
        (schedule) => schedule.teacherId === currentSession.teacherId,
      )
    }

    return schedules
  }, [currentSession, schedules])

  const calendarEvents = useMemo(
    () => buildScheduleEvents(visibleSchedules, teacherMap, studentMap),
    [studentMap, teacherMap, visibleSchedules],
  )

  const activeVisibleSchedules = visibleSchedules.filter(
    (schedule) => schedule.status === 'active',
  )
  const regularCount = activeVisibleSchedules.filter(
    (schedule) => schedule.eventType === 'regular',
  ).length
  const replacementCount = activeVisibleSchedules.filter(
    (schedule) => schedule.eventType === 'replacement',
  ).length
  const visibleTeacherCount =
    currentSession?.role === 'teacher'
      ? 1
      : new Set(activeVisibleSchedules.map((schedule) => schedule.teacherId)).size

  const navItems =
    currentSession?.role === 'teacher'
      ? [{ key: 'calendar', label: 'Calendar' }]
      : [
          { key: 'calendar', label: 'Calendar' },
          { key: 'students', label: 'Students' },
        ]

  function updateStudentForm<K extends keyof RenewalFormState>(
    key: K,
    value: RenewalFormState[K],
  ) {
    setStudentFormState((currentState) => ({
      ...currentState,
      [key]: value,
    }))
  }

  function updateScheduleForm<K extends keyof ScheduleFormState>(
    key: K,
    value: ScheduleFormState[K],
  ) {
    setScheduleFormState((currentState) => ({
      ...currentState,
      [key]: value,
      ...(key === 'eventType' && value === 'replacement'
        ? { dayOfWeek: '', startRecur: '', endRecur: '' }
        : {}),
    }))
  }

  function openStudentRenewal(studentId: number) {
    setStudentSaveError(null)
    setSelectedStudentId(studentId)
  }

  function closeStudentRenewal() {
    setSelectedStudentId(null)
    setStudentSaveError(null)
  }

  function openCreateSchedule(prefillDate?: string) {
    setScheduleSaveError(null)
    setEditingScheduleId(null)
    setIsCreatingSchedule(true)

    const clickedDate = prefillDate ?? todayString
    const clickedDayOfWeek = String(parseLocalDate(clickedDate).getDay())

    setScheduleFormState({
      title: '',
      teacherId:
        currentSession?.role === 'teacher' && currentSession.teacherId
          ? String(currentSession.teacherId)
          : teachers[0]
            ? String(teachers[0].id)
            : '',
      studentId: '',
      eventType: prefillDate ? 'replacement' : 'regular',
      dayOfWeek: clickedDayOfWeek,
      scheduledDate: clickedDate,
      startTime: '19:30',
      endTime: '21:30',
      startRecur: clickedDate,
      endRecur: '',
      notes: '',
    })
  }

  function openEditSchedule(scheduleId: number) {
    setScheduleSaveError(null)
    setIsCreatingSchedule(false)
    setEditingScheduleId(scheduleId)
  }

  function closeScheduleModal() {
    setIsCreatingSchedule(false)
    setEditingScheduleId(null)
    setScheduleSaveError(null)
  }

  async function handleStudentRenewalSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!selectedStudent || !supabase) {
      return
    }

    const parsedHours = Number.parseInt(studentFormState.addHours, 10)
    const hoursToAdd =
      Number.isFinite(parsedHours) && parsedHours > 0 ? parsedHours : 0

    try {
      setIsSavingStudent(true)
      setStudentSaveError(null)

      const { data, error } = await supabase
        .from('students')
        .update({
          remaining_hours: selectedStudent.remainingHours + hoursToAdd,
          lesson_expiry_date:
            studentFormState.lessonExpiryDate || selectedStudent.lessonExpiryDate,
          account_fee_expiry_date:
            studentFormState.accountFeeExpiryDate ||
            selectedStudent.accountFeeExpiryDate,
          mirai_club_expiry_date:
            studentFormState.miraiClubExpiryDate ||
            selectedStudent.miraiClubExpiryDate,
        })
        .eq('id', selectedStudent.id)
        .select(
          'id, teacher_id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date',
        )
        .single()

      if (error) {
        throw error
      }

      const updatedStudent = mapStudentRow(data)
      setStudents((currentStudents) =>
        currentStudents.map((student) =>
          student.id === updatedStudent.id ? updatedStudent : student,
        ),
      )

      closeStudentRenewal()
    } catch (error) {
      setStudentSaveError(
        error instanceof Error ? error.message : 'Failed to save renewal.',
      )
    } finally {
      setIsSavingStudent(false)
    }
  }

  async function handleScheduleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!supabase) {
      return
    }

    const teacherId = Number(scheduleFormState.teacherId)
    if (!teacherId) {
      setScheduleSaveError('Please select a teacher for this schedule.')
      return
    }

    if (!scheduleFormState.title.trim()) {
      setScheduleSaveError('Please enter a class title.')
      return
    }

    const payload: Database['public']['Tables']['schedules']['Update'] = {
      teacher_id: teacherId,
      student_id: scheduleFormState.studentId
        ? Number(scheduleFormState.studentId)
        : null,
      title: scheduleFormState.title.trim(),
      event_type: scheduleFormState.eventType,
      recurrence_type:
        scheduleFormState.eventType === 'regular' ? 'weekly' : 'none',
      day_of_week:
        scheduleFormState.eventType === 'regular'
          ? Number(scheduleFormState.dayOfWeek)
          : null,
      scheduled_date:
        scheduleFormState.eventType === 'replacement'
          ? scheduleFormState.scheduledDate
          : null,
      start_time: `${scheduleFormState.startTime}:00`,
      end_time: `${scheduleFormState.endTime}:00`,
      start_recur:
        scheduleFormState.eventType === 'regular'
          ? scheduleFormState.startRecur
          : null,
      end_recur:
        scheduleFormState.eventType === 'regular' &&
        scheduleFormState.endRecur.trim()
          ? scheduleFormState.endRecur
          : null,
      notes: scheduleFormState.notes.trim() || null,
      status: 'active',
    }

    try {
      setIsSavingSchedule(true)
      setScheduleSaveError(null)

      if (isCreatingSchedule) {
        const { data, error } = await supabase
          .from('schedules')
          .insert(payload as Database['public']['Tables']['schedules']['Insert'])
          .select(
            'id, teacher_id, student_id, title, event_type, recurrence_type, day_of_week, scheduled_date, start_time, end_time, start_recur, end_recur, status, notes',
          )
          .single()

        if (error) {
          throw error
        }

        const nextSchedule = mapScheduleRow(data)
        setSchedules((currentSchedules) =>
          [...currentSchedules, nextSchedule].sort((left, right) =>
            left.title.localeCompare(right.title),
          ),
        )
      } else if (editingSchedule) {
        const { data, error } = await supabase
          .from('schedules')
          .update(payload)
          .eq('id', editingSchedule.id)
          .select(
            'id, teacher_id, student_id, title, event_type, recurrence_type, day_of_week, scheduled_date, start_time, end_time, start_recur, end_recur, status, notes',
          )
          .single()

        if (error) {
          throw error
        }

        const updatedSchedule = mapScheduleRow(data)
        setSchedules((currentSchedules) =>
          currentSchedules.map((schedule) =>
            schedule.id === updatedSchedule.id ? updatedSchedule : schedule,
          ),
        )
      }

      closeScheduleModal()
    } catch (error) {
      setScheduleSaveError(
        error instanceof Error ? error.message : 'Failed to save schedule.',
      )
    } finally {
      setIsSavingSchedule(false)
    }
  }

  async function handleCancelSchedule() {
    if (!editingSchedule || !supabase) {
      return
    }

    if (!window.confirm('Cancel this schedule from the timetable?')) {
      return
    }

    try {
      setIsSavingSchedule(true)
      setScheduleSaveError(null)

      const { data, error } = await supabase
        .from('schedules')
        .update({ status: 'cancelled' })
        .eq('id', editingSchedule.id)
        .select(
          'id, teacher_id, student_id, title, event_type, recurrence_type, day_of_week, scheduled_date, start_time, end_time, start_recur, end_recur, status, notes',
        )
        .single()

      if (error) {
        throw error
      }

      const cancelledSchedule = mapScheduleRow(data)
      setSchedules((currentSchedules) =>
        currentSchedules.map((schedule) =>
          schedule.id === cancelledSchedule.id ? cancelledSchedule : schedule,
        ),
      )

      closeScheduleModal()
    } catch (error) {
      setScheduleSaveError(
        error instanceof Error ? error.message : 'Failed to cancel schedule.',
      )
    } finally {
      setIsSavingSchedule(false)
    }
  }

  const currentScheduleModalOpen = isCreatingSchedule || Boolean(editingSchedule)
  const currentScheduleForRead = editingSchedule
  const isAdminView = currentSession?.role !== 'teacher'

  return (
    <main className="min-h-screen bg-[#f3f4f6] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-[248px] shrink-0 bg-[#2f2f2f] text-white lg:flex lg:flex-col">
          <div className="flex h-16 items-center border-b border-white/10 px-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fc0c97] text-lg font-bold">
              M
            </div>
            <div className="ml-3">
              <div className="text-sm font-semibold">Mirai Admin</div>
              <div className="text-xs text-white/60">Teaching System</div>
            </div>
          </div>

          <div className="px-4 py-5">
            <div className="rounded-2xl bg-[#fc0c97] px-4 py-3">
              <div className="text-sm font-semibold">
                {currentSession?.role === 'teacher'
                  ? 'Teacher Calendar'
                  : 'Admin Workspace'}
              </div>
              <div className="mt-1 text-xs text-white/85">
                {currentSession?.role === 'teacher'
                  ? 'Assigned classes only'
                  : 'Calendar and student control center'}
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-3">
            {navItems.map((item) => {
              const active = activeSection === item.key
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveSection(item.key as AppSection)}
                  className={cn(
                    'flex w-full items-center rounded-xl px-4 py-3 text-left text-sm font-medium transition',
                    active
                      ? 'bg-white text-[#fc0c97]'
                      : 'text-white/70 hover:bg-white/5 hover:text-white',
                  )}
                >
                  <span className="h-2 w-2 rounded-full bg-current" />
                  <span className="ml-3">{item.label}</span>
                </button>
              )
            })}
          </nav>

          <div className="border-t border-white/10 px-6 py-5 text-xs text-white/50">
            Phase 3 calendar board · mobile ready
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <div className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#fc0c97]">
                  {activeSection === 'calendar' ? 'Calendar Board' : 'Student Board'}
                </div>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
                  {activeSection === 'calendar'
                    ? 'Classes & Timetable'
                    : 'Student Hours & Expiry'}
                </h1>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
                  Local Date: {formatDate(todayString)}
                </div>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                  <span className="font-medium">View As</span>
                  <select
                    value={currentSession?.key ?? ''}
                    onChange={(event) => setSelectedSessionKey(event.target.value)}
                    className="bg-transparent text-sm font-semibold text-slate-900 outline-none"
                  >
                    {sessionOptions.map((session) => (
                      <option key={session.key} value={session.key}>
                        {session.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div
                  className={cn(
                    'rounded-xl px-4 py-2 text-sm font-semibold',
                    isSupabaseConfigured
                      ? 'bg-[#fff1f8] text-[#fc0c97]'
                      : 'bg-amber-100 text-amber-800',
                  )}
                >
                  {isSupabaseConfigured ? 'Supabase Connected' : 'Setup Required'}
                </div>
              </div>
            </div>
          </div>

          <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
            {loadError && (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
                {loadError}
              </section>
            )}

            {activeSection === 'calendar' && (
              <>
                <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="text-sm font-medium text-slate-500">
                      Active Schedule Cards
                    </div>
                    <div className="mt-3 text-3xl font-semibold text-slate-900">
                      {activeVisibleSchedules.length}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="text-sm font-medium text-slate-500">
                      Regular Classes
                    </div>
                    <div className="mt-3 text-3xl font-semibold text-sky-600">
                      {regularCount}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="text-sm font-medium text-slate-500">
                      Replacement Classes
                    </div>
                    <div className="mt-3 text-3xl font-semibold text-orange-500">
                      {replacementCount}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="text-sm font-medium text-slate-500">
                      Visible Teachers
                    </div>
                    <div className="mt-3 text-3xl font-semibold text-[#fc0c97]">
                      {visibleTeacherCount}
                    </div>
                  </div>
                </section>

                <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
                  <div className="border-b border-slate-200 bg-[#f8fafc] px-5 py-4 sm:px-6">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-slate-900">
                          Full Calendar Timetable Board
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                          Blue = Regular Class. Orange = Replacement Class.
                          Admin can click events to cancel or reschedule. Teachers
                          only see assigned classes.
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <span className="h-3 w-3 rounded-full bg-sky-500" />
                          <span>Regular Class</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <span className="h-3 w-3 rounded-full bg-orange-500" />
                          <span>Replacement Class</span>
                        </div>
                        {isAdminView && (
                          <button
                            type="button"
                            onClick={() => openCreateSchedule()}
                            className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
                          >
                            New Schedule
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 sm:p-6">
                    <FullCalendar
                      key={`calendar-${isMobile ? 'mobile' : 'desktop'}-${currentSession?.key ?? 'anon'}`}
                      plugins={[
                        dayGridPlugin,
                        timeGridPlugin,
                        listPlugin,
                        interactionPlugin,
                        rrulePlugin,
                      ]}
                      initialView={isMobile ? 'listWeek' : 'dayGridMonth'}
                      headerToolbar={
                        isMobile
                          ? {
                              left: 'prev,next',
                              center: 'title',
                              right: 'dayGridMonth,listWeek',
                            }
                          : {
                              left: 'prev,next today',
                              center: 'title',
                              right: 'dayGridMonth,timeGridWeek,listWeek',
                            }
                      }
                      buttonText={{
                        today: 'Today',
                        dayGridMonth: 'Month',
                        timeGridWeek: 'Week',
                        listWeek: 'Agenda',
                      }}
                      height="auto"
                      timeZone="local"
                      events={calendarEvents}
                      dayMaxEvents={2}
                      nowIndicator
                      eventDisplay="block"
                      displayEventTime
                      eventTimeFormat={{
                        hour: 'numeric',
                        minute: '2-digit',
                        meridiem: 'short',
                      }}
                      dateClick={(arg: DateClickArg) => {
                        if (isAdminView) {
                          openCreateSchedule(arg.dateStr)
                        }
                      }}
                      eventClick={(arg: EventClickArg) => {
                        const scheduleId = Number(
                          arg.event.extendedProps.scheduleId,
                        )
                        if (Number.isFinite(scheduleId)) {
                          openEditSchedule(scheduleId)
                        }
                      }}
                      eventContent={(eventInfo) => (
                        <CalendarEventContent {...eventInfo} />
                      )}
                    />
                  </div>
                </section>
              </>
            )}

            {activeSection === 'students' && (
              <StudentDashboardSection
                activeFilter={studentFilter}
                isLoading={isLoading}
                students={students}
                todayString={todayString}
                onOpenRenewal={openStudentRenewal}
                onToggleFilter={(filter) =>
                  setStudentFilter((currentFilter) =>
                    currentFilter === filter ? 'all' : filter,
                  )
                }
              />
            )}
          </div>
        </section>
      </div>

      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 py-6">
          <div className="w-full max-w-2xl overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.15)]">
            <div className="border-b border-slate-200 bg-[#f8fafc] px-6 py-5 sm:px-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-[#fc0c97]">
                    Manual renewal panel
                  </div>
                  <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                    Renew {selectedStudent.name}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    This save button updates the real Supabase student record.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeStudentRenewal}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white"
                >
                  Close
                </button>
              </div>
            </div>

            <form
              onSubmit={handleStudentRenewalSubmit}
              className="space-y-6 px-6 py-6 sm:px-8"
            >
              <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Current Remaining Hours
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">
                    {selectedStudent.remainingHours}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Current Local Date
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">
                    {formatDate(todayString)}
                  </div>
                </div>
              </div>

              {studentSaveError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {studentSaveError}
                </div>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Add Hours
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={studentFormState.addHours}
                    onChange={(event) =>
                      updateStudentForm('addHours', event.target.value)
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    New Lesson Expiry Date
                  </span>
                  <input
                    type="date"
                    value={studentFormState.lessonExpiryDate}
                    onChange={(event) =>
                      updateStudentForm('lessonExpiryDate', event.target.value)
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    New Account Fee Expiry Date
                  </span>
                  <input
                    type="date"
                    value={studentFormState.accountFeeExpiryDate}
                    onChange={(event) =>
                      updateStudentForm(
                        'accountFeeExpiryDate',
                        event.target.value,
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    New Mirai Club Expiry Date
                  </span>
                  <input
                    type="date"
                    value={studentFormState.miraiClubExpiryDate}
                    onChange={(event) =>
                      updateStudentForm(
                        'miraiClubExpiryDate',
                        event.target.value,
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={closeStudentRenewal}
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingStudent}
                  className="rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSavingStudent ? 'Saving...' : 'Save Renewal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {currentScheduleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 py-6">
          <div className="w-full max-w-3xl overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.15)]">
            <div className="border-b border-slate-200 bg-[#f8fafc] px-6 py-5 sm:px-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-[#fc0c97]">
                    {isCreatingSchedule
                      ? 'Create timetable entry'
                      : currentSession?.role === 'teacher'
                        ? 'Class details'
                        : 'Edit timetable entry'}
                  </div>
                  <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                    {isCreatingSchedule
                      ? 'New Schedule'
                      : currentScheduleForRead?.title ?? 'Schedule'}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {currentSession?.role === 'teacher'
                      ? 'Teachers can view only their assigned classes.'
                      : 'Admins can reschedule, cancel, or create regular and replacement classes.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeScheduleModal}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white"
                >
                  Close
                </button>
              </div>
            </div>

            <form onSubmit={handleScheduleSubmit} className="space-y-6 px-6 py-6 sm:px-8">
              {scheduleSaveError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {scheduleSaveError}
                </div>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Class Title
                  </span>
                  <input
                    type="text"
                    value={scheduleFormState.title}
                    onChange={(event) =>
                      updateScheduleForm('title', event.target.value)
                    }
                    disabled={!isAdminView}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-50"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Teacher
                  </span>
                  <select
                    value={scheduleFormState.teacherId}
                    onChange={(event) =>
                      updateScheduleForm('teacherId', event.target.value)
                    }
                    disabled={!isAdminView}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-50"
                  >
                    <option value="">Select teacher</option>
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.fullName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Student
                  </span>
                  <select
                    value={scheduleFormState.studentId}
                    onChange={(event) =>
                      updateScheduleForm('studentId', event.target.value)
                    }
                    disabled={!isAdminView}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-50"
                  >
                    <option value="">Unassigned / group class</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Event Type
                  </span>
                  <select
                    value={scheduleFormState.eventType}
                    onChange={(event) =>
                      updateScheduleForm(
                        'eventType',
                        event.target.value as ScheduleFormState['eventType'],
                      )
                    }
                    disabled={!isAdminView}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-50"
                  >
                    <option value="regular">Regular Class</option>
                    <option value="replacement">Replacement Class</option>
                  </select>
                </label>

                {scheduleFormState.eventType === 'regular' ? (
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Repeat Every
                    </span>
                    <select
                      value={scheduleFormState.dayOfWeek}
                      onChange={(event) =>
                        updateScheduleForm('dayOfWeek', event.target.value)
                      }
                      disabled={!isAdminView}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-50"
                    >
                      {weekdayLabels.map((label, index) => (
                        <option key={label} value={index}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Scheduled Date
                    </span>
                    <input
                      type="date"
                      value={scheduleFormState.scheduledDate}
                      onChange={(event) =>
                        updateScheduleForm('scheduledDate', event.target.value)
                      }
                      disabled={!isAdminView}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-50"
                    />
                  </label>
                )}

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Start Time
                  </span>
                  <input
                    type="time"
                    value={scheduleFormState.startTime}
                    onChange={(event) =>
                      updateScheduleForm('startTime', event.target.value)
                    }
                    disabled={!isAdminView}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-50"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    End Time
                  </span>
                  <input
                    type="time"
                    value={scheduleFormState.endTime}
                    onChange={(event) =>
                      updateScheduleForm('endTime', event.target.value)
                    }
                    disabled={!isAdminView}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-50"
                  />
                </label>

                {scheduleFormState.eventType === 'regular' && (
                  <>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-slate-700">
                        Recurrence Start Date
                      </span>
                      <input
                        type="date"
                        value={scheduleFormState.startRecur}
                        onChange={(event) =>
                          updateScheduleForm('startRecur', event.target.value)
                        }
                        disabled={!isAdminView}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-50"
                      />
                    </label>

                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-slate-700">
                        Recurrence End Date
                      </span>
                      <input
                        type="date"
                        value={scheduleFormState.endRecur}
                        onChange={(event) =>
                          updateScheduleForm('endRecur', event.target.value)
                        }
                        disabled={!isAdminView}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-50"
                      />
                    </label>
                  </>
                )}

                <label className="space-y-2 sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Notes
                  </span>
                  <textarea
                    rows={4}
                    value={scheduleFormState.notes}
                    onChange={(event) =>
                      updateScheduleForm('notes', event.target.value)
                    }
                    disabled={!isAdminView}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-50"
                  />
                </label>
              </div>

              {!isCreatingSchedule && currentScheduleForRead && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  <div className="font-semibold text-slate-900">
                    Current Schedule Snapshot
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      Teacher:{' '}
                      {teacherMap.get(currentScheduleForRead.teacherId)?.fullName ??
                        'Unknown'}
                    </div>
                    <div>
                      Student:{' '}
                      {currentScheduleForRead.studentId
                        ? studentMap.get(currentScheduleForRead.studentId)?.name ??
                          'Unknown'
                        : 'Unassigned / group class'}
                    </div>
                    <div>
                      Event Type:{' '}
                      {currentScheduleForRead.eventType === 'regular'
                        ? 'Regular Class'
                        : 'Replacement Class'}
                    </div>
                    <div>
                      Time:{' '}
                      {formatTime(currentScheduleForRead.startTime)} -{' '}
                      {formatTime(currentScheduleForRead.endTime)}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  {isAdminView && !isCreatingSchedule && currentScheduleForRead && (
                    <button
                      type="button"
                      onClick={handleCancelSchedule}
                      disabled={isSavingSchedule}
                      className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Cancel Schedule
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={closeScheduleModal}
                    className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    {isAdminView ? 'Close' : 'Back'}
                  </button>
                  {isAdminView && (
                    <button
                      type="submit"
                      disabled={isSavingSchedule}
                      className="rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isSavingSchedule
                        ? 'Saving...'
                        : isCreatingSchedule
                          ? 'Create Schedule'
                          : 'Save Changes'}
                    </button>
                  )}
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
