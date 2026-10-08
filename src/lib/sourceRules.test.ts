import { describe, expect, it } from 'vitest'
import { matchSourceRules, normalizeForMatch, type SourceRule } from './sourceRules'

const rule = (id: number, phrase: string, sourceId: number | null, tagIds: number[] = [], isActive = true): SourceRule => ({
  id,
  phrase,
  sourceId,
  tagIds,
  isActive,
})

describe('normalizeForMatch', () => {
  it('ignores capitals, punctuation, emoji and spacing', () => {
    expect(normalizeForMatch('  Hi!!  I want\nto KNOW 😀 more.. ')).toBe('hi i want to know more')
  })

  it('keeps Chinese text', () => {
    expect(normalizeForMatch('我想了解，HOA课程！')).toBe('我想了解 hoa课程')
  })
})

describe('matchSourceRules', () => {
  it('matches a phrase inside a longer message, however it is written', () => {
    const match = matchSourceRules('Hello!! I want to know MORE about the HOA course', [
      rule(1, 'know more about the hoa course', 5, [9]),
    ])
    expect(match).toMatchObject({ sourceId: 5, tagIds: [9] })
    expect(match.rules).toHaveLength(1)
  })

  it('matches Chinese text without spaces', () => {
    expect(matchSourceRules('你好，我想了解HOA课程', [rule(1, '想了解hoa', 2)]).sourceId).toBe(2)
  })

  it('lets the longest matching phrase pick the source and adds every tag', () => {
    const match = matchSourceRules('i saw your facebook ad for the holiday camp', [
      rule(1, 'facebook ad', 1, [10]),
      rule(2, 'facebook ad for the holiday camp', 2, [11]),
    ])
    expect(match.sourceId).toBe(2)
    expect([...match.tagIds].sort()).toEqual([10, 11])
  })

  it('takes the source from a rule that sets one when the longest only adds a tag', () => {
    const match = matchSourceRules('facebook ad camp', [rule(1, 'facebook', 4), rule(2, 'facebook ad camp', null, [8])])
    expect(match).toMatchObject({ sourceId: 4, tagIds: [8] })
  })

  it('skips rules that are off or empty, and finds nothing otherwise', () => {
    expect(matchSourceRules('facebook', [rule(1, 'facebook', 1, [], false), rule(2, '   ', 1)]).rules).toEqual([])
    expect(matchSourceRules('hello', [rule(1, 'facebook', 1)])).toEqual({ sourceId: null, tagIds: [], rules: [] })
  })
})
