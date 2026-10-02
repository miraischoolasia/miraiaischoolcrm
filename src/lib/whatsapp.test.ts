import { describe, expect, it } from 'vitest'
import { getWhatsAppUrl } from './whatsapp'

describe('getWhatsAppUrl', () => {
  it('turns a local number into a Malaysian international one', () => {
    expect(getWhatsAppUrl('012-345 6789')).toBe('https://wa.me/60123456789')
    expect(getWhatsAppUrl('0123456789')).toBe('https://wa.me/60123456789')
  })

  it('keeps numbers that already carry a country code', () => {
    expect(getWhatsAppUrl('+60 12-345 6789')).toBe('https://wa.me/60123456789')
    expect(getWhatsAppUrl('60123456789')).toBe('https://wa.me/60123456789')
    expect(getWhatsAppUrl('+65 9123 4567')).toBe('https://wa.me/6591234567')
    expect(getWhatsAppUrl('0065 9123 4567')).toBe('https://wa.me/6591234567')
  })

  it('adds a ready-written message when given one', () => {
    expect(getWhatsAppUrl('0123456789', 'Hi Mrs Lim & family')).toBe(
      'https://wa.me/60123456789?text=Hi%20Mrs%20Lim%20%26%20family',
    )
  })

  it('gives nothing for a missing or too short number', () => {
    expect(getWhatsAppUrl(null)).toBeNull()
    expect(getWhatsAppUrl('')).toBeNull()
    expect(getWhatsAppUrl('0123')).toBeNull()
    expect(getWhatsAppUrl('call me')).toBeNull()
  })
})
