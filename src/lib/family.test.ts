import { describe, expect, it } from 'vitest'
import { familyOf } from './family'
import type { Person } from './peopleApi'

const person = (id: number, patch: Partial<Person>): Person => ({
  id,
  kind: 'contact',
  name: null,
  phone: null,
  email: null,
  contactId: null,
  parentId: null,
  leadId: null,
  studentId: null,
  ...patch,
})

const people = [
  person(1, { kind: 'parent', name: '@yvonne.ywbl', contactId: 482, leadId: 174 }),
  person(2, { kind: 'student', name: 'Teoh Tze Yu', parentId: 1, studentId: 56 }),
  person(3, { kind: 'student', name: 'Ethan', parentId: 1, contactId: 600 }),
  person(4, { kind: 'parent', name: 'Yvonne (old chat)', contactId: 398, leadId: 174 }),
  person(5, { kind: 'contact', name: 'Someone', contactId: 900 }),
  person(6, { kind: 'student', name: 'Alone', contactId: 700 }),
]

describe('familyOf', () => {
  it('shows a parent with their children', () => {
    const family = familyOf(482, people)

    expect(family?.parent?.id).toBe(1)
    expect(family?.children.map((child) => child.name)).toEqual(['Teoh Tze Yu', 'Ethan'])
    expect(family?.leadId).toBe(174)
  })

  it('shows the same parent under another contact as another chat of the family', () => {
    const family = familyOf(482, people)

    expect(family?.otherParentChats.map((other) => other.contactId)).toEqual([398])
  })

  it('shows a student with their parent and their brothers and sisters', () => {
    const family = familyOf(600, people)

    expect(family?.me.name).toBe('Ethan')
    expect(family?.parent?.id).toBe(1)
    expect(family?.children.map((child) => child.name)).toEqual(['Teoh Tze Yu', 'Ethan'])
  })

  it('shows a student whose parent is not saved yet on their own', () => {
    const family = familyOf(700, people)

    expect(family?.parent).toBeNull()
    expect(family?.children.map((child) => child.name)).toEqual(['Alone'])
  })

  it('has no family for a contact nobody has placed, or for a chat with no person', () => {
    expect(familyOf(900, people)).toBeNull()
    expect(familyOf(12345, people)).toBeNull()
  })
})
