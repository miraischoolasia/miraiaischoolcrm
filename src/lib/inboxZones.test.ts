import { describe, expect, it } from 'vitest'
import { listedInboxIds, showsStudentInbox, zoneFilter } from './inboxZones'
import { isOnAllowedNumber } from './whatsappInbox'

const chatOn = (inboxId?: number) => ({ inbox_id: inboxId })

describe('the Marketing Inbox and the Student Inbox', () => {
  it('waits until it is known which numbers the person may see', () => {
    expect(zoneFilter('marketing', undefined, [6])).toBeUndefined()
    expect(zoneFilter('students', undefined, [6])).toBeUndefined()
  })

  it('the Marketing Inbox shows every number but the students ones', () => {
    const filter = zoneFilter('marketing', null, [6])!
    expect(isOnAllowedNumber(chatOn(3), filter.allowed, filter.excluded)).toBe(true)
    expect(isOnAllowedNumber(chatOn(2), filter.allowed, filter.excluded)).toBe(true)
    expect(isOnAllowedNumber(chatOn(6), filter.allowed, filter.excluded)).toBe(false)
    // A chat whose number is not known yet stays in the Marketing Inbox, as before.
    expect(isOnAllowedNumber(chatOn(undefined), filter.allowed, filter.excluded)).toBe(true)
  })

  it('the Student Inbox shows only the students numbers', () => {
    const filter = zoneFilter('students', null, [6, 7])!
    expect(filter.allowed).toEqual([6, 7])
    expect(isOnAllowedNumber(chatOn(6), filter.allowed, filter.excluded)).toBe(true)
    expect(isOnAllowedNumber(chatOn(3), filter.allowed, filter.excluded)).toBe(false)
    expect(isOnAllowedNumber(chatOn(undefined), filter.allowed, filter.excluded)).toBe(false)
  })

  it('still keeps to the numbers given to the person', () => {
    expect(zoneFilter('students', [3, 6], [6, 7])).toEqual({ allowed: [6], excluded: [] })
    expect(zoneFilter('marketing', [3, 6], [6, 7])).toEqual({ allowed: [3], excluded: [6, 7] })
  })

  it('a school with no students number sees no change', () => {
    expect(zoneFilter('marketing', null, [])).toEqual({ allowed: null, excluded: [] })
    expect(zoneFilter('marketing', [3], [])).toEqual({ allowed: [3], excluded: [] })
  })

  it('lists nothing while loading, and keeps "every number" as every number (2026-10-22 bug)', () => {
    expect(listedInboxIds(undefined)).toEqual([])
    expect(listedInboxIds(zoneFilter('marketing', null, [3]))).toBeNull()
    expect(listedInboxIds(zoneFilter('students', null, [3]))).toEqual([3])
  })

  it('shows the Student Inbox in the menu only with the tick and a students number', () => {
    expect(showsStudentInbox(true, [6])).toBe(true)
    expect(showsStudentInbox(true, [])).toBe(false)
    expect(showsStudentInbox(false, [6])).toBe(false)
  })
})
