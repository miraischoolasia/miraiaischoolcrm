import { describe, expect, it } from 'vitest'
import {
  USERNAME_PATTERN,
  firstFreeUsername,
  friendlyPassword,
  portalEmail,
  suggestParentUsername,
  suggestUsername,
} from '../../supabase/functions/portal-accounts/logic'

describe('portal login names', () => {
  it('names a parent with no name after the child', () => {
    expect(suggestParentUsername('Toh Jia Choon', 'parent9')).toBe('toh.jia.choon.parent')
    expect(suggestParentUsername('Muhammad Aiman bin Abdullah Rahman', 'parent9')).toBe('muhammad.aiman.bin.abdullah.parent')
    expect(suggestParentUsername('陈小明', 'parent9')).toBe('parent9')
    expect(USERNAME_PATTERN.test(suggestParentUsername('Muhammad Aiman bin Abdullah Rahman', 'x'))).toBe(true)
  })

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
