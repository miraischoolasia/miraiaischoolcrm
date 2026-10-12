import { describe, expect, it } from 'vitest'
import { leadPhoneFor, parentPhoneOf, studentPhoneOf } from './studentContact'

describe('studentPhoneOf', () => {
  it('is the number on the child, else the lead\'s', () => {
    expect(studentPhoneOf('0123456789', '0112223334')).toBe('0112223334')
    expect(studentPhoneOf('+60 12-345 6789', null)).toBe('+60 12-345 6789')
    expect(studentPhoneOf('0123456789', '  ')).toBe('0123456789')
  })
})

describe('parentPhoneOf', () => {
  it('is nothing while the lead holds only the child\'s number', () => {
    expect(parentPhoneOf('0123456789', null)).toBe('')
    expect(parentPhoneOf('012-345 6789', '+60 12-345 6789')).toBe('')
  })

  it('is the lead\'s number once it is a different one from the child\'s', () => {
    expect(parentPhoneOf('0198887777', '0123456789')).toBe('0198887777')
  })
})

describe('leadPhoneFor', () => {
  it('is the parent\'s number when there is one, else the child\'s', () => {
    expect(leadPhoneFor('0198887777', '0123456789')).toBe('0198887777')
    expect(leadPhoneFor('  ', '0123456789')).toBe('0123456789')
  })
})
