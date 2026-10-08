import { describe, expect, it } from 'vitest'
import { quickReplyErrorMessage } from './quickRepliesApi'

describe('quickReplyErrorMessage', () => {
  it('says so when the title is taken', () => {
    expect(quickReplyErrorMessage({ code: '23505' }, 'x')).toBe('A quick reply with that title already exists.')
  })

  it('tells the admin when the database has not been updated yet', () => {
    expect(quickReplyErrorMessage({ code: 'PGRST205', message: 'no table' }, 'x')).toMatch(/not set up yet/)
    expect(quickReplyErrorMessage({ message: 'relation "quick_replies" does not exist' }, 'x')).toMatch(/not set up yet/)
  })

  it('says when the account may not change them', () => {
    expect(quickReplyErrorMessage({ code: '42501' }, 'x')).toMatch(/not allowed/)
  })

  it('falls back to the message, then to the given text', () => {
    expect(quickReplyErrorMessage({ message: 'Boom' }, 'x')).toBe('Boom')
    expect(quickReplyErrorMessage(null, 'Could not save')).toBe('Could not save')
  })
})
