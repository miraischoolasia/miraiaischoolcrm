import { useEffect, useState } from 'react'
import type { ChatwootClient } from '../lib/chatwootClient'
import { searchCopy } from '../lib/inboxCopyReader'
import type { ChatwootConversation } from '../lib/whatsappInbox'

const MIN_LENGTH = 2
const PAUSE_MS = 450

export type MessageSearch = {
  // Chat -> the words of the message that matched.
  snippets: ReadonlyMap<number, string>
  // Chat -> that message, so the chat can open on it (only known when the copy was searched).
  messageIds: ReadonlyMap<number, number>
  // Chats the copy found, with their newest message, for the list (they may not be loaded yet).
  chats: ChatwootConversation[]
}

const NOTHING: MessageSearch = { snippets: new Map(), messageIds: new Map(), chats: [] }

// Looks inside the messages of every chat, once the person stops typing. With the CRM's copy of the inbox it
// searches every message ever copied (any language, any part of a word) and knows which message matched; without
// it, or when the copy does not answer, it asks Chatwoot as before. One request per pause.
export function useMessageSearch(client: ChatwootClient, query: string, useCopy = false): MessageSearch {
  const [found, setFound] = useState<{ query: string; result: MessageSearch }>({ query: '', result: NOTHING })
  const wanted = query.trim()

  useEffect(() => {
    if (wanted.length < MIN_LENGTH) {
      return
    }
    let cancelled = false
    const fromChatwoot = () =>
      client.searchMessages(wanted).then((results) => ({
        snippets: new Map(results.map((result) => [result.conversationId, result.snippet])),
        messageIds: new Map<number, number>(),
        chats: [],
      }))
    const timer = window.setTimeout(() => {
      const search: Promise<MessageSearch> = useCopy
        ? searchCopy(wanted)
            .then(({ hits, chats }) => ({
              snippets: new Map([...hits].map(([id, hit]) => [id, hit.snippet])),
              messageIds: new Map([...hits].flatMap(([id, hit]) => (hit.messageId === null ? [] : [[id, hit.messageId] as const]))),
              chats,
            }))
            .catch(fromChatwoot)
        : fromChatwoot()
      search
        .then((result) => {
          if (!cancelled) {
            setFound({ query: wanted, result })
          }
        })
        .catch(() => undefined)
    }, PAUSE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [client, wanted, useCopy])

  // Answers for an older search are not shown for the new one.
  return found.query === wanted && wanted.length >= MIN_LENGTH ? found.result : NOTHING
}
