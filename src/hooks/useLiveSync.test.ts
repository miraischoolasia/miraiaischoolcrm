import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CoreSyncTarget, TableVersions } from '../lib/coreSync'

const realtime = vi.hoisted(() => ({
  handlers: [] as (() => void)[],
  status: null as null | ((status: string) => void),
  opened: 0,
  removed: vi.fn(),
}))

vi.mock('../lib/supabase', () => {
  const channel = () => {
    realtime.opened += 1
    realtime.handlers.length = 0
    const made = {
      on: (_type: string, _filter: unknown, handler: () => void) => {
        realtime.handlers.push(handler)
        return made
      },
      subscribe: (onStatus?: (status: string) => void) => {
        realtime.status = onStatus ?? null
        return made
      },
    }
    return made
  }
  return { supabase: { channel, removeChannel: realtime.removed } }
})

const tables = vi.hoisted(() => ({ next: null as TableVersions | null, asked: 0 }))
vi.mock('../lib/coreSync', async (original) => ({
  ...(await original<typeof import('../lib/coreSync')>()),
  fetchTableVersions: vi.fn(async () => {
    tables.asked += 1
    return tables.next
  }),
}))

import { FULL_READ_AFTER_MS, LIVE_TABLES, useLiveSync } from './useLiveSync'

let hidden = false
function setHidden(value: boolean) {
  hidden = value
  document.dispatchEvent(new Event('visibilitychange'))
}

// What each read was asked to do: 'all', or the parts it read, sorted.
function reads(sync: ReturnType<typeof vi.fn>) {
  return sync.mock.calls.map(([target]) => (target === 'all' ? 'all' : [...(target as Set<string>)].sort().join(',')))
}

function start(known: TableVersions | null, on = true) {
  const sync = vi.fn(async (_target: CoreSyncTarget) => undefined)
  const versions = { current: known }
  const view = renderHook(({ enabled }) => useLiveSync(enabled, sync, versions), { initialProps: { enabled: on } })
  return { sync, versions, view }
}

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

const BASE: TableVersions = { students: 1, student_classroom_periods: 1, leads: 1, schedules: 1, teachers: 1 }

