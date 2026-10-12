import { canonicalPhone } from './chatLink'

// A child who writes to the school themself. Their number is kept on the child; the lead's own number
// is the parent's once the school has it, and until then it is the child's too, so the chat is still
// found by phone. These two read that arrangement back into the two boxes the team sees.

// The child's own number: the one on the child, else the lead's (the chat's number).
export function studentPhoneOf(leadPhone: string, childPhone: string | null | undefined) {
  return childPhone?.trim() ? childPhone : leadPhone
}

// The parent's number: the lead's number when it is a different one from the child's, else nothing yet.
export function parentPhoneOf(leadPhone: string, childPhone: string | null | undefined) {
  if (!childPhone?.trim()) {
    return ''
  }
  const same = canonicalPhone(leadPhone) !== null && canonicalPhone(leadPhone) === canonicalPhone(childPhone)
  return same || leadPhone.trim() === childPhone.trim() ? '' : leadPhone
}

// What the lead's own number is, given the two boxes: the parent's when there is one.
export function leadPhoneFor(parentPhone: string, studentPhone: string) {
  return parentPhone.trim() ? parentPhone : studentPhone
}
