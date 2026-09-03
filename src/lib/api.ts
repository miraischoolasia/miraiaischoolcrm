import { supabase } from './supabase'
import {
  mapAdminActivityRow,
  mapClassroomRow,
  mapLeadRow,
  mapLessonLogStudentReviewRow,
  mapLessonLogStudentRow,
  mapLessonLogSummaryRow,
  mapScheduleParticipantRow,
  mapScheduleRow,
  mapStudentRow,
  mapTeacherRow,
} from './mappers'
import type { LessonLogStudent, LessonLogStudentReview, LessonLogSummary } from '../types/domain'

export async function fetchStudentsFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('students')
    .select(
      'id, teacher_id, classroom_id, full_name, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, notes, is_active, student_type',
    )
    .order('full_name')

  if (error) {
    throw error
  }

  return data.map(mapStudentRow)
}

export async function fetchClassroomsFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('classrooms')
    .select('id, name, age_group, program_level, teacher_id, status, notes, archived_at')
    .order('age_group')
    .order('program_level')
    .order('name')

  if (error) {
    throw error
  }

  return data.map(mapClassroomRow)
}

export async function fetchTeachersFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('teachers')
    .select('id, username, full_name, email, phone, role, is_active')
    .eq('is_active', true)
    .order('role', { ascending: true })
    .order('full_name')

  if (error) {
    throw error
  }

  return data.map(mapTeacherRow)
}

export async function fetchLeadsFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('leads')
    .select(
      'id, full_name, phone, source, status, children, notes, follow_ups, converted_student_id, added_date, created_at, updated_at',
    )
    .order('added_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }

  return data.map(mapLeadRow)
}

const ADMIN_ACTIVITY_PAGE_SIZE = 250

export async function fetchAdminActivityFromSupabase(options?: {
  limit?: number
  beforeId?: number
}) {
  if (!supabase) {
    return []
  }

  let query = supabase
    .from('admin_activity_logs')
    .select(
      'id, actor_teacher_id, action_type, entity_type, entity_id, entity_label, details, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(options?.limit ?? ADMIN_ACTIVITY_PAGE_SIZE)

  if (options?.beforeId !== undefined) {
    query = query.lt('id', options.beforeId)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return data.map(mapAdminActivityRow)
}

export async function fetchSchedulesFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('schedules')
    .select(
      'id, teacher_id, classroom_id, title, event_type, recurrence_type, day_of_week, scheduled_date, start_time, end_time, start_recur, end_recur, status, notes',
    )
    .order('title')

  if (error) {
    throw error
  }

  return data.map(mapScheduleRow)
}

export async function fetchScheduleParticipantsFromSupabase() {
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

export async function fetchLessonLogSummariesFromSupabase() {
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

export async function fetchLessonLogStudentReviewsFromSupabase() {
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

export async function fetchLatestLessonLogStudents(scheduleId: number, lessonDate: string) {
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

export function getSupabaseLoadErrorMessage(error: unknown) {
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
