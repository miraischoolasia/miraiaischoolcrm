import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLeadFormAnswers } from './useLeadFormAnswers'
import type { Lead, LeadFormSubmission } from '../types/domain'

const api = vi.hoisted(() => ({
  fetchLeadIdsWithFormSubmissions: vi.fn(),
  fetchLeadFormSubmissions: vi.fn(),
}))

vi.mock('../lib/api', () => api)

const leads = [] as Lead[]
const submission: LeadFormSubmission = {
  id: 1,
  formId: 'f',
  formName: 'Form',
  createdAt: '2026-10-01T00:00:00Z',
  answers: [],
  wasExisting: false,
  tracking: null,
}

beforeEach(() => {
  api.fetchLeadIdsWithFormSubmissions.mockReset().mockResolvedValue([3, 5])
  api.fetchLeadFormSubmissions.mockReset().mockResolvedValue([submission])
})

describe('useLeadFormAnswers', () => {
  it('knows which leads came with form answers', async () => {
    const { result } = renderHook(() => useLeadFormAnswers(true, leads, null))

    await waitFor(() => expect(result.current.leadIdsWithForms).toEqual(new Set([3, 5])))
    expect(api.fetchLeadFormSubmissions).not.toHaveBeenCalled()
  })

  it('loads the answers of the lead being edited, and is loading until they arrive', async () => {
    const { result } = renderHook(() => useLeadFormAnswers(true, leads, 3))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.submissions).toEqual([])
    await waitFor(() => expect(result.current.submissions).toEqual([submission]))
    expect(result.current.isLoading).toBe(false)
    expect(api.fetchLeadFormSubmissions).toHaveBeenCalledWith(3)
  })

  it('does not show one lead\'s answers while another lead\'s are loading', async () => {
    const { result, rerender } = renderHook(({ id }) => useLeadFormAnswers(true, leads, id), {
      initialProps: { id: 3 as number | null },
    })
    await waitFor(() => expect(result.current.submissions).toHaveLength(1))

    api.fetchLeadFormSubmissions.mockReturnValue(new Promise(() => {}))
    rerender({ id: 5 })

    expect(result.current.submissions).toEqual([])
    expect(result.current.isLoading).toBe(true)
  })

  it('shows nothing, without an error, when the answers cannot be loaded', async () => {
    api.fetchLeadFormSubmissions.mockRejectedValue(new Error('offline'))
    api.fetchLeadIdsWithFormSubmissions.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useLeadFormAnswers(true, leads, 3))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.submissions).toEqual([])
    expect(result.current.leadIdsWithForms.size).toBe(0)
  })

  it('makes no request for a teacher', () => {
    renderHook(() => useLeadFormAnswers(false, leads, 3))

    expect(api.fetchLeadIdsWithFormSubmissions).not.toHaveBeenCalled()
    expect(api.fetchLeadFormSubmissions).not.toHaveBeenCalled()
  })

  it('looks the tags up again when the leads are reloaded', async () => {
    const { rerender } = renderHook(({ list }) => useLeadFormAnswers(true, list, null), {
      initialProps: { list: leads },
    })
    await waitFor(() => expect(api.fetchLeadIdsWithFormSubmissions).toHaveBeenCalledTimes(1))

    rerender({ list: [] as Lead[] })

    await waitFor(() => expect(api.fetchLeadIdsWithFormSubmissions).toHaveBeenCalledTimes(2))
  })
})
