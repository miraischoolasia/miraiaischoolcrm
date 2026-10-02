import { supabase } from './supabase'
import { mapFormRow, mapPublicForm, mapSubmissionRow, suggestSlug } from './forms'
import {
  mapAdminActivityRow,
  mapClassroomRow,
  mapLeadOptionRow,
  mapLeadRow,
  mapMakeupPlanRow,
  mapPackageRow,
  mapLessonLogStudentReviewRow,
  mapLessonLogStudentRow,
  mapLessonLogSummaryRow,
  mapScheduleExceptionRow,
  mapScheduleParticipantRow,
  mapScheduleRow,
  mapStudentEnrollmentRow,
  mapStudentRow,
  mapTeacherRow,
  mapTrialBookingRow,
} from './mappers'
import type {
  FormField,
  FormSettings,
  LeadFormSubmission,
  LessonLogStudent,
  LessonLogStudentReview,
  LeadRow,
  LessonLogSummary,
  ScheduleExceptionRow,
  StudentRow,
} from '../types/domain'

function isMissingTableError(error: { code?: string }) {
  return error.code === 'PGRST205' || error.code === '42P01'
}

export async function fetchStudentsFromSupabase() {
  if (!supabase) {
    return []
  }

  const columns =
    'id, teacher_id, classroom_id, full_name, phone, age, remaining_hours, lesson_expiry_date, account_fee_expiry_date, mirai_club_expiry_date, notes, is_active, student_type'
  const select = async (selected: string) => {
    const result = await supabase!.from('students').select(selected).order('full_name')
    return result as unknown as {
      data: (Omit<StudentRow, 'package_id'> & { package_id?: number | null })[] | null
      error: { code?: string } | null
    }
  }
  let { data, error } = await select(`${columns}, package_id`)

  // Before the packages migration package_id does not exist yet.
  if (error?.code === '42703') {
    ;({ data, error } = await select(columns))
  }

  if (error) {
    throw error
  }

  return (data ?? []).map((row) => mapStudentRow({ ...row, package_id: row.package_id ?? null }))
}

export async function fetchPackagesFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('packages')
    .select('id, name, kind, class_count, duration_months, includes_fees, is_active, sort_order')
    .order('sort_order')
    .order('id')

  if (error) {
    // Before the packages migration there are none yet.
    if (isMissingTableError(error)) {
      return []
    }
    throw error
  }

  return data.map(mapPackageRow)
}

export async function fetchStudentEnrollments(studentId: number) {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('student_enrollments')
    .select('id, student_id, package_id, start_date, end_date, class_count, remark, created_at')
    .eq('student_id', studentId)
    .order('start_date', { ascending: false })

  if (error) {
    if (isMissingTableError(error)) {
      return []
    }
    throw error
  }

  return data.map(mapStudentEnrollmentRow)
}

export async function fetchClassroomsFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('classrooms')
    .select('id, name, category, age_group, program_level, teacher_id, status, notes, archived_at')
    .order('age_group')
    .order('program_level')
    .order('name')

  if (error) {
    throw error
  }

  return data.map(mapClassroomRow)
}

// Includes archived (inactive) teachers so history still shows their names
// and a deactivated login gets the right message. Lists that offer teachers
// for assignment filter on isActive themselves.
export async function fetchTeachersFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('teachers')
    .select('id, auth_user_id, username, full_name, email, phone, role, is_active, permissions')
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

  const select = async (columns: string) => {
    const result = await supabase!
      .from('leads')
      .select(columns)
      .order('added_date', { ascending: false })
      .order('created_at', { ascending: false })
    return { data: result.data as unknown as LeadRow[] | null, error: result.error }
  }

  const columns =
    'id, full_name, phone, status, children, notes, follow_ups, tasks, converted_student_id, added_date, created_at, updated_at'
  let { data, error } = await select(`${columns}, source_id, pic_id`)

  // Before the lead options migration source_id / pic_id do not exist yet:
  // load the leads without them rather than failing the workspace.
  if (error?.code === '42703') {
    ;({ data, error } = await select(columns))
  }

  if (error) {
    throw error
  }

  return (data ?? []).map((row) =>
    mapLeadRow({ ...row, source_id: row.source_id ?? null, pic_id: row.pic_id ?? null }),
  )
}

export async function fetchLeadOptionsFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('lead_options')
    .select('id, kind, label, is_active, legacy_key')
    .order('id')

  if (error) {
    // Before the lead options migration there are no custom names yet.
    if (isMissingTableError(error)) {
      return []
    }

    throw error
  }

  return data.map(mapLeadOptionRow)
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

