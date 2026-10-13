import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatwootMessage } from '../lib/whatsappInbox'
import type { AiDraftOutcome } from '../lib/aiDraft'
import { resetAiSuggestions, useAiSuggestion } from './useAiSuggestion'

const accepted = vi.hoisted(() => vi.fn())
vi.mock('../lib/aiDraft', async (original) => ({
  ...(await original<typeof import('../lib/aiDraft')>()),
  markAiDraftAccepted: accepted,
}))

let nextId = 1
const message = (change: Partial<ChatwootMessage> = {}): ChatwootMessage => ({
  id: nextId++,
  content: 'How much is HOA?',
  message_type: 0,
  created_at: 1,
  private: false,
  status: 'sent',
  ...change,
})

const context = { childName: 'Ethan', childAge: 9, teamName: 'Lex' }
const draft: AiDraftOutcome = { kind: 'draft', suggestion: { id: 5, text: 'Hi 妈咪😊', note: '' } }

function setup(
  options: {
    enabled?: boolean
    hasDraft?: boolean
    messages?: ChatwootMessage[]
    conversationId?: number
    outcome?: AiDraftOutcome
  } = {},
) {
  const request = vi.fn().mockResolvedValue(options.outcome ?? draft)
  const messages = options.messages ?? [message()]
  const hook = renderHook(
    (props: { messages: ChatwootMessage[]; hasDraft: boolean }) =>
      useAiSuggestion({
        enabled: options.enabled ?? true,
        conversationId: options.conversationId ?? 1,
        messages: props.messages,
        context,
        hasDraft: props.hasDraft,
        request,
      }),
    { initialProps: { messages, hasDraft: options.hasDraft ?? false } },
  )
  return { request, hook, messages }
}

beforeEach(() => {
  resetAiSuggestions()
  accepted.mockReset()
  nextId = 1
})

describe('useAiSuggestion', () => {
  it('asks once for an unanswered message and shows the suggestion', async () => {
    const { request, hook } = setup()
    await waitFor(() => expect(hook.result.current.suggestion).toMatchObject({ id: 5, text: 'Hi 妈咪😊' }))
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][0]).toMatchObject({ chatId: 1, child: { name: 'Ethan', age: 9 }, teamName: 'Lex' })

    // The same chat polled again (a new list with the same last message) does not ask again.
    hook.rerender({ messages: [{ ...message({ id: 1 }) }], hasDraft: false })
    await act(async () => {})
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('does not ask when the feature is off, something is already written, or the team spoke last', async () => {
    const off = setup({ enabled: false, conversationId: 2 })
    const written = setup({ hasDraft: true, conversationId: 3 })
    const answered = setup({ messages: [message({ message_type: 1, content: 'Hi' })], conversationId: 4 })
    await act(async () => {})
    expect(off.request).not.toHaveBeenCalled()
    expect(written.request).not.toHaveBeenCalled()
    expect(answered.request).not.toHaveBeenCalled()
    expect(answered.hook.result.current.available).toBe(false)
  })

  it('asks once the box is empty again', async () => {
    const { request, hook, messages } = setup({ hasDraft: true, conversationId: 5 })
    await act(async () => {})
    expect(request).not.toHaveBeenCalled()
    hook.rerender({ messages, hasDraft: false })
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
  })

  it('shows nothing when the AI sees no reply is needed, but can be asked again by hand', async () => {
    const { request, hook } = setup({ conversationId: 6, outcome: { kind: 'skip' } })
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(hook.result.current.isLoading).toBe(false))
    expect(hook.result.current.suggestion).toBeNull()
    request.mockResolvedValue(draft)
    act(() => hook.result.current.suggest())
    await waitFor(() => expect(hook.result.current.suggestion?.text).toBe('Hi 妈咪😊'))
    expect(request.mock.calls.at(-1)?.[0]).toMatchObject({ regenerate: true })
  })

  it('reports a failure without a suggestion', async () => {
    const request = vi.fn().mockResolvedValue({ kind: 'error', message: 'The AI key has not been set up yet.' })
    const messages = [message()]
    const { result } = renderHook(() =>
      useAiSuggestion({ enabled: true, conversationId: 7, messages, context, hasDraft: false, request }),
    )
    await waitFor(() => expect(result.current.error).toBe('The AI key has not been set up yet.'))
    expect(result.current.suggestion).toBeNull()
  })

  it('puts a dismissed suggestion away and records a used one', async () => {
    const first = setup({ conversationId: 8 })
    await waitFor(() => expect(first.hook.result.current.suggestion).not.toBeNull())
    act(() => first.hook.result.current.dismiss())
    expect(first.hook.result.current.suggestion).toBeNull()
    expect(accepted).not.toHaveBeenCalled()

    const second = setup({ conversationId: 9 })
    await waitFor(() => expect(second.hook.result.current.suggestion).not.toBeNull())
    act(() => second.hook.result.current.markUsed())
    expect(accepted).toHaveBeenCalledWith(5)
    expect(second.hook.result.current.suggestion).toBeNull()
  })
})
