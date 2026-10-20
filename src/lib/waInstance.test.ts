import { describe, expect, it } from 'vitest'
import { instanceOfInbox, withInstance } from './waInstance'

describe('instanceOfInbox', () => {
  const numbers = [
    { inboxId: 3, instance: 'school-1' },
    { inboxId: 6, instance: 'school-2' },
    { inboxId: 9, instance: '  ' },
    { inboxId: 10, instance: null },
  ]

  it('reads the name of the number a chat is on from the numbers table, for any number of numbers', () => {
    expect(instanceOfInbox(numbers, 3)).toBe('school-1')
    expect(instanceOfInbox(numbers, 6)).toBe('school-2')
  })

  it('gives no name for a number not written down, or with no name: the gateway then uses its own one', () => {
    expect(instanceOfInbox(numbers, 4)).toBeNull()
    expect(instanceOfInbox(numbers, 9)).toBeNull()
    expect(instanceOfInbox(numbers, 10)).toBeNull()
    expect(instanceOfInbox(numbers, undefined)).toBeNull()
    expect(instanceOfInbox([], 3)).toBeNull()
  })
})

describe('withInstance', () => {
  it('adds the name to the address, safely written', () => {
    expect(withInstance('https://gw/wa/read', 'school-2')).toBe('https://gw/wa/read?instance=school-2')
    expect(withInstance('https://gw/wa/x?a=1', 'a b&c')).toBe('https://gw/wa/x?a=1&instance=a%20b%26c')
  })

  it('leaves the address as it was without a name (a school with one number)', () => {
    expect(withInstance('https://gw/wa/read', null)).toBe('https://gw/wa/read')
    expect(withInstance('https://gw/wa/read', '')).toBe('https://gw/wa/read')
  })
})
