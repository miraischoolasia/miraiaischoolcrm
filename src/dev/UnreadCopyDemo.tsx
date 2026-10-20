import { useMemo, useRef, useState } from 'react'
import { useWhatsAppUnread } from '../hooks/useWhatsAppUnread'
import type { InboxCopyLive } from '../hooks/useInboxCopyLive'
import type { ChatwootClient } from '../lib/chatwootClient'
import type { ChatwootConversation } from '../lib/whatsappInbox'
import { supabase } from '../lib/supabase'

// Only the dev server shows this (/?demo=unreadcopy): the menu badge's real hook on 300 made-up open chats held in the
// page as "the copy", with its live line. The buttons stand for what the live copy reports (a parent writes, a chat is
// read, a chat is marked Done); the counter shows how often Chatwoot's list was asked (it used to be every page every
// 10 seconds from every tab). No login, no database, nothing sent.

const now = Math.floor(Date.now() / 1000)
function chat(id: number, unread: number): ChatwootConversation {
  return {
    id,
    inbox_id: 3,
    status: 'open',
    unread_count: unread,
    waiting_since: 0,
    timestamp: now - id * 60,
    last_activity_at: now - id * 60,
    meta: { channel: 'Channel::Api', sender: { id: 9000 + id, name: `Parent ${id}`, phone_number: `+6012000${String(id).padStart(4, '0')}`, identifier: null } },
  } as ChatwootConversation
}

const start = Array.from({ length: 300 }, (_, index) => chat(index + 1, index % 7 === 0 ? 1 : 0))

// The copy, held in the page: the hook reads it whole once, then hears of each change.
let rows = new Map(start.map((entry) => [entry.id, entry]))
if (supabase) {
  const client = supabase as unknown as { from: unknown }
  const query = () => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      not: () => builder,
      order: () => builder,
      range: () => builder,
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        resolve({
          data: [...rows.values()].filter((entry) => entry.status === 'open').map((entry) => ({ conversation_id: entry.id, raw: entry, last_message_raw: null })),
          error: null,
        }),
    }
    return builder
  }
  client.from = query
}

export function UnreadCopyDemo() {
  const listeners = useRef(new Set<(conversation: ChatwootConversation) => void>())
  const [chatwootCalls, setChatwootCalls] = useState(0)
  const client = useMemo(
    () =>
      ({
        listConversations: async () => {
          setChatwootCalls((count) => count + 1)
          return { conversations: [...rows.values()].filter((entry) => entry.status === 'open').slice(0, 25), totalCount: rows.size }
        },
      }) as unknown as ChatwootClient,
    [],
  )
  const copy = useMemo<InboxCopyLive>(
    () => ({
      available: true,
      live: true,
      subscribeChats: (listener) => {
        listeners.current.add(listener)
        return () => listeners.current.delete(listener)
      },
      watchMessages: () => () => undefined,
    }),
    [],
  )
  const { unread, openChats } = useWhatsAppUnread(client, null, undefined, copy)

  function change(conversation: ChatwootConversation) {
    rows = new Map(rows).set(conversation.id, conversation)
    listeners.current.forEach((listener) => listener(conversation))
  }
  const quiet = [...rows.values()].find((entry) => entry.status === 'open' && entry.unread_count === 0)
  const unreadOne = [...rows.values()].find((entry) => entry.status === 'open' && entry.unread_count > 0)

  return (
    <div className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-semibold text-slate-900">Menu badge from the inbox copy</h1>
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <span className="text-sm font-semibold text-slate-700">Inbox</span>
        <span aria-label="Unread chats" className="rounded-full bg-[#fc0c97] px-2.5 py-0.5 text-sm font-bold text-white">
          {unread}
        </span>
        <span className="ml-auto text-sm text-slate-600" aria-label="Open chats">
          {openChats.length} open chats
        </span>
      </div>
      <p className="text-sm text-slate-600" aria-label="Chatwoot list requests">
        Chatwoot's list was asked <strong>{chatwootCalls}</strong> times (one tab of this browser, at most once a minute).
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-xl bg-[#fc0c97] px-3 py-2 text-sm font-semibold text-white"
          onClick={() => quiet && change({ ...quiet, unread_count: 1, last_activity_at: Math.floor(Date.now() / 1000) })}
        >
          A parent writes
        </button>
        <button
          type="button"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
          onClick={() => unreadOne && change({ ...unreadOne, unread_count: 0 })}
        >
          A chat is read
        </button>
        <button
          type="button"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
          onClick={() => unreadOne && change({ ...unreadOne, status: 'resolved' })}
        >
          A chat is marked Done
        </button>
      </div>
    </div>
  )
}
