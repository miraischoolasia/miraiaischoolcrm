import type { Database } from './database'

export type AppSection =
  | 'calendar'
  | 'classrooms'
  | 'students'
  | 'teachers'
  | 'leads'
  | 'forms'
  | 'activity'
export type FilterKey = 'all' | 'hoa' | 'trial' | 'regular' | 'camp' | 'followUp'
export type AttendanceStatus = 'present' | 'absent' | 'leave'
export type StudentType = 'trial' | 'preview' | 'regular'
export type LeadOptionKind = 'source' | 'pic' | 'tag' | 'check'

// A lead source or PIC name the admin manages (see lead_options).
export type LeadOption = {
  id: number
  kind: LeadOptionKind
  label: string
  isActive: boolean
  // The old fixed source key (walk_in, referral, ...) for the first five;
  // check_1 .. check_3 for the three tick columns.
  legacyKey: string | null
  // Only tags have one: a #rrggbb colour.
  color: string | null
}

// The three tick columns of the Leads list, by position.
export type LeadCheckSlot = 1 | 2 | 3
export type LeadChecks = Partial<Record<LeadCheckSlot, { at: string | null; by: number | null }>>
export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'trial_scheduled'
  | 'trial_completed'
  | 'converted'
  | 'lost'
export type AgeGroup =
  | '6-8 Years Old'
  | '9-11 Years Old'
  | '12-14 Years Old'
  | '15-17 Years Old'
export type ProgramLevel =
  | 'Coder Foundation'
  | 'Coder Pro'
  | 'VibeTech Innovator'
  | 'VibeTech Pro'
  | 'VibeTech Future'
  | 'Software Engineer'
export type PerformanceMetricKey =
  | 'logicalThinking'
  | 'codingCreativity'
  | 'problemSolving'
  | 'expressiveness'
  | 'sustainedFocus'
export type ReviewScoreField =
  | 'logicalThinkingScore'
  | 'codingCreativityScore'
  | 'problemSolvingScore'
  | 'expressivenessScore'
  | 'sustainedFocusScore'
export type ReviewRemarkField =
  | 'logicalThinkingRemark'
  | 'codingCreativityRemark'
  | 'problemSolvingRemark'
  | 'expressivenessRemark'
  | 'sustainedFocusRemark'

export type Student = {
  id: number
  teacherId: number | null
  classroomId: number | null
  name: string
  phone: string | null
  // Only ever populated for a trial-booking student (from the booking's
  // child age) — never collected for a regular or preview student.
  age: number | null
  remainingHours: number
  lessonExpiryDate: string
  accountFeeExpiryDate: string
  miraiClubExpiryDate: string
  notes: string | null
  isActive: boolean
  studentType: StudentType
  // The package the student is on now (regular students only).
  packageId?: number | null
  // Every stay in a class, for the roster of a given day. Undefined before
  // the class history migration.
  classPeriods?: ClassroomPeriod[]
}

// One stay in a class: from startDate (null = since the class began) up to,
// not including, endDate (null = still in it).
export type ClassroomPeriod = {
  classroomId: number
  startDate: string | null
  endDate: string | null
}

export type PackageKind = 'trial' | 'regular' | 'camp'

// What a parent signs up for. Admin adds, renames and hides these.
export type Package = {
  id: number
  name: string
  kind: PackageKind
  classCount: number
  durationMonths: number
  includesFees: boolean
  isActive: boolean
  sortOrder: number
}

export type StudentEnrollment = {
  id: number
  studentId: number
  packageId: number
  startDate: string
  endDate: string
  classCount: number
  remark: string | null
  createdAt: string
}

export type ClassroomCategory = 'regular' | 'trial' | 'camp'

export type Classroom = {
  category: ClassroomCategory
  id: number
  name: string
  ageGroup: AgeGroup
  programLevel: ProgramLevel
  teacherId: number | null
  status: 'active' | 'archived'
  notes: string | null
  archivedAt: string | null
}

export type Teacher = {
  id: number
  authUserId: string | null
  username: string
  fullName: string
  email: string | null
  phone: string | null
  role: TeacherRole
  isActive: boolean
  permissions: AccountPermissions
}

export type TeacherRole = 'admin' | 'teacher' | 'staff'

export type PermissionModule =
  | 'calendar'
  | 'classrooms'
  | 'students'
  | 'leads'
  | 'forms'
  | 'activity'

export type PermissionAction = 'view' | 'edit' | 'delete'

// A missing module means no access. Delete is only ever set with edit.
export type AccountPermissions = Partial<
  Record<PermissionModule, { level: 'view' | 'edit'; delete?: boolean }>
