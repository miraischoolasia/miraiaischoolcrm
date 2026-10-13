import { useCallback, useEffect, useState } from 'react'
import { chatWebhookErrorMessage, fetchChatWebhookInfo, type ChatWebhookInfo } from '../lib/chatActivity'

// The address Chatwoot calls and whether messages are arriving. Only an admin can read it.
export function useChatWebhook({ enabled }: { enabled: boolean }) {
  const [info, setInfo] = useState<ChatWebhookInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const reload = useCallback(async () => {
    if (!enabled) {
      return
    }
    setIsLoading(true)
    try {
      setInfo(await fetchChatWebhookInfo())
      setError(null)
    } catch (problem) {
      setError(chatWebhookErrorMessage(problem))
    } finally {
      setIsLoading(false)
    }
  }, [enabled])

  useEffect(() => {
    if (enabled) {
      void reload()
    }
  }, [enabled, reload])

  return { info, error, isLoading, reload }
}
