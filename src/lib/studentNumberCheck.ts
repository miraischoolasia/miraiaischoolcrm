import { supabase } from './supabase'

// When the team says a chat IS the student, or ties a chat to a student by hand, the chat's number should be the
// number the school has for that student (the phone, or the second parent phone). If it is not, ask once: it is
// often another parent (a mum and a dad each have a number), not the child's own phone.

// The last nine digits, how the database matches numbers; null for something too short to be a number.
export function numberKey(value: string | null | undefined) {
  const digits = (value ?? '').replace(/\D/g, '')
  return digits.length >= 8 ? digits.slice(-9) : null
}

export type StudentNumbers = { phone: string | null; secondParentPhone: string | null }

// True when the chat's number is a number the school does not have for this student. False (no question) when it
// matches either of them, when the chat has no real number (WhatsApp hid it), or when the school has no number for
// the student yet (then the chat's number simply becomes theirs).
export function numberIsStrange(chatPhone: string | null | undefined, student: StudentNumbers) {
  const chat = numberKey(chatPhone)
  const known = [numberKey(student.phone), numberKey(student.secondParentPhone)].filter((key): key is string => key !== null)
  return chat !== null && known.length > 0 && !known.includes(chat)
}

// The student's two numbers as the database has them now (the list on screen may be older). The second
// parent phone is left out where that column does not exist yet.
export async function fetchStudentNumbers(studentId: number, fallbackPhone: string | null): Promise<StudentNumbers> {
  const numbers: StudentNumbers = { phone: fallbackPhone, secondParentPhone: null }
  if (!supabase) return numbers
  try {
    const { data, error } = await supabase.from('students').select('phone, second_parent_phone').eq('id', studentId).maybeSingle()
    if (!error && data) {
      return { phone: data.phone ?? fallbackPhone, secondParentPhone: data.second_parent_phone ?? null }
    }
  } catch {
    // The list's own phone is all there is.
  }
  return numbers
}

export type SecondPhoneResult = { status: 'saved' | 'same' | 'kept'; kept?: string } | { status: 'error'; message: string }

// Puts the number in the student's second parent phone only when that is empty; never overwrites one.
export async function saveSecondParentPhone(studentId: number, phone: string): Promise<SecondPhoneResult> {
  if (!supabase) return { status: 'error', message: 'Not connected to the database.' }
  const current = await supabase.from('students').select('second_parent_phone').eq('id', studentId).maybeSingle()
  if (current.error) {
    return {
      status: 'error',
      message: current.error.code === '42703' ? "The second parent phone can't be saved until the database update for it is applied." : current.error.message || "Couldn't read the student.",
    }
  }
  const existing = (current.data?.second_parent_phone ?? '').trim()
  if (existing !== '') {
    return numberKey(existing) === numberKey(phone) ? { status: 'same' } : { status: 'kept', kept: existing }
  }
  const { error } = await supabase
    .from('students')
    .update({ second_parent_phone: phone })
    .eq('id', studentId)
    .or('second_parent_phone.is.null,second_parent_phone.eq.')
  if (error) {
    return { status: 'error', message: error.message || "Couldn't save the number." }
  }
  return { status: 'saved' }
}
