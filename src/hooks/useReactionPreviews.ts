import { useEffect, useMemo, useRef, useState } from 'react'
import { mayBeReaction, type ReactionPreview } from '../lib/reactionPreview'
import { waIdOf, type WaActions } from '../lib/waActions'
import type { ChatwootConversation } from '../lib/whatsappInbox'

// For chats whose newest message looks like a reaction (a lone emoji quoting another message), asks WhatsApp
// what it was put on, so the list can say "You reacted 😂 to: ..." like WhatsApp does. The answer is by the
// reaction's own WhatsApp id; a message that is no reaction after all is simply left out.
// actionsFor: the actions of the number a chat is on (a school can have many numbers); null while the page is hidden.
export function useReactionPreviews(
  actionsFor: ((conversation: ChatwootConversation) => WaActions) | null,
  conversations: ChatwootConversation[],
) {
  const [previews, setPreviews] = useState<ReadonlyMap<string, ReactionPreview>>(new Map())
  const asked = useRef(new Set<string>())
  const actionsForRef = useRef(actionsFor)
  useEffect(() => {
    actionsForRef.current = actionsFor
  }, [actionsFor])
  const on = actionsFor !== null

  // The reaction's id, and the chat it is in (for the number to ask).
  const candidates = useMemo(() => {
    const byId = new Map<string, ChatwootConversation>()
    for (const conversation of conversations) {
      const last = conversation.last_non_activity_message
      const id = waIdOf(last?.source_id)
      if (id && mayBeReaction(last)) {
        byId.set(id, conversation)
      }
    }
    return [...byId.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [conversations])
  const key = candidates.map(([id]) => id).join(',')

  useEffect(() => {
    const actionsOf = actionsForRef.current
    if (!on || !actionsOf) {
      return
    }
    const fresh = candidates.filter(([id]) => !asked.current.has(id))
    if (fresh.length === 0) {
      return
    }
    fresh.forEach(([id]) => asked.current.add(id))
    Promise.all(
      fresh.map(([id, conversation]) =>
        actionsOf(conversation)
          .reactionPreview(id)
          .then((preview) => [id, preview] as const)
          .catch(() => {
            // Not answered (WhatsApp unreachable): ask again at the next change.
            asked.current.delete(id)
            return [id, null] as const
          }),
      ),
    ).then((answers) => {
      setPreviews((current) => {
        const next = new Map(current)
        answers.forEach(([id, preview]) => preview && next.set(id, preview))
        return next.size === current.size ? current : next
      })
    })
    // The ids are in key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, key])

  return previews
}
