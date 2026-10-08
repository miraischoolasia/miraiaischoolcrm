import { useEffect, useState } from 'react'
import type { ChatwootClient } from '../lib/chatwootClient'

const NO_HITS: ReadonlyMap<number, string> = new Map()
const MIN_LENGTH = 2
const PAUSE_MS = 450

// Looks inside the messages of every chat, once the person stops typing. One
// request per pause, so it costs the server next to nothing. Resolves to the
// chats that matched and the message that matched in each.
export function useMessageSearch(client: ChatwootClient, query: string) {
  const [found, setFound] = useState<{ query: string; hits: ReadonlyMap<number, string> }>({ query: '', hits: NO_HITS })
  const wanted = query.trim()

  useEffect(() => {
    if (wanted.length < MIN_LENGTH) {
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      client
        .searchMessages(wanted)
        .then((results) => {
          if (!cancelled) {
            setFound({ query: wanted, hits: new Map(results.map((result) => [result.conversationId, result.snippet])) })
          }
        })
        .catch(() => undefined)
    }, PAUSE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [client, wanted])

  // Answers for an older search are not shown for the new one.
  return found.query === wanted && wanted.length >= MIN_LENGTH ? found.hits : NO_HITS
}
