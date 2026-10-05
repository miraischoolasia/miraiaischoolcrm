import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { preloadImages } from './preloadImages'

class FakeImage {
  static all: FakeImage[] = []
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  src = ''

  constructor() {
    FakeImage.all.push(this)
  }
}

beforeEach(() => {
  FakeImage.all = []
  vi.stubGlobal('Image', FakeImage)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function settled(promise: Promise<void>) {
  let done = false
  void promise.then(() => (done = true))
  await vi.advanceTimersByTimeAsync(0)
  return done
}

describe('preloadImages', () => {
  it('is done at once when there is nothing to load', async () => {
    await expect(preloadImages([])).resolves.toBeUndefined()
    expect(FakeImage.all).toHaveLength(0)
  })

  it('waits until every picture has loaded, asking for each address once', async () => {
    const promise = preloadImages(['/a.png', '/b.png', '/a.png', ''])
    expect(FakeImage.all.map((image) => image.src)).toEqual(['/a.png', '/b.png'])

    FakeImage.all[0].onload?.()
    expect(await settled(promise)).toBe(false)

    FakeImage.all[1].onload?.()
    expect(await settled(promise)).toBe(true)
  })

  it('counts a picture that failed as done', async () => {
    const promise = preloadImages(['/a.png', '/b.png'])
    FakeImage.all[0].onload?.()
    FakeImage.all[1].onerror?.()

    expect(await settled(promise)).toBe(true)
  })

  it('gives up waiting after the time limit', async () => {
    const promise = preloadImages(['/a.png'], 5000)

    await vi.advanceTimersByTimeAsync(4999)
    expect(await settled(promise)).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(await settled(promise)).toBe(true)
  })
})
