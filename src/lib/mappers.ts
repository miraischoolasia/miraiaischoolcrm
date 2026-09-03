import type {
  AdminActivity,
  AdminActivityRow,
  AttendanceReviewFormState,
  Classroom,
  ClassroomRow,
  Lead,
  LeadRow,
  LessonLogStudent,
  LessonLogStudentRow,
  LessonLogStudentReview,
  LessonLogStudentReviewRow,
  LessonLogSummary,
  LessonLogSummaryRow,
  Schedule,
  ScheduleParticipant,
  ScheduleParticipantRow,
  ScheduleRow,
  Student,
  StudentRow,
  Teacher,
  TeacherRow,
} from '../types/domain'

export function mapStudentRow(row: StudentRow): Student {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    classroomId: row.classroom_id,
    name: row.full_name,
    remainingHours: row.remaining_hours,
    lessonExpiryDate: row.lesson_expiry_date,
    accountFeeExpiryDate: row.account_fee_expiry_date,
    miraiClubExpiryDate: row.mirai_club_expiry_date,
    notes: row.notes,
    isActive: row.is_active,
    studentType: row.student_type,
  }
}

export function mapClassroomRow(row: ClassroomRow): Classroom {
  return {
    id: row.id,
    name: row.name,
    ageGroup: row.age_group,
    programLevel: row.program_level,
    teacherId: row.teacher_id,
    status: row.status,
    notes: row.notes,
    archivedAt: row.archived_at,
  }
}

export function mapTeacherRow(row: TeacherRow): Teacher {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    isActive: row.is_active,
  }
}

export function mapLeadRow(row: LeadRow): Lead {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    source: row.source,
    status: row.status,
    interestedAgeGroup: row.interested_age_group,
    notes: row.notes,
    followUpDate: row.follow_up_date,
    convertedStudentId: row.converted_student_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapAdminActivityRow(row: AdminActivityRow): AdminActivity {
  return {
    id: row.id,
    actorTeacherId: row.actor_teacher_id,
    actionType: row.action_type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    details: (row.details ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
  }
}

export function normalizeTimeInput(timeString: string) {
  return timeString.slice(0, 5)
}

export function mapScheduleRow(row: ScheduleRow): Schedule {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    classroomId: row.classroom_id,
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

export function mapScheduleParticipantRow(row: ScheduleParticipantRow): ScheduleParticipant {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    studentId: row.student_id,
    isActive: row.is_active,
  }
}

export function mapLessonLogSummaryRow(row: LessonLogSummaryRow): LessonLogSummary {
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

export function mapLessonLogStudentRow(row: LessonLogStudentRow): LessonLogStudent {
  return {
    id: row.id,
    lessonLogId: row.lesson_log_id,
    studentId: row.student_id,
    attendanceStatus: row.attendance_status,
  }
}

export function mapLessonLogStudentReviewRow(
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

export function createEmptyAttendanceReviewForm(): AttendanceReviewFormState {
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

export function mapReviewToFormState(
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

export function getLatestLessonLogMap(logs: LessonLogSummary[]) {
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
