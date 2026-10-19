import { describe, expect, it } from 'vitest'
import { heightToBottom } from './useFillToBottom'

describe('heightToBottom', () => {
  it('reaches from the top of the box to the bottom of the window, less the margin', () => {
    expect(heightToBottom(137, 900, 16, 520)).toBe(747)
    expect(heightToBottom(137, 768, 16, 520)).toBe(615)
  })

  it('never goes below the smallest height, on a very short window', () => {
    expect(heightToBottom(137, 500, 16, 520)).toBe(520)
  })
})
