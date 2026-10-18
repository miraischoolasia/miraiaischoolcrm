import { describe, expect, it } from 'vitest'
import { getChatwootUrl, ownMediaUrl } from './chatwoot'

describe('getChatwootUrl', () => {
  it('returns nothing until an address is set', () => {
    expect(getChatwootUrl(undefined)).toBeNull()
    expect(getChatwootUrl('')).toBeNull()
    expect(getChatwootUrl('   ')).toBeNull()
  })

  it('keeps a clean http or https address without a trailing slash', () => {
    expect(getChatwootUrl('https://chat.example.com/')).toBe('https://chat.example.com')
    expect(getChatwootUrl(' http://localhost:3100 ')).toBe('http://localhost:3100')
  })

  it('refuses anything that is not a web address', () => {
    expect(getChatwootUrl('chat.example.com')).toBeNull()
    expect(getChatwootUrl('javascript:alert(1)')).toBeNull()
    expect(getChatwootUrl('ftp://chat.example.com')).toBeNull()
  })
})

describe('ownMediaUrl', () => {
  const OTHER = 'https://wa.miraischool.asia/rails/active_storage/blobs/redirect/abc--def/voice-1.wav'

  it('fetches a chat file through the own inbox address of the school when the message carries another one', () => {
    expect(ownMediaUrl(OTHER, 'https://wa.eduhero.com.my')).toBe(
      'https://wa.eduhero.com.my/rails/active_storage/blobs/redirect/abc--def/voice-1.wav',
    )
    expect(ownMediaUrl(`${OTHER}?x=1`, 'https://wa.eduhero.com.my')).toMatch(/^https:\/\/wa\.eduhero\.com\.my\/.*\?x=1$/)
  })

  it('leaves an address that is already the own one, and any other address, as it is', () => {
    expect(ownMediaUrl(OTHER, 'https://wa.miraischool.asia')).toBe(OTHER)
    const link = 'https://firebasestorage.googleapis.com/v0/b/x/o/voice.mp4?alt=media'
    expect(ownMediaUrl(link, 'https://wa.eduhero.com.my')).toBe(link)
    expect(ownMediaUrl(OTHER, null)).toBe(OTHER)
    expect(ownMediaUrl('not a url', 'https://wa.eduhero.com.my')).toBe('not a url')
  })
})
