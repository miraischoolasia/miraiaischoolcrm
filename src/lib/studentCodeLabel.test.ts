import { describe, expect, it } from 'vitest'
import { codesLabel, makeLeadCodes, withCodes } from './studentCodeLabel'

describe('codesLabel', () => {
  it('lists each code once, in order', () => {
    expect(codesLabel(['S1234568', 'S1234567', 'S1234567'])).toBe('S1234567 / S1234568')
  })

  it('is empty when there is no code', () => {
    expect(codesLabel([])).toBe('')
    expect(codesLabel([null, undefined, '  '])).toBe('')
  })
})

describe('withCodes', () => {
  it('puts the code in front of the name', () => {
    expect(withCodes('KEW KAYDEN', ['S1234567'])).toBe('S1234567 · KEW KAYDEN')
    expect(withCodes("KEW KAYDEN's Parent", ['S1234567', 'S1234568'])).toBe("S1234567 / S1234568 · KEW KAYDEN's Parent")
  })

  it('leaves the name as it is when there is no code, and never writes the code twice', () => {
    expect(withCodes('Mrs Lim', [])).toBe('Mrs Lim')
    expect(withCodes('S1234567 · Mrs Lim', ['S1234567'])).toBe('S1234567 · Mrs Lim')
  })

  it('gives the codes alone when there is no name', () => {
    expect(withCodes('', ['S1234567'])).toBe('S1234567')
    expect(withCodes(null, [])).toBe('')
  })
})

describe('makeLeadCodes', () => {
  const codes = new Map([
    [1, 'S1000001'],
    [2, 'S1000002'],
    [3, 'S1000003'],
  ])
  const students = [
    { id: 1, phone: '012-345 6789' },
    { id: 2, phone: '+60 12-345 6789' },
    { id: 3, phone: '0199999999' },
    { id: 4, phone: '60123456789' },
  ]
  const codeOf = makeLeadCodes(students, codes)

  it('lists every student with the number of the lead', () => {
    expect(codeOf({ phone: '60123456789', convertedStudentId: 1 })).toEqual(['S1000001', 'S1000002'])
  })

  it('adds the student the lead became even when the number differs', () => {
    expect(codeOf({ phone: '0187654321', convertedStudentId: 3 })).toEqual(['S1000003'])
  })

  it('is empty for a lead that is not a student yet, and for a student with no code', () => {
    expect(codeOf({ phone: '0187654321', convertedStudentId: null })).toEqual([])
    expect(codeOf({ phone: null, convertedStudentId: 4 })).toEqual([])
  })
})
