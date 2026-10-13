import { useCallback, useEffect, useMemo, useReducer } from 'react'
import {
  buildDraftBody,
  markAiDraftAccepted,
  messageNeedingReply,
  requestAiDraft,
  type AiDraftContext,
  type AiDraftOutcome,
  type AiDraftSuggestion,
} from '../lib/aiDraft'
import type { ChatwootMessage } from '../lib/whatsappInbox'

type Entry =
  | { status: 'loading' }
  | { status: 'ready'; suggestion: AiDraftSuggestion }
  // Nothing to show: the AI saw no need to reply, or the suggestion was used or dismissed.
  | { status: 'none' }
  | { status: 'error'; message: string }

// What was asked for each parent message, kept while the page is open so going back to a chat, or a
// second person opening it, does not ask again.
const entries = new Map<string, Entry>()
const MAX_ENTRIES = 200
// The id of the draft made for each parent message, kept after the suggestion is used or put away, so
// that what the team then sends can be recorded against it.
const draftIds = new Map<string, number>()

function remember(key: string, entry: Entry) {
  entries.delete(key)
  entries.set(key, entry)
  if (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value
    if (oldest !== undefined) {
      entries.delete(oldest)
      draftIds.delete(oldest)
    }
  }
}

function entryOf(outcome: AiDraftOutcome): Entry {
  if (outcome.kind === 'draft') {
    return { status: 'ready', suggestion: outcome.suggestion }
  }
  return outcome.kind === 'skip' ? { status: 'none' } : { status: 'error', message: outcome.message }
}

type Args = {
  // Only people who may edit leads, and only where the feature is wanted.
  enabled: boolean
  conversationId: number
  messages: ChatwootMessage[]
  context: AiDraftContext
  // Something is already written in the box; a suggestion would only be in the way.
  hasDraft: boolean
  // Replaced in tests.
  request?: typeof requestAiDraft
}

// A grey reply suggestion for the parent's last message: asked for once when a chat with an
// unanswered message is open and the box is empty, and again only when the person asks.
export function useAiSuggestion({
  enabled,
  conversationId,
  messages,
  context,
  hasDraft,
  request = requestAiDraft,
}: Args) {
  const [, refresh] = useReducer((count: number) => count + 1, 0)
  const targetId = useMemo(() => messageNeedingReply(messages)?.id ?? null, [messages])
  const key = targetId === null ? null : `${conversationId}:${targetId}`
  const { teamName } = context
  // The list is a new array on every render of the page; only a change in what it says matters.
  const childrenKey = JSON.stringify(context.children)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const children = useMemo(() => context.children, [childrenKey])

  const run = useCallback(
    async (regenerate: boolean) => {
      if (key === null) {
        return
      }
      const body = buildDraftBody(conversationId, messages, { children, teamName }, regenerate)
      if (!body) {
        return
      }
      remember(key, { status: 'loading' })
      refresh()
      const outcome = await request(body)
      if (outcome.kind === 'draft' && outcome.suggestion.id !== null) {
        draftIds.set(key, outcome.suggestion.id)
      }
      remember(key, entryOf(outcome))
      refresh()
    },
    [key, conversationId, messages, children, teamName, request],
  )

  useEffect(() => {
    if (enabled && key !== null && !hasDraft && !entries.has(key)) {
      void run(false)
    }
  }, [enabled, key, hasDraft, run])

  const entry = key === null ? undefined : entries.get(key)

  const dismiss = useCallback(() => {
    if (key !== null) {
      remember(key, { status: 'none' })
      refresh()
    }
  }, [key])

  const markUsed = useCallback(() => {
    if (key === null) {
      return
    }
    const current = entries.get(key)
    if (current?.status === 'ready' && current.suggestion.id !== null) {
      void markAiDraftAccepted(current.suggestion.id)
    }
    remember(key, { status: 'none' })
    refresh()
  }, [key])

  // Asks again, also when the first answer was "no reply needed".
  const suggest = useCallback(() => void run(true), [run])

  return {
    available: enabled && key !== null,
    // The draft made for the message the next reply will answer, even once it has been used or put away.
    draftId: key === null ? null : (draftIds.get(key) ?? null),
    suggestion: entry?.status === 'ready' ? entry.suggestion : null,
    isLoading: entry?.status === 'loading',
    error: entry?.status === 'error' ? entry.message : null,
    suggest,
    dismiss,
    markUsed,
  }
}

// Only for tests: forget what was asked.
export function resetAiSuggestions() {
  entries.clear()
  draftIds.clear()
}
