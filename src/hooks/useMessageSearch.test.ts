import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatwootClient } from '../lib/chatwootClient'
import { useMessageSearch } from './useMessageSearch'

function clientWith(results: { conversationId: number; snippet: string }[]) {
  return { searchMessages: vi.fn().mockResolvedValue(results) } as unknown as ChatwootClient & {
    searchMessages: ReturnType<typeof vi.fn>
  }
}

describe('useMessageSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('asks once, after the typing pauses, and returns what matched', async () => {
    const client = clientWith([{ conversationId: 7, snippet: 'The fees are RM100' }])
    const { result, rerender } = renderHook(({ query }) => useMessageSearch(client, query), { initialProps: { query: 'f' } })

    rerender({ query: 'fe' })
    rerender({ query: 'fees' })
    expect(client.searchMessages).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    expect(client.searchMessages).toHaveBeenCalledTimes(1)
    expect(client.searchMessages).toHaveBeenCalledWith('fees')
    expect(result.current.get(7)).toBe('The fees are RM100')
  })

  it('does not search for a single letter', async () => {
    const client = clientWith([])
    renderHook(() => useMessageSearch(client, ' a '))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(client.searchMessages).not.toHaveBeenCalled()
  })

  it('drops the answer once the words change or are cleared', async () => {
    const client = clientWith([{ conversationId: 7, snippet: 'hit' }])
    const { result, rerender } = renderHook(({ query }) => useMessageSearch(client, query), { initialProps: { query: 'fees' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(result.current.size).toBe(1)

    rerender({ query: 'fees now' })
    expect(result.current.size).toBe(0)
    rerender({ query: '' })
    expect(result.current.size).toBe(0)
  })
})
