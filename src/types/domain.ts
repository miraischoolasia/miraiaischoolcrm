import type { Database } from './database'

export type AppSection =
  | 'home'
  | 'calendar'
  | 'classrooms'
  | 'questions'
  | 'videos'
  | 'students'
  | 'app-logins'
  | 'student-chat'
  | 'teachers'
  | 'leads'
  | 'whatsapp'
  | 'automations'
  | 'ai-knowledge'
  | 'content-studio'
  | 'content-library'
  | 'programmes'
  | 'forms'
  | 'activity'
  | 'team-replies'
// A tab on the Students page: a kind of student, or (for a school with programmes of its own) one programme,
// 'programme:<id>', or the students in none, 'programme:none'.
export type FilterKey = 'all' | 'hoa' | 'trial' | 'regular' | 'camp' | `programme:${number}` | 'programme:none'
// The key of one of the school's attendance statuses ('present', 'absent',
// 'leave', or one an admin added such as 'late').
export type AttendanceStatus = string

export type AttendanceStatusColor = 'emerald' | 'slate' | 'amber' | 'sky' | 'rose' | 'violet'

export type AttendanceStatusOption = {
  key: AttendanceStatus
  label: string
  // In class: needs a review and counts as there.
  attended: boolean
  // Takes one lesson from the package.
  deductsLesson: boolean
  color: AttendanceStatusColor
  sortOrder: number
  isActive: boolean
  // Points the student gets for it when attendance is submitted.
  rewardPoints: number
}
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
// What the bulk actions of the Leads list can do to the selected leads.
export type LeadBulkAction =
  | { type: 'stage'; status: LeadStatus }
  // null clears the PIC.
  | { type: 'pic'; picId: number | null }
  | { type: 'source'; sourceId: number }
  | { type: 'tag-add'; tagId: number }
  | { type: 'tag-remove'; tagId: number }
  | { type: 'delete' }

// The key of one of the school's lead stages ('new', 'converted' and 'lost' always exist; the school adds its own).
export type LeadStatus = string
// The name of one of the school's age groups (Class Settings > Subjects & ages).
export type AgeGroup = string
// The name of one of the school's class levels (Class Settings > Class options).
export type ProgramLevel = string
// A review criterion a school sets itself (Logical Thinking, Teamwork, ...).
export type ReviewCriterion = {
  id: number
  name: string
  description: string | null
  maxScore: number
  // A score at or below this needs a remark (0 = never).
  remarkRequiredAtOrBelow: number
  sortOrder: number
  isActive: boolean
  // Set on the five criteria that were fixed columns before.
  legacyKey: string | null
}

export type ReviewScore = {
  score: number
  remark: string | null
}

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
  // The child's birth date (yyyy-mm-dd); the age is worked out from it. Undefined before the migration.
  dateOfBirth?: string | null
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
  // Where the class meets on Zoom. Undefined before the migration.
  zoomLink?: string | null
  // The programme (course) the class belongs to, or null. Undefined before the migration.
  programmeId?: number | null
  // What the class studies (Coding, Maths, ...), or null. Undefined before the migration.
  subjectId?: number | null
  // Everyone who teaches the class, the main teacher (teacherId) included.
  // Undefined before the class teachers migration.
  teacherIds?: number[]
  // The school's category (My Classroom tab); category above is the kind it
  // works like. Undefined before the class categories migration.
  categoryName?: string | null
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
  // The account's own ticks plus those of its teams, worked out by the database
  // (teachers.effective_permissions). Missing on accounts made in the page itself.
  effectivePermissions?: EffectivePermissions
}

export type TeacherRole = 'admin' | 'teacher' | 'staff'

export type PermissionModule =
  | 'calendar'
  | 'classrooms'
  | 'students'
  | 'leads'
  | 'forms'
  | 'activity'
  | 'team_replies'
  | 'inbox'
  | 'automations'
  | 'ai_knowledge'
  | 'content_studio'
  | 'content_library'
  | 'videos'
  | 'questions'
  | 'app_logins'
  | 'packages'
  | 'class_settings'
  | 'staff_hours'

export type PermissionAction = 'view' | 'edit' | 'delete'

