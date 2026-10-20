import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { conversationFromCopy, fillMissingCopyChats, messageFromCopy } from '../lib/inboxCopyReader'
import type { ChatwootClient } from '../lib/chatwootClient'
import type { ChatwootConversation, ChatwootMessage } from '../lib/whatsappInbox'

// The live line to the CRM's copy of the inbox. While it is connected the Inbox page reads chats and messages from
// the copy and hears about new ones the moment the copy has them, instead of asking Chatwoot every few seconds.
// Not set up in this database, not connected, or the tab hidden for a minute: `live` is false and the page asks
// Chatwoot as it always did.

// Hidden this long: the connection is closed (a phone in a pocket does not keep reconnecting); it opens again the
// moment the tab is looked at.
export const HIDDEN_DISCONNECT_MS = 60_000
// The copy is used once at most this share of its chats lacks Chatwoot's own shape (a chat or two always may).
const MISSING_ALLOWED = 0.02
// One browser fills the missing chats at a time, and tries again at most this often (another tab, a reload).
const FILL_LOCK_KEY = 'crm-inbox-copy-fill'
const FILL_AGAIN_MS = 15 * 60_000

// This tab may fill the copy now (no other tab of this browser did in the last quarter hour); claims it if so.
function claimFill() {
  try {
    const last = Number(window.localStorage.getItem(FILL_LOCK_KEY) ?? 0)
    if (Date.now() - last < FILL_AGAIN_MS) {
      return false
    }
    window.localStorage.setItem(FILL_LOCK_KEY, String(Date.now()))
    return true
  } catch {
    return false
  }
}

type Channel = ReturnType<NonNullable<typeof supabase>['channel']>
type ChatListener = (conversation: ChatwootConversation) => void
type MessageListener = (conversationId: number, message: ChatwootMessage) => void

export type InboxCopyLive = {
  // The copy's tables are in this database and readable.
  available: boolean
  // Available and connected: read from the copy, no need to ask Chatwoot every few seconds.
  live: boolean
  // Every change to a chat of the copy (a new message, status, owner), as Chatwoot's API shape.
  subscribeChats: (listener: ChatListener) => () => void
  // New and changed messages of these chats; returns the way to stop.
  watchMessages: (conversationIds: number[], listener: MessageListener) => () => void
}

let channelCount = 0

// client: with it, chats the copy has without Chatwoot's shape are filled from Chatwoot's list once (2026-10-20: most
// chats lacked it, so the copy was never used and every tab kept reading every page of Chatwoot's list).
export function useInboxCopyLive(enabled: boolean, client: ChatwootClient | null = null): InboxCopyLive {
  const [available, setAvailable] = useState(false)
  const [checks, setChecks] = useState(0)
  const [connected, setConnected] = useState(false)
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || !document.hidden)
  const chatListeners = useRef(new Set<ChatListener>())

  // Is the copy there, and complete? Two tiny reads when the page opens. A copy made before it kept Chatwoot's
  // own shape (raw) is not used until "Copy old chats" has read those chats again: the page would miss them.
  useEffect(() => {
    if (!enabled || !supabase) {
      setAvailable(false)
      return
    }
    let cancelled = false
    const chats = supabase.from('inbox_chats')
    Promise.all([
      chats.select('conversation_id', { head: true, count: 'exact' }),
      supabase.from('inbox_chats').select('conversation_id', { head: true, count: 'exact' }).is('raw', null),
    ])
      .then(([all, missing]) => {
        if (cancelled) {
          return
        }
        const total = all.count ?? 0
        const usable = !all.error && !missing.error && total > 0 && (missing.count ?? total) <= total * MISSING_ALLOWED
        setAvailable(usable)
        // Too many chats without their shape: fill them from Chatwoot's list (one browser at a time), then look again.
        if (!usable && client && !all.error && !missing.error && total > 0 && checks < 2 && claimFill()) {
          void fillMissingCopyChats(client, () => cancelled)
            .catch(() => undefined)
            .then(() => {
              if (!cancelled) {
                setChecks((count) => count + 1)
              }
            })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAvailable(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [enabled, client, checks])

  // Hidden for a minute: let go of the connection; looked at again: connect again.
  useEffect(() => {
    let timer: number | null = null
    const onChange = () => {
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
      if (document.hidden) {
        timer = window.setTimeout(() => setVisible(false), HIDDEN_DISCONNECT_MS)
      } else {
        setVisible(true)
      }
    }
    document.addEventListener('visibilitychange', onChange)
    return () => {
      document.removeEventListener('visibilitychange', onChange)
      if (timer !== null) {
        window.clearTimeout(timer)
      }
    }
  }, [])

  useEffect(() => {
    if (!enabled || !available || !visible || !supabase) {
      setConnected(false)
      return
    }
    const client = supabase
    channelCount += 1
    const channel: Channel = client
      .channel(`inbox-copy-chats-${channelCount}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbox_chats' }, (change) => {
        const row = change.new as { raw?: unknown; last_message_raw?: unknown } | null
        const conversation = row ? conversationFromCopy(row.raw, row.last_message_raw) : null
        if (conversation) {
          chatListeners.current.forEach((listener) => listener(conversation))
        }
      })
      .subscribe((status) => {
        setConnected(status === 'SUBSCRIBED')
      })
    return () => {
      setConnected(false)
      void client.removeChannel(channel)
    }
  }, [enabled, available, visible])

  const subscribeChats = useCallback((listener: ChatListener) => {
    chatListeners.current.add(listener)
    return () => {
      chatListeners.current.delete(listener)
    }
  }, [])

  const live = enabled && available && connected

  const watchMessages = useCallback(
    (conversationIds: number[], listener: MessageListener) => {
      if (!live || !supabase || conversationIds.length === 0) {
        return () => {}
      }
      const client = supabase
      channelCount += 1
      const channel = client
        .channel(`inbox-copy-messages-${channelCount}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'inbox_messages', filter: `conversation_id=in.(${conversationIds.join(',')})` },
          (change) => {
            const row = change.new as { conversation_id?: number; raw?: unknown } | null
            const message = row ? messageFromCopy(row.raw) : null
            if (row?.conversation_id !== undefined && message) {
              listener(row.conversation_id, message)
            }
          },
        )
        .subscribe()
      return () => {
        void client.removeChannel(channel)
      }
    },
    [live],
  )

  return useMemo(() => ({ available, live, subscribeChats, watchMessages }), [available, live, subscribeChats, watchMessages])
}
