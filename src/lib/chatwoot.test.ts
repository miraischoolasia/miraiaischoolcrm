import { describe, expect, it } from 'vitest'
import { getChatwootUrl } from './chatwoot'

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
