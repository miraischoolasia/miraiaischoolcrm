import { describe, expect, it } from 'vitest'
import {
  USERNAME_PATTERN,
  firstFreeUsername,
  friendlyPassword,
  portalEmail,
  suggestUsername,
} from '../../supabase/functions/portal-accounts/logic'

describe('portal login names', () => {
  it('suggests a name from the full name', () => {
    expect(suggestUsername('Ethan Lim', 'student7')).toBe('ethan.lim')
    expect(suggestUsername('  Siti Nur Aisyah  ', 'student7')).toBe('siti.nur.aisyah')
    expect(suggestUsername('José Álvarez', 'student7')).toBe('jose.alvarez')
  })

  it('falls back when the name has no Latin letters', () => {
    expect(suggestUsername('林小明', 'student7')).toBe('student7')
    expect(suggestUsername('Al', 'parent3')).toBe('parent3')
  })

  it('takes the first free name', () => {
    expect(firstFreeUsername('ali.tan', new Set())).toBe('ali.tan')
    expect(firstFreeUsername('ali.tan', new Set(['ali.tan', 'ali.tan2']))).toBe('ali.tan3')
  })

  it('every suggestion is a valid login name', () => {
    for (const name of ['Ethan Lim', '林小明', 'A', 'Muhammad Danial bin Abdullah Rahman Hakim']) {
      expect(USERNAME_PATTERN.test(suggestUsername(name, 'student123'))).toBe(true)
    }
  })

  it('uses its own email domain, apart from staff', () => {
    expect(portalEmail('ali.tan')).toBe('ali.tan@portal.internal')
  })

  it('makes easy passwords', () => {
    expect(friendlyPassword(() => 0)).toBe('sunny-panda-10')
    expect(friendlyPassword()).toMatch(/^[a-z]+-[a-z]+-\d{2}$/)
  })
})
