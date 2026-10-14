import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const realtime = vi.hoisted(() => ({
  handlers: [] as (() => void)[],
  removed: vi.fn(),
}))

vi.mock('../lib/supabase', () => {
  const channel = {
    on: (_type: string, _filter: unknown, handler: () => void) => {
      realtime.handlers.push(handler)
      return channel
    },
    subscribe: () => channel,
  }
  return { supabase: { channel: () => channel, removeChannel: realtime.removed } }
})

import { LIVE_TABLES, useLiveSync } from './useLiveSync'

describe('useLiveSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    realtime.handlers.length = 0
    realtime.removed.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('checks every 15 seconds', async () => {
    const sync = vi.fn(async () => undefined)
    renderHook(() => useLiveSync(true, sync))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(sync).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(sync).toHaveBeenCalledTimes(2)
  })

  it('reads again right after a database change, once for a burst of changes', async () => {
    const sync = vi.fn(async () => undefined)
    renderHook(() => useLiveSync(true, sync))
    expect(realtime.handlers).toHaveLength(LIVE_TABLES.length)

    await act(async () => {
      realtime.handlers[0]()
      realtime.handlers[3]()
      realtime.handlers[5]()
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('does nothing while switched off, and stops when unmounted', async () => {
    const sync = vi.fn(async () => undefined)
    const view = renderHook(({ on }) => useLiveSync(on, sync), { initialProps: { on: false } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(sync).not.toHaveBeenCalled()

    view.rerender({ on: true })
    view.unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(sync).not.toHaveBeenCalled()
    expect(realtime.removed).toHaveBeenCalled()
  })

  it('never runs two reads at once, and catches up after a slow one', async () => {
    let release: () => void = () => undefined
    const sync = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    renderHook(() => useLiveSync(true, sync))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(sync).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    // The first read is still going: the second check waits.
    expect(sync).toHaveBeenCalledTimes(1)
    await act(async () => {
      release()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(sync).toHaveBeenCalledTimes(2)
  })
})
