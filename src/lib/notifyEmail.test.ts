import { describe, expect, it } from 'vitest'
import { buildSubmissionEmail, escapeHtml } from '../../supabase/functions/notify-form-submission/email'

describe('buildSubmissionEmail', () => {
  it('lists every answer and says where the visitor came from', () => {
    const email = buildSubmissionEmail(
      'Trial Class',
      [
        { label: 'Parent', value: 'Mrs Lim' },
        { label: 'Phone', value: '012-345 6789' },
      ],
      { source: 'facebook', medium: 'cpc', campaign: 'spring', content: '', referrer: '' },
      'https://crm.test',
    )

    expect(email.subject).toBe('New submission: Trial Class')
    expect(email.text).toContain('Parent: Mrs Lim')
    expect(email.text).toContain('Phone: 012-345 6789')
    expect(email.text).toContain('Came from: facebook / cpc / spring')
    expect(email.text).toContain('Open the CRM: https://crm.test')
    expect(email.html).toContain('Mrs Lim')
  })

  it('never lets what a visitor typed become markup or break the subject line', () => {
    const email = buildSubmissionEmail(
      'Class\r\nBcc: x@evil.test',
      [{ label: '<b>Name</b>', value: '<img src=x onerror=alert(1)> & "quotes"' }],
      null,
      '',
    )

    expect(email.subject).toBe('New submission: Class Bcc: x@evil.test')
    expect(email.subject).not.toMatch(/[\r\n]/)
    expect(email.html).not.toContain('<img')
    expect(email.html).not.toContain('<b>Name')
    expect(email.html).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quotes&quot;')
    expect(email.text).not.toContain('Came from')
    expect(email.text).not.toContain('Open the CRM')
  })

  it('escapes the characters that matter in html', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })
})
