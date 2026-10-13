import type { Lead } from '../types/domain'
import { sortStudentRows, type StudentRow } from './studentRows'
import type { AgendaItem, TeacherAgenda } from './teacherAgenda'

export type MissingByTeacher = {
  teacherId: number
  // How many past classes have no attendance submitted.
  count: number
  // The date of the oldest one.
  oldest: string
}

export type AttendanceOverview = {
  today: AgendaItem[]
  submittedToday: number
  openToday: number
  missingTotal: number
  missingByTeacher: MissingByTeacher[]
}

// What the admin's Today shows of the classes: every teacher's day, and who still owes attendance.
export function summariseAttendance(agenda: TeacherAgenda): AttendanceOverview {
  const byTeacher = new Map<number, MissingByTeacher>()
  for (const item of agenda.todo) {
    const current = byTeacher.get(item.teacherId)
    if (!current) {
      byTeacher.set(item.teacherId, { teacherId: item.teacherId, count: 1, oldest: item.date })
    } else {
      current.count += 1
      if (item.date < current.oldest) {
        current.oldest = item.date
      }
    }
  }
  return {
    today: agenda.today,
    submittedToday: agenda.today.filter((item) => item.state === 'submitted').length,
    openToday: agenda.today.filter((item) => item.state === 'open').length,
    missingTotal: agenda.todo.length,
    // The teacher with the most owed first; the oldest one breaks a tie.
    missingByTeacher: [...byTeacher.values()].sort(
      (a, b) => b.count - a.count || a.oldest.localeCompare(b.oldest) || a.teacherId - b.teacherId,
    ),
  }
}

export type FollowUpStudent = {
  row: StudentRow
  // The most urgent thing about the student, e.g. "Package ended".
  reason: string
  critical: boolean
}

// The students who need action, the most urgent first.
export function pickFollowUpStudents(rows: StudentRow[]) {
  const needing = rows.filter((row) => row.needsFollowUp)
  const sorted = sortStudentRows(needing, 'attention')
  const toStudent = (row: StudentRow): FollowUpStudent => ({
    row,
    reason: row.issues[0]?.label ?? 'Needs follow-up',
    critical: row.issues[0]?.tone === 'critical',
  })
  return { total: needing.length, critical: needing.filter((row) => row.issues[0]?.tone === 'critical').length, all: sorted.map(toStudent) }
}

export type LeadTaskRow = {
  leadId: number
  leadName: string
  title: string
  dueDate: string
  overdue: boolean
}

function leadName(lead: Lead) {
  return lead.fullName?.trim() || lead.children[0]?.name || lead.phone || `Lead #${lead.id}`
}

// Tasks nobody ticked off that are due today or already late, the late ones first. A lead that
// became a student or was lost no longer needs its tasks.
export function getLeadTasksDue(leads: Lead[], todayString: string): LeadTaskRow[] {
  const rows: LeadTaskRow[] = []
  for (const lead of leads) {
    if (lead.status === 'converted' || lead.status === 'lost') {
      continue
    }
    for (const task of lead.tasks) {
      if (!task.completed && task.dueDate <= todayString) {
        rows.push({
          leadId: lead.id,
          leadName: leadName(lead),
          title: task.title,
          dueDate: task.dueDate,
          overdue: task.dueDate < todayString,
        })
      }
    }
  }
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.leadId - b.leadId)
}

// New leads nobody has written a follow-up for yet.
export function countUntouchedLeads(leads: Lead[]) {
  return leads.filter((lead) => lead.status === 'new' && lead.followUps.length === 0).length
}
