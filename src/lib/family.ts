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

// Lookups over one people list, built once per list (the list is replaced, never changed, when people are read
// again). The Inbox asks for families of every chat on each redraw; scanning 12,000 people for each was the
// biggest part of a redraw on a phone.
type PeopleIndex = {
  byContact: Map<number, Person>
  byId: Map<number, Person>
  parentsByLead: Map<number, Person[]>
  childrenByParent: Map<number, Person[]>
  families: Map<number, Family | null>
  childNames: Map<number, string[]>
}
const indexes = new WeakMap<Person[], PeopleIndex>()

function indexOf(people: Person[]): PeopleIndex {
  let index = indexes.get(people)
  if (index) {
    return index
  }
  index = { byContact: new Map(), byId: new Map(), parentsByLead: new Map(), childrenByParent: new Map(), families: new Map(), childNames: new Map() }
  for (const person of people) {
    // The first row of a contact wins, as people.find did.
    if (person.contactId !== null && !index.byContact.has(person.contactId)) {
      index.byContact.set(person.contactId, person)
    }
    index.byId.set(person.id, person)
    if (person.kind === 'parent' && person.leadId !== null) {
      index.parentsByLead.set(person.leadId, [...(index.parentsByLead.get(person.leadId) ?? []), person])
    }
    if (person.kind === 'student' && person.parentId !== null) {
      index.childrenByParent.set(person.parentId, [...(index.childrenByParent.get(person.parentId) ?? []), person])
    }
  }
  indexes.set(people, index)
  return index
}

// The person of a WhatsApp contact (the first row when there are several), without scanning the list.
export function personOfContact(contactId: number, people: Person[]): Person | undefined {
  return indexOf(people).byContact.get(contactId)
}

// Null for a contact nobody has placed yet: there is no family to show.
export function familyOf(contactId: number, people: Person[]): Family | null {
  const index = indexOf(people)
  if (index.families.has(contactId)) {
    return index.families.get(contactId) ?? null
  }
  const family = buildFamily(contactId, index)
  index.families.set(contactId, family)
  return family
}

function buildFamily(contactId: number, index: PeopleIndex): Family | null {
  const me = index.byContact.get(contactId)
  if (!me || me.kind === 'contact') {
    return null
  }

  const parent = me.kind === 'parent' ? me : me.parentId !== null ? (index.byId.get(me.parentId) ?? null) : null
  const leadId = parent?.leadId ?? me.leadId ?? null
  // Rows of the same lead are the same parent, written in under another contact.
  const siblings =
    parent && parent.leadId !== null ? (index.parentsByLead.get(parent.leadId) ?? []).filter((person) => person.id !== parent.id) : []
  const parentIds = [...(parent ? [parent.id] : []), ...siblings.map((person) => person.id)]

  const children = [...new Set(parentIds)]
    .flatMap((id) => index.childrenByParent.get(id) ?? [])
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

// The names of the children of the parent this chat is (oldest first, nobody twice). Empty for a chat that is
// not a parent's, or a parent with no child saved.
export function familyChildNames(contactId: number, people: Person[]): string[] {
  const known = indexOf(people).childNames.get(contactId)
  if (known) {
    return known
  }
  const names = childNamesOf(familyOf(contactId, people))
  indexOf(people).childNames.set(contactId, names)
  return names
}

function childNamesOf(family: Family | null): string[] {
  if (!family || family.me.kind !== 'parent') {
    return []
  }
  const seen = new Set<string>()
  const names: string[] = []
  for (const child of family.children) {
    const name = (child.name ?? '').trim()
    const key = name.toLowerCase().replace(/[\s\p{P}]/gu, '')
    if (name !== '' && !seen.has(key)) {
      seen.add(key)
      names.push(name)
    }
  }
  return names
}
