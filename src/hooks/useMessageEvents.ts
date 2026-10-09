import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChatwootClient, Sender } from '../lib/chatwootClient'
import { describeSent } from '../lib/specialMessages'
import type { ChatwootMessage } from '../lib/whatsappInbox'
import { NO_EVENTS, waIdOf, type MessageEvents, type Reaction, type SpecialMessage, type WaActions, type WaLabel } from '../lib/waActions'

const REFRESH_MS = 6_000

// What the open chat has seen since the messages were sent (reactions, edited and deleted messages),
// and the team's own reactions, edits and deletes. WhatsApp keeps these apart from the messages.
export function useMessageEvents(
  actions: WaActions | null,
  client: Pick<ChatwootClient, 'deleteMessage' | 'addSentMessage'>,
  sender: Sender,
  conversationId: number | null,
  messages: ChatwootMessage[],
  active: boolean,
) {
  const [fetched, setFetched] = useState<{ conversationId: number | null; events: MessageEvents; labels: WaLabel[] }>({
    conversationId: null,
    events: NO_EVENTS,
    labels: [],
  })
  // Our own changes, shown at once and kept for as long as the chat is open.
  const [mine, setMine] = useState<{ conversationId: number | null; reactions: Map<string, string>; edits: Map<string, string>; deleted: Set<string> }>(
    { conversationId: null, reactions: new Map(), edits: new Map(), deleted: new Set() },
  )
  const [error, setError] = useState<string | null>(null)

  // The newest message from each side tells which WhatsApp chats this one is made of.
  const seeds = useMemo(() => {
    const newest = (type: number) =>
      [...messages].reverse().find((message) => message.message_type === type && waIdOf(message.source_id))
    return [newest(0), newest(1)].flatMap((message) => waIdOf(message?.source_id) ?? [])
  }, [messages])
  const seedKey = seeds.join(',')

  const refresh = useCallback(async () => {
    if (!actions || conversationId === null || seeds.length === 0) {
      return
    }
    try {
      const keys = await Promise.all(seeds.map((seed) => actions.keyOf(seed)))
      const jids = [...new Set(keys.flatMap((key) => key?.remoteJid ?? []))]
      const events = jids.length > 0 ? await actions.events(jids) : NO_EVENTS
      // Labels are a bonus: not having them must not hide the reactions.
      const labels = jids.length > 0 ? await actions.labelsOf(jids).catch(() => []) : []
      setFetched({ conversationId, events, labels })
    } catch {
      // The messages themselves are fine without this; try again at the next tick.
    }
    // The seeds are in seedKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, conversationId, seedKey])

  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    if (!actions || conversationId === null || !active) {
      return
    }
    // Not asked again while the last answer is still awaited, so a slow server is not buried in requests.
    let busy = false
    const ask = () => {
      if (busy) {
        return
      }
      busy = true
      void refreshRef.current().finally(() => {
        busy = false
      })
    }
    ask()
    const timer = window.setInterval(() => {
      if (!document.hidden) {
        ask()
      }
    }, REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [actions, conversationId, seedKey, active])

  const current = fetched.conversationId === conversationId ? fetched.events : NO_EVENTS
  const labels = fetched.conversationId === conversationId ? fetched.labels : []
  const own = mine.conversationId === conversationId ? mine : null

  const events = useMemo<MessageEvents>(() => {
    if (!own) {
      return current
    }
    const reactions = new Map<string, Reaction[]>(current.reactions)
    for (const [target, emoji] of own.reactions) {
      const others = (reactions.get(target) ?? []).filter((reaction) => !reaction.byUs)
      reactions.set(target, emoji ? [...others, { emoji, byUs: true }] : others)
    }
    return {
      reactions,
      edits: new Map([...current.edits, ...own.edits]),
      texts: current.texts,
      reactionIds: current.reactionIds,
      deleted: new Set([...current.deleted, ...own.deleted]),
    }
  }, [current, own])

  function remember(change: (draft: NonNullable<typeof own>) => void) {
    setMine((previous) => {
      const base =
        previous.conversationId === conversationId
          ? previous
          : { conversationId, reactions: new Map<string, string>(), edits: new Map<string, string>(), deleted: new Set<string>() }
      const next = { ...base, reactions: new Map(base.reactions), edits: new Map(base.edits), deleted: new Set(base.deleted) }
      change(next)
      return next
    })
  }

  async function run(work: () => Promise<void>, fallback: string) {
    setError(null)
    try {
      await work()
      return true
    } catch {
      setError(fallback)
      return false
    }
  }

  return {
    events,
    labels,
    error,
    clearError: () => setError(null),

    // Null when it went out, otherwise what to tell the person.
    sendSpecial: async (message: SpecialMessage) => {
      const anchor = seeds[0]
      if (!actions || !anchor) {
        return 'This chat has no WhatsApp message yet, so there is nothing to send into. Send a text first.'
      }
      try {
        const whatsappId = await actions.sendSpecial(anchor, message)
        // WhatsApp does not hand this kind of message to the chat by itself, so it is added here.
        if (whatsappId && conversationId !== null) {
          await client
            .addSentMessage(conversationId, {
              content: message.kind === 'sticker' ? '' : describeSent(message),
              whatsappId,
              sender,
              file: message.kind === 'sticker' ? message.file : undefined,
            })
            .catch(() => undefined)
        }
        return null
      } catch {
        return "Couldn't send it. Check the WhatsApp connection and try again."
      }
    },

    react: (waId: string, emoji: string) =>
      run(async () => {
        await actions?.react(waId, emoji)
        remember((draft) => draft.reactions.set(waId, emoji))
      }, "Couldn't send the reaction. Try again."),

    edit: (waId: string, text: string) =>
      run(async () => {
        await actions?.edit(waId, text)
        remember((draft) => draft.edits.set(waId, text))
      }, "Couldn't change the message. WhatsApp only allows it for 15 minutes after sending."),

    remove: (waId: string, messageId: number) =>
      run(async () => {
        await actions?.deleteForEveryone(waId)
        remember((draft) => draft.deleted.add(waId))
        if (conversationId !== null) {
          await client.deleteMessage(conversationId, messageId).catch(() => undefined)
        }
      }, "Couldn't delete the message for everyone. WhatsApp only allows it for a limited time."),
  }
}
