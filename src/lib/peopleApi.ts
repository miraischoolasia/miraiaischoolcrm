import { supabase } from './supabase'

// The family table: everyone the school talks to or teaches, and who belongs to whom.
// The database keeps it in step with leads and students itself (triggers); the page only tells it
// about WhatsApp contacts and about what the team ties together by hand.

export type PersonKind = 'contact' | 'parent' | 'student'

export type Person = {
  id: number
  kind: PersonKind
  name: string | null
  // Digits with the country code; null when WhatsApp hides the number or the person has none.
  phone: string | null
  email: string | null
  // The WhatsApp contact in the inbox, when this person has a chat.
  contactId: number | null
  // For a student: their parent.
  parentId: number | null
  leadId: number | null
  studentId: number | null
}

type ContactInput = { contactId: number; name: string; phone: string | null; role: 'parent' | 'student' | null }

function requireSupabase() {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  return supabase
}

export async function fetchPeople(): Promise<Person[]> {
  const client = requireSupabase()
  const { data, error } = await client
    .from('people')
    .select('id, kind, full_name, phone, email, chatwoot_contact_id, parent_id, lead_id, student_id')
    .order('id', { ascending: true })
    .limit(5000)
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.full_name,
    phone: row.phone,
    email: row.email,
    contactId: row.chatwoot_contact_id,
    parentId: row.parent_id,
    leadId: row.lead_id,
    studentId: row.student_id,
  }))
}

// Makes a person for each WhatsApp contact that has none yet. Returns how many were made.
export async function ensureContactPeople(contacts: ContactInput[]): Promise<number> {
  if (contacts.length === 0) {
    return 0
  }
  const client = requireSupabase()
  const { data, error } = await client.rpc('ensure_contact_people', {
    p_contacts: contacts.map((contact) => ({
      contact_id: contact.contactId,
      name: contact.name,
      phone: contact.phone,
      role: contact.role,
    })),
  })
  if (error) {
    throw error
  }
  return data ?? 0
}

export async function linkContactToLead(contactId: number, leadId: number) {
  const { error } = await requireSupabase().rpc('link_contact_to_lead', { p_contact_id: contactId, p_lead_id: leadId })
  if (error) {
    throw error
  }
}

export async function linkContactToStudents(contactId: number, studentIds: number[]) {
  const { error } = await requireSupabase().rpc('link_contact_to_students', {
    p_contact_id: contactId,
    p_student_ids: studentIds,
  })
  if (error) {
    throw error
  }
}

export async function setContactRole(contactId: number, role: 'parent' | 'student') {
  const { error } = await requireSupabase().rpc('set_contact_role', { p_contact_id: contactId, p_role: role })
  if (error) {
    throw error
  }
}
