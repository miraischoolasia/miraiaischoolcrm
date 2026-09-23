import type { Lead } from '../types/domain'

function digitsOnly(value: string) {
  return value.replace(/\D/g, '')
}

// Finds leads by parent name, child name, or phone (parent or child), so a
// trial booking can attach to a family that is already in the pipeline.
export function searchLeads(leads: Lead[], query: string, limit = 5): Lead[] {
  const text = query.trim().toLowerCase()

  if (!text) {
    return []
  }

  // Ignore spacing and punctuation in phone numbers, but only once enough
  // digits are typed for the match to mean something.
  const digits = digitsOnly(text)

  return leads
    .filter((lead) => {
      if (lead.fullName?.toLowerCase().includes(text)) {
        return true
      }

      // `child.name` is typed as a required string, but this reads real
      // Supabase jsonb rows that may not match the type exactly — guard the
      // same way as the phone check above rather than trust the type alone.
      if (lead.children.some((child) => child.name?.toLowerCase().includes(text))) {
        return true
      }

      if (digits.length < 3) {
        return false
      }

      // A lead saved before children carried a `phone` field has `undefined`
      // here, not `null` — `!= null` catches both instead of only one.
      return [lead.phone, ...lead.children.map((child) => child.phone)].some(
        (phone) => phone != null && digitsOnly(phone).includes(digits),
      )
    })
    .slice(0, limit)
}
