import type { Lead, Package, Student, TrialBooking } from '../types/domain'
import { canonicalPhone } from './chatLink'

// What a student is to the school right now. The same four groups as the Students page:
// HOA (a trial-slot or old preview-class student), Trial 1 Month, Regular and Camp.
export type StudentKind = 'hoa' | 'trial' | 'regular' | 'camp'

export const STUDENT_KIND_LABELS: Record<StudentKind, string> = {
  hoa: 'HOA',
  trial: 'Trial',
  regular: 'Regular',
  camp: 'Camp',
}

export function getStudentKind(student: Student, packages: Package[]): StudentKind {
  if (student.studentType !== 'regular') {
    return 'hoa'
  }
  const kind = packages.find((entry) => entry.id === student.packageId)?.kind
  // A regular student with no package yet counts as Regular, like on the Students page.
  return kind === 'trial' || kind === 'camp' ? kind : 'regular'
}

// A short label for a chat or a card: "Regular · 3 Months", "HOA".
export function describeStudent(student: Student, packages: Package[]) {
  const kind = getStudentKind(student, packages)
  const plan = packages.find((entry) => entry.id === student.packageId)
  if (kind === 'regular' && plan) {
    return `${STUDENT_KIND_LABELS.regular} · ${plan.name}`
  }
  return STUDENT_KIND_LABELS[kind]
}

const KIND_ORDER: Record<StudentKind, number> = { regular: 0, camp: 1, trial: 2, hoa: 3 }

function childKey(student: Student) {
  return student.name.toLowerCase().replace(/\s+/g, ' ').trim()
}

// A child who did an HOA class and then joined has a row for each. Show the one that
// matters now: the regular one, and an active one over one that stopped.
function oneRowPerChild(students: Student[], packages: Package[]) {
  const best = new Map<string, Student>()
  for (const student of students) {
    const key = childKey(student)
    const current = best.get(key)
    if (!current) {
      best.set(key, student)
      continue
    }
    const rank = (entry: Student) => (entry.isActive ? 0 : 10) + KIND_ORDER[getStudentKind(entry, packages)]
    if (rank(student) < rank(current)) {
      best.set(key, student)
    }
  }
  return [...best.values()].sort(
    (a, b) =>
      KIND_ORDER[getStudentKind(a, packages)] - KIND_ORDER[getStudentKind(b, packages)] || a.name.localeCompare(b.name),
  )
}

type Sources = {
  students: Student[]
  trialBookings: TrialBooking[]
  packages: Package[]
}

// Every student a parent has, found from what the school already knows. A parent is
// linked to a student when the lead was converted into the student, when the lead booked
// the student's HOA class, or when the phone number is the same. The chat's own number
// counts too, so a parent who is not a lead yet still finds their child.
export function makeStudentResolver({ students, trialBookings, packages }: Sources) {
  const byId = new Map(students.map((student) => [student.id, student]))
  const byPhone = new Map<string, Student[]>()
  for (const student of students) {
    const key = canonicalPhone(student.phone)
    if (key) {
      byPhone.set(key, [...(byPhone.get(key) ?? []), student])
    }
  }
  const bookingsByLead = new Map<number, TrialBooking[]>()
  const bookingsByPhone = new Map<string, TrialBooking[]>()
  for (const booking of trialBookings) {
    if (booking.studentId === null) {
      continue
    }
    if (booking.leadId !== null) {
      bookingsByLead.set(booking.leadId, [...(bookingsByLead.get(booking.leadId) ?? []), booking])
    }
    const key = canonicalPhone(booking.phone)
    if (key) {
      bookingsByPhone.set(key, [...(bookingsByPhone.get(key) ?? []), booking])
    }
  }

  // linkedIds are students the team tied to the chat by hand: they count even when no
  // phone number or lead leads to them.
  return (lead: Lead | null, chatPhone: string | null, linkedIds: number[] = []): Student[] => {
    const found = new Map<number, Student>()
    const add = (student: Student | undefined) => {
      if (student) {
        found.set(student.id, student)
      }
    }
    const phones = [chatPhone, lead?.phone, ...(lead?.children.map((child) => child.phone) ?? [])]
      .map((phone) => canonicalPhone(phone))
      .filter((phone): phone is string => phone !== null)

    for (const id of linkedIds) {
      add(byId.get(id))
    }
    if (lead) {
      if (lead.convertedStudentId !== null) {
        add(byId.get(lead.convertedStudentId))
      }
      for (const booking of bookingsByLead.get(lead.id) ?? []) {
        add(booking.studentId === null ? undefined : byId.get(booking.studentId))
      }
    }
    for (const phone of phones) {
      for (const student of byPhone.get(phone) ?? []) {
        add(student)
      }
      for (const booking of bookingsByPhone.get(phone) ?? []) {
        add(booking.studentId === null ? undefined : byId.get(booking.studentId))
      }
    }
    return oneRowPerChild([...found.values()], packages)
  }
}
