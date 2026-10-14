import { supabase } from './supabase'

// One WhatsApp number the school has linked: it is one inbox in Chatwoot.
export type WhatsAppNumber = {
  id: number
  label: string
  // Digits, for showing; null when not written down.
  phone: string | null
  inboxId: number
  // The name of the number inside Evolution (for reactions, edits...); null when not set.
  instance: string | null
  isActive: boolean
}

export type WhatsAppNumberDraft = {
  label: string
  phone: string
  inboxId: number | null
  instance: string
  isActive: boolean
}

type Row = {
  id: number
  label: string
  phone: string | null
  chatwoot_inbox_id: number
  evolution_instance: string | null
  is_active: boolean
}

function toNumber(row: Row): WhatsAppNumber {
  return {
    id: row.id,
    label: row.label,
    phone: row.phone,
    inboxId: row.chatwoot_inbox_id,
    instance: row.evolution_instance,
    isActive: row.is_active,
  }
}

export async function fetchWhatsAppNumbers(): Promise<WhatsAppNumber[]> {
  if (!supabase) {
    return []
  }
  const { data, error } = await supabase
    .from('whatsapp_numbers')
    .select('id, label, phone, chatwoot_inbox_id, evolution_instance, is_active')
    .order('id')
  if (error) {
    throw error
  }
  return ((data ?? []) as Row[]).map(toNumber)
}

// number id -> ids of the staff it is given to. An admin gets every row, anyone else only their own.
export async function fetchNumberAssignments(): Promise<Map<number, number[]>> {
  const result = new Map<number, number[]>()
  if (!supabase) {
    return result
  }
  const { data, error } = await supabase.from('whatsapp_number_staff').select('number_id, teacher_id')
  if (error) {
    throw error
  }
  for (const row of (data ?? []) as { number_id: number; teacher_id: number }[]) {
    result.set(row.number_id, [...(result.get(row.number_id) ?? []), row.teacher_id])
  }
  return result
}

// The Chatwoot inboxes this person may see; null when there is no restriction.
export async function fetchMyInboxIds(): Promise<number[] | null> {
  if (!supabase) {
    return null
  }
  const { data, error } = await supabase.rpc('my_whatsapp_inbox_ids')
  if (error) {
    throw error
  }
  return Array.isArray(data) ? (data as number[]) : null
}

export function numberDraftError(draft: WhatsAppNumberDraft): string | null {
  if (draft.label.trim() === '') {
    return 'Give the number a name, for example "Main" or "Sales".'
  }
  if (draft.inboxId === null || !Number.isInteger(draft.inboxId) || draft.inboxId <= 0) {
    return 'Pick the Chatwoot inbox of this number.'
  }
  const digits = draft.phone.replace(/\D/g, '')
  if (digits !== '' && !/^[0-9]{8,15}$/.test(digits)) {
    return 'The phone number should have 8 to 15 digits, or be left empty.'
  }
  if (draft.instance.trim() !== '' && !/^[A-Za-z0-9_-]{1,60}$/.test(draft.instance.trim())) {
    return 'The Evolution name can only have letters, digits, - and _.'
  }
  return null
}

export function numberSaveMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code
  if (code === '23505') {
    return 'This inbox is already used by another number.'
  }
  if (code === '42501') {
    return 'Only an admin can change the WhatsApp numbers.'
  }
  return "Couldn't save the number. Try again."
}

export async function saveWhatsAppNumber(existing: WhatsAppNumber | null, draft: WhatsAppNumberDraft) {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  if (draft.inboxId === null) {
    throw new Error('Pick the Chatwoot inbox of this number.')
  }
  const values = {
    label: draft.label.trim(),
    phone: draft.phone.replace(/\D/g, '') || null,
    chatwoot_inbox_id: draft.inboxId,
    evolution_instance: draft.instance.trim() || null,
    is_active: draft.isActive,
  }
  const query = existing
    ? supabase.from('whatsapp_numbers').update(values).eq('id', existing.id)
    : supabase.from('whatsapp_numbers').insert(values)
  const { error } = await query
  if (error) {
    throw error
  }
}

export async function deleteWhatsAppNumber(number: WhatsAppNumber) {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  const { error } = await supabase.from('whatsapp_numbers').delete().eq('id', number.id)
  if (error) {
    throw error
  }
}

// Gives a number to exactly these staff members.
export async function setNumberStaff(numberId: number, teacherIds: number[]) {
  if (!supabase) {
    throw new Error('Not connected to the database.')
  }
  const { error: removeError } = await supabase.from('whatsapp_number_staff').delete().eq('number_id', numberId)
  if (removeError) {
    throw removeError
  }
  if (teacherIds.length > 0) {
    const { error } = await supabase
      .from('whatsapp_number_staff')
      .insert(teacherIds.map((teacherId) => ({ number_id: numberId, teacher_id: teacherId })))
    if (error) {
      throw error
    }
  }
}
