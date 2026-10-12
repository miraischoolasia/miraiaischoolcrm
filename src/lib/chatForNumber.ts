import type { Lead, Student } from '../types/domain'
import { canonicalPhone } from './chatLink'
import {
  getLinkedLeadId,
  getLinkedStudentIds,
  getRealPhone,
  type ChatwootConversation,
} from './whatsappInbox'

// Opening "the chat of this lead / student / number" must find the chat the school already has,
// even when WhatsApp hides the parent's number behind a long internal ID. Such a chat has no
// number of its own, but the team tied it to a lead or a student, and those have the number.
// Without this, a second, empty chat was made for the number and the parent had two windows.

type Input = {
  conversations: ChatwootConversation[]
  phone: string
  // The lead being opened, when the request came from one.
  leadId: number | null
  leads: Lead[]
  students: Student[]
}

export function findChatForNumber({ conversations, phone, leadId, leads, students }: Input) {
  const wanted = canonicalPhone(phone)
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]))
  const studentsById = new Map(students.map((student) => [student.id, student]))

  const holdsNumber = (lead: Lead) =>
    wanted !== null &&
    [lead.phone, ...lead.children.map((child) => child.phone)].some((value) => canonicalPhone(value) === wanted)

  const matches = conversations.filter((conversation) => {
    const linkedLead = getLinkedLeadId(conversation)
    if (leadId !== null && linkedLead === leadId) {
      return true
    }
    if (wanted === null) {
      return false
    }
    if (canonicalPhone(getRealPhone(conversation.meta.sender.phone_number)) === wanted) {
      return true
    }
    const lead = linkedLead === null ? undefined : leadsById.get(linkedLead)
    if (lead && holdsNumber(lead)) {
      return true
    }
    return getLinkedStudentIds(conversation).some(
      (id) => canonicalPhone(studentsById.get(id)?.phone) === wanted,
    )
  })

  // The chat with messages in it is the real one; a chat made empty by an earlier click is not.
  return (
    [...matches].sort(
      (a, b) =>
        Number(Boolean(b.last_non_activity_message)) - Number(Boolean(a.last_non_activity_message)) ||
        b.last_activity_at - a.last_activity_at,
    )[0] ?? null
  )
}
