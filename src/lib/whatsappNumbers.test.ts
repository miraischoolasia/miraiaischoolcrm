import { describe, expect, it } from 'vitest'
import { numberDraftError, numberSaveMessage, type WhatsAppNumberDraft } from './whatsappNumbers'

const draft: WhatsAppNumberDraft = { label: 'Sales', phone: '60123456789', inboxId: 2, instance: 'mirai-2', isActive: true, zone: 'marketing' }

describe('checking a WhatsApp number before it is saved', () => {
  it('accepts a complete number', () => {
    expect(numberDraftError(draft)).toBeNull()
    expect(numberDraftError({ ...draft, phone: '', instance: '' })).toBeNull()
    // The phone may be written the way people write it.
    expect(numberDraftError({ ...draft, phone: '+60 12-345 6789' })).toBeNull()
  })

  it('asks for the name and the inbox', () => {
    expect(numberDraftError({ ...draft, label: '  ' })).toMatch(/name/i)
    expect(numberDraftError({ ...draft, inboxId: null })).toMatch(/inbox/i)
    expect(numberDraftError({ ...draft, inboxId: 0 })).toMatch(/inbox/i)
  })

  it('refuses a phone with too few digits and an Evolution name with odd characters', () => {
    expect(numberDraftError({ ...draft, phone: '12345' })).toMatch(/digits/i)
    expect(numberDraftError({ ...draft, instance: 'my number!' })).toMatch(/Evolution/i)
  })
})

describe('explaining a failed save', () => {
  it('says when the inbox is already used or the person is not an admin', () => {
    expect(numberSaveMessage({ code: '23505' })).toMatch(/already used/i)
    expect(numberSaveMessage({ code: '42501' })).toMatch(/admin/i)
    expect(numberSaveMessage(new Error('boom'))).toMatch(/try again/i)
  })
})
