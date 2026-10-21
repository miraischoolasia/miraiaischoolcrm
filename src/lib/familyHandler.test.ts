import { describe, expect, it } from 'vitest'
import { familyHandler } from './familyHandler'
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

const family = [
  person(1, { kind: 'parent', contactId: 482 }),
  person(2, { kind: 'student', parentId: 1, studentId: 56 }),
  person(3, { kind: 'student', parentId: 1, studentId: 57 }),
]

const none = { consultantOf: () => undefined, picOfTag: () => undefined }

describe('familyHandler', () => {
  it('is the students consultant', () => {
    const sources = { ...none, consultantOf: (id: number) => (id === 56 || id === 57 ? 39 : undefined) }
    expect(familyHandler(482, family, sources)).toEqual({ teacherId: 39 })
  })

  it('has no answer when the children have different consultants', () => {
    const sources = { ...none, consultantOf: (id: number) => (id === 56 ? 39 : id === 57 ? 45 : undefined) }
    expect(familyHandler(482, family, sources)).toBeNull()
  })

  it('works from a child chat too', () => {
    const chats = [person(1, { kind: 'parent' }), person(2, { kind: 'student', parentId: 1, studentId: 56, contactId: 900 })]
    expect(familyHandler(900, chats, { ...none, consultantOf: () => 22 })).toEqual({ teacherId: 22 })
  })

  it('uses the PIC a tag on the family names when there is no consultant', () => {
    const tagged = [{ ...family[0], tagIds: [388] }, family[1], family[2]]
    expect(familyHandler(482, tagged, { ...none, picOfTag: (id: number) => (id === 388 ? 7 : undefined) })).toEqual({ picOptionId: 7 })
  })

  it('lets the consultant win over a tag', () => {
    const tagged = [{ ...family[0], tagIds: [388] }, family[1], family[2]]
    const sources = { consultantOf: () => 45, picOfTag: () => 7 }
    expect(familyHandler(482, tagged, sources)).toEqual({ teacherId: 45 })
  })

  it('has no answer for two tags naming different PICs, an unknown contact, or nothing to go on', () => {
    const tagged = [{ ...family[0], tagIds: [388, 389] }, family[1], family[2]]
    expect(familyHandler(482, tagged, { ...none, picOfTag: (id: number) => id }) ).toBeNull()
    expect(familyHandler(999, family, none)).toBeNull()
    expect(familyHandler(482, family, none)).toBeNull()
  })
})
