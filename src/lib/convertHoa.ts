import { supabase } from './supabase'
import type { Student, TrialBooking } from '../types/domain'

// HOA (trial) student -> regular student, in one step on the same student
// (convert_hoa_student, 20261027200000_convert_hoa_student.sql).

export type ConvertHoaInput = {
  studentId: number
  classroomId: number
  startDate: string
  // A package (Mirai): its classes, end date and the fee dates.
  packageId?: number | null
  classCount?: number
  lessonExpiryDate?: string | null
  accountFeeExpiryDate?: string | null
  miraiClubExpiryDate?: string | null
  // No package (a school that charges by the month): months for the class.
  months?: number | null
  // The lead the child came through, marked converted to this student.
  leadId?: number | null
}

// Null when done, else the reason to show.
export async function convertHoaStudent(input: ConvertHoaInput): Promise<string | null> {
  if (!supabase) return 'Supabase is not configured.'
  const { error } = await supabase.rpc('convert_hoa_student', {
    p_student_id: input.studentId,
    p_classroom_id: input.classroomId,
    p_start_date: input.startDate,
    p_package_id: input.packageId ?? null,
    p_class_count: input.classCount ?? 0,
    p_lesson_expiry_date: input.lessonExpiryDate ?? null,
    p_account_fee_expiry_date: input.accountFeeExpiryDate ?? null,
    p_mirai_club_expiry_date: input.miraiClubExpiryDate ?? null,
    p_months: input.months ?? null,
    p_lead_id: input.leadId ?? null,
  })
  if (!error) return null
  if (error.code === 'PGRST202' || error.code === '42883') {
    return 'Converting to a regular student needs the database update first.'
  }
  return error.message || 'Could not convert the student.'
}

function sameName(a: string, b: string) {
  const key = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim()
  return key(a) === key(b)
}

// The HOA student this lead's child already has, so signing up from a chat
// converts them instead of making a second student. The child is found by the
// lead's HOA bookings and the child's name; a lead with one child and one HOA
// student also matches when the name was typed a little differently.
export function findHoaStudentForChild({
  leadId,
  childName,
  childCount,
  students,
  trialBookings,
}: {
  leadId: number
  childName: string
  childCount: number
  students: Student[]
  trialBookings: TrialBooking[]
}): Student | null {
  const byId = new Map(students.map((student) => [student.id, student]))
  const hoaStudents = [
    ...new Map(
      trialBookings
        .filter((booking) => booking.leadId === leadId && booking.studentId !== null)
        .map((booking) => byId.get(booking.studentId!))
        .filter((student): student is Student => student !== undefined && student.studentType === 'trial')
        .map((student) => [student.id, student]),
    ).values(),
  ]
  const named = hoaStudents.filter((student) => sameName(student.name, childName))
  if (named.length > 0) {
    // The newest one when the same child has more than one.
    return named.sort((a, b) => b.id - a.id)[0]
  }
  return childCount <= 1 && hoaStudents.length === 1 ? hoaStudents[0] : null
}
