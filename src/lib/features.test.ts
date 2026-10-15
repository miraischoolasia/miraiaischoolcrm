import { describe, expect, it } from 'vitest'
import { isFeatureOn } from './features'

describe('isFeatureOn', () => {
  it('is on only for the word true', () => {
    expect(isFeatureOn('true')).toBe(true)
    expect(isFeatureOn(' TRUE ')).toBe(true)
  })

  it('stays off when the variable is missing or says anything else', () => {
    expect(isFeatureOn(undefined)).toBe(false)
    expect(isFeatureOn('')).toBe(false)
    expect(isFeatureOn('false')).toBe(false)
    expect(isFeatureOn('1')).toBe(false)
    expect(isFeatureOn(true)).toBe(false)
  })
})
