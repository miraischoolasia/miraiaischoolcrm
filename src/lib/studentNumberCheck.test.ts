import { describe, expect, it } from 'vitest'
import { numberIsStrange, numberKey } from './studentNumberCheck'

describe('numberKey', () => {
  it('keeps the last nine digits, whatever the writing', () => {
    expect(numberKey('+60 12-761 2598')).toBe('127612598')
    expect(numberKey('012-761 2598')).toBe('127612598')
    expect(numberKey('60127612598')).toBe('127612598')
  })

  it('is null for something too short to be a number', () => {
    expect(numberKey(null)).toBeNull()
    expect(numberKey('1234')).toBeNull()
  })
})

describe('numberIsStrange', () => {
  const student = { phone: '60127504996', secondParentPhone: null }

  it('is false when the chat number is the registered phone (written another way)', () => {
    expect(numberIsStrange('+60 12-750 4996', student)).toBe(false)
    expect(numberIsStrange('0127504996', student)).toBe(false)
  })

  it('is false when it is the second parent phone', () => {
    expect(numberIsStrange('60127612598', { ...student, secondParentPhone: '012-761 2598' })).toBe(false)
  })

  it('is true when it is neither of the two numbers', () => {
    expect(numberIsStrange('60127612598', student)).toBe(true)
    expect(numberIsStrange('60127612598', { ...student, secondParentPhone: '0191112222' })).toBe(true)
  })

  it('does not ask when the chat has no real number or the school has no number for the student', () => {
    expect(numberIsStrange(null, student)).toBe(false)
    expect(numberIsStrange('60127612598', { phone: null, secondParentPhone: null })).toBe(false)
    expect(numberIsStrange('60127612598', { phone: '', secondParentPhone: '12' })).toBe(false)
  })
})
