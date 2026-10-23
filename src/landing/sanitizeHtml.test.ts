import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from './sanitizeHtml'

describe('sanitizeHtml', () => {
  it('keeps plain formatting and safe links', () => {
    expect(sanitizeHtml('<p>Hi <strong>you</strong></p><ul><li>one</li></ul>')).toBe('<p>Hi <strong>you</strong></p><ul><li>one</li></ul>')
    expect(sanitizeHtml('<a href="https://x.com">x</a>')).toBe('<a href="https://x.com" target="_blank" rel="noopener noreferrer">x</a>')
    expect(sanitizeHtml('<p style="text-align: center">c</p>')).toBe('<p style="text-align: center">c</p>')
  })

  it('drops scripts, event handlers, other styles and unsafe links', () => {
    expect(sanitizeHtml('<p onclick="alert(1)">a</p><script>alert(1)</script>')).toBe('<p>a</p>')
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeHtml('<img onerror=alert(1)><iframe></iframe>')).toBe('')
    expect(sanitizeHtml('<div><p style="color:red">k</p></div>')).toBe('<p>k</p>')
  })
})
