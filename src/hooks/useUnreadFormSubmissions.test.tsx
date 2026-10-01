import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUnreadFormSubmissions } from './useUnreadFormSubmissions'

const api = vi.hoisted(() => ({ countFormSubmissionsSince: vi.fn() }))

vi.mock('../lib/api', () => api)

const SEEN_KEY = 'mirai-forms-seen-at'

beforeEach(() => {
  window.localStorage.clear()
  api.countFormSubmissionsSince.mockReset().mockResolvedValue(0)
})

describe('useUnreadFormSubmissions', () => {
  it('counts only what came in after this browser last looked', async () => {
    window.localStorage.setItem(SEEN_KEY, '2026-10-01T00:00:00.000Z')
    api.countFormSubmissionsSince.mockResolvedValue(3)

    const { result } = renderHook(() => useUnreadFormSubmissions(true))

    await waitFor(() => expect(result.current.unread).toBe(3))
    expect(api.countFormSubmissionsSince).toHaveBeenCalledWith('2026-10-01T00:00:00.000Z')
  })

  it('does not flag old submissions on the first visit in a browser', async () => {
    renderHook(() => useUnreadFormSubmissions(true))

    await waitFor(() => expect(api.countFormSubmissionsSince).toHaveBeenCalled())
    const since = api.countFormSubmissionsSince.mock.calls[0][0] as string
    expect(Math.abs(Date.now() - Date.parse(since))).toBeLessThan(5000)
    expect(window.localStorage.getItem(SEEN_KEY)).toBe(since)
  })

  it('clears the count and remembers the newest submission when marked seen', async () => {
    window.localStorage.setItem(SEEN_KEY, '2026-10-01T00:00:00.000Z')
    api.countFormSubmissionsSince.mockResolvedValue(2)
    const { result } = renderHook(() => useUnreadFormSubmissions(true))
    await waitFor(() => expect(result.current.unread).toBe(2))

    act(() => result.current.markSeen('2026-10-01T05:00:00.000Z'))

    expect(result.current.unread).toBe(0)
    expect(window.localStorage.getItem(SEEN_KEY)).toBe('2026-10-01T05:00:00.000Z')
  })

  it('never moves the last-seen time backwards', async () => {
    window.localStorage.setItem(SEEN_KEY, '2026-10-02T00:00:00.000Z')
    const { result } = renderHook(() => useUnreadFormSubmissions(true))

    act(() => result.current.markSeen('2026-10-01T05:00:00.000Z'))

    expect(window.localStorage.getItem(SEEN_KEY)).toBe('2026-10-02T00:00:00.000Z')
  })

  it('stays quiet and makes no request for a teacher', () => {
    renderHook(() => useUnreadFormSubmissions(false))

    expect(api.countFormSubmissionsSince).not.toHaveBeenCalled()
  })

  it('shows no badge when the count cannot be loaded', async () => {
    api.countFormSubmissionsSince.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useUnreadFormSubmissions(true))

    await waitFor(() => expect(api.countFormSubmissionsSince).toHaveBeenCalled())
    expect(result.current.unread).toBe(0)
  })
})
