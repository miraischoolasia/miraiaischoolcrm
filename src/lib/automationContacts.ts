import { supabase } from './supabase'
import { normalizeTestPhone } from './automationFlows'
import { formatPhone } from './whatsappInbox'

// The people an automation message can be sent to instead of the family: the team's own numbers,
// a teacher, anyone with a WhatsApp number. A message block names one by its id.

export const MAX_CONTACTS = 50
export const MAX_CONTACT_NAME = 60

export type AutomationContact = {
  id: number
  name: string
  // Digits only, with the country code.
  phone: string
}

type ContactRow = { id: number; name: string; phone: string }

const COLUMNS = 'id, name, phone'

function requireSupabase() {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  return supabase
}

function contactOf(row: ContactRow): AutomationContact {
  return { id: row.id, name: row.name, phone: row.phone }
}

// How a contact's number reads on the page: +60 12-345 6789.
export function displayContactPhone(contact: Pick<AutomationContact, 'phone'>) {
  return formatPhone(contact.phone)
}

// Why a contact cannot be saved yet (or null), and the number as digits for the database.
export function checkContact(name: string, phone: string): { error: string | null; digits: string } {
  const trimmed = name.trim()
  if (trimmed === '') {
    return { error: 'Write the contact name.', digits: '' }
  }
  if (trimmed.length > MAX_CONTACT_NAME) {
    return { error: `The name can be up to ${MAX_CONTACT_NAME} characters.`, digits: '' }
  }
  const digits = normalizeTestPhone(phone)
  if (!digits) {
    return { error: 'Type the WhatsApp number, like 012-345 6789 or +60 12 345 6789.', digits: '' }
  }
  return { error: null, digits }
}

export function automationContactsErrorMessage(problem: unknown, fallback: string) {
  const text =
    problem instanceof Error
      ? problem.message
      : typeof problem === 'object' && problem && 'message' in problem
        ? String((problem as { message: unknown }).message)
        : ''
  const code =
    typeof problem === 'object' && problem && 'code' in problem ? String((problem as { code: unknown }).code) : ''
  if (/automation_contacts/.test(text) && /(does not exist|schema cache|Could not find)/.test(text)) {
    return 'Contacts are not set up in the database yet.'
  }
  if (code === '23505') {
    return 'There is already a contact with this number.'
  }
  if (/row-level security|permission denied|Only an admin/i.test(text)) {
    return 'Only an admin can change the contacts.'
  }
  // The database refuses with a sentence written for people (a contact a flow still uses, 50 contacts).
  if (code === 'P0001' && text) {
    return text
  }
  return fallback
}

export async function fetchContacts(): Promise<AutomationContact[]> {
  const { data, error } = await requireSupabase()
    .from('automation_contacts')
    .select(COLUMNS)
    .order('name', { ascending: true })
    .order('id', { ascending: true })
  if (error) {
    throw error
  }
  return (data ?? []).map((row) => contactOf(row as ContactRow))
}

export async function addContact(name: string, digits: string): Promise<AutomationContact> {
  const { data, error } = await requireSupabase()
    .from('automation_contacts')
    .insert({ name: name.trim(), phone: digits })
    .select(COLUMNS)
    .single()
  if (error) {
    throw error
  }
  return contactOf(data as ContactRow)
}

export async function updateContact(id: number, name: string, digits: string): Promise<AutomationContact> {
  const { data, error } = await requireSupabase()
    .from('automation_contacts')
    .update({ name: name.trim(), phone: digits })
    .eq('id', id)
    .select(COLUMNS)
  if (error) {
    throw error
  }
  const row = (data ?? [])[0] as ContactRow | undefined
  if (!row) {
    // The database hides a row you may not change instead of failing.
    throw new Error('Only an admin can change the contacts.')
  }
  return contactOf(row)
}

export async function deleteContact(id: number) {
  const { data, error } = await requireSupabase().from('automation_contacts').delete().eq('id', id).select('id')
  if (error) {
    throw error
  }
  if ((data ?? []).length === 0) {
    throw new Error('Only an admin can change the contacts.')
  }
}
