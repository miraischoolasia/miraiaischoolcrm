import { describe, expect, it } from 'vitest'
import { signInAttempts, usernameToInternalEmail } from './auth'

describe('usernameToInternalEmail', () => {
  it('ignores spaces round the username and capitals', () => {
    expect(usernameToInternalEmail('  MsAngie ')).toBe('msangie@mirai.internal')
    expect(usernameToInternalEmail('jiahui@eduhero.com')).toBe('jiahui_eduhero.com@mirai.internal')
  })
})

describe('signInAttempts', () => {
  it('tries a plain username once, exactly as typed', () => {
    expect(signInAttempts(' msangie ', 'secret12')).toEqual([{ email: 'msangie@mirai.internal', password: 'secret12' }])
  })

  it('tries the whole e-mail first, then only the name before "@"', () => {
    expect(signInAttempts('msangie@eduhero.com', 'secret12')).toEqual([
      { email: 'msangie_eduhero.com@mirai.internal', password: 'secret12' },
      { email: 'msangie@mirai.internal', password: 'secret12' },
    ])
  })

  it('tries the password as typed first, then without spaces round it', () => {
    expect(signInAttempts('msangie', 'secret12 ')).toEqual([
      { email: 'msangie@mirai.internal', password: 'secret12 ' },
      { email: 'msangie@mirai.internal', password: 'secret12' },
    ])
    // Spaces inside a password are part of it.
    expect(signInAttempts('msangie', 'my secret')).toHaveLength(1)
    // A password of only spaces is tried as typed.
    expect(signInAttempts('msangie', '   ')).toEqual([{ email: 'msangie@mirai.internal', password: '   ' }])
  })
})