export async function fetchScheduleExceptionsFromSupabase() {
  if (!supabase) {
    return []
  }

  const select = async (columns: string) => {
    const result = await supabase!
      .from('schedule_exceptions')
      .select(columns)
      .order('exception_date')
    return {
      data: result.data as unknown as ScheduleExceptionRow[] | null,
      error: result.error,
    }
  }

  let { data, error } = await select(
    'id, schedule_id, exception_date, reason, moved_to_schedule_id',
  )

  // Before the drag-to-move migration the moved_to_schedule_id column does
  // not exist yet: load without it rather than failing the workspace.
  if (error?.code === '42703') {
    ;({ data, error } = await select('id, schedule_id, exception_date, reason'))
  }

  if (error) {
    // Skipped days are optional decoration on the calendar. If the frontend
    // is deployed before the migration that creates the table, treat it as
    // "nothing cancelled" instead of failing the whole workspace load. Every
    // other error still surfaces.
    if (isMissingTableError(error)) {
      return []
    }

    throw error
  }

  return (data ?? []).map(mapScheduleExceptionRow)
}

export async function fetchTrialBookingsFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('trial_bookings')
    .select('id, schedule_id, booking_date, lead_id, student_id, child_name, child_age, phone, notes')
    .order('booking_date')

  if (error) {
    // Same reasoning as skipped days: bookings are an overlay on the calendar,
    // so a database that has not had the trial_bookings migration yet must
    // not stop the workspace from loading.
    if (isMissingTableError(error)) {
      return []
    }

    throw error
  }

  return data.map(mapTrialBookingRow)
}

export async function fetchMakeupPlansFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('makeup_plans')
    .select(
      'id, classroom_id, missed_date, student_id, missed_minutes, notes, makeup_sessions(session_date, extra_minutes)',
    )
    .order('missed_date')

  if (error) {
    // Same as trial bookings: an overlay, so a database without the
    // migration yet must not block the workspace.
    if (isMissingTableError(error)) {
      return []
    }

    throw error
  }

  return data.map(mapMakeupPlanRow)
}

// Every attendance row of one student, to find the classes they missed.
export async function fetchStudentAttendanceRows(studentId: number) {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('lesson_log_students')
    .select('lesson_log_id, attendance_status')
    .eq('student_id', studentId)

  if (error) {
    throw error
  }

  return data.map((row) => ({
    lessonLogId: row.lesson_log_id,
    status: row.attendance_status as 'present' | 'absent' | 'leave',
  }))
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

const formColumns =
  'id, name, fields, settings, is_published, slug, view_count, created_at, updated_at, updated_by_teacher_id'

export async function fetchFormsFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('forms')
    .select(formColumns)
    .order('updated_at', { ascending: false })

  if (error) {
    throw error
  }

  return data.map(mapFormRow)
}

const UNIQUE_VIOLATION = '23505'

export async function createFormInSupabase(
  name: string,
  fields: FormField[],
  settings: FormSettings,
) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  // Every form gets a readable link name; a clash with another form's just
  // draws a new random tail.
  for (let attempt = 0; ; attempt += 1) {
    const { data, error } = await supabase
      .from('forms')
      .insert({ name, fields, settings, slug: suggestSlug(name) })
      .select(formColumns)
      .single()

    if (error?.code === UNIQUE_VIOLATION && attempt < 3) {
      continue
    }
    if (error) {
      throw error
    }
    return mapFormRow(data)
  }
}

// Returns null when saved, or a message when the link name is taken.
export async function saveFormSlugInSupabase(formId: string, slug: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase
    .from('forms')
    .update({ slug })
    .eq('id', formId)
    .select(formColumns)
    .single()

  if (error?.code === UNIQUE_VIOLATION) {
    return { form: null, taken: true }
  }
  if (error) {
    throw error
  }
  return { form: mapFormRow(data), taken: false }
}

export async function saveFormInSupabase(
  formId: string,
  changes: { name: string; fields: FormField[]; settings: FormSettings; isPublished: boolean },
) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { data, error } = await supabase
    .from('forms')
    .update({
      name: changes.name,
      fields: changes.fields,
      settings: changes.settings,
      is_published: changes.isPublished,
    })
    .eq('id', formId)
    .select(formColumns)
    .single()

  if (error) {
    throw error
  }

  return mapFormRow(data)
}

export async function deleteFormInSupabase(formId: string) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { error } = await supabase.from('forms').delete().eq('id', formId)

  if (error) {
    throw error
  }
}