>

export type LeadChild = {
  name: string
  age: number
  phone: string | null
}

export type LeadFollowUp = {
  date: string
  note: string
}

export type LeadTask = {
  id: string
  title: string
  dueDate: string
  completed: boolean
}

export type Lead = {
  id: number
  fullName: string | null
  phone: string | null
  sourceId: number | null
  picId: number | null
  // Ids of lead_options of kind 'tag'.
  tagIds: number[]
  // Which tick columns are ticked, and when and by whom.
  checks: LeadChecks
  status: LeadStatus
  children: LeadChild[]
  notes: string | null
  followUps: LeadFollowUp[]
  tasks: LeadTask[]
  convertedStudentId: number | null
  addedDate: string
  createdAt: string
  updatedAt: string
}

export type AdminActivity = {
  id: number
  actorTeacherId: number | null
  actionType: string
  entityType: 'student' | 'teacher' | 'classroom' | 'schedule' | 'lead'
  entityId: number | null
  entityLabel: string
  details: Record<string, unknown>
  createdAt: string
}

export type Schedule = {
  id: number
  teacherId: number
  classroomId: number | null
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

export type ScheduleParticipant = {
  id: number
  scheduleId: number
  studentId: number
  isActive: boolean
}

export type TrialBooking = {
  id: number
  scheduleId: number
  bookingDate: string
  leadId: number | null
  // The lightweight `student_type: 'trial'` student this booking's
  // attendance is recorded against (see the 20260922010000 migration). Null
  // only for a booking made before that migration and not yet backfilled.
  studentId: number | null
  childName: string
  childAge: number | null
  phone: string | null
  notes: string | null
}

export type TrialBookingFormState = {
  leadId: number | null
  childName: string
  childAge: string
  phone: string
  notes: string
}

export type ScheduleException = {
  id: number
  scheduleId: number
  exceptionDate: string
  reason: string | null
  // Set when the day was dragged to another date: the replacement class
  // created for it. Restoring the day removes that replacement.
  movedToScheduleId?: number | null
}

// A missed class (whole class, or one student) made up by adding minutes
// to later classes. A record only: it never changes remaining classes.
export type MakeupSession = {
  sessionDate: string
  extraMinutes: number
}

export type MakeupPlan = {
  id: number
  classroomId: number
  missedDate: string
  // null = the whole class
  studentId: number | null
  missedMinutes: number
  notes: string | null
  sessions: MakeupSession[]
}

export type LessonLogSummary = {
  id: number
  scheduleId: number
  teacherId: number
  lessonDate: string
  lessonRemark: string | null
  submittedAt: string
  revisionNumber: number
  parentLogId: number | null
}

export type LessonLogStudent = {
  id: number
  lessonLogId: number
  studentId: number
  attendanceStatus: AttendanceStatus
}

export type LessonLogStudentReview = {
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

export type AttendanceReviewFormState = {
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

export type RenewalFormState = {
  // '' when renewing by hand, without a package.
  packageId: string
  startDate: string
  addHours: string
  lessonExpiryDate: string
  accountFeeExpiryDate: string
  miraiClubExpiryDate: string
  remark: string
}

export type CreateStudentFormState = {
  packageId: string
  startDate: string
  fullName: string
  phone: string
  classroomId: string
  initialHours: string
  lessonExpiryDate: string
  accountFeeExpiryDate: string
  miraiClubExpiryDate: string
  notes: string
  studentType: StudentType
}

export type LeadChildFormState = {
  name: string
  age: string
  phone: string
}

export type LeadFormState = {
  fullName: string
  phone: string
  // Option ids as strings for the selects; '' = none picked.
  sourceId: string
  picId: string
  tagIds: number[]
  status: LeadStatus
  children: LeadChildFormState[]
  notes: string
  addedDate: string
}

export type CreateTeacherFormState = {
  username: string
  fullName: string
  email: string
  phone: string
  role: TeacherRole
  permissions: AccountPermissions
}

export type StudentDetailsFormState = {
  fullName: string
  phone: string
  classroomId: string
  notes: string
  studentType: StudentType
}

export type ScheduleFormState = {
  title: string
  teacherId: string
  classroomId: string
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

export type ClassroomFormState = {
  category: ClassroomCategory
  name: string
  ageGroup: AgeGroup
  programLevel: ProgramLevel
  teacherId: string
  // When editing and the teacher changes: the first day the new teacher
  // takes the class (earlier classes stay with the previous teacher).
  teacherEffectiveDate: string
  notes: string
}

export type AttendanceModalState = {
  scheduleId: number
  occurrenceDate: string
  title: string
}

export type ClassStatusSummary = {
  healthy: number
  attention: number
}

export type UserSession = {
  key: string
  role: TeacherRole
  label: string
  teacherId: number | null
}

export type StudentRow = Pick<
  Database['public']['Tables']['students']['Row'],
  | 'id'
  | 'teacher_id'
  | 'classroom_id'
  | 'full_name'
  | 'phone'
  | 'age'
  | 'remaining_hours'
  | 'lesson_expiry_date'
  | 'account_fee_expiry_date'
  | 'mirai_club_expiry_date'
  | 'notes'
  | 'is_active'
  | 'student_type'
  | 'package_id'
>

export type ClassroomRow = Pick<
  Database['public']['Tables']['classrooms']['Row'],
  | 'id'
  | 'name'
  | 'category'
  | 'age_group'
  | 'program_level'
  | 'teacher_id'
  | 'status'
  | 'notes'
  | 'archived_at'
>

export type TeacherRow = Pick<
  Database['public']['Tables']['teachers']['Row'],
  | 'id'
  | 'auth_user_id'
  | 'username'
  | 'full_name'
  | 'email'
  | 'phone'
  | 'role'
  | 'is_active'
  | 'permissions'
>

export type LeadRow = Pick<
  Database['public']['Tables']['leads']['Row'],
  | 'id'
  | 'full_name'
  | 'phone'
  | 'source_id'
  | 'pic_id'
  | 'tag_ids'
  | 'checks'
  | 'status'
  | 'children'
  | 'notes'
  | 'follow_ups'
  | 'tasks'
  | 'converted_student_id'
  | 'added_date'
  | 'created_at'
  | 'updated_at'
>

export type AdminActivityRow = Pick<
  Database['public']['Tables']['admin_activity_logs']['Row'],
  | 'id'
  | 'actor_teacher_id'
  | 'action_type'
  | 'entity_type'
  | 'entity_id'
  | 'entity_label'
  | 'details'
  | 'created_at'
>

export type ScheduleRow = Pick<
  Database['public']['Tables']['schedules']['Row'],
  | 'id'
  | 'teacher_id'
  | 'classroom_id'
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

export type ScheduleParticipantRow = Pick<
  Database['public']['Tables']['schedule_students']['Row'],
  'id' | 'schedule_id' | 'student_id' | 'is_active'
>

export type TrialBookingRow = Pick<
  Database['public']['Tables']['trial_bookings']['Row'],
  | 'id'
  | 'schedule_id'
  | 'booking_date'
  | 'lead_id'
  | 'student_id'
  | 'child_name'
  | 'child_age'
  | 'phone'
  | 'notes'
>

export type ScheduleExceptionRow = Pick<
  Database['public']['Tables']['schedule_exceptions']['Row'],
  'id' | 'schedule_id' | 'exception_date' | 'reason'
> &
  Partial<
    Pick<Database['public']['Tables']['schedule_exceptions']['Row'], 'moved_to_schedule_id'>
  >

export type MakeupPlanRow = Pick<
  Database['public']['Tables']['makeup_plans']['Row'],
  'id' | 'classroom_id' | 'missed_date' | 'student_id' | 'missed_minutes' | 'notes'
> & {
  makeup_sessions: Pick<
    Database['public']['Tables']['makeup_sessions']['Row'],
    'session_date' | 'extra_minutes'
  >[]
}

export type LessonLogSummaryRow = Pick<
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

export type LessonLogStudentRow = Pick<
  Database['public']['Tables']['lesson_log_students']['Row'],
  'id' | 'lesson_log_id' | 'student_id' | 'attendance_status'
>

export type LessonLogStudentReviewRow = Pick<
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

export type PackageRow = Pick<
  Database['public']['Tables']['packages']['Row'],
  | 'id'
  | 'name'
  | 'kind'
  | 'class_count'
  | 'duration_months'
  | 'includes_fees'
  | 'is_active'
  | 'sort_order'
>

export type StudentEnrollmentRow = Pick<
  Database['public']['Tables']['student_enrollments']['Row'],
  'id' | 'student_id' | 'package_id' | 'start_date' | 'end_date' | 'class_count' | 'remark' | 'created_at'
>

export type LeadOptionRow = Pick<
  Database['public']['Tables']['lead_options']['Row'],
  'id' | 'kind' | 'label' | 'is_active' | 'legacy_key' | 'color'
>

export type FormFieldType =
  | 'short_text'
  | 'long_text'
  | 'email'
  | 'phone'
  | 'number'
  | 'date'
  | 'dropdown'
  | 'radio'
  | 'checkbox'
  // Not questions: they show a picture (for example a poster) or some
  // written details on the form.
  | 'image'
  | 'text_block'

// Which Lead column a form answer fills when the form creates a lead.
export type FormLeadMap =
  | 'parent_name'
  | 'phone'
  | 'child_name'
  | 'child_age'
  | 'child_phone'
  | 'notes'

export type FormImageAlign = 'left' | 'center' | 'right'
export type FormTextStyle = 'heading' | 'body'

export type FormField = {
  id: string
  type: FormFieldType
  label: string
  placeholder: string
  required: boolean
  options: string[]
  mapTo: FormLeadMap | null
  // Only for 'image' fields: where the picture is stored, how wide it is
  // (percent of the form's width) and which side it sits on.
  imageUrl: string
  imageWidth: number
  imageAlign: FormImageAlign
  // Only for 'text_block' fields: the written details and how they look.
  content: string
  textStyle: FormTextStyle
  // The page of the form this field is on (see FormSettings.pages).
  pageId: string
}

export type FormAfterSubmit = 'message' | 'redirect'

// A page's rule reads the answer to an earlier choice question. 'is' and
// 'is_not' are for dropdown and single choice, 'includes' and 'excludes' for
// multiple choice.
export type FormRuleOp = 'is' | 'is_not' | 'includes' | 'excludes'

// What happens when a rule matches: jump forward to a later page, or end the
// form there, with the form's usual ending or one of its own.
export type FormRuleAction =
  | { type: 'page'; pageId: string }
  | { type: 'end'; ending: 'default' | 'message' | 'redirect'; message: string; redirectUrl: string }

export type FormRule = {
  id: string
  fieldId: string
  op: FormRuleOp
  value: string
  action: FormRuleAction
}

// Rules are checked top to bottom and the first match wins; with none, the
// visitor goes to the next page.
export type FormPage = {
  id: string
  title: string
  description: string
  rules: FormRule[]
}

export type FormSettings = {
  // The heading visitors see on the form. Empty = use the form's name, which
  // is only for the admin to tell forms apart.
  title: string
  submitLabel: string
  // What the visitor gets after sending: the message, or a page to go to.
  afterSubmit: FormAfterSubmit
  successMessage: string
  redirectUrl: string
  createLead: boolean
  // Lets the visitor add up to two more children.
  allowMoreChildren: boolean
  // The form's pages, in order. A form always has at least one.
  pages: FormPage[]
  // Closing the form: after this time (ISO, empty = never), and/or once this
  // many submissions are finished (null = no limit). What visitors see then.
  closesAt: string
  maxSubmissions: number | null
  closedMessage: string
  // People emailed for each new submission. Only admins ever see this.
  notifyEmails: string[]
}

export type Form = {
  id: string
  name: string
  fields: FormField[]
  settings: FormSettings
  isPublished: boolean
  // The editable part of the public link (/?form=<slug>); null until set.
  slug: string | null
  viewCount: number
  createdAt: string
  updatedAt: string
  updatedByTeacherId: number | null
}

export type FormAnswer = {
  id: string
  label: string
  value: string
}

// Where a visitor came from: ?utm_source=... in the link, and the website that
// sent them. Each is empty when unknown.
export type FormTracking = {
  source: string
  medium: string
  campaign: string
  content: string
  referrer: string
}

export type FormSubmission = {
  id: number
  formId: string
  answers: FormAnswer[]
  leadId: number | null
  // The phone already belonged to a lead, so the answers went into its notes.
  leadWasExisting: boolean
  // 'partial' = the visitor pressed Next but never finished; no lead yet.
  status: 'partial' | 'completed'
  // For a partial one: the page the visitor had got to (1 = first).
  lastPage: number | null
  tracking: FormTracking | null
  createdAt: string
}

export type FormClosedReason = 'deadline' | 'full'

// The slice of a form the public page needs (see get_public_form).
export type PublicForm = Pick<Form, 'id' | 'name' | 'fields' | 'settings'> & {
  // Alerts are on, so the page asks for an email to be sent after submitting.
  notify: boolean
  // Why the form is not taking answers right now; null = open.
  closedReason: FormClosedReason | null
}

// One form submission linked to a lead, as the lead's "Form answers" shows it.
export type LeadFormSubmission = {
  id: number
  formId: string
  formName: string
  createdAt: string
  answers: FormAnswer[]
  // The lead already existed (same phone), so this submission was linked to it.
  wasExisting: boolean
  tracking: FormTracking | null
}
