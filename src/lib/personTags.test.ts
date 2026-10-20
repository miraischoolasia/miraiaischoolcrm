import { describe, expect, it } from 'vitest'
import { matchesTagFilter, NO_TAG } from './personTags'

describe('matchesTagFilter', () => {
  it('lets everyone through when no tag is chosen', () => {
    expect(matchesTagFilter(undefined, '')).toBe(true)
    expect(matchesTagFilter([3], '')).toBe(true)
  })

  it('finds the students with one tag', () => {
    expect(matchesTagFilter([3, 7], '7')).toBe(true)
    expect(matchesTagFilter([3], '7')).toBe(false)
    expect(matchesTagFilter(undefined, '7')).toBe(false)
  })

  it('finds the students with no tag at all', () => {
    expect(matchesTagFilter(undefined, NO_TAG)).toBe(true)
    expect(matchesTagFilter([], NO_TAG)).toBe(true)
    expect(matchesTagFilter([3], NO_TAG)).toBe(false)
  })
})
