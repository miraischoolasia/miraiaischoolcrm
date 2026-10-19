import { supabase } from './supabase'
import { teachesClassroom } from './classroomTeachers'
import type { Classroom, Schedule } from '../types/domain'

// Who may take a lesson's attendance. Mirrors can_take_attendance in the
// database (20261025100000_attendance_assistants_substitutes.sql): admin and
// the class's teacher always; the class's other teachers (assistants) and the
// day's substitute when the school allows them.

export type AttendanceTakerRules = { assistants: boolean; substitutes: boolean }

export const defaultAttendanceTakerRules: AttendanceTakerRules = { assistants: true, substitutes: true }

// One teacher covering one day of one class.
export type LessonSubstitute = { scheduleId: number; lessonDate: string; teacherId: number }

export type AttendanceTakerRole = 'admin' | 'teacher' | 'assistant' | 'substitute'

export function substituteKey(scheduleId: number, lessonDate: string) {
  return `${scheduleId}:${lessonDate}`
}

// The substitute teacher of each class day.
export function buildSubstituteMap(substitutes: LessonSubstitute[]) {
  return new Map(substitutes.map((entry) => [substituteKey(entry.scheduleId, entry.lessonDate), entry.teacherId]))
}

export function parseAttendanceTakerRules(value: unknown): AttendanceTakerRules {
  const rules = (value ?? {}) as { assistants?: unknown; substitutes?: unknown }
  return {
    assistants: rules.assistants !== false,
    substitutes: rules.substitutes !== false,
  }
}

// A class this teacher teaches every week: the schedule is theirs, or they
// are one of the class's teachers.
export function teachesSchedule(
  schedule: Pick<Schedule, 'teacherId' | 'classroomId'>,
  classroom: Pick<Classroom, 'teacherId' | 'teacherIds'> | null | undefined,
  teacherId: number | null | undefined,
) {
  if (teacherId === null || teacherId === undefined) return false
  return schedule.teacherId === teacherId || (!!classroom && teachesClassroom(classroom, teacherId))
}

export type AttendanceTakerContext = {
  isAdmin: boolean
  teacherId: number | null | undefined
  rules: AttendanceTakerRules
  substitutes: Map<string, number>
  classroomMap: Map<number, Pick<Classroom, 'teacherId' | 'teacherIds'>>
}

// Why this login may take the attendance of one class day, or null.
export function attendanceTakerRole(
  context: AttendanceTakerContext,
  schedule: Pick<Schedule, 'id' | 'teacherId' | 'classroomId'>,
  lessonDate: string,
): AttendanceTakerRole | null {
  const { isAdmin, teacherId, rules, substitutes, classroomMap } = context
  if (isAdmin) return 'admin'
  if (teacherId === null || teacherId === undefined) return null
  if (schedule.teacherId === teacherId) return 'teacher'
  const classroom = schedule.classroomId !== null ? classroomMap.get(schedule.classroomId) : null
  if (rules.assistants && classroom && teachesClassroom(classroom, teacherId)) return 'assistant'
  if (rules.substitutes && substitutes.get(substituteKey(schedule.id, lessonDate)) === teacherId) return 'substitute'
  return null
}

export function canTakeAttendance(
  context: AttendanceTakerContext,
  schedule: Pick<Schedule, 'id' | 'teacherId' | 'classroomId'>,
  lessonDate: string,
) {
  return attendanceTakerRole(context, schedule, lessonDate) !== null
}

// The days this teacher covers on classes that are not theirs, for the calendar.
export function coveredLessons(
  substitutes: LessonSubstitute[],
  teacherId: number | null | undefined,
  isOwnSchedule: (scheduleId: number) => boolean,
) {
  return substitutes.filter((entry) => entry.teacherId === teacherId && !isOwnSchedule(entry.scheduleId))
}

// Before the migration is pushed the setting row and the table are missing:
// the table is not even asked for (the setting row comes with it), nobody
// covers a class, and the defaults apply. Any failure here never stops the
// page from loading.
export async function fetchAttendanceTakers(): Promise<{
  rules: AttendanceTakerRules
  substitutes: LessonSubstitute[]
}> {
  const fallback = { rules: defaultAttendanceTakerRules, substitutes: [] }
  if (!supabase) return fallback
  try {
    const setting = await supabase.from('app_settings').select('value').eq('key', 'attendance_takers').maybeSingle()
    if (setting.error || !setting.data) return fallback
    const rows = await supabase.from('lesson_substitutes').select('schedule_id, lesson_date, teacher_id')
    return {
      rules: parseAttendanceTakerRules(setting.data.value),
      substitutes: rows.error
        ? []
        : (rows.data ?? []).map((row) => ({
            scheduleId: row.schedule_id,
            lessonDate: row.lesson_date,
            teacherId: row.teacher_id,
          })),
    }
  } catch {
    return fallback
  }
}

// Null clears the day's substitute. Null when saved, else the reason.
export async function saveLessonSubstitute(scheduleId: number, lessonDate: string, teacherId: number | null) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_lesson_substitute', {
    p_schedule_id: scheduleId,
    p_lesson_date: lessonDate,
    p_teacher_id: teacherId,
  })
  return error ? error.message || 'Could not save the substitute teacher.' : null
}

export async function saveAttendanceTakerRules(rules: AttendanceTakerRules) {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('set_attendance_takers', {
    p_assistants: rules.assistants,
    p_substitutes: rules.substitutes,
  })
  return error ? error.message || 'Could not save who takes attendance.' : null
}