// Whose rows a tick covers: everyone's, mine and nobody's, or only mine.
export type PermissionScope = 'all' | 'own_unassigned' | 'own'

// A missing module means no access. Delete is only ever set with edit. No scope means 'all'.
export type AccountPermissions = Partial<
  Record<PermissionModule, { level: 'view' | 'edit'; delete?: boolean; scope?: PermissionScope }>
>

// The total of several sets of ticks: per action, the widest scope that gives it.
export type EffectivePermissions = Partial<
  Record<
    PermissionModule,
    { level: 'view' | 'edit'; delete: boolean; scope: PermissionScope; editScope?: PermissionScope; deleteScope?: PermissionScope }
  >
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
  // One of the Malaysian states, or null when not known.
  state: string | null
  // Optional: a Chinese name, and the number of another parent (shown in the lead details).
  nameZh?: string | null
  secondParentPhone?: string | null
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
  // The lesson's own FB group and fixed Zoom link. Undefined before the
  // schedule links migration.
  fbGroupUrl?: string | null
  zoomLink?: string | null
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
  // The replacement class made for the cancelled day ("Add Replacement Class"). Unlike a moved day, Restore
  // leaves it alone. Undefined before the replacement link migration.
  replacementScheduleId?: number | null
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
  // By criterion id.
  scores: Record<number, ReviewScore>
  // This student's own note on the lesson (progress, homework, ...).
  lessonRemark: string | null
}

export type AttendanceReviewFormState = {
  // By criterion id; a missing entry is not rated yet.
  scores: Record<number, number | null>
  remarks: Record<number, string>
  lessonRemark: string
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
  // yyyy-mm-dd or empty.
  dateOfBirth: string
  // The school's own number for the child (when the school uses student codes).
  studentCode?: string
  // A school that charges by the month: months paid for the class, from startDate.
  months?: string
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
  // '' = not set.
  state: string
  // Optional, '' = none.
  nameZh?: string
  secondParentPhone?: string
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
  // yyyy-mm-dd or empty.
  dateOfBirth: string
  // The school's own number for the child (when the school uses student codes).
  studentCode?: string
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
  // Weekly lessons only; left out means "no link".
  fbGroupUrl?: string
  zoomLink?: string
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
  // The class's Zoom address, or empty.
  zoomLink: string
  // The programme the class belongs to, as a programme id, or empty for none.
  programmeId: string
  // The class's subject, as a subject id, or empty for none.
  subjectId: string
  // The school's category for the class (Class Settings > Class options), or
  // left out before the class categories migration.
  categoryName?: string
}

export type AttendanceModalState = {
  scheduleId: number
  occurrenceDate: string
  title: string
  // Opened by "End class" in the live class console: fill from Zoom and add
  // the class notes at once (the teacher still checks and submits).
  autoFill?: boolean
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
> & { date_of_birth?: string | null }

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
> & { zoom_link?: string | null; programme_id?: number | null; subject_id?: number | null; category_name?: string | null }

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
> & { effective_permissions?: Database['public']['Tables']['teachers']['Row']['effective_permissions'] }

export type LeadRow = Pick<
  Database['public']['Tables']['leads']['Row'],
  | 'id'
  | 'full_name'
  | 'phone'
  | 'source_id'
  | 'pic_id'
  | 'state'
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
> & { name_zh?: string | null; second_parent_phone?: string | null }

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
> &
  Partial<Pick<Database['public']['Tables']['schedules']['Row'], 'fb_group_url' | 'zoom_link'>>

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
    Pick<Database['public']['Tables']['schedule_exceptions']['Row'], 'moved_to_schedule_id' | 'replacement_schedule_id'>
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
  'id' | 'lesson_log_id' | 'student_id' | 'lesson_remark'
>

export type LessonReviewScoreRow = Pick<
  Database['public']['Tables']['lesson_review_scores']['Row'],
  'lesson_log_id' | 'student_id' | 'criterion_id' | 'score' | 'remark'
>

export type ReviewCriterionRow = Database['public']['Tables']['review_criteria']['Row']

export type AttendanceStatusRow = Database['public']['Tables']['attendance_statuses']['Row']

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
