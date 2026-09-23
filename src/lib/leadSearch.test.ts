import { describe, expect, it } from 'vitest'
import { searchLeads } from './leadSearch'
import type { Lead } from '../types/domain'

function makeLead(overrides: Partial<Lead>): Lead {
  return {
    id: 1,
    fullName: null,
    phone: null,
    source: 'other',
    status: 'new',
    children: [],
    notes: null,
    followUps: [],
    tasks: [],
    convertedStudentId: null,
    addedDate: '2026-09-01',
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

const jane = makeLead({
  id: 1,
  fullName: 'Jane Tan',
  phone: '+60 12-345 6789',
  children: [{ name: 'Ethan Tan', age: 9, phone: null }],
})
const wei = makeLead({
  id: 2,
  fullName: null,
  phone: null,
  children: [{ name: 'Wei Ling', age: 11, phone: '+65 8123 9988' }],
})

describe('searchLeads', () => {
  const leads = [jane, wei]

  it('returns nothing for an empty query', () => {
    expect(searchLeads(leads, '   ')).toEqual([])
  })

  it('matches parent name and child name, ignoring case', () => {
    expect(searchLeads(leads, 'jane').map((lead) => lead.id)).toEqual([1])
    expect(searchLeads(leads, 'ETHAN').map((lead) => lead.id)).toEqual([1])
  })

  it('matches a parent phone ignoring spaces and punctuation', () => {
    expect(searchLeads(leads, '012 3456789').map((lead) => lead.id)).toEqual([1])
    expect(searchLeads(leads, '12-345').map((lead) => lead.id)).toEqual([1])
  })

  it('matches a child phone', () => {
    expect(searchLeads(leads, '81239988').map((lead) => lead.id)).toEqual([2])
  })

  it('does not match on fewer than 3 digits', () => {
    expect(searchLeads(leads, '12')).toEqual([])
  })

  it('does not crash on a child with no phone key at all (older leads predate that field)', () => {
    // Supabase jsonb rows are not type-checked at runtime: a child saved
    // before `phone` existed on the child shape has it `undefined`, not
    // `null`. searchLeads must treat that the same as "no phone" instead of
    // crashing when it tries to strip digits from `undefined`.
    const legacyChild = { name: 'Old Kid', age: 8 } as unknown as Lead['children'][number]
    const legacy = makeLead({ id: 3, fullName: 'Legacy Parent', children: [legacyChild] })

    expect(() => searchLeads([...leads, legacy], '999')).not.toThrow()
    expect(searchLeads([...leads, legacy], 'legacy').map((lead) => lead.id)).toEqual([3])
    expect(searchLeads([...leads, legacy], 'old kid').map((lead) => lead.id)).toEqual([3])
  })

  it('does not crash on a child with no name key at all', () => {
    const namelessChild = { age: 8, phone: '+60 19-000 0000' } as unknown as Lead['children'][number]
    const nameless = makeLead({ id: 4, children: [namelessChild] })

    expect(() => searchLeads([...leads, nameless], 'anything')).not.toThrow()
    expect(searchLeads([...leads, nameless], '19000000').map((lead) => lead.id)).toEqual([4])
  })

  it('caps the number of results', () => {
    const many = Array.from({ length: 8 }, (_, index) =>
      makeLead({ id: index + 10, fullName: `Parent ${index}` }),
    )

    expect(searchLeads(many, 'parent')).toHaveLength(5)
    expect(searchLeads(many, 'parent', 3)).toHaveLength(3)
  })
})
