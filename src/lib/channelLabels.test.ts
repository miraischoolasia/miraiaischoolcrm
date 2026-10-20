import { describe, expect, it } from 'vitest'
import { channelLabelProblem, fullLabelOf, shortLabelOf } from './channelLabels'

describe('channel labels', () => {
  it('shows the short name, else the last 4 digits of the number, else the start of the name', () => {
    expect(shortLabelOf({ shortName: 'Dora', color: '#2563eb' }, '60123456789', 'EduHero - Dora')).toBe('Dora')
    expect(shortLabelOf(undefined, '+60 12-345 6789', 'EduHero WhatsApp 2')).toBe('6789')
    expect(shortLabelOf({ shortName: '  ', color: null }, null, 'EduHero WhatsApp 2')).toBe('EduHero ')
    expect(shortLabelOf(undefined, null, 'Jack')).toBe('Jack')
  })

  it('gives the full name and number for the long look', () => {
    expect(fullLabelOf('EduHero WhatsApp 2', '60123456789')).toBe('EduHero WhatsApp 2 · +60123456789')
    expect(fullLabelOf('万能教 Jack老师', null)).toBe('万能教 Jack老师')
  })

  it('keeps a short name short (8 characters, Chinese counted one each)', () => {
    expect(channelLabelProblem({ shortName: '万能教Jack老', color: null })).toBeNull()
    expect(channelLabelProblem({ shortName: 'TooLongName', color: null })).toMatch(/at most 8/)
  })
})