describe('useLiveSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    realtime.handlers.length = 0
    realtime.status = null
    realtime.opened = 0
    realtime.removed.mockClear()
    tables.next = BASE
    tables.asked = 0
    hidden = false
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads only the parts whose tables changed when Realtime reconnects after a short gap', async () => {
    const { sync, versions } = start(BASE)
    await act(async () => realtime.status?.('SUBSCRIBED'))
    await wait(500)
    // Connected: one small check, nothing changed, nothing read.
    expect(tables.asked).toBe(1)
    expect(sync).not.toHaveBeenCalled()

    await act(async () => realtime.status?.('CHANNEL_ERROR'))
    tables.next = { ...BASE, leads: 2, student_classroom_periods: 3 }
    await wait(20_000)
    await act(async () => realtime.status?.('SUBSCRIBED'))
    await wait(500)

    expect(reads(sync)).toEqual(['leads,students'])
    expect(versions.current).toEqual(tables.next)
  })

  it('reads everything once when Realtime was down for over 5 minutes', async () => {
    const { sync } = start(BASE)
    await act(async () => realtime.status?.('SUBSCRIBED'))
    await wait(500)
    // A phone whose connection is gone: hidden, so nothing is asked meanwhile.
    await act(async () => realtime.status?.('CLOSED'))
    setHidden(true)
    await wait(FULL_READ_AFTER_MS + 1_000)
    expect(sync).not.toHaveBeenCalled()

    setHidden(false)
    await wait(500)
    expect(reads(sync)).toEqual(['all'])

    // Back and connected: the next checks are small again.
    await act(async () => realtime.status?.('SUBSCRIBED'))
    tables.next = { ...BASE, teachers: 2 }
    await wait(500)
    expect(reads(sync)).toEqual(['all', 'teachers'])
  })

  it('a tab hidden for a moment only checks what changed when looked at again', async () => {
    const { sync } = start(BASE)
    await act(async () => realtime.status?.('SUBSCRIBED'))
    await wait(500)
    setHidden(true)
    await wait(30_000)
    tables.next = { ...BASE, schedules: 2 }
    setHidden(false)
    await wait(500)
    expect(reads(sync)).toEqual(['schedules'])
  })

  it('while hidden it neither checks nor reads, and closes the connection after a minute', async () => {
    const { sync } = start(BASE)
    await act(async () => realtime.status?.('SUBSCRIBED'))
    await wait(500)
    const askedBefore = tables.asked
    setHidden(true)
    // A change reported while hidden waits for the tab to be looked at.
    await act(async () => realtime.handlers[0]())
    await wait(4 * 60_000)
    expect(tables.asked).toBe(askedBefore)
    expect(sync).not.toHaveBeenCalled()
    expect(realtime.removed).toHaveBeenCalledTimes(1)

    // Looked at again: connects again and catches up at once (before the connection is even back).
    tables.next = { ...BASE, students: 2 }
    setHidden(false)
    expect(realtime.opened).toBe(2)
    await wait(500)
    expect(reads(sync)).toEqual(['students'])
  })

  it('a tab hidden for over 5 minutes reads everything once when looked at again', async () => {
    const { sync } = start(BASE)
    await act(async () => realtime.status?.('SUBSCRIBED'))
    await wait(500)
    setHidden(true)
    await wait(FULL_READ_AFTER_MS + 1_000)
    setHidden(false)
    await wait(500)
    expect(reads(sync)).toEqual(['all'])
    // The connection comes back: only a small check, and it is not a second full read.
    await act(async () => realtime.status?.('SUBSCRIBED'))
    await wait(500)
    expect(reads(sync)).toEqual(['all'])
  })

  it('checks every 30 seconds while Realtime is not connected, reading only what changed', async () => {
    const { sync } = start(BASE)
    await wait(30_000)
    expect(tables.asked).toBe(1)
    expect(sync).not.toHaveBeenCalled()
    tables.next = { ...BASE, leads: 5 }
    await wait(30_000)
    expect(tables.asked).toBe(2)
    expect(reads(sync)).toEqual(['leads'])
  })

  it('only makes a small safety check every 5 minutes while Realtime is connected', async () => {
    const { sync } = start(BASE)
    await act(async () => realtime.status?.('SUBSCRIBED'))
    await wait(500)
    await wait(4 * 60_000)
    expect(tables.asked).toBe(1)
    await wait(60_000)
    expect(tables.asked).toBe(2)
    expect(sync).not.toHaveBeenCalled()
  })

  it('checks right after a database change, once for a burst of changes', async () => {
    const { sync } = start(BASE)
    await act(async () => realtime.status?.('SUBSCRIBED'))
    await wait(500)
    expect(realtime.handlers).toHaveLength(LIVE_TABLES.length)

    tables.next = { ...BASE, leads: 2 }
    await act(async () => {
      realtime.handlers[0]()
      realtime.handlers[3]()
      realtime.handlers[5]()
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(tables.asked).toBe(2)
    expect(reads(sync)).toEqual(['leads'])
  })

  it('reads everything as before while the database has no change numbers yet', async () => {
    tables.next = null
    const { sync } = start(null)
    await act(async () => realtime.status?.('SUBSCRIBED'))
    await wait(500)
    expect(reads(sync)).toEqual(['all'])
    await act(async () => realtime.status?.('CHANNEL_ERROR'))
    await wait(30_000)
    expect(reads(sync)).toEqual(['all', 'all'])
  })

  it('does nothing while switched off, and stops when unmounted', async () => {
    const { sync, view } = start(BASE, false)
    await wait(30_000)
    expect(sync).not.toHaveBeenCalled()
    expect(tables.asked).toBe(0)

    view.rerender({ enabled: true })
    view.unmount()
    await wait(30_000)
    expect(tables.asked).toBe(0)
    expect(realtime.removed).toHaveBeenCalled()
  })

  it('never runs two reads at once, and catches up after a slow one', async () => {
    let release: () => void = () => undefined
    const sync = vi.fn(
      (_target: CoreSyncTarget) =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    tables.next = null
    renderHook(() => useLiveSync(true, sync, { current: null }))

    await wait(30_000)
    expect(sync).toHaveBeenCalledTimes(1)
    await wait(30_000)
    // The first read is still going: the second check waits.
    expect(sync).toHaveBeenCalledTimes(1)
    await act(async () => {
      release()
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(sync).toHaveBeenCalledTimes(2)
  })
})
