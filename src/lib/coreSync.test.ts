import { describe, expect, it } from 'vitest'
import { changedGroups } from './coreSync'

describe('changedGroups', () => {
  it('names the parts whose tables went up, a part once even when two of its tables changed', () => {
    const known = { students: 1, student_classroom_periods: 1, leads: 4, teachers: 2 }
    const next = { students: 2, student_classroom_periods: 2, leads: 4, teachers: 2 }
    expect([...changedGroups(known, next)]).toEqual(['students'])
  })

  it('reads a table that has no change number every time, and skips one this database does not have', () => {
    const known = { leads: 1, classrooms: 1, classroom_teachers: null }
    const next = { leads: 1, classrooms: 1, classroom_teachers: null }
    expect([...changedGroups(known, next)]).toEqual(['classrooms'])
  })

  it('reads a table that appeared since the last look', () => {
    expect([...changedGroups({ leads: 1 }, { leads: 1, subjects: 0 })]).toEqual(['subjects'])
  })
})
