import { useEffect, useMemo, useState } from 'react'
import type { EventClickArg, EventContentArg, EventInput } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import FullCalendar from '@fullcalendar/react'
import interactionPlugin, { type DateClickArg } from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import rrulePlugin from '@fullcalendar/rrule'
import timeGridPlugin from '@fullcalendar/timegrid'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { Database } from './types/database'

type AppSection = 'calendar' | 'classrooms' | 'students' | 'teachers'
type FilterKey = 'all' | 'hours' | 'accountFee' | 'mirai' | 'normal'
type AttendanceStatus = 'present' | 'absent' | 'leave'
type PerformanceMetricKey =
  | 'logicalThinking'
  | 'codingCreativity'
  | 'problemSolving'
  | 'expressiveness'
  | 'sustainedFocus'
type ReviewScoreField =
  | 'logicalThinkingScore'
  | 'codingCreativityScore'
  | 'problemSolvingScore'
  | 'expressivenessScore'
  | 'sustainedFocusScore'
type ReviewRemarkField =
  | 'logicalThinkingRemark'
  | 'codingCreativityRemark'
  | 'problemSolvingRemark'
  | 'expressivenessRemark'
  | 'sustainedFocusRemark'

type Student = {
  id: number
  teacherId: number | null
  name: string
  remainingHours: number
  lessonExpiryDate: string
  accountFeeExpiryDate: string
  miraiClubExpiryDate: string
  isActive: boolean
}

type Teacher = {
  id: number
  username: string
  fullName: string
  email: string | null
  phone: string | null
  role: 'admin' | 'teacher'
}

type Schedule = {
  id: number
  teacherId: number
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

type ScheduleParticipant = {
  id: number
  scheduleId: number
  studentId: number
  isActive: boolean
}

type LessonLogSummary = {
  id: number
  scheduleId: number
  teacherId: number
  lessonDate: string
  lessonRemark: string | null
  submittedAt: string
  revisionNumber: number
  parentLogId: number | null
}

type LessonLogStudent = {
  id: number
  lessonLogId: number
  studentId: number
  attendanceStatus: AttendanceStatus
}

type LessonLogStudentReview = {
  id: number
  lessonLogId: number
  studentId: number
  logicalThinkingScore: number | null
  logicalThinkingRemark: string | null
  codingCreativityScore: number | null
  codingCreativityRemark: string | null
  problemSolvingScore: number | null
  problemSolvingRemark: string | null
  expressivenessScore: number | null
  expressivenessRemark: string | null
  sustainedFocusScore: number | null
  sustainedFocusRemark: string | null
}

type AttendanceReviewFormState = {
  logicalThinkingScore: number | null
  logicalThinkingRemark: string
  codingCreativityScore: number | null
  codingCreativityRemark: string
  problemSolvingScore: number | null
  problemSolvingRemark: string
  expressivenessScore: number | null
  expressivenessRemark: string
  sustainedFocusScore: number | null
  sustainedFocusRemark: string
}

type StatusTag = {
  label: string
  tone: 'critical' | 'healthy'
}

type RenewalFormState = {
  addHours: string
  lessonExpiryDate: string
  accountFeeExpiryDate: string
  miraiClubExpiryDate: string
  remark: string
}

type CreateStudentFormState = {
  fullName: string
  teacherId: string
  initialHours: string
  lessonExpiryDate: string
  accountFeeExpiryDate: string
  miraiClubExpiryDate: string
  notes: string
  classIds: string[]
}

type CreateTeacherFormState = {
  username: string
  fullName: string
  email: string
  phone: string
  role: 'admin' | 'teacher'
}

type ScheduleFormState = {
  title: string
  teacherId: string
  eventType: 'regular' | 'replacement'
  dayOfWeek: string
  scheduledDate: string
  startTime: string
  endTime: string
  startRecur: string
  endRecur: string
  notes: string
  participantIds: string[]
}

type AttendanceModalState = {
  scheduleId: number
  occurrenceDate: string
  title: string
}

type ClassStatusSummary = {
  healthy: number
  attention: number
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
  | 'is_active'
>

type TeacherRow = Pick<
  Database['public']['Tables']['teachers']['Row'],
  'id' | 'username' | 'full_name' | 'email' | 'phone' | 'role'
>

type ScheduleRow = Pick<
  Database['public']['Tables']['schedules']['Row'],
  | 'id'
  | 'teacher_id'
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

type ScheduleParticipantRow = Pick<
  Database['public']['Tables']['schedule_students']['Row'],
  'id' | 'schedule_id' | 'student_id' | 'is_active'
>

type LessonLogSummaryRow = Pick<
  Database['public']['Tables']['lesson_logs']['Row'],
  | 'id'
  | 'schedule_id'
  | 'teacher_id'
  | 'lesson_date'
  | 'lesson_remark'
  | 'submitted_at'
  | 'revision_number'
  | 'parent_log_id'
>

type LessonLogStudentRow = Pick<
  Database['public']['Tables']['lesson_log_students']['Row'],
  'id' | 'lesson_log_id' | 'student_id' | 'attendance_status'
>

type LessonLogStudentReviewRow = Pick<
  Database['public']['Tables']['lesson_log_student_reviews']['Row'],
  | 'id'
  | 'lesson_log_id'
  | 'student_id'
  | 'logical_thinking_score'
  | 'logical_thinking_remark'
  | 'coding_creativity_score'
  | 'coding_creativity_remark'
  | 'problem_solving_score'
  | 'problem_solving_remark'
  | 'expressiveness_score'
  | 'expressiveness_remark'
  | 'sustained_focus_score'
  | 'sustained_focus_remark'
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
const performanceMetricDefinitions: Array<{
  key: PerformanceMetricKey
  scoreField: ReviewScoreField
  remarkField: ReviewRemarkField
  shortLabel: string
  label: string
}> = [
  {
    key: 'logicalThinking',
    scoreField: 'logicalThinkingScore',
    remarkField: 'logicalThinkingRemark',
    shortLabel: 'Logic',
    label: 'Logical & Algorithmic Thinking',
  },
  {
    key: 'codingCreativity',
    scoreField: 'codingCreativityScore',
    remarkField: 'codingCreativityRemark',
    shortLabel: 'Creative',
    label: 'Coding Creativity',
  },
  {
    key: 'problemSolving',
    scoreField: 'problemSolvingScore',
    remarkField: 'problemSolvingRemark',
    shortLabel: 'Solve',
    label: 'Problem Solving',
  },
  {
    key: 'expressiveness',
    scoreField: 'expressivenessScore',
    remarkField: 'expressivenessRemark',
    shortLabel: 'Express',
    label: 'Expressiveness',
  },
  {
    key: 'sustainedFocus',
    scoreField: 'sustainedFocusScore',
    remarkField: 'sustainedFocusRemark',
    shortLabel: 'Focus',
    label: 'Sustained Focus',
  },
]

const studentFilterOptions: Array<{ key: FilterKey; label: string }> = [
  { key: 'hours', label: 'Classes Low / Expired' },
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

function getDateKeyFromDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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
  const isDeactivated = !student.isActive

  const tags: StatusTag[] = []

  if (isDeactivated) {
    tags.push({ label: 'Deactivated', tone: 'critical' })
  }

  if (hoursLow) {
    tags.push({ label: 'Classes Low', tone: 'critical' })
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
    isDeactivated,
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
    isActive: row.is_active,
  }
}

function mapTeacherRow(row: TeacherRow): Teacher {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
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

function mapScheduleParticipantRow(row: ScheduleParticipantRow): ScheduleParticipant {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    studentId: row.student_id,
    isActive: row.is_active,
  }
}

function mapLessonLogSummaryRow(row: LessonLogSummaryRow): LessonLogSummary {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    teacherId: row.teacher_id,
    lessonDate: row.lesson_date,
    lessonRemark: row.lesson_remark,
    submittedAt: row.submitted_at,
    revisionNumber: row.revision_number,
    parentLogId: row.parent_log_id,
  }
}

function mapLessonLogStudentRow(row: LessonLogStudentRow): LessonLogStudent {
  return {
    id: row.id,
    lessonLogId: row.lesson_log_id,
    studentId: row.student_id,
    attendanceStatus: row.attendance_status,
  }
}

function mapLessonLogStudentReviewRow(
  row: LessonLogStudentReviewRow,
): LessonLogStudentReview {
  return {
    id: row.id,
    lessonLogId: row.lesson_log_id,
    studentId: row.student_id,
    logicalThinkingScore: row.logical_thinking_score,
    logicalThinkingRemark: row.logical_thinking_remark,
    codingCreativityScore: row.coding_creativity_score,
    codingCreativityRemark: row.coding_creativity_remark,
    problemSolvingScore: row.problem_solving_score,
    problemSolvingRemark: row.problem_solving_remark,
    expressivenessScore: row.expressiveness_score,
    expressivenessRemark: row.expressiveness_remark,
    sustainedFocusScore: row.sustained_focus_score,
    sustainedFocusRemark: row.sustained_focus_remark,
  }
}

function createEmptyAttendanceReviewForm(): AttendanceReviewFormState {
  return {
    logicalThinkingScore: null,
    logicalThinkingRemark: '',
    codingCreativityScore: null,
    codingCreativityRemark: '',
    problemSolvingScore: null,
    problemSolvingRemark: '',
    expressivenessScore: null,
    expressivenessRemark: '',
    sustainedFocusScore: null,
    sustainedFocusRemark: '',
  }
}

function mapReviewToFormState(
  review: LessonLogStudentReview | null | undefined,
): AttendanceReviewFormState {
  if (!review) {
    return createEmptyAttendanceReviewForm()
  }

  return {
    logicalThinkingScore: review.logicalThinkingScore,
    logicalThinkingRemark: review.logicalThinkingRemark ?? '',
    codingCreativityScore: review.codingCreativityScore,
    codingCreativityRemark: review.codingCreativityRemark ?? '',
    problemSolvingScore: review.problemSolvingScore,
    problemSolvingRemark: review.problemSolvingRemark ?? '',
    expressivenessScore: review.expressivenessScore,
    expressivenessRemark: review.expressivenessRemark ?? '',
    sustainedFocusScore: review.sustainedFocusScore,
    sustainedFocusRemark: review.sustainedFocusRemark ?? '',
  }
}

async function fetchStudentsFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('students')
    .select(
      'id, teacher_id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, is_active',
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
    .select('id, username, full_name, email, phone, role')
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
      'id, teacher_id, title, event_type, recurrence_type, day_of_week, scheduled_date, start_time, end_time, start_recur, end_recur, status, notes',
    )
    .order('title')

  if (error) {
    throw error
  }

  return data.map(mapScheduleRow)
}

async function fetchScheduleParticipantsFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('schedule_students')
    .select('id, schedule_id, student_id, is_active')
    .order('schedule_id')

  if (error) {
    throw error
  }

  return data.map(mapScheduleParticipantRow)
}

async function fetchLessonLogSummariesFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('lesson_logs')
    .select(
      'id, schedule_id, teacher_id, lesson_date, lesson_remark, submitted_at, revision_number, parent_log_id',
    )
    .order('schedule_id')
    .order('lesson_date')
    .order('revision_number', { ascending: false })

  if (error) {
    throw error
  }

  return data.map(mapLessonLogSummaryRow)
}

async function fetchLessonLogStudentReviewsFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('lesson_log_student_reviews')
    .select(
      'id, lesson_log_id, student_id, logical_thinking_score, logical_thinking_remark, coding_creativity_score, coding_creativity_remark, problem_solving_score, problem_solving_remark, expressiveness_score, expressiveness_remark, sustained_focus_score, sustained_focus_remark',
    )
    .order('lesson_log_id')
    .order('student_id')

  if (error) {
    throw error
  }

  return data.map(mapLessonLogStudentReviewRow)
}

async function fetchLatestLessonLogStudents(scheduleId: number, lessonDate: string) {
  if (!supabase) {
    return {
      summary: null as LessonLogSummary | null,
      students: [] as LessonLogStudent[],
      reviews: [] as LessonLogStudentReview[],
    }
  }

  const { data: summaryRows, error: summaryError } = await supabase
    .from('lesson_logs')
    .select(
      'id, schedule_id, teacher_id, lesson_date, lesson_remark, submitted_at, revision_number, parent_log_id',
    )
    .eq('schedule_id', scheduleId)
    .eq('lesson_date', lessonDate)
    .order('revision_number', { ascending: false })
    .limit(1)

  if (summaryError) {
    throw summaryError
  }

  const summaryRow = summaryRows[0]
  if (!summaryRow) {
    return { summary: null, students: [], reviews: [] }
  }

  const { data: attendanceRows, error: attendanceError } = await supabase
    .from('lesson_log_students')
    .select('id, lesson_log_id, student_id, attendance_status')
    .eq('lesson_log_id', summaryRow.id)
    .order('student_id')

  if (attendanceError) {
    throw attendanceError
  }

  const { data: reviewRows, error: reviewError } = await supabase
    .from('lesson_log_student_reviews')
    .select(
      'id, lesson_log_id, student_id, logical_thinking_score, logical_thinking_remark, coding_creativity_score, coding_creativity_remark, problem_solving_score, problem_solving_remark, expressiveness_score, expressiveness_remark, sustained_focus_score, sustained_focus_remark',
    )
    .eq('lesson_log_id', summaryRow.id)
    .order('student_id')

  if (reviewError) {
    throw reviewError
  }

  return {
    summary: mapLessonLogSummaryRow(summaryRow),
    students: attendanceRows.map(mapLessonLogStudentRow),
    reviews: reviewRows.map(mapLessonLogStudentReviewRow),
  }
}

function buildScheduleFormState(
  schedule: Schedule | null,
  todayString: string,
  defaultTeacherId: number | null,
  participantIds: string[],
): ScheduleFormState {
  if (!schedule) {
    return {
      title: '',
      teacherId: defaultTeacherId ? String(defaultTeacherId) : '',
      eventType: 'regular',
      dayOfWeek: String(parseLocalDate(todayString).getDay()),
      scheduledDate: todayString,
      startTime: '19:30',
      endTime: '21:30',
      startRecur: todayString,
      endRecur: '',
      notes: '',
      participantIds,
    }
  }

  return {
    title: schedule.title,
    teacherId: String(schedule.teacherId),
    eventType: schedule.eventType,
    dayOfWeek:
      schedule.dayOfWeek !== null ? String(schedule.dayOfWeek) : String(parseLocalDate(todayString).getDay()),
    scheduledDate: schedule.scheduledDate ?? todayString,
    startTime: schedule.startTime,
    endTime: schedule.endTime,
    startRecur: schedule.startRecur ?? todayString,
    endRecur: schedule.endRecur ?? '',
    notes: schedule.notes ?? '',
    participantIds,
  }
}

