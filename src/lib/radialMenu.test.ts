import { describe, expect, it } from 'vitest'
import { radialPositions } from './radialMenu'

describe('one-tap ring', () => {
  it('puts the first button on top and spreads them round', () => {
    expect(radialPositions(4, 60)).toEqual([
      { x: 0, y: -60 },
      { x: 60, y: 0 },
      { x: 0, y: 60 },
      { x: -60, y: 0 },
    ])
  })
  it('handles none', () => {
    expect(radialPositions(0, 60)).toEqual([])
  })
})
