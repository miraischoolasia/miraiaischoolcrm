import { describe, expect, it } from 'vitest'
import { buildChildRows } from './leadChildren'
import type { Lead } from '../types/domain'

const lead = (id: number, fullName: string | null, phone: string, children: Lead['children']) =>
  ({ id, fullName, phone, children }) as Lead

const leads = [
  lead(1, 'Mei Ling', '+60 12-345 6789', [
    { name: 'Ethan', age: 9, phone: null },
    { name: 'Chloe', age: 13, phone: '0198887777' },
  ]),
  lead(2, 'Aisha', '+60 19-111 2222', [{ name: '', age: 7, phone: null }]),
  lead(3, 'No Kids', '+60 11-000 0000', []),
]

describe('buildChildRows', () => {
  it('makes one row for every child, and none for a lead without children', () => {
    const rows = buildChildRows(leads)
    expect(rows.map((row) => `${row.leadId}:${row.childName || row.age}`)).toEqual(['1:Ethan', '1:Chloe', '2:7'])
    expect(rows[0].parentName).toBe('Mei Ling')
  })

  it('finds a child by name or number, and all children of a parent found by the parent', () => {
    expect(buildChildRows(leads, { search: 'chloe' }).map((row) => row.childName)).toEqual(['Chloe'])
    expect(buildChildRows(leads, { search: '98887777' }).map((row) => row.childName)).toEqual(['Chloe'])
    expect(buildChildRows(leads, { search: 'mei' }).map((row) => row.childName)).toEqual(['Ethan', 'Chloe'])
  })

  it('narrows to an age group', () => {
    expect(buildChildRows(leads, { ageGroup: '12-14' }).map((row) => row.childName)).toEqual(['Chloe'])
    expect(buildChildRows(leads, { ageGroup: '6-8' }).map((row) => row.age)).toEqual([7])
  })
})

describe('buildChildRows by grade', () => {
  const graded = [
    lead(10, 'Mum', '0123', [
      { name: 'Alba', age: 8, phone: null, gradeLevel: 2, gradeYear: 2026 },
      { name: 'Ben', age: 13, phone: null, gradeLevel: 7, gradeYear: 2026 },
      { name: 'Cara', age: 10, phone: null },
    ]),
  ]

  it('keeps the children in a grade, working the stored grade up to the day', () => {
    expect(buildChildRows(graded, { grade: 2, today: '2026-10-23' }).map((row) => row.childName)).toEqual(['Alba'])
    expect(buildChildRows(graded, { grade: 3, today: '2027-03-01' }).map((row) => row.childName)).toEqual(['Alba'])
    expect(buildChildRows(graded, { grade: 7, today: '2026-10-23' }).map((row) => row.childName)).toEqual(['Ben'])
  })

  it('leaves out a child with no grade stored, and ignores the grade when none is asked for', () => {
    expect(buildChildRows(graded, { grade: 4, today: '2026-10-23' })).toEqual([])
    expect(buildChildRows(graded, { grade: null }).map((row) => row.childName)).toEqual(['Alba', 'Ben', 'Cara'])
  })
})
