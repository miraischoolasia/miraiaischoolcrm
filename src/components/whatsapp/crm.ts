import type { Classroom, Lead, LeadOption, LeadOptionKind, LeadStatus, Package, Student } from '../../types/domain'

// What the WhatsApp page needs from the rest of the CRM: the records to match a
// chat against, and the few things the team can do to them from the side panel.

export type NewLeadInput = {
  fullName: string
  phone: string
  sourceId: number | null
  picId: number | null
  tagIds: number[]
  childName: string
  childAge: number | null
  notes: string
}

// Each action resolves to an error message, or null when it worked.
export type WhatsAppCrm = {
  leads: Lead[]
  students: Student[]
  classrooms: Classroom[]
  packages: Package[]
  leadOptions: LeadOption[]
  canEditLeads: boolean
  canEditStudents: boolean
  // Make-up classes are arranged with the calendar's permission.
  canBookMakeup: boolean
  onCreateLead: (input: NewLeadInput) => Promise<{ leadId: number | null; error: string | null }>
  onChangeLeadStatus: (leadId: number, status: LeadStatus) => Promise<void>
  onAddFollowUp: (leadId: number, note: string) => Promise<string | null>
  onAddOption: (kind: LeadOptionKind, label: string, color?: string) => Promise<LeadOption | null>
  onRecordLeave: (studentId: number, text: string) => Promise<string | null>
  onOpenLead: (leadId: number) => void
  // Leads that filled in one of the school's forms, and a way to read what they wrote.
  leadIdsWithForms: Set<number>
  onOpenFormAnswers: (leadId: number) => void
  onOpenStudent: (studentId: number) => void
  // Only offered for a student in a regular class.
  onOpenMakeup: (studentId: number) => void
}
