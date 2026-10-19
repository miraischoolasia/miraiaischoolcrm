import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// A stand-in Supabase: the two counts the hook reads, and a Realtime channel that says SUBSCRIBED.
const fake = vi.hoisted(() => ({ total: 500, missing: 0, error: null as null | { code: string }, subscribed: true, channels: 0 }))
vi.mock('../lib/supabase', () => {
  const head = (missingOnly: boolean) => ({
    is: () => Promise.resolve({ count: fake.missing, error: fake.error }),
    then: (resolve: (value: unknown) => void) => resolve({ count: missingOnly ? fake.missing : fake.total, error: fake.error }),
  })
  const channel = {
    on: () => channel,
    subscribe: (callback: (status: string) => void) => {
      fake.channels += 1
      callback(fake.subscribed ? 'SUBSCRIBED' : 'CHANNEL_ERROR')
      return channel
    },
  }
  return {
    supabase: {
      from: () => ({ select: () => head(false) }),
      channel: () => channel,
      removeChannel: vi.fn(),
    },
  }
})

const { useInboxCopyLive } = await import('./useInboxCopyLive')

beforeEach(() => {
  Object.assign(fake, { total: 500, missing: 0, error: null, subscribed: true, channels: 0 })
})

describe('useInboxCopyLive', () => {
  it('is live once the copy is there, complete, and connected', async () => {
    const { result } = renderHook(() => useInboxCopyLive(true))
    await waitFor(() => expect(result.current.live).toBe(true))
    expect(result.current.available).toBe(true)
  })

  it('is not used while many chats lack Chatwoot\'s own shape (before "Copy old chats" read them again)', async () => {
    fake.missing = 120
    const { result } = renderHook(() => useInboxCopyLive(true))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result.current.available).toBe(false)
    expect(result.current.live).toBe(false)
  })

  it('is not used when the copy is not in the database', async () => {
    fake.error = { code: '42703' }
    const { result } = renderHook(() => useInboxCopyLive(true))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result.current.available).toBe(false)
  })

  it('is available but not live when Realtime does not connect: the page asks Chatwoot as before', async () => {
    fake.subscribed = false
    const { result } = renderHook(() => useInboxCopyLive(true))
    await waitFor(() => expect(result.current.available).toBe(true))
    expect(result.current.live).toBe(false)
  })

  it('does nothing for someone without the inbox', async () => {
    const { result } = renderHook(() => useInboxCopyLive(false))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result.current.available).toBe(false)
    expect(fake.channels).toBe(0)
  })
})
