import type { Database } from './database'

export type AppSection =
  | 'calendar'
  | 'classrooms'
  | 'students'
  | 'teachers'
  | 'leads'
  | 'activity'
export type FilterKey = 'all' | 'hours' | 'accountFee' | 'mirai' | 'normal'
export type AttendanceStatus = 'present' | 'absent' | 'leave'
export type StudentType = 'trial' | 'regular'
export type LeadSource = 'walk_in' | 'referral' | 'social_media' | 'advertisement' | 'other'
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
  remainingHours: number
  lessonExpiryDate: string
  accountFeeExpiryDate: string
  miraiClubExpiryDate: string
  notes: string | null
  isActive: boolean
  studentType: StudentType
}

export type Classroom = {
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
  username: string
  fullName: string
  email: string | null
  phone: string | null
  role: 'admin' | 'teacher'
  isActive: boolean
}

export type LeadChild = {
  name: string
  age: number
}

export type LeadFollowUp = {
  date: string
  note: string
}

export type Lead = {
  id: number
  fullName: string | null
  phone: string | null
  source: LeadSource
  status: LeadStatus
  children: LeadChild[]
  notes: string | null
  followUps: LeadFollowUp[]
  convertedStudentId: number | null
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
  addHours: string
  lessonExpiryDate: string
  accountFeeExpiryDate: string
  miraiClubExpiryDate: string
  remark: string
}

export type CreateStudentFormState = {
  fullName: string
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
}

export type LeadFormState = {
  fullName: string
  phone: string
  source: LeadSource
  status: LeadStatus
  children: LeadChildFormState[]
  notes: string
}

export type CreateTeacherFormState = {
  username: string
  fullName: string
  email: string
  phone: string
  role: 'admin' | 'teacher'
}

export type StudentDetailsFormState = {
  fullName: string
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
  name: string
  ageGroup: AgeGroup
  programLevel: ProgramLevel
  teacherId: string
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
  role: 'admin' | 'teacher'
  label: string
  teacherId: number | null
}

export type StudentRow = Pick<
  Database['public']['Tables']['students']['Row'],
  | 'id'
  | 'teacher_id'
  | 'classroom_id'
  | 'full_name'
  | 'remaining_hours'
  | 'lesson_expiry_date'
  | 'account_fee_expiry_date'
  | 'mirai_club_expiry_date'
  | 'notes'
  | 'is_active'
  | 'student_type'
>

export type ClassroomRow = Pick<
  Database['public']['Tables']['classrooms']['Row'],
  | 'id'
  | 'name'
  | 'age_group'
  | 'program_level'
  | 'teacher_id'
  | 'status'
  | 'notes'
  | 'archived_at'
>

export type TeacherRow = Pick<
  Database['public']['Tables']['teachers']['Row'],
  'id' | 'username' | 'full_name' | 'email' | 'phone' | 'role' | 'is_active'
>

export type LeadRow = Pick<
  Database['public']['Tables']['leads']['Row'],
  | 'id'
  | 'full_name'
  | 'phone'
  | 'source'
  | 'status'
  | 'children'
  | 'notes'
  | 'follow_ups'
  | 'converted_student_id'
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
