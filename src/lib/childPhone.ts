import type { Lead, Student } from '../types/domain'
import { canonicalPhone } from './chatLink'
import { getLinkedLeadId, getRealPhone, type ChatwootConversation } from './whatsappInbox'

// A child's phone number typed in the Inbox lead form (Children): what the school already has with that number, so
// the team links it instead of making a second lead. Found as it is typed, once the number is long enough to mean
// something (canonicalPhone: 8 digits).
export type ChildPhoneMatches = {
  // The number is the parent's own (the lead's phone): not a child's number.
  sameAsParent: boolean
  // Other leads that have the number (as the parent's phone or a child's).
  leads: Lead[]
  // Students with the number: only shown, a student is not joined this way.
  students: Student[]
  // WhatsApp chats from the number that are not on this lead yet.
  chats: ChatwootConversation[]
}

const NONE: ChildPhoneMatches = { sameAsParent: false, leads: [], students: [], chats: [] }

export function findChildPhoneMatches({
  phone,
  parentPhone,
  currentLeadId,
  leads,
  students,
  conversations,
  limit = 3,
}: {
  phone: string
  parentPhone: string
  currentLeadId: number | null
  leads: Lead[]
  students: Student[]
  conversations: ChatwootConversation[]
  limit?: number
}): ChildPhoneMatches {
  const wanted = canonicalPhone(phone)
  if (wanted === null) {
    return NONE
  }
  if (canonicalPhone(parentPhone) === wanted) {
    return { ...NONE, sameAsParent: true }
  }
  const current = currentLeadId === null ? null : (leads.find((lead) => lead.id === currentLeadId) ?? null)
  return {
    sameAsParent: false,
    leads: leads
      .filter(
        (lead) =>
          lead.id !== currentLeadId &&
          [lead.phone, ...lead.children.map((child) => child.phone)].some((value) => canonicalPhone(value) === wanted),
      )
      .slice(0, limit),
    students: students
      .filter((student) => student.id !== current?.convertedStudentId && canonicalPhone(student.phone) === wanted)
      .slice(0, limit),
    chats: conversations
      .filter(
        (conversation) =>
          canonicalPhone(getRealPhone(conversation.meta.sender.phone_number)) === wanted &&
          (currentLeadId === null || getLinkedLeadId(conversation) !== currentLeadId),
      )
      .slice(0, limit),
  }
}

const hasPhone = (lead: Lead) => (lead.phone ?? '').trim() !== ''

// Which lead stays when two are joined: the one with a phone number (merge_leads), else this one.
export function keptLead(current: Lead, other: Lead) {
  return hasPhone(other) && !hasPhone(current) ? other : current
}

export function hasChildPhoneMatches(matches: ChildPhoneMatches) {
  return matches.sameAsParent || matches.leads.length + matches.students.length + matches.chats.length > 0
}
