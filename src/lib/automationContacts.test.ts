import { describe, expect, it } from 'vitest'
import { automationContactsErrorMessage, checkContact, displayContactPhone } from './automationContacts'

describe('checking a contact before it is saved', () => {
  it('turns the number into digits with the country code', () => {
    expect(checkContact('Lex', '012-345 6789')).toEqual({ error: null, digits: '60123456789' })
    expect(checkContact('  Lex  ', '+60 12 345 6789')).toEqual({ error: null, digits: '60123456789' })
  })

  it('asks for a name and a number that can be a WhatsApp number', () => {
    expect(checkContact('  ', '012-345 6789').error).toMatch(/name/)
    expect(checkContact('Lex', '12345').error).toMatch(/number/)
    expect(checkContact('x'.repeat(61), '012-345 6789').error).toMatch(/up to 60/)
  })

  it('writes a number the way people read it', () => {
    expect(displayContactPhone({ phone: '60123456789' })).toBe('+60 12-345 6789')
  })
})

describe('what is said when the database says no', () => {
  it('explains a missing table, a refused change, a repeated number and a rule of the database', () => {
    expect(
      automationContactsErrorMessage({ message: 'relation "public.automation_contacts" does not exist' }, 'x'),
    ).toMatch(/not set up/)
    expect(automationContactsErrorMessage({ message: 'new row violates row-level security policy' }, 'x')).toMatch(
      /Only an admin/,
    )
    expect(automationContactsErrorMessage({ code: '23505', message: 'duplicate key' }, 'x')).toMatch(/already/)
    expect(
      automationContactsErrorMessage(
        { code: 'P0001', message: 'The flow "Reminder" still sends a message to this contact.' },
        'x',
      ),
    ).toBe('The flow "Reminder" still sends a message to this contact.')
    expect(automationContactsErrorMessage(new Error('boom'), 'fallback')).toBe('fallback')
  })
})
