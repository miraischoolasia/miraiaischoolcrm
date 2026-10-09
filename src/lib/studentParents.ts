import type { Lead, Student, TrialBooking } from '../types/domain'

export type StudentParent = {
  name: string | null
  phone: string | null
}

// The parent behind each student, from the lead they came through: a lead
// converted into the student, or the lead that booked the student's HOA class.
// The student's own phone wins over the lead's. A student with no lead still
// gets their phone, with no name.
export function buildStudentParents({
  students,
  leads,
  trialBookings,
}: {
  students: Student[]
  leads: Lead[]
  trialBookings: TrialBooking[]
}) {
  const leadById = new Map(leads.map((lead) => [lead.id, lead]))
  const leadByStudent = new Map<number, Lead>()

  for (const booking of trialBookings) {
    const lead = booking.leadId === null ? undefined : leadById.get(booking.leadId)
    if (booking.studentId !== null && lead) {
      leadByStudent.set(booking.studentId, lead)
    }
  }
  // A converted lead is the better link, so it is applied last.
  for (const lead of leads) {
    if (lead.convertedStudentId !== null) {
      leadByStudent.set(lead.convertedStudentId, lead)
    }
  }

  return new Map<number, StudentParent>(
    students.map((student) => {
      const lead = leadByStudent.get(student.id)
      return [
        student.id,
        {
          name: lead?.fullName?.trim() || null,
          phone: student.phone?.trim() || lead?.phone?.trim() || null,
        },
      ]
    }),
  )
}