function calculateDuration(startTime: string, endTime: string) {
  const [startHour, startMinute] = startTime.split(':').map(Number)
  const [endHour, endMinute] = endTime.split(':').map(Number)
  const totalMinutes = endHour * 60 + endMinute - (startHour * 60 + startMinute)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function buildScheduleEvents(
  schedules: Schedule[],
  teacherMap: Map<number, Teacher>,
  scheduleParticipantMap: Map<number, number[]>,
  studentMap: Map<number, Student>,
): EventInput[] {
  return schedules
    .filter((schedule) => schedule.status === 'active')
    .map((schedule) => {
      const teacher = teacherMap.get(schedule.teacherId)
      const participantNames = (scheduleParticipantMap.get(schedule.id) ?? [])
        .map((studentId) => studentMap.get(studentId)?.name)
        .filter(Boolean)
        .join(', ')

      const shared = {
        id: `schedule-${schedule.id}`,
        title: schedule.title,
        duration: calculateDuration(schedule.startTime, schedule.endTime),
        extendedProps: {
          scheduleId: schedule.id,
          teacherName: teacher?.fullName ?? 'Unknown Teacher',
          participantNames: participantNames || 'No students assigned',
          eventType: schedule.eventType,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
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

function getLatestLessonLogMap(logs: LessonLogSummary[]) {
  const result = new Map<string, LessonLogSummary>()

  for (const log of logs) {
    const key = `${log.scheduleId}:${log.lessonDate}`
    const existing = result.get(key)
    if (!existing || log.revisionNumber > existing.revisionNumber) {
      result.set(key, log)
    }
  }

  return result
}

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function getSupabaseLoadErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Failed to load Supabase data.'
  }

  const message = error.message.toLowerCase()

  if (
    message.includes('404') ||
    message.includes('not found') ||
    message.includes('relation') ||
    message.includes('schema cache')
  ) {
    return 'Supabase tables are not ready yet. Run the latest database migrations, or push them with the Supabase CLI workflow.'
  }

  return error.message
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

type ClassListingSectionProps = {
  onEditClass: (scheduleId: number) => void
  onOpenCreateClass?: () => void
  onOpenStudentDetail: (studentId: number) => void
  onViewCalendar: () => void
  schedules: Schedule[]
  scheduleParticipantMap: Map<number, number[]>
  selectedClassId: number | null
  setSelectedClassId: (scheduleId: number) => void
  studentMap: Map<number, Student>
  teacherMap: Map<number, Teacher>
  todayString: string
  isAdminView: boolean
}

function ClassListingSection({
  onEditClass,
  onOpenCreateClass,
  onOpenStudentDetail,
  onViewCalendar,
  schedules,
  scheduleParticipantMap,
  selectedClassId,
  setSelectedClassId,
  studentMap,
  teacherMap,
  todayString,
  isAdminView,
}: ClassListingSectionProps) {
  const activeClasses = schedules.filter(
    (schedule) =>
      schedule.status === 'active' && schedule.eventType === 'regular',
  )
  const selectedClass =
    activeClasses.find((schedule) => schedule.id === selectedClassId) ??
    activeClasses[0] ??
    null

  const getClassSummary = (scheduleId: number): ClassStatusSummary => {
    const studentIds = scheduleParticipantMap.get(scheduleId) ?? []
    return studentIds.reduce<ClassStatusSummary>(
      (summary, studentId) => {
        const student = studentMap.get(studentId)
        if (!student) {
          return summary
        }

        const status = getStudentStatus(student, todayString)
        if (status.isDeactivated || status.hoursLow || status.lessonExpired) {
          summary.attention += 1
        } else {
          summary.healthy += 1
        }
        return summary
      },
      { healthy: 0, attention: 0 },
    )
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-[#f8fafc] px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">My Classroom</h2>
              <p className="mt-1 text-sm text-slate-500">
                {isAdminView
                  ? 'View every regular class, assigned teacher, and all students inside each classroom.'
                  : 'View each regular class assigned to this teacher and open the roster quickly.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-sm text-slate-500">
                {activeClasses.length} classroom
                {activeClasses.length === 1 ? '' : 's'}
              </div>
              {isAdminView && onOpenCreateClass && (
                <button
                  type="button"
                  onClick={onOpenCreateClass}
                  className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
                >
                  Add Class
                </button>
              )}
            </div>
          </div>
        </div>

        {activeClasses.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-slate-500">
            No active classroom found yet.
          </div>
        ) : (
          <div className="grid gap-6 p-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <div className="space-y-3">
              {activeClasses.map((schedule) => {
                const participantIds = scheduleParticipantMap.get(schedule.id) ?? []
                const summary = getClassSummary(schedule.id)
                const selected = selectedClass?.id === schedule.id
                return (
                  <button
                    key={schedule.id}
                    type="button"
                    onClick={() => setSelectedClassId(schedule.id)}
                    className={cn(
                      'w-full rounded-2xl border p-4 text-left transition',
                      selected
                        ? 'border-[#fc0c97] bg-[#fff8fc] shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-slate-900">
                          {schedule.title}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          {teacherMap.get(schedule.teacherId)?.fullName ?? 'Unassigned teacher'}
                        </div>
                      </div>
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]',
                          schedule.eventType === 'regular'
                            ? 'bg-sky-100 text-sky-700'
                            : 'bg-orange-100 text-orange-700',
                        )}
                      >
                        {schedule.eventType}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-slate-500">
                      <span>
                        {participantIds.length} student
                        {participantIds.length === 1 ? '' : 's'}
                      </span>
                      <span>{summary.healthy} healthy</span>
                      <span>{summary.attention} need attention</span>
                    </div>
                  </button>
                )
              })}
            </div>

            {selectedClass && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#fc0c97]">
                      Classroom Detail
                    </div>
                    <h3 className="mt-1 text-2xl font-semibold text-slate-900">
                      {selectedClass.title}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-500">
                      <span>
                        Teacher: {teacherMap.get(selectedClass.teacherId)?.fullName ?? 'Unassigned'}
                      </span>
                      <span>
                        Recurring: {weekdayLabels[selectedClass.dayOfWeek ?? 0]}
                      </span>
                      <span>
                        Time: {selectedClass.startTime} - {selectedClass.endTime}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {isAdminView && (
                      <button
                        type="button"
                        onClick={() => onEditClass(selectedClass.id)}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Edit Class
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onViewCalendar}
                      className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
                    >
                      View in Calendar
                    </button>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {(scheduleParticipantMap.get(selectedClass.id) ?? []).map((studentId) => {
                    const student = studentMap.get(studentId)
                    if (!student) {
                      return null
                    }
                    const status = getStudentStatus(student, todayString)
                    return (
                      <div
                        key={student.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <button
                              type="button"
                              onClick={() => onOpenStudentDetail(student.id)}
                              className="text-left text-base font-semibold text-slate-900 transition hover:text-[#fc0c97]"
                            >
                              {student.name}
                            </button>
                            <div className="mt-1 text-sm text-slate-500">
                              Classes: {student.remainingHours} - Lesson Expiry:{' '}
                              {formatDate(student.lessonExpiryDate)}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">
                              Account Fee: {formatDate(student.accountFeeExpiryDate)} - Mirai Club:{' '}
                              {formatDate(student.miraiClubExpiryDate)}
                            </div>
                            {!student.isActive && (
                              <div className="mt-2 text-sm font-semibold text-red-600">
                                Deactivated student
                              </div>
                            )}
                          </div>
                          <div className="flex max-w-[320px] flex-wrap gap-2">
                            {status.tags.map((tag) => (
                              <StatusChip
                                key={`${selectedClass.id}-${student.id}-${tag.label}`}
                                label={tag.label}
                                tone={tag.tone}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

type StudentDashboardSectionProps = {
  activeFilter: FilterKey
  deactivatingStudentId: number | null
  isLoading: boolean
  students: Student[]
  todayString: string
  onDeactivateStudent: (studentId: number) => void
  onOpenCreateStudent: () => void
  onOpenStudentDetail: (studentId: number) => void
  onOpenRenewal: (studentId: number) => void
  onToggleFilter: (filter: FilterKey) => void
}

function StudentDashboardSection({
  activeFilter,
  deactivatingStudentId,
  isLoading,
  students,
  todayString,
  onDeactivateStudent,
  onOpenCreateStudent,
  onOpenStudentDetail,
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
          <div className="text-sm font-medium text-slate-500">Classes Attention</div>
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
                Student Classes & Expiry Board
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Admin-only table for class balance, membership, and renewal control.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onOpenCreateStudent}
                className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
              >
                Add Student
              </button>
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
                <th className="px-6 py-4">Lesson Expiry</th>
                <th className="px-6 py-4">Account Fee Expiry</th>
                <th className="px-6 py-4">Mirai Club Expiry</th>
                <th className="px-6 py-4">Membership Status</th>
                <th className="px-6 py-4">Remaining Classes</th>
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
                        <button
                          type="button"
                          onClick={() => onOpenStudentDetail(student.id)}
                          className="text-left text-base font-semibold text-slate-900 transition hover:text-[#fc0c97]"
                        >
                          {student.name}
                        </button>
                        <div className="text-sm text-slate-500">
                          Student ID #{student.id.toString().padStart(3, '0')}
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
                    <td className="px-6 py-5">
                      <div className="space-y-2">
                        <div
                          className={cn(
                            'inline-flex min-w-20 items-center justify-center rounded-xl px-3 py-2 text-lg font-semibold',
                            status.isDeactivated || status.hoursLow
                              ? 'bg-[#fff1f8] text-[#be185d] ring-1 ring-inset ring-[#fecdd3]'
                              : 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
                          )}
                        >
                          {student.remainingHours}
                        </div>
                        <div className="text-xs font-medium text-slate-500">
                          {status.isDeactivated
                            ? 'Student deactivated'
                            : status.hoursLow
                            ? 'Immediate action needed'
                            : 'Healthy balance'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenStudentDetail(student.id)}
                          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenRenewal(student.id)}
                          className="inline-flex items-center justify-center rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
                        >
                          Renew
                        </button>
                        <button
                          type="button"
                          disabled={!student.isActive || deactivatingStudentId === student.id}
                          onClick={() => onDeactivateStudent(student.id)}
                          className={cn(
                            'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition',
                            !student.isActive
                              ? 'cursor-not-allowed border border-red-200 bg-red-50 text-red-600'
                              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                          )}
                        >
                          {!student.isActive
                            ? 'Deactivated'
                            : deactivatingStudentId === student.id
                              ? 'Deactivating...'
                              : 'Deactivate'}
                        </button>
                      </div>
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

type TeacherManagementSectionProps = {
  isLoading: boolean
  teachers: Teacher[]
  onOpenCreateTeacher: () => void
}

function TeacherManagementSection({
  isLoading,
  teachers,
  onOpenCreateTeacher,
}: TeacherManagementSectionProps) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-500">Total Teachers</div>
          <div className="mt-3 text-3xl font-semibold text-slate-900">
            {teachers.filter((teacher) => teacher.role === 'teacher').length}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-500">Admin Accounts</div>
          <div className="mt-3 text-3xl font-semibold text-[#fc0c97]">
            {teachers.filter((teacher) => teacher.role === 'admin').length}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-500">Teacher Accounts</div>
          <div className="mt-3 text-3xl font-semibold text-sky-600">
            {teachers.filter((teacher) => teacher.role === 'teacher').length}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm font-medium text-slate-500">With Contact Info</div>
          <div className="mt-3 text-3xl font-semibold text-emerald-600">
            {
              teachers.filter(
                (teacher) => Boolean(teacher.email) || Boolean(teacher.phone),
              ).length
            }
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-[#f8fafc] px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">My Teacher</h2>
              <p className="mt-1 text-sm text-slate-500">
                Review teacher basic information and add new teacher records.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenCreateTeacher}
              className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
            >
              Add Teacher
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left">
            <thead className="bg-white text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              <tr>
                <th className="px-6 py-4">Teacher</th>
                <th className="px-6 py-4">Username</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Email</th>
                <th className="px-6 py-4">Phone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {teachers.map((teacher) => (
                <tr key={teacher.id} className="align-top">
                  <td className="px-6 py-5">
                    <div className="font-semibold text-slate-900">
                      {teacher.fullName}
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      Teacher ID #{String(teacher.id).padStart(3, '0')}
                    </div>
                  </td>
                  <td className="px-6 py-5 text-sm font-medium text-slate-700">
                    {teacher.username}
                  </td>
                  <td className="px-6 py-5">
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                        teacher.role === 'admin'
                          ? 'bg-[#fff1f8] text-[#be185d]'
                          : 'bg-sky-50 text-sky-700',
                      )}
                    >
                      {teacher.role === 'admin' ? 'Admin' : 'Teacher'}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-sm text-slate-600">
                    {teacher.email || '-'}
                  </td>
                  <td className="px-6 py-5 text-sm text-slate-600">
                    {teacher.phone || '-'}
                  </td>
                </tr>
              ))}

              {!isLoading && teachers.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-16 text-center text-sm text-slate-500"
                  >
                    No teachers found yet.
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

function StarRatingInput({
  value,
  disabled,
  onChange,
}: {
  value: number | null
  disabled?: boolean
  onChange: (score: number) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {[1, 2, 3, 4, 5].map((score) => {
        const active = (value ?? 0) >= score
        return (
          <button
            key={score}
            type="button"
            disabled={disabled}
            onClick={() => onChange(score)}
            className={cn(
              'text-xl leading-none transition',
              active ? 'text-amber-400' : 'text-slate-300',
              !disabled && 'hover:text-amber-300',
              disabled && 'cursor-not-allowed opacity-70',
            )}
          >
            ★
          </button>
        )
      })}
    </div>
  )
}

function PerformanceRadarChart({
  averages,
}: {
  averages: Record<ReviewScoreField, number>
}) {
  const size = 280
  const center = size / 2
  const radius = 88

  function getPoint(index: number, value: number) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / performanceMetricDefinitions.length
    const scaledRadius = (Math.max(0, Math.min(5, value)) / 5) * radius
    return {
      x: center + Math.cos(angle) * scaledRadius,
      y: center + Math.sin(angle) * scaledRadius,
    }
  }

  const polygonPoints = performanceMetricDefinitions
    .map((metric, index) => {
      const point = getPoint(index, averages[metric.scoreField] ?? 0)
      return `${point.x},${point.y}`
    })
    .join(' ')

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-[280px] w-[280px]">
      {[1, 2, 3, 4, 5].map((level) => {
        const levelPoints = performanceMetricDefinitions
          .map((_, index) => {
            const point = getPoint(index, level)
            return `${point.x},${point.y}`
          })
          .join(' ')

        return (
          <polygon
            key={level}
            points={levelPoints}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="1"
          />
        )
      })}

      {performanceMetricDefinitions.map((metric, index) => {
        const edgePoint = getPoint(index, 5)
        const labelPoint = getPoint(index, 5.8)
        return (
          <g key={metric.key}>
            <line
              x1={center}
              y1={center}
              x2={edgePoint.x}
              y2={edgePoint.y}
              stroke="#cbd5e1"
              strokeWidth="1"
            />
            <text
              x={labelPoint.x}
              y={labelPoint.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-slate-500 text-[11px] font-semibold"
            >
              {metric.shortLabel}
            </text>
          </g>
        )
      })}

      <polygon
        points={polygonPoints}
        fill="#fc0c9726"
        stroke="#fc0c97"
        strokeWidth="2"
      />

      {performanceMetricDefinitions.map((metric, index) => {
        const point = getPoint(index, averages[metric.scoreField] ?? 0)
        return <circle key={metric.key} cx={point.x} cy={point.y} r="4" fill="#fc0c97" />
      })}
    </svg>
  )
}

type StudentDetailModalProps = {
  student: Student
  lessonLogs: LessonLogSummary[]
  lessonReviews: LessonLogStudentReview[]
  onClose: () => void
  scheduleParticipantMap: Map<number, number[]>
  schedules: Schedule[]
  teacherMap: Map<number, Teacher>
}

function StudentDetailModal({
  student,
  lessonLogs,
  lessonReviews,
  onClose,
  scheduleParticipantMap,
  schedules,
  teacherMap,
}: StudentDetailModalProps) {
  const latestLessonLogIds = useMemo(() => {
    return new Set(
      Array.from(getLatestLessonLogMap(lessonLogs).values()).map((log) => log.id),
    )
  }, [lessonLogs])

  const latestReviewEntries = useMemo(() => {
    const scheduleMap = new Map(schedules.map((schedule) => [schedule.id, schedule]))

    return lessonReviews
      .filter(
        (review) =>
          review.studentId === student.id && latestLessonLogIds.has(review.lessonLogId),
      )
      .map((review) => {
        const log = lessonLogs.find((entry) => entry.id === review.lessonLogId)
        const schedule = log ? scheduleMap.get(log.scheduleId) : null
        return {
          review,
          log,
          schedule,
        }
      })
      .filter(
        (entry): entry is {
          review: LessonLogStudentReview
          log: LessonLogSummary
          schedule: Schedule | null
        } => Boolean(entry.log),
      )
      .sort((left, right) => {
        const rightDate = `${right.log.lessonDate}-${right.log.revisionNumber}`
        const leftDate = `${left.log.lessonDate}-${left.log.revisionNumber}`
        return rightDate.localeCompare(leftDate)
      })
  }, [latestLessonLogIds, lessonLogs, lessonReviews, schedules, student.id])

  const metricAverages = useMemo(() => {
    const result = {
      logicalThinkingScore: 0,
      codingCreativityScore: 0,
      problemSolvingScore: 0,
      expressivenessScore: 0,
      sustainedFocusScore: 0,
    } satisfies Record<ReviewScoreField, number>

    if (latestReviewEntries.length === 0) {
      return result
    }

    for (const metric of performanceMetricDefinitions) {
      const values = latestReviewEntries
        .map((entry) => entry.review[metric.scoreField])
        .filter((value): value is number => value !== null)

      result[metric.scoreField] =
        values.length > 0
          ? Number(
              (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1),
            )
          : 0
    }

    return result
  }, [latestReviewEntries])

  const assignedClassrooms = useMemo(() => {
    return schedules.filter(
      (schedule) =>
        schedule.status === 'active' &&
        schedule.eventType === 'regular' &&
        (scheduleParticipantMap.get(schedule.id) ?? []).includes(student.id),
    )
  }, [scheduleParticipantMap, schedules, student.id])

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/30 px-4 py-6">
      <div className="mx-auto flex min-h-full w-full max-w-5xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.15)]">
          <div className="border-b border-slate-200 bg-[#f8fafc] px-6 py-5 sm:px-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-[#fc0c97]">
                  Student Performance Detail
                </div>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                  {student.name}
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Student ID #{String(student.id).padStart(3, '0')} - recent class reviews and five-metric performance profile.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white"
              >
                Close
              </button>
            </div>
          </div>

          <div className="max-h-[82vh] space-y-6 overflow-y-auto px-6 py-6 sm:px-8">
            <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Student Snapshot
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-sm text-slate-500">Remaining Classes</div>
                    <div className="mt-1 text-2xl font-semibold text-slate-900">
                      {student.remainingHours}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-500">Membership Status</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {student.isActive ? 'Active' : 'Deactivated'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-500">Assigned Teacher</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {student.teacherId
                        ? teacherMap.get(student.teacherId)?.fullName ?? 'Unassigned'
                        : 'Unassigned'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-500">Lesson Expiry</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {formatDate(student.lessonExpiryDate)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-500">Classrooms</div>
                    <div className="mt-1 text-lg font-semibold text-slate-900">
                      {assignedClassrooms.length}
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {assignedClassrooms.map((schedule) => (
                    <span
                      key={schedule.id}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700"
                    >
                      {schedule.title}
                    </span>
                  ))}
                  {assignedClassrooms.length === 0 && (
                    <span className="text-sm text-slate-500">
                      No regular classroom assigned yet.
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Five-Metric Radar
                </div>
                <div className="mt-3">
                  <PerformanceRadarChart averages={metricAverages} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {performanceMetricDefinitions.map((metric) => (
                    <div
                      key={metric.key}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
                    >
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                        {metric.shortLabel}
                      </div>
                      <div className="mt-1 text-lg font-semibold text-slate-900">
                        {metricAverages[metric.scoreField].toFixed(1)} / 5
                      </div>
                      <div className="mt-1 text-sm text-slate-500">{metric.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-5 py-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  Recent Lesson Reviews
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Latest revision only. Low-score remarks remain visible for follow-up.
                </p>
              </div>

              <div className="space-y-4 p-5">
                {latestReviewEntries.map(({ review, log, schedule }) => (
                  <div
                    key={review.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="text-base font-semibold text-slate-900">
                          {schedule?.title ?? 'Unknown Class'}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          {formatDate(log.lessonDate)} -{' '}
                          {teacherMap.get(log.teacherId)?.fullName ?? 'Unknown Teacher'} - Revision{' '}
                          {log.revisionNumber}
                        </div>
                        {log.lessonRemark && (
                          <div className="mt-2 text-sm text-slate-600">
                            Lesson Remark: {log.lessonRemark}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      {performanceMetricDefinitions.map((metric) => {
                        const score = review[metric.scoreField]
                        const remark = review[metric.remarkField]
                        return (
                          <div
                            key={`${review.id}-${metric.key}`}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-sm font-semibold text-slate-900">
                                  {metric.label}
                                </div>
                                <div className="mt-1 text-lg font-semibold text-slate-900">
                                  {score ?? '-'} / 5
                                </div>
                              </div>
                              <div className="text-lg text-amber-400">
                                {'★'.repeat(score ?? 0)}
                                <span className="text-slate-200">
                                  {'★'.repeat(5 - (score ?? 0))}
                                </span>
                              </div>
                            </div>
                            {remark && (
                              <div className="mt-2 text-sm text-slate-600">
                                Remark: {remark}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}

                {latestReviewEntries.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-14 text-center text-sm text-slate-500">
                    No performance reviews have been submitted for this student yet.
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  const isMobile = useIsMobile()
  const todayString = getTodayString()

  const [students, setStudents] = useState<Student[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [scheduleParticipants, setScheduleParticipants] = useState<
    ScheduleParticipant[]
  >([])
  const [lessonLogs, setLessonLogs] = useState<LessonLogSummary[]>([])
  const [lessonReviews, setLessonReviews] = useState<LessonLogStudentReview[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [isSavingStudent, setIsSavingStudent] = useState(false)
  const [deactivatingStudentId, setDeactivatingStudentId] = useState<number | null>(null)
  const [studentSaveError, setStudentSaveError] = useState<string | null>(null)
  const [isCreatingStudentRecord, setIsCreatingStudentRecord] = useState(false)
  const [createStudentSaveError, setCreateStudentSaveError] = useState<string | null>(null)
  const [isCreatingTeacherRecord, setIsCreatingTeacherRecord] = useState(false)
  const [createTeacherSaveError, setCreateTeacherSaveError] = useState<string | null>(null)
  const [isSavingSchedule, setIsSavingSchedule] = useState(false)
  const [scheduleSaveError, setScheduleSaveError] = useState<string | null>(null)
  const [isSavingAttendance, setIsSavingAttendance] = useState(false)
  const [attendanceSaveError, setAttendanceSaveError] = useState<string | null>(
    null,
  )

  const [studentFilter, setStudentFilter] = useState<FilterKey>('all')
  const [activeSection, setActiveSection] = useState<AppSection>('calendar')
  const [selectedSessionKey, setSelectedSessionKey] = useState<string>('')

  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null)
  const [selectedStudentDetailId, setSelectedStudentDetailId] = useState<number | null>(
    null,
  )
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
  const [isCreateStudentOpen, setIsCreateStudentOpen] = useState(false)
  const [isCreateTeacherOpen, setIsCreateTeacherOpen] = useState(false)
  const [studentFormState, setStudentFormState] = useState<RenewalFormState>({
    addHours: '0',
    lessonExpiryDate: '',
    accountFeeExpiryDate: '',
    miraiClubExpiryDate: '',
    remark: '',
  })
  const [createStudentFormState, setCreateStudentFormState] =
    useState<CreateStudentFormState>({
      fullName: '',
      teacherId: '',
      initialHours: '0',
      lessonExpiryDate: todayString,
      accountFeeExpiryDate: todayString,
      miraiClubExpiryDate: todayString,
      notes: '',
      classIds: [],
    })
  const [createTeacherFormState, setCreateTeacherFormState] =
    useState<CreateTeacherFormState>({
      username: '',
      fullName: '',
      email: '',
      phone: '',
      role: 'teacher',
    })

  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null)
  const [isCreatingSchedule, setIsCreatingSchedule] = useState(false)
  const [scheduleFormState, setScheduleFormState] = useState<ScheduleFormState>({
    title: '',
    teacherId: '',
    eventType: 'regular',
    dayOfWeek: '2',
    scheduledDate: todayString,
    startTime: '19:30',
    endTime: '21:30',
    startRecur: todayString,
    endRecur: '',
    notes: '',
    participantIds: [],
  })

  const [attendanceModal, setAttendanceModal] =
    useState<AttendanceModalState | null>(null)
  const [attendanceStatuses, setAttendanceStatuses] = useState<
    Record<number, AttendanceStatus>
  >({})
  const [attendanceReviews, setAttendanceReviews] = useState<
    Record<number, AttendanceReviewFormState>
  >({})
  const [attendanceRemark, setAttendanceRemark] = useState('')
  const [attendanceExistingLog, setAttendanceExistingLog] =
    useState<LessonLogSummary | null>(null)
  const [attendanceLocked, setAttendanceLocked] = useState(false)
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false)

  const teacherMap = useMemo(
    () => new Map(teachers.map((teacher) => [teacher.id, teacher])),
    [teachers],
  )
  const studentMap = useMemo(
    () => new Map(students.map((student) => [student.id, student])),
    [students],
  )
  const scheduleParticipantMap = useMemo(() => {
    const nextMap = new Map<number, number[]>()

    for (const membership of scheduleParticipants) {
      if (!membership.isActive) {
        continue
      }

      const existing = nextMap.get(membership.scheduleId) ?? []
      existing.push(membership.studentId)
      nextMap.set(membership.scheduleId, existing)
    }

    return nextMap
  }, [scheduleParticipants])
  const latestLessonLogMap = useMemo(
    () => getLatestLessonLogMap(lessonLogs),
    [lessonLogs],
  )

  const sessionOptions = useMemo<UserSession[]>(() => {
    const defaultTeacherId =
      teachers.find((teacher) => teacher.role === 'teacher')?.id ??
      teachers[0]?.id ??
      null

    return [
      {
        key: 'local-admin',
        role: 'admin',
        label: 'Local Admin Preview',
        teacherId: null,
      },
      {
        key: 'local-teacher',
        role: 'teacher',
        label: 'Local Teacher Preview',
        teacherId: defaultTeacherId,
      },
      ...teachers.map((teacher) => ({
        key: `teacher-${teacher.id}`,
        role: teacher.role,
        label:
          teacher.role === 'admin'
            ? `${teacher.fullName} (Admin)`
            : `${teacher.fullName} (Teacher)`,
        teacherId: teacher.id,
      })),
    ]
  }, [teachers])

  const currentSession =
    sessionOptions.find((session) => session.key === selectedSessionKey) ??
    sessionOptions[0]

  const isAdminView = currentSession?.role !== 'teacher'
  const selectedStudent =
    students.find((student) => student.id === selectedStudentId) ?? null
  const selectedStudentDetail =
    students.find((student) => student.id === selectedStudentDetailId) ?? null
  const editingSchedule =
    schedules.find((schedule) => schedule.id === editingScheduleId) ?? null

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
    if (
      currentSession?.role === 'teacher' &&
      activeSection !== 'calendar' &&
      activeSection !== 'classrooms'
    ) {
      setActiveSection('calendar')
    }
  }, [activeSection, currentSession])

  useEffect(() => {
    if (!selectedStudent) {
      return
    }

    setStudentFormState({
      addHours: '0',
      lessonExpiryDate: selectedStudent.lessonExpiryDate,
      accountFeeExpiryDate: selectedStudent.accountFeeExpiryDate,
      miraiClubExpiryDate: selectedStudent.miraiClubExpiryDate,
      remark: '',
    })
  }, [selectedStudent])

  useEffect(() => {
    if (!isCreatingSchedule && !editingSchedule) {
      return
    }

    const currentParticipantIds =
      editingSchedule && scheduleParticipantMap.has(editingSchedule.id)
        ? (scheduleParticipantMap.get(editingSchedule.id) ?? []).map(String)
        : []

    setScheduleFormState(
      buildScheduleFormState(
        editingSchedule,
        todayString,
        currentSession?.teacherId ?? teachers[0]?.id ?? null,
        currentParticipantIds,
      ),
    )
  }, [
    currentSession,
    editingSchedule,
    isCreatingSchedule,
    scheduleParticipantMap,
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

        const [
          nextTeachers,
          nextStudents,
          nextSchedules,
          nextParticipants,
          nextLessonLogs,
          nextLessonReviews,
        ] = await Promise.all([
          fetchTeachersFromSupabase(),
          fetchStudentsFromSupabase(),
          fetchSchedulesFromSupabase(),
          fetchScheduleParticipantsFromSupabase(),
          fetchLessonLogSummariesFromSupabase(),
          fetchLessonLogStudentReviewsFromSupabase(),
        ])

        if (!cancelled) {
          setTeachers(nextTeachers)
          setStudents(nextStudents)
          setSchedules(nextSchedules)
          setScheduleParticipants(nextParticipants)
          setLessonLogs(nextLessonLogs)
          setLessonReviews(nextLessonReviews)
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(getSupabaseLoadErrorMessage(error))
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

    if (currentSession.role === 'teacher' && currentSession.teacherId === null) {
      return []
    }

    return schedules
  }, [currentSession, schedules])

  const calendarEvents = useMemo(
    () =>
      buildScheduleEvents(
        visibleSchedules,
        teacherMap,
        scheduleParticipantMap,
        studentMap,
      ),
    [scheduleParticipantMap, studentMap, teacherMap, visibleSchedules],
  )

  const activeVisibleSchedules = visibleSchedules.filter(
    (schedule) => schedule.status === 'active',
  )
  const activeClassroomSchedules = activeVisibleSchedules.filter(
    (schedule) => schedule.eventType === 'regular',
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

  useEffect(() => {
    if (!selectedClassId && activeClassroomSchedules[0]) {
      setSelectedClassId(activeClassroomSchedules[0].id)
      return
    }

    if (
      selectedClassId !== null &&
      !activeClassroomSchedules.some((schedule) => schedule.id === selectedClassId)
    ) {
      setSelectedClassId(activeClassroomSchedules[0]?.id ?? null)
    }
  }, [activeClassroomSchedules, selectedClassId])

  const navItems =
    currentSession?.role === 'teacher'
      ? [
          { key: 'calendar', label: 'Calendar' },
          { key: 'classrooms', label: 'My Classroom' },
        ]
      : [
          { key: 'calendar', label: 'Calendar' },
          { key: 'classrooms', label: 'My Classroom' },
          { key: 'students', label: 'Students' },
          { key: 'teachers', label: 'My Teacher' },
        ]

  const attendanceRoster = useMemo(() => {
    if (!attendanceModal) {
      return []
    }

    const studentIds = scheduleParticipantMap.get(attendanceModal.scheduleId) ?? []
    return studentIds
      .map((studentId) => studentMap.get(studentId))
      .filter((student): student is Student => Boolean(student))
  }, [attendanceModal, scheduleParticipantMap, studentMap])

  function updateStudentForm<K extends keyof RenewalFormState>(
    key: K,
    value: RenewalFormState[K],
  ) {
    setStudentFormState((currentState) => ({
      ...currentState,
      [key]: value,
    }))
  }

  function updateCreateStudentForm<K extends keyof CreateStudentFormState>(
    key: K,
    value: CreateStudentFormState[K],
  ) {
    setCreateStudentFormState((currentState) => ({
      ...currentState,
      [key]: value,
    }))
  }

  function updateCreateTeacherForm<K extends keyof CreateTeacherFormState>(
    key: K,
    value: CreateTeacherFormState[K],
  ) {
    setCreateTeacherFormState((currentState) => ({
      ...currentState,
      [key]: value,
    }))
  }

  function toggleCreateStudentClass(scheduleId: string) {
    setCreateStudentFormState((currentState) => {
      const exists = currentState.classIds.includes(scheduleId)
      return {
        ...currentState,
        classIds: exists
          ? currentState.classIds.filter((item) => item !== scheduleId)
          : [...currentState.classIds, scheduleId],
      }
    })
  }

  function updateScheduleForm<K extends keyof ScheduleFormState>(
    key: K,
    value: ScheduleFormState[K],
  ) {
    setScheduleFormState((currentState) => ({
      ...currentState,
      [key]: value,
      ...(key === 'eventType' && value === 'replacement'
        ? {
            dayOfWeek: '',
            startRecur: '',
            endRecur: '',
          }
        : {}),
      ...(key === 'eventType' && value === 'regular'
        ? {
            scheduledDate: todayString,
            dayOfWeek: currentState.dayOfWeek || '2',
            startRecur: currentState.startRecur || todayString,
          }
        : {}),
    }))
  }

  function toggleScheduleParticipant(studentId: string) {
    setScheduleFormState((currentState) => {
      const exists = currentState.participantIds.includes(studentId)
      return {
        ...currentState,
        participantIds: exists
          ? currentState.participantIds.filter((item) => item !== studentId)
          : [...currentState.participantIds, studentId],
      }
    })
  }

  function openStudentDetail(studentId: number) {
    setSelectedStudentDetailId(studentId)
  }

  function closeStudentDetail() {
    setSelectedStudentDetailId(null)
  }

  function openStudentRenewal(studentId: number) {
    setStudentSaveError(null)
    setSelectedStudentId(studentId)
  }

  function closeStudentRenewal() {
    setSelectedStudentId(null)
    setStudentSaveError(null)
  }

  async function handleDeactivateStudent(studentId: number) {
    if (!supabase) {
      return
    }

    const student = students.find((item) => item.id === studentId)
    if (!student || !student.isActive) {
      return
    }

    const confirmed = window.confirm(
      `Deactivate ${student.name}? This marks the student as not renewing and keeps the record visible in classroom views.`,
    )
    if (!confirmed) {
      return
    }

    try {
      setDeactivatingStudentId(studentId)
      setLoadError(null)

      const { error } = await supabase
        .from('students')
        .update({ is_active: false })
        .eq('id', studentId)

      if (error) {
        throw error
      }

      await refreshStudentsAndLogs()
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Failed to deactivate student.',
      )
    } finally {
      setDeactivatingStudentId(null)
    }
  }

  function openCreateStudentModal() {
    setCreateStudentSaveError(null)
    setIsCreateStudentOpen(true)
    setCreateStudentFormState({
      fullName: '',
      teacherId: '',
      initialHours: '0',
      lessonExpiryDate: todayString,
      accountFeeExpiryDate: todayString,
      miraiClubExpiryDate: todayString,
      notes: '',
      classIds: [],
    })
  }

  function closeCreateStudentModal() {
    setIsCreateStudentOpen(false)
    setCreateStudentSaveError(null)
  }

  function openCreateTeacherModal() {
    setCreateTeacherSaveError(null)
    setIsCreateTeacherOpen(true)
    setCreateTeacherFormState({
      username: '',
      fullName: '',
      email: '',
      phone: '',
      role: 'teacher',
    })
  }

  function closeCreateTeacherModal() {
    setIsCreateTeacherOpen(false)
    setCreateTeacherSaveError(null)
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
      eventType: prefillDate ? 'replacement' : 'regular',
      dayOfWeek: clickedDayOfWeek,
      scheduledDate: clickedDate,
      startTime: '19:30',
      endTime: '21:30',
      startRecur: clickedDate,
      endRecur: '',
      notes: '',
      participantIds: [],
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

  async function refreshStudentsAndLogs() {
    const [nextStudents, nextLessonLogs, nextLessonReviews] = await Promise.all([
      fetchStudentsFromSupabase(),
      fetchLessonLogSummariesFromSupabase(),
      fetchLessonLogStudentReviewsFromSupabase(),
    ])
    setStudents(nextStudents)
    setLessonLogs(nextLessonLogs)
    setLessonReviews(nextLessonReviews)
  }

  async function refreshTeachers() {
    const nextTeachers = await fetchTeachersFromSupabase()
    setTeachers(nextTeachers)
  }

  async function assignStudentToSchedules(studentId: number, scheduleIds: number[]) {
    if (!supabase || scheduleIds.length === 0) {
      return
    }

    const rowsToUpsert = scheduleIds.map((scheduleId) => ({
      schedule_id: scheduleId,
      student_id: studentId,
      is_active: true,
    }))

    const { error } = await supabase.from('schedule_students').upsert(rowsToUpsert, {
      onConflict: 'schedule_id,student_id',
    })

    if (error) {
      throw error
    }

    const nextParticipants = await fetchScheduleParticipantsFromSupabase()
    setScheduleParticipants(nextParticipants)
  }

  async function handleCreateStudentSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!supabase) {
      return
    }

    const fullName = createStudentFormState.fullName.trim()
    const initialHours = Number.parseInt(createStudentFormState.initialHours, 10)

    if (!fullName) {
      setCreateStudentSaveError('Please enter the student full name.')
      return
    }

    if (!createStudentFormState.lessonExpiryDate) {
      setCreateStudentSaveError('Please select the lesson expiry date.')
      return
    }

    if (!createStudentFormState.accountFeeExpiryDate) {
      setCreateStudentSaveError('Please select the Account Fee expiry date.')
      return
    }

    if (!createStudentFormState.miraiClubExpiryDate) {
      setCreateStudentSaveError('Please select the Mirai Club expiry date.')
      return
    }

    try {
      setIsCreatingStudentRecord(true)
      setCreateStudentSaveError(null)

      const { data, error } = await supabase.rpc('create_student_record', {
        p_full_name: fullName,
        p_teacher_id: createStudentFormState.teacherId
          ? Number(createStudentFormState.teacherId)
          : null,
        p_initial_hours:
          Number.isFinite(initialHours) && initialHours > 0 ? initialHours : 0,
        p_lesson_expiry_date: createStudentFormState.lessonExpiryDate,
        p_account_fee_expiry_date: createStudentFormState.accountFeeExpiryDate,
        p_mirai_club_expiry_date: createStudentFormState.miraiClubExpiryDate,
        p_notes: createStudentFormState.notes.trim() || null,
        p_actor_teacher_id: currentSession?.teacherId ?? null,
      })

      if (error) {
        throw error
      }

      const createdStudentId = data?.[0]?.student_id
      if (createdStudentId && createStudentFormState.classIds.length > 0) {
        await assignStudentToSchedules(
          createdStudentId,
          createStudentFormState.classIds.map(Number),
        )
      }

      await refreshStudentsAndLogs()
      closeCreateStudentModal()
    } catch (error) {
      setCreateStudentSaveError(
        error instanceof Error ? error.message : 'Failed to create student record.',
      )
    } finally {
      setIsCreatingStudentRecord(false)
    }
  }

  async function handleCreateTeacherSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!supabase) {
      return
    }

    const username = createTeacherFormState.username.trim()
    const fullName = createTeacherFormState.fullName.trim()

    if (!username) {
      setCreateTeacherSaveError('Please enter the teacher username.')
      return
    }

    if (!fullName) {
      setCreateTeacherSaveError('Please enter the teacher full name.')
      return
    }

    try {
      setIsCreatingTeacherRecord(true)
      setCreateTeacherSaveError(null)

      const { error } = await supabase.rpc('create_teacher_record', {
        p_username: username,
        p_full_name: fullName,
        p_email: createTeacherFormState.email.trim() || null,
        p_phone: createTeacherFormState.phone.trim() || null,
        p_role: createTeacherFormState.role,
      })

      if (error) {
        throw error
      }

      await refreshTeachers()
      closeCreateTeacherModal()
    } catch (error) {
      setCreateTeacherSaveError(
        error instanceof Error ? error.message : 'Failed to create teacher record.',
      )
    } finally {
      setIsCreatingTeacherRecord(false)
    }
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

      const { error } = await supabase.rpc('renew_student_record', {
        p_student_id: selectedStudent.id,
        p_add_hours: hoursToAdd,
        p_new_lesson_expiry_date:
          studentFormState.lessonExpiryDate || selectedStudent.lessonExpiryDate,
        p_new_account_fee_expiry_date:
          studentFormState.accountFeeExpiryDate ||
          selectedStudent.accountFeeExpiryDate,
        p_new_mirai_club_expiry_date:
          studentFormState.miraiClubExpiryDate ||
          selectedStudent.miraiClubExpiryDate,
        p_remark: studentFormState.remark.trim() || null,
        p_actor_teacher_id: currentSession?.teacherId ?? null,
      })

      if (error) {
        throw error
      }

      if (!selectedStudent.isActive) {
        const { error: reactivateError } = await supabase
          .from('students')
          .update({ is_active: true })
          .eq('id', selectedStudent.id)

        if (reactivateError) {
          throw reactivateError
        }
      }

      await refreshStudentsAndLogs()
      closeStudentRenewal()
    } catch (error) {
      setStudentSaveError(
        error instanceof Error ? error.message : 'Failed to save renewal.',
      )
    } finally {
      setIsSavingStudent(false)
    }
  }

  async function syncScheduleParticipants(scheduleId: number, participantIds: number[]) {
    if (!supabase) {
      return
    }

    const existing = scheduleParticipants.filter(
      (membership) => membership.scheduleId === scheduleId,
    )
    const existingIds = new Set(existing.map((membership) => membership.studentId))
    const nextIds = new Set(participantIds)

    const rowsToUpsert = participantIds.map((studentId) => ({
      schedule_id: scheduleId,
      student_id: studentId,
      is_active: true,
    }))

    if (rowsToUpsert.length > 0) {
      const { error } = await supabase
        .from('schedule_students')
        .upsert(rowsToUpsert, {
          onConflict: 'schedule_id,student_id',
        })

      if (error) {
        throw error
      }
    }

    const idsToDeactivate = [...existingIds].filter((id) => !nextIds.has(id))
    if (idsToDeactivate.length > 0) {
      const { error } = await supabase
        .from('schedule_students')
        .update({ is_active: false })
        .eq('schedule_id', scheduleId)
        .in('student_id', idsToDeactivate)

      if (error) {
        throw error
      }
    }

    const { data: nextParticipants, error: participantError } = await supabase
      .from('schedule_students')
      .select('id, schedule_id, student_id, is_active')
      .order('schedule_id')

    if (participantError) {
      throw participantError
    }

    setScheduleParticipants(nextParticipants.map(mapScheduleParticipantRow))
  }

  async function handleScheduleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!supabase) {
      return
    }

    const teacherId = Number(scheduleFormState.teacherId)
    const participantIds = scheduleFormState.participantIds.map(Number)

    if (!teacherId) {
      setScheduleSaveError('Please select a teacher for this schedule.')
      return
    }

    if (!scheduleFormState.title.trim()) {
      setScheduleSaveError('Please enter a class title.')
      return
    }

    if (participantIds.length === 0) {
      setScheduleSaveError(
        scheduleFormState.eventType === 'regular'
          ? 'Please assign the full regular class roster.'
          : 'Please assign at least one student for the replacement class.',
      )
      return
    }

    const payload: Database['public']['Tables']['schedules']['Update'] = {
      teacher_id: teacherId,
      student_id: participantIds[0] ?? null,
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
            'id, teacher_id, title, event_type, recurrence_type, day_of_week, scheduled_date, start_time, end_time, start_recur, end_recur, status, notes',
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
        await syncScheduleParticipants(nextSchedule.id, participantIds)
      } else if (editingSchedule) {
        const { data, error } = await supabase
          .from('schedules')
          .update(payload)
          .eq('id', editingSchedule.id)
          .select(
            'id, teacher_id, title, event_type, recurrence_type, day_of_week, scheduled_date, start_time, end_time, start_recur, end_recur, status, notes',
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
        await syncScheduleParticipants(updatedSchedule.id, participantIds)
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
          'id, teacher_id, title, event_type, recurrence_type, day_of_week, scheduled_date, start_time, end_time, start_recur, end_recur, status, notes',
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

  async function openAttendanceForEvent(
    scheduleId: number,
    occurrenceDate: string,
    title: string,
  ) {
    setAttendanceSaveError(null)
    setAttendanceModal({
      scheduleId,
      occurrenceDate,
      title,
    })
    setAttendanceRemark('')
    setAttendanceStatuses({})
    setAttendanceReviews({})
    setAttendanceExistingLog(null)
    setAttendanceLocked(false)

    try {
      setIsLoadingAttendance(true)
      const { summary, students: latestAttendanceRows, reviews: latestReviewRows } =
        await fetchLatestLessonLogStudents(scheduleId, occurrenceDate)

      const rosterIds = scheduleParticipantMap.get(scheduleId) ?? []
      const nextStatuses: Record<number, AttendanceStatus> = {}
      const nextReviews: Record<number, AttendanceReviewFormState> = {}

      for (const studentId of rosterIds) {
        nextStatuses[studentId] = 'present'
        nextReviews[studentId] = createEmptyAttendanceReviewForm()
      }

      for (const row of latestAttendanceRows) {
        nextStatuses[row.studentId] = row.attendanceStatus
      }

      for (const review of latestReviewRows) {
        nextReviews[review.studentId] = mapReviewToFormState(review)
      }

      setAttendanceStatuses(nextStatuses)
      setAttendanceReviews(nextReviews)
      setAttendanceExistingLog(summary)
      setAttendanceRemark(summary?.lessonRemark ?? '')

      if (summary) {
        const editableUntil =
          new Date(summary.submittedAt).getTime() + 24 * 60 * 60 * 1000
        setAttendanceLocked(Date.now() > editableUntil)
      }
    } catch (error) {
      setAttendanceSaveError(
        error instanceof Error ? error.message : 'Failed to load attendance log.',
      )
    } finally {
      setIsLoadingAttendance(false)
    }
  }

  function closeAttendanceModal() {
    setAttendanceModal(null)
    setAttendanceSaveError(null)
    setAttendanceRemark('')
    setAttendanceStatuses({})
    setAttendanceReviews({})
    setAttendanceExistingLog(null)
    setAttendanceLocked(false)
  }

  function updateAttendanceReviewScore(
    studentId: number,
    scoreField: ReviewScoreField,
    remarkField: ReviewRemarkField,
    score: number,
  ) {
    setAttendanceReviews((currentState) => ({
      ...currentState,
      [studentId]: {
        ...(currentState[studentId] ?? createEmptyAttendanceReviewForm()),
        [scoreField]: score,
        ...(score >= 3 ? { [remarkField]: '' } : {}),
      },
    }))
  }

  function updateAttendanceReviewRemark(
    studentId: number,
    remarkField: ReviewRemarkField,
    remark: string,
  ) {
    setAttendanceReviews((currentState) => ({
      ...currentState,
      [studentId]: {
        ...(currentState[studentId] ?? createEmptyAttendanceReviewForm()),
        [remarkField]: remark,
      },
    }))
  }

  async function handleAttendanceSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    if (!attendanceModal || !supabase || !currentSession?.teacherId) {
      return
    }

    const rosterIds = scheduleParticipantMap.get(attendanceModal.scheduleId) ?? []
    const payload = rosterIds.map((studentId) => ({
      student_id: studentId,
      status: attendanceStatuses[studentId] ?? 'present',
    }))
    const reviewPayload: Array<
      {
        student_id: number
      } & Record<ReviewScoreField, number> &
        Record<ReviewRemarkField, string | null>
    > = []

    for (const studentId of rosterIds) {
      const status = attendanceStatuses[studentId] ?? 'present'
      if (status !== 'present') {
        continue
      }

      const reviewForm = attendanceReviews[studentId] ?? createEmptyAttendanceReviewForm()

      for (const metric of performanceMetricDefinitions) {
        const score = reviewForm[metric.scoreField]
        if (score === null) {
          setAttendanceSaveError(
            `Please rate ${metric.label} for every present student.`,
          )
          return
        }

        if (score <= 2 && !reviewForm[metric.remarkField].trim()) {
          const studentName = studentMap.get(studentId)?.name ?? 'this student'
          setAttendanceSaveError(
            `${studentName}: ${metric.label} requires a remark when the score is 1 or 2.`,
          )
          return
        }
      }

      reviewPayload.push({
        student_id: studentId,
        logicalThinkingScore: reviewForm.logicalThinkingScore ?? 3,
        logicalThinkingRemark: reviewForm.logicalThinkingRemark.trim() || null,
        codingCreativityScore: reviewForm.codingCreativityScore ?? 3,
        codingCreativityRemark: reviewForm.codingCreativityRemark.trim() || null,
        problemSolvingScore: reviewForm.problemSolvingScore ?? 3,
        problemSolvingRemark: reviewForm.problemSolvingRemark.trim() || null,
        expressivenessScore: reviewForm.expressivenessScore ?? 3,
        expressivenessRemark: reviewForm.expressivenessRemark.trim() || null,
        sustainedFocusScore: reviewForm.sustainedFocusScore ?? 3,
        sustainedFocusRemark: reviewForm.sustainedFocusRemark.trim() || null,
      })
    }

    try {
      setIsSavingAttendance(true)
      setAttendanceSaveError(null)

      const { error } = await supabase.rpc('submit_lesson_attendance', {
        p_schedule_id: attendanceModal.scheduleId,
        p_occurrence_date: attendanceModal.occurrenceDate,
        p_teacher_id: currentSession.teacherId,
        p_lesson_remark: attendanceRemark.trim() || null,
        p_attendance: payload,
        p_student_reviews: reviewPayload,
      })

      if (error) {
        throw error
      }

      await refreshStudentsAndLogs()
      closeAttendanceModal()
    } catch (error) {
      setAttendanceSaveError(
        error instanceof Error ? error.message : 'Failed to submit attendance.',
      )
    } finally {
      setIsSavingAttendance(false)
    }
  }

  function renderCalendarEventContent(eventInfo: EventContentArg) {
    const eventType = eventInfo.event.extendedProps.eventType as
      | 'regular'
      | 'replacement'
    const teacherName = eventInfo.event.extendedProps.teacherName as string
    const participantNames = eventInfo.event.extendedProps.participantNames as string
    const scheduleId = Number(eventInfo.event.extendedProps.scheduleId)
    const occurrenceDate = eventInfo.event.start
      ? getDateKeyFromDate(eventInfo.event.start)
      : ''
    const completed = latestLessonLogMap.has(`${scheduleId}:${occurrenceDate}`)

    return (
      <div
        className={cn(
          'rounded-xl border px-2.5 py-2 shadow-sm',
          eventType === 'regular' && !completed && 'border-sky-200 bg-sky-500 text-white',
          eventType === 'replacement' &&
            !completed &&
            'border-orange-200 bg-orange-500 text-white',
          eventType === 'regular' &&
            completed &&
            'border-sky-200 bg-sky-100 text-sky-700 opacity-75',
          eventType === 'replacement' &&
            completed &&
            'border-orange-200 bg-orange-100 text-orange-700 opacity-75',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]',
              eventType === 'regular' && !completed && 'bg-sky-100 text-sky-700',
              eventType === 'replacement' &&
                !completed &&
                'bg-orange-100 text-orange-700',
              completed && 'bg-white/80 text-slate-600',
            )}
          >
            {completed
              ? 'Completed'
              : eventType === 'regular'
                ? 'Regular'
                : 'Replacement'}
          </span>
          <span
            className={cn(
              'text-[10px] font-medium',
              completed ? 'text-slate-500' : 'text-white/90',
            )}
          >
            {eventInfo.timeText}
          </span>
        </div>
        <div
          className={cn(
            'mt-2 text-xs font-semibold leading-snug',
            completed ? 'text-slate-700' : 'text-white',
          )}
        >
          {eventInfo.event.title}
        </div>
        <div
          className={cn(
            'mt-1 text-[11px]',
            completed ? 'text-slate-500' : 'text-white/90',
          )}
        >
          {teacherName}
        </div>
        <div
          className={cn(
            'mt-0.5 text-[11px]',
            completed ? 'text-slate-400' : 'text-white/80',
          )}
        >
          {participantNames}
        </div>
      </div>
    )
  }

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
                  ? 'Teacher Workspace'
                  : 'Admin Workspace'}
              </div>
              <div className="mt-1 text-xs text-white/85">
                {currentSession?.role === 'teacher'
                  ? 'Calendar, attendance, and classroom overview'
                  : 'Calendar, attendance, and student control center'}
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
            Phase 4 attendance flow - mobile ready
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <div className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#fc0c97]">
                  {activeSection === 'calendar'
                    ? 'Calendar Board'
                    : activeSection === 'classrooms'
                      ? 'Classroom Board'
                      : activeSection === 'teachers'
                        ? 'Teacher Board'
                        : 'Student Board'}
                </div>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
                  {activeSection === 'calendar'
                    ? 'Classes, Attendance & Timetable'
                    : activeSection === 'classrooms'
                      ? 'My Classroom'
                      : activeSection === 'teachers'
                        ? 'My Teacher'
                        : 'Student Classes & Expiry'}
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
                {!isSupabaseConfigured && (
                  <div className="rounded-xl bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800">
                    Setup Required
                  </div>
                )}
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
                          Blue = Regular Class. Orange = Replacement Class. Teachers
                          tap a card to take attendance. Completed lessons fade and
                          remain editable for 24 hours.
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
                        const scheduleId = Number(arg.event.extendedProps.scheduleId)
                        const occurrenceDate = arg.event.start
                          ? getDateKeyFromDate(arg.event.start)
                          : todayString

                        if (isAdminView) {
                          openEditSchedule(scheduleId)
                          return
                        }

                        void openAttendanceForEvent(
                          scheduleId,
                          occurrenceDate,
                          arg.event.title,
                        )
                      }}
                      eventContent={renderCalendarEventContent}
                    />
                  </div>
                </section>
              </>
            )}

            {activeSection === 'classrooms' && (
              <ClassListingSection
                isAdminView={isAdminView}
                onEditClass={openEditSchedule}
                onOpenCreateClass={isAdminView ? () => openCreateSchedule() : undefined}
                onOpenStudentDetail={openStudentDetail}
                onViewCalendar={() => setActiveSection('calendar')}
                scheduleParticipantMap={scheduleParticipantMap}
                schedules={activeClassroomSchedules}
                selectedClassId={selectedClassId}
                setSelectedClassId={setSelectedClassId}
                studentMap={studentMap}
                teacherMap={teacherMap}
                todayString={todayString}
              />
            )}

            {activeSection === 'students' && (
              <StudentDashboardSection
                activeFilter={studentFilter}
                deactivatingStudentId={deactivatingStudentId}
                isLoading={isLoading}
                students={students}
                todayString={todayString}
                onDeactivateStudent={handleDeactivateStudent}
                onOpenCreateStudent={openCreateStudentModal}
                onOpenStudentDetail={openStudentDetail}
                onOpenRenewal={openStudentRenewal}
                onToggleFilter={(filter) =>
                  setStudentFilter((currentFilter) =>
                    currentFilter === filter ? 'all' : filter,
                  )
                }
              />
            )}

            {activeSection === 'teachers' && isAdminView && (
              <TeacherManagementSection
                isLoading={isLoading}
                teachers={teachers}
                onOpenCreateTeacher={openCreateTeacherModal}
              />
            )}
          </div>
        </section>
      </div>

      {isCreateStudentOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/30 px-4 py-6">
          <div className="mx-auto flex min-h-full w-full max-w-2xl items-center justify-center">
            <div className="w-full overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.15)]">
            <div className="border-b border-slate-200 bg-[#f8fafc] px-6 py-5 sm:px-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-[#fc0c97]">
                    Student record setup
                  </div>
                  <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                    Add Student Record
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Create a new student profile with initial classes and all active expiry dates.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeCreateStudentModal}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white"
                >
                  Close
                </button>
              </div>
            </div>

            <form
              onSubmit={handleCreateStudentSubmit}
              className="max-h-[82vh] space-y-6 overflow-y-auto px-6 py-6 sm:px-8"
            >
              {createStudentSaveError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {createStudentSaveError}
                </div>
              )}

              <div className="grid gap-5 sm:grid-cols-2">
                <label className="space-y-2 sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Student Full Name
                  </span>
                  <input
                    type="text"
                    value={createStudentFormState.fullName}
                    onChange={(event) =>
                      updateCreateStudentForm('fullName', event.target.value)
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Assigned Teacher
                  </span>
                  <select
                    value={createStudentFormState.teacherId}
                    onChange={(event) =>
                      updateCreateStudentForm('teacherId', event.target.value)
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                  >
                    <option value="">Unassigned for now</option>
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.fullName}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Initial Classes
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={createStudentFormState.initialHours}
                    onChange={(event) =>
                      updateCreateStudentForm('initialHours', event.target.value)
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Lesson Expiry Date
                  </span>
                  <input
                    type="date"
                    value={createStudentFormState.lessonExpiryDate}
                    onChange={(event) =>
                      updateCreateStudentForm('lessonExpiryDate', event.target.value)
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Account Fee Expiry Date
                  </span>
                  <input
                    type="date"
                    value={createStudentFormState.accountFeeExpiryDate}
                    onChange={(event) =>
                      updateCreateStudentForm(
                        'accountFeeExpiryDate',
                        event.target.value,
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Mirai Club Expiry Date
                  </span>
                  <input
                    type="date"
                    value={createStudentFormState.miraiClubExpiryDate}
                    onChange={(event) =>
                      updateCreateStudentForm(
                        'miraiClubExpiryDate',
                        event.target.value,
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                  />
                </label>

                <label className="space-y-2 sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Assign to Classroom
                  </span>
                  <div className="grid max-h-56 gap-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
                    {activeClassroomSchedules.map((schedule) => {
                      const selected = createStudentFormState.classIds.includes(
                        String(schedule.id),
                      )
                      return (
                        <label
                          key={schedule.id}
                          className={cn(
                            'flex items-start gap-3 rounded-xl border px-3 py-3 text-sm transition',
                            selected
                              ? 'border-[#fc0c97] bg-[#fff1f8]'
                              : 'border-slate-200 bg-white',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() =>
                              toggleCreateStudentClass(String(schedule.id))
                            }
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-[#fc0c97] focus:ring-[#fc0c97]"
                          />
                          <div>
                            <div className="font-semibold text-slate-900">
                              {schedule.title}
                            </div>
                            <div className="text-xs text-slate-500">
                              {teacherMap.get(schedule.teacherId)?.fullName ?? 'Unassigned teacher'}
                            </div>
                          </div>
                        </label>
                      )
                    })}
                    {activeClassroomSchedules.length === 0 && (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-500 sm:col-span-2">
                        No active classroom available yet. Create a regular class first, then assign students into it.
                      </div>
                    )}
                  </div>
                </label>

                <label className="space-y-2 sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Internal Note
                  </span>
                  <textarea
                    rows={4}
                    value={createStudentFormState.notes}
                    onChange={(event) =>
                      updateCreateStudentForm('notes', event.target.value)
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={closeCreateStudentModal}
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingStudentRecord}
                  className="rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isCreatingStudentRecord ? 'Creating...' : 'Create Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
        </div>
      )}

      {isCreateTeacherOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/30 px-4 py-6">
          <div className="mx-auto flex min-h-full w-full max-w-2xl items-center justify-center">
            <div className="w-full overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.15)]">
              <div className="border-b border-slate-200 bg-[#f8fafc] px-6 py-5 sm:px-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-[#fc0c97]">
                      Teacher record setup
                    </div>
                    <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                      Add Teacher
                    </h2>
                    <p className="mt-2 text-sm text-slate-500">
                      Create a teacher profile for classroom assignment and timetable visibility.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeCreateTeacherModal}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white"
                  >
                    Close
                  </button>
                </div>
              </div>

              <form
                onSubmit={handleCreateTeacherSubmit}
                className="max-h-[82vh] space-y-6 overflow-y-auto px-6 py-6 sm:px-8"
              >
                {createTeacherSaveError && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {createTeacherSaveError}
                  </div>
                )}

                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Username
                    </span>
                    <input
                      type="text"
                      value={createTeacherFormState.username}
                      onChange={(event) =>
                        updateCreateTeacherForm('username', event.target.value)
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Full Name
                    </span>
                    <input
                      type="text"
                      value={createTeacherFormState.fullName}
                      onChange={(event) =>
                        updateCreateTeacherForm('fullName', event.target.value)
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Email
                    </span>
                    <input
                      type="email"
                      value={createTeacherFormState.email}
                      onChange={(event) =>
                        updateCreateTeacherForm('email', event.target.value)
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Phone
                    </span>
                    <input
                      type="text"
                      value={createTeacherFormState.phone}
                      onChange={(event) =>
                        updateCreateTeacherForm('phone', event.target.value)
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                    />
                  </label>

                  <label className="space-y-2 sm:col-span-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Role
                    </span>
                    <select
                      value={createTeacherFormState.role}
                      onChange={(event) =>
                        updateCreateTeacherForm(
                          'role',
                          event.target.value as CreateTeacherFormState['role'],
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                    >
                      <option value="teacher">Teacher</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={closeCreateTeacherModal}
                    className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreatingTeacherRecord}
                    className="rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isCreatingTeacherRecord ? 'Creating...' : 'Create Teacher'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {selectedStudentDetail && (
        <StudentDetailModal
          student={selectedStudentDetail}
          lessonLogs={lessonLogs}
          lessonReviews={lessonReviews}
          onClose={closeStudentDetail}
          scheduleParticipantMap={scheduleParticipantMap}
          schedules={schedules}
          teacherMap={teacherMap}
        />
      )}

      {selectedStudent && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/30 px-4 py-6">
          <div className="mx-auto flex min-h-full w-full max-w-2xl items-center justify-center">
            <div className="w-full overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.15)]">
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
                    Renewal now updates the real student record and writes an immutable admin ledger entry.
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
              className="max-h-[82vh] space-y-6 overflow-y-auto px-6 py-6 sm:px-8"
            >
              <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Current Remaining Classes
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
                    Add Classes
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

                <label className="space-y-2 sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">
                    Admin Remark
                  </span>
                  <textarea
                    rows={4}
                    value={studentFormState.remark}
                    onChange={(event) =>
                      updateStudentForm('remark', event.target.value)
                    }
                    placeholder="Explain why this renewal was made. This remark will be written into the admin ledger."
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
        </div>
      )}

      {(isCreatingSchedule || editingSchedule) && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/30 px-4 py-6">
          <div className="mx-auto w-full max-w-3xl overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.15)]">
            <div className="border-b border-slate-200 bg-[#f8fafc] px-6 py-5 sm:px-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-[#fc0c97]">
                    {isCreatingSchedule
                      ? 'Create timetable entry'
                      : 'Edit timetable entry'}
                  </div>
                  <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                    {isCreatingSchedule
                      ? 'New Schedule'
                      : editingSchedule?.title ?? 'Schedule'}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Set regular recurring classes or one-off replacement classes,
                    then assign the student roster that will appear in attendance.
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

            <form
              onSubmit={handleScheduleSubmit}
              className="max-h-[82vh] space-y-6 overflow-y-auto px-6 py-6 sm:px-8"
            >
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
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
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
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
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
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                  >
                    <option value="regular">Regular Class</option>
                    <option value="replacement">Replacement Class</option>
                  </select>
                </label>

                {scheduleFormState.eventType === 'regular' ? (
                  <>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold text-slate-700">
                        Repeat Every
                      </span>
                      <select
                        value={scheduleFormState.dayOfWeek}
                        onChange={(event) =>
                          updateScheduleForm('dayOfWeek', event.target.value)
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                      >
                        {weekdayLabels.map((label, index) => (
                          <option key={label} value={index}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>

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
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
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
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                      />
                    </label>
                  </>
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
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
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
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
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
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                  />
                </label>

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                  <div className="text-sm font-semibold text-slate-900">
                    {scheduleFormState.eventType === 'regular'
                      ? 'Regular Class Roster'
                      : 'Replacement Class Participants'}
                  </div>
                  <p className="text-sm text-slate-500">
                    {scheduleFormState.eventType === 'regular'
                      ? 'These students will appear every time the teacher opens attendance for this regular class.'
                      : 'Only the selected students will appear for this replacement lesson attendance.'}
                  </p>
                  <div className="grid max-h-56 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                    {students.map((student) => {
                      const selected = scheduleFormState.participantIds.includes(
                        String(student.id),
                      )
                      return (
                        <label
                          key={student.id}
                          className={cn(
                            'flex items-start gap-3 rounded-xl border px-3 py-3 text-sm transition',
                            selected
                              ? 'border-[#fc0c97] bg-[#fff1f8]'
                              : 'border-slate-200 bg-white',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() =>
                              toggleScheduleParticipant(String(student.id))
                            }
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-[#fc0c97] focus:ring-[#fc0c97]"
                          />
                          <div>
                            <div className="font-semibold text-slate-900">
                              {student.name}
                            </div>
                            <div className="text-xs text-slate-500">
                              Classes: {student.remainingHours}
                            </div>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>

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
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2]"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  {!isCreatingSchedule && editingSchedule && (
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
                    Close
                  </button>
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
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {attendanceModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/30 px-4 py-6">
          <div className="mx-auto flex min-h-full w-full max-w-3xl items-center justify-center">
            <div className="w-full overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.15)]">
            <div className="border-b border-slate-200 bg-[#f8fafc] px-6 py-5 sm:px-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-[#fc0c97]">
                    Attendance Submission
                  </div>
                  <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                    {attendanceModal.title}
                  </h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {formatDate(attendanceModal.occurrenceDate)} -{' '}
                    {attendanceExistingLog
                      ? attendanceLocked
                        ? 'Locked after 24 hours'
                        : `Editing revision ${attendanceExistingLog.revisionNumber} within 24 hours`
                      : 'New lesson attendance submission'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeAttendanceModal}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white"
                >
                  Close
                </button>
              </div>
            </div>

            <form
              onSubmit={handleAttendanceSubmit}
              className="max-h-[82vh] space-y-6 overflow-y-auto px-6 py-6 sm:px-8"
            >
              {attendanceSaveError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {attendanceSaveError}
                </div>
              )}

              {isLoadingAttendance ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-16 text-center text-sm text-slate-500">
                  Loading attendance roster...
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {attendanceRoster.map((student) => {
                      const expired = parseLocalDate(student.lessonExpiryDate) < parseLocalDate(todayString)
                      const zeroOrLess = student.remainingHours <= 0
                      const highlight = expired || zeroOrLess
                      const currentStatus =
                        attendanceStatuses[student.id] ?? 'present'
                      const reviewForm =
                        attendanceReviews[student.id] ??
                        createEmptyAttendanceReviewForm()

                      return (
                        <div
                          key={student.id}
                          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                              <div className="space-y-1">
                                <div
                                  className={cn(
                                    'text-base font-semibold',
                                    highlight ? 'text-red-600' : 'text-slate-900',
                                  )}
                                >
                                  {student.name}
                                </div>
                                <div className="text-sm text-slate-500">
                                  Remaining Classes: {student.remainingHours} - Lesson
                                  Expiry: {formatDate(student.lessonExpiryDate)}
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-2">
                                {([
                                  ['present', 'Present'],
                                  ['absent', 'Absent'],
                                  ['leave', 'Leave'],
                                ] as const).map(([value, label]) => {
                                  const active = currentStatus === value

                                  return (
                                    <button
                                      key={value}
                                      type="button"
                                      disabled={attendanceLocked}
                                      onClick={() =>
                                        setAttendanceStatuses((current) => ({
                                          ...current,
                                          [student.id]: value,
                                        }))
                                      }
                                      className={cn(
                                        'rounded-xl border px-4 py-2 text-sm font-semibold transition',
                                        active &&
                                          value === 'present' &&
                                          'border-emerald-200 bg-emerald-50 text-emerald-700',
                                        active &&
                                          value === 'absent' &&
                                          'border-slate-300 bg-slate-100 text-slate-700',
                                        active &&
                                          value === 'leave' &&
                                          'border-amber-200 bg-amber-50 text-amber-700',
                                        !active &&
                                          'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                                        attendanceLocked && 'cursor-not-allowed opacity-70',
                                      )}
                                    >
                                      {label}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>

                            {currentStatus === 'present' && (
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="mb-3 text-sm font-semibold text-slate-900">
                                  Student Performance Review
                                </div>
                                <div className="grid gap-3 lg:grid-cols-2">
                                  {performanceMetricDefinitions.map((metric) => {
                                    const score = reviewForm[metric.scoreField]
                                    const needsRemark =
                                      score !== null && score <= 2

                                    return (
                                      <div
                                        key={`${student.id}-${metric.key}`}
                                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
                                      >
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                          <div className="text-sm font-semibold text-slate-900">
                                            {metric.label}
                                          </div>
                                          <StarRatingInput
                                            value={score}
                                            disabled={attendanceLocked}
                                            onChange={(nextScore) =>
                                              updateAttendanceReviewScore(
                                                student.id,
                                                metric.scoreField,
                                                metric.remarkField,
                                                nextScore,
                                              )
                                            }
                                          />
                                        </div>

                                        {needsRemark && (
                                          <div className="mt-3 space-y-2">
                                            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-red-600">
                                              Remark Required for 1-2 Stars
                                            </div>
                                            <textarea
                                              rows={3}
                                              value={reviewForm[metric.remarkField]}
                                              disabled={attendanceLocked}
                                              onChange={(event) =>
                                                updateAttendanceReviewRemark(
                                                  student.id,
                                                  metric.remarkField,
                                                  event.target.value,
                                                )
                                              }
                                              placeholder="Explain the low score for this metric."
                                              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-50"
                                            />
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}

                    {attendanceRoster.length === 0 && (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                        No students are assigned to this class yet. Admin must edit
                        the schedule and add participants first.
                      </div>
                    )}
                  </div>

                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-slate-700">
                      Lesson Remark
                    </span>
                    <textarea
                      rows={5}
                      value={attendanceRemark}
                      disabled={attendanceLocked}
                      onChange={(event) => setAttendanceRemark(event.target.value)}
                      placeholder="Write the lesson progress, homework, or any important classroom note here."
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-[#fc0c97] focus:ring-4 focus:ring-[#ffe4f2] disabled:bg-slate-50"
                    />
                  </label>
                </>
              )}

              <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={closeAttendanceModal}
                  className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Close
                </button>
                {!attendanceLocked && attendanceRoster.length > 0 && (
                  <button
                    type="submit"
                    disabled={isSavingAttendance || isLoadingAttendance}
                    className="rounded-xl bg-[#fc0c97] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSavingAttendance ? 'Submitting...' : 'Submit Attendance'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
        </div>
      )}
    </main>
  )
}

export default App