// Newest first, capped so the page stays quick once a busy form has years of
// submissions; the list says when the cap is reached.
export const FORM_SUBMISSIONS_FETCH_LIMIT = 2000

export async function fetchFormSubmissionsFromSupabase() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('form_submissions')
    .select('id, form_id, answers, lead_id, lead_was_existing, status, last_page, created_at')
    .order('created_at', { ascending: false })
    .limit(FORM_SUBMISSIONS_FETCH_LIMIT)

  if (error) {
    throw error
  }

  return data.map(mapSubmissionRow)
}

export async function deleteFormSubmissionInSupabase(submissionId: number) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { error } = await supabase.from('form_submissions').delete().eq('id', submissionId)

  if (error) {
    throw error
  }
}

// The two calls below are what a visitor who is not logged in can reach.
export async function fetchPublicForm(formKey: string) {
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase.rpc('get_public_form_by_key', { p_form_key: formKey })

  if (error) {
    throw error
  }

  return mapPublicForm(data)
}

export async function recordFormView(formId: string) {
  if (!supabase) {
    return
  }

  await supabase.rpc('record_form_view', { p_form_id: formId })
}

export async function submitPublicForm(
  formId: string,
  answers: Record<string, string | string[]>,
  honeypot: string,
  // Ties this to the answers saved along the way, so they become one finished
  // submission instead of two.
  token: string | null = null,
) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const { error } = await supabase.rpc('submit_form', {
    p_form_id: formId,
    p_answers: answers,
    p_honeypot: honeypot,
    p_token: token,
  })

  if (error) {
    throw error
  }
}

// Called each time the visitor presses Next. It is only a safety net, so a
// failure is never shown to them.
export async function saveFormProgress(
  formId: string,
  token: string,
  answers: Record<string, string | string[]>,
  lastPage: number,
) {
  if (!supabase) {
    return
  }

  await supabase.rpc('save_form_progress', {
    p_form_id: formId,
    p_token: token,
    p_answers: answers,
    p_last_page: lastPage,
  })
}

// How many submissions came in after `sinceIso`, for the Forms menu badge.
// Unfinished ones do not count: there is nothing to follow up yet.
export async function countFormSubmissionsSince(sinceIso: string) {
  if (!supabase) {
    return 0
  }

  const { count, error } = await supabase
    .from('form_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gt('created_at', sinceIso)

  if (error) {
    throw error
  }

  return count ?? 0
}

const FORM_IMAGE_BUCKET = 'form-images'

// Stores a poster in the public bucket and returns the address visitors load
// it from. Every upload gets its own name, so replacing an image never shows
// an old cached copy.
export async function uploadFormImageToSupabase(file: File) {
  if (!supabase) {
    throw new Error('Supabase is not configured.')
  }

  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[
    file.type
  ]
  const path = `${crypto.randomUUID()}.${extension ?? 'img'}`

  const { error } = await supabase.storage
    .from(FORM_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: '31536000' })

  if (error) {
    throw error
  }

  return supabase.storage.from(FORM_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl
}

// The leads that have at least one finished form submission, for the small
// "Form" tag in the Leads list.
export async function fetchLeadIdsWithFormSubmissions() {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('form_submissions')
    .select('lead_id')
    .eq('status', 'completed')
    .not('lead_id', 'is', null)
    .limit(5000)

  if (error) {
    throw error
  }

  return [...new Set(data.flatMap((row) => (row.lead_id === null ? [] : [row.lead_id])))]
}

// Every finished submission linked to one lead, newest first.
export async function fetchLeadFormSubmissions(leadId: number): Promise<LeadFormSubmission[]> {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('form_submissions')
    .select('id, form_id, answers, lead_was_existing, created_at')
    .eq('lead_id', leadId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })

  if (error) {
    throw error
  }
  if (data.length === 0) {
    return []
  }

  const { data: forms, error: formsError } = await supabase
    .from('forms')
    .select('id, name')
    .in('id', [...new Set(data.map((row) => row.form_id))])

  if (formsError) {
    throw formsError
  }

  const names = new Map(forms.map((form) => [form.id, form.name]))
  return data.map((row) => {
    const submission = mapSubmissionRow({ ...row, lead_id: leadId, status: 'completed', last_page: null })
    return {
      id: submission.id,
      formId: submission.formId,
      formName: names.get(submission.formId) ?? 'Deleted form',
      createdAt: submission.createdAt,
      answers: submission.answers,
      wasExisting: submission.leadWasExisting,
    }
  })
}
