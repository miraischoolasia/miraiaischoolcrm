import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { everyWhileVisible } from './visibleTimer'

let hidden = false
function setHidden(value: boolean) {
  hidden = value
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('everyWhileVisible', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    hidden = false
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ticks while looked at, stays quiet in the background, and ticks at once when looked at again', () => {
    const tick = vi.fn()
    const stop = everyWhileVisible(tick, 60_000)
    vi.advanceTimersByTime(60_000)
    expect(tick).toHaveBeenCalledTimes(1)

    setHidden(true)
    vi.advanceTimersByTime(10 * 60_000)
    expect(tick).toHaveBeenCalledTimes(1)

    setHidden(false)
    expect(tick).toHaveBeenCalledTimes(2)

    stop()
    vi.advanceTimersByTime(10 * 60_000)
    setHidden(true)
    setHidden(false)
    expect(tick).toHaveBeenCalledTimes(2)
  })
})
