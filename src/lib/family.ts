import type { Person } from './peopleApi'

// The family around the person the open chat is, read from the family table.

export type Family = {
  // The person the open chat is.
  me: Person
  // The parent of the family; null for a student whose parent is not saved yet.
  parent: Person | null
  // The same parent under another WhatsApp contact (an old hidden-ID chat and the one with the number).
  otherParentChats: Person[]
  // The students of this parent, oldest first. Includes the person themself when they are a student.
  children: Person[]
  // The lead the family came from, when there is one.
  leadId: number | null
}

// Null for a contact nobody has placed yet: there is no family to show.
export function familyOf(contactId: number, people: Person[]): Family | null {
  const me = people.find((person) => person.contactId === contactId)
  if (!me || me.kind === 'contact') {
    return null
  }

  const parent = me.kind === 'parent' ? me : (people.find((person) => person.id === me.parentId) ?? null)
  const leadId = parent?.leadId ?? me.leadId ?? null
  // Rows of the same lead are the same parent, written in under another contact.
  const siblings =
    parent && parent.leadId !== null
      ? people.filter((person) => person.kind === 'parent' && person.leadId === parent.leadId && person.id !== parent.id)
      : []
  const parentIds = new Set([...(parent ? [parent.id] : []), ...siblings.map((person) => person.id)])

  const children = people
    .filter((person) => person.kind === 'student' && person.parentId !== null && parentIds.has(person.parentId))
    .sort((a, b) => a.id - b.id)
  // A student whose parent is not saved still shows themself.
  if (me.kind === 'student' && !children.some((child) => child.id === me.id)) {
    children.push(me)
  }

  return {
    me,
    parent,
    otherParentChats: siblings.filter((person) => person.contactId !== null),
    children,
    leadId,
  }
}
