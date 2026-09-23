import { describe, expect, it } from 'vitest'
import { getErrorMessage } from './errors'

describe('getErrorMessage', () => {
  it('reads the message of an Error', () => {
    expect(getErrorMessage(new Error('boom'), 'fallback')).toBe('boom')
  })

  it('reads the message of a plain Supabase error object', () => {
    expect(
      getErrorMessage({ code: 'P0001', message: 'This child is already booked.' }, 'fallback'),
    ).toBe('This child is already booked.')
  })

  it.each([null, undefined, 'text', 42, {}, { message: '' }, { message: 5 }])(
    'falls back for %j',
    (value) => {
      expect(getErrorMessage(value, 'fallback')).toBe('fallback')
    },
  )
})
