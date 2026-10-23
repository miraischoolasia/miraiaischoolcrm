import { describe, expect, it } from 'vitest'
import { migrateLandingData, normalizeLandingData, slugFromTitle, slugProblem } from './landingData'

describe('landing page data', () => {
  it('reads a broken or empty row as an empty page', () => {
    expect(normalizeLandingData(null)).toEqual({ root: { props: {} }, content: [] })
    expect(normalizeLandingData({ content: [{ props: {} }, 'x', { type: 'Text', props: { text: 'hi' } }] })).toEqual({
      root: { props: {} },
      content: [{ type: 'Text', props: { text: 'hi' } }],
    })
  })

  it('keeps a page of today\'s format as it is', () => {
    const page = { root: { props: { shareTitle: 'A' } }, content: [{ type: 'Hero', props: { id: 'h', title: 'Hi' } }] }
    expect(migrateLandingData(page, 1)).toEqual(page)
  })

  it('makes a web address from a page name, and checks one', () => {
    expect(slugFromTitle('Book Fair 2026!')).toBe('book-fair-2026')
    expect(slugFromTitle('年终书展')).toBe('')
    expect(slugProblem('book-fair')).toBeNull()
    expect(slugProblem('-book')).not.toBeNull()
    expect(slugProblem('Book')).not.toBeNull()
    expect(slugProblem('admin')).not.toBeNull()
  })
})
