import { describe, expect, it } from 'vitest'
import { avatarLook, initials } from './avatarLook'

describe('avatar look', () => {
  it('is always the same for one child', () => {
    expect(avatarLook(42)).toEqual(avatarLook(42))
  })

  it('varies across a class', () => {
    const looks = Array.from({ length: 30 }, (_, index) => avatarLook(index + 1))
    expect(new Set(looks.map((look) => look.hairStyle)).size).toBeGreaterThanOrEqual(4)
    expect(new Set(looks.map((look) => look.background)).size).toBeGreaterThanOrEqual(5)
    expect(new Set(looks.map((look) => JSON.stringify(look))).size).toBeGreaterThanOrEqual(25)
  })

  it('makes initials', () => {
    expect(initials('Lim Loke Yan')).toBe('LL')
    expect(initials('  ')).toBe('?')
    expect(initials('奶茶 老师')).toBe('奶老')
  })
})
