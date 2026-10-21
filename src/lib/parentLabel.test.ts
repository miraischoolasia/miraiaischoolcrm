import { describe, expect, it } from 'vitest'
import { chatNameLabel, isNumberName, leadParentName, parentDisplayName, parentLabel, realNameOf } from './parentLabel'

describe('isNumberName', () => {
  it('is true for nothing, a phone number or a hidden WhatsApp ID', () => {
    expect(isNumberName(null)).toBe(true)
    expect(isNumberName('   ')).toBe(true)
    expect(isNumberName('60129219368')).toBe(true)
    expect(isNumberName('+60 12-921 9368')).toBe(true)
    expect(isNumberName('236998554123456')).toBe(true)
  })

  it('is false for a real name, even with a number in it', () => {
    expect(isNumberName('Mei Ling')).toBe(false)
    expect(isNumberName('Mum 2')).toBe(false)
  })
})

describe('parentLabel', () => {
  it('calls the parent by the child', () => {
    expect(parentLabel(['KEW KAYDEN'])).toBe("KEW KAYDEN's Parent")
  })

  it('joins two or more children with &', () => {
    expect(parentLabel(['KEW KAYDEN', 'KEW KAYVEN'])).toBe("KEW KAYDEN & KEW KAYVEN's Parent")
    expect(parentLabel(['A', 'B', 'C'])).toBe("A & B & C's Parent")
  })

  it('names a child once, whatever the spelling of spaces', () => {
    expect(parentLabel(['Kew Kayden', ' kew  kayden ', null])).toBe("Kew Kayden's Parent")
  })

  it('is null when there is no child', () => {
    expect(parentLabel([])).toBeNull()
    expect(parentLabel(['', null, undefined])).toBeNull()
  })
})

describe('parentDisplayName', () => {
  it('keeps a real name', () => {
    expect(parentDisplayName('Mrs Kew', ['KEW KAYDEN'])).toBe('Mrs Kew')
    expect(realNameOf('Mrs Kew')).toBe('Mrs Kew')
  })

  it('uses the children when the name is empty or only a number', () => {
    expect(parentDisplayName(null, ['KEW KAYDEN'])).toBe("KEW KAYDEN's Parent")
    expect(parentDisplayName('60129219368', ['KEW KAYDEN', 'KEW KAYVEN'])).toBe("KEW KAYDEN & KEW KAYVEN's Parent")
  })

  it('is null when there is neither a name nor a child', () => {
    expect(parentDisplayName('60129219368', [])).toBeNull()
  })
})

describe('leadParentName', () => {
  it('keeps the name of the lead, and calls a lead with no name by its children', () => {
    expect(leadParentName({ fullName: 'Mrs Kew', children: [{ name: 'KAYDEN' }] })).toBe('Mrs Kew')
    expect(leadParentName({ fullName: null, children: [{ name: 'KAYDEN' }, { name: 'KAYVEN' }] })).toBe("KAYDEN & KAYVEN's Parent")
    expect(leadParentName({ fullName: '60129219368', children: [{ name: 'KAYDEN' }] })).toBe("KAYDEN's Parent")
  })

  it('uses the student the lead became when no child is written on it', () => {
    expect(leadParentName({ fullName: null, children: [] }, 'KEW KAYDEN')).toBe("KEW KAYDEN's Parent")
    expect(leadParentName({ fullName: null, children: [] }, null)).toBeNull()
  })
})

describe('chatNameLabel', () => {
  const base = {
    leadName: null,
    role: null,
    personKind: 'parent' as const,
    personName: null,
    studentNames: [],
    familyNames: ['KEW KAYDEN', 'KEW KAYVEN'],
    leadChildNames: [],
  }

  it('calls a parent the family table knows, with no name, by the children', () => {
    expect(chatNameLabel(base)).toBe("KEW KAYDEN & KEW KAYVEN's Parent")
    expect(chatNameLabel({ ...base, leadName: '60129219368', personName: '60129219368' })).toBe("KEW KAYDEN & KEW KAYVEN's Parent")
  })

  it('leaves a real name as it was', () => {
    expect(chatNameLabel({ ...base, leadName: 'Mrs Kew' })).toBe('Mrs Kew')
    expect(chatNameLabel({ ...base, personName: 'Mrs Kew' })).toBeNull()
  })

  it('does not call a student, a contact or a parent with no child by anyone', () => {
    expect(chatNameLabel({ ...base, personKind: 'student' })).toBeNull()
    expect(chatNameLabel({ ...base, personKind: 'contact' })).toBeNull()
    expect(chatNameLabel({ ...base, familyNames: [] })).toBeNull()
  })

  it('keeps the name the team gave the chat: the lead and the child it is the parent of', () => {
    expect(chatNameLabel({ ...base, role: 'parent', leadName: 'Mei' })).toBe("Mei · KEW KAYDEN & KEW KAYVEN's Parent")
    expect(chatNameLabel({ ...base, role: 'student', studentNames: ['Albee'], familyNames: [] })).toBe('Albee (student)')
  })
})
