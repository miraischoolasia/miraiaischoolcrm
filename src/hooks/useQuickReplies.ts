import { useCallback, useEffect, useState } from 'react'
import type { QuickReply } from '../lib/quickReplies'
import {
  deleteQuickReply,
  fetchQuickReplies,
  quickReplyErrorMessage,
  saveQuickReply,
  saveQuickReplyOrder,
  type QuickReplyDraft,
} from '../lib/quickRepliesApi'

// The team's quick replies. Loaded once, and again whenever the list is opened,
// so a reply someone else just added shows up.
export function useQuickReplies(enabled: boolean) {
  const [replies, setReplies] = useState<QuickReply[]>([])
  const [isLoading, setIsLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!enabled) {
      return
    }
    try {
      setReplies(await fetchQuickReplies())
      setError(null)
    } catch (problem) {
      setError(quickReplyErrorMessage(problem, "Couldn't load the quick replies."))
    } finally {
      setIsLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    void reload()
  }, [reload])

  // Each returns an error message, or null when it worked.
  const save = useCallback(
    async (existing: QuickReply | null, draft: QuickReplyDraft) => {
      try {
        await saveQuickReply(existing, draft)
        await reload()
        return null
      } catch (problem) {
        return quickReplyErrorMessage(problem, "Couldn't save this quick reply.")
      }
    },
    [reload],
  )

  const remove = useCallback(
    async (reply: QuickReply) => {
      try {
        await deleteQuickReply(reply)
        await reload()
        return null
      } catch (problem) {
        return quickReplyErrorMessage(problem, "Couldn't delete this quick reply.")
      }
    },
    [reload],
  )

  // Shows the new order at once, then saves it; if that fails the saved order comes back.
  const reorder = useCallback(
    async (ids: number[]) => {
      setReplies((current) => ids.flatMap((id) => current.find((reply) => reply.id === id) ?? []))
      try {
        await saveQuickReplyOrder(ids)
        return null
      } catch (problem) {
        await reload()
        return quickReplyErrorMessage(problem, "Couldn't save the new order.")
      }
    },
    [reload],
  )

  return { replies, isLoading, error, reload, save, remove, reorder }
}
