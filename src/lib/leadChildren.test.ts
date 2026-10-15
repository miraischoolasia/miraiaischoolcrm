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
