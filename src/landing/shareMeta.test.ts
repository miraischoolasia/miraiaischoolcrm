import { describe, expect, it } from 'vitest'
import { injectShareTags } from './shareMeta'

const html = '<!doctype html><html><head><meta charset="UTF-8" /><title>Mirai AI School</title></head><body></body></html>'

describe('injectShareTags', () => {
  it('writes the page\'s title, text and picture into the page for link previews', () => {
    const out = injectShareTags(html, {
      title: 'Book fair "2026"',
      description: 'Come & see',
      image: 'https://x/a.webp',
      url: 'https://crm.example/p/book-fair',
      siteName: 'Mirai',
    })
    expect(out).toContain('<title>Book fair &quot;2026&quot;</title>')
    expect(out).toContain('<meta property="og:title" content="Book fair &quot;2026&quot;" />')
    expect(out).toContain('<meta property="og:description" content="Come &amp; see" />')
    expect(out).toContain('<meta property="og:image" content="https://x/a.webp" />')
    expect(out).toContain('<meta property="og:url" content="https://crm.example/p/book-fair" />')
    expect(out.indexOf('og:title')).toBeLessThan(out.indexOf('</head>'))
  })

  it('leaves out tags with nothing to say', () => {
    const out = injectShareTags(html, { title: 'A', description: '', image: '', url: 'u', siteName: 'S' })
    expect(out).not.toContain('og:image')
    expect(out).not.toContain('name="description"')
    expect(out).toContain('summary')
  })
})
