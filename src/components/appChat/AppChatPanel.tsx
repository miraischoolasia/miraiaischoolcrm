import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChatCircleDots, Eye, MagnifyingGlass, PaperPlaneRight } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import {
  APP_CHAT_MAX_LENGTH,
  appChatRoleLabel,
  appChatSeenByStudent,
  appChatStudentLabel,
  fetchAppChatMessages,
  filterAppChatThreads,
  markAppChatRead,
  mergeAppChatMessages,
  replyAppChat,
  type AppChatMessage,
  type AppChatThread,
} from '../../lib/appChat'
import { supabase } from '../../lib/supabase'
import type { AppChatState } from '../../hooks/useAppChat'

function timeLabel(iso: string, now = new Date()) {
  const at = new Date(iso)
  const sameDay = at.toDateString() === now.toDateString()
  return sameDay
    ? at.toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit' })
    : at.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })
}

// Students > Student Chat (a page of its own; it can also sit inside another page as a tab): messages students
// send from the student app. The list
// on the left (student code · name, to whom, last line, unread), the thread on
// the right with the answer box. An admin sees every thread but answers only
// the ones written to them; the others are read only, marked "Viewing".
// `active` is false while the page sits behind another one: nothing is marked read then.
export function AppChatPanel({ chat, isAdmin, active = true }: { chat: AppChatState; isAdmin: boolean; active?: boolean }) {
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const shown = filterAppChatThreads(chat.threads, query, onlyMine)
  const picked = chat.threads.find((thread) => thread.thread_id === pickedId) ?? null

  if (!chat.on) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">
        Student app chat is off. An admin can turn it on in Class Settings › Student app.
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <aside className={cn('flex w-full min-w-0 flex-col border-r border-slate-200 md:w-80 md:shrink-0', picked && 'hidden md:flex')}>
        <div className="space-y-2 border-b border-slate-100 p-3">
          <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm">
            <MagnifyingGlass className="h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search student or teacher"
              className="min-w-0 flex-1 bg-transparent outline-none"
            />
          </label>
          {isAdmin && (
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <input type="checkbox" checked={onlyMine} onChange={(event) => setOnlyMine(event.target.checked)} />
              Only chats written to me
            </label>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!chat.loaded && <p className="p-4 text-sm text-slate-500">Loading…</p>}
          {chat.loaded && shown.length === 0 && (
            <p className="p-4 text-sm text-slate-500">{chat.threads.length === 0 ? 'No messages from the student app yet.' : 'No chat matches.'}</p>
          )}
          {shown.map((thread) => (
            <ThreadRow key={thread.thread_id} thread={thread} picked={thread.thread_id === pickedId} onPick={() => setPickedId(thread.thread_id)} />
          ))}
        </div>
      </aside>
      <section className={cn('min-w-0 flex-1', !picked && 'hidden md:block')}>
        {picked ? (
          <ThreadView key={picked.thread_id} thread={picked} active={active} onBack={() => setPickedId(null)} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-slate-500">
            <ChatCircleDots className="h-10 w-10 text-slate-300" />
            Pick a chat on the left.
          </div>
        )}
      </section>
    </div>
  )
}

function ThreadRow({ thread, picked, onPick }: { thread: AppChatThread; picked: boolean; onPick: () => void }) {
  const unread = thread.mine ? thread.unread_for_staff : 0
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn('flex w-full items-start gap-3 border-b border-slate-100 px-3 py-3 text-left transition hover:bg-slate-50', picked && 'bg-slate-100')}
    >
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">
        {thread.student_name.slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn('truncate text-sm', unread > 0 ? 'font-bold text-slate-900' : 'font-semibold text-slate-800')}>
            {appChatStudentLabel(thread)}
          </span>
          <span className="ml-auto shrink-0 text-[11px] text-slate-400">{timeLabel(thread.last_message_at)}</span>
        </span>
        <span className="block truncate text-xs text-slate-500">
          To {thread.mine ? 'you' : thread.staff_name} · {appChatRoleLabel(thread.role)}
        </span>
        <span className={cn('block truncate text-xs', unread > 0 ? 'font-semibold text-slate-800' : 'text-slate-500')}>
          {thread.last_sender === 'staff' ? 'Reply: ' : ''}
          {thread.last_preview}
        </span>
      </span>
      {unread > 0 && (
        <span className="mt-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  )
}

function ThreadView({ thread, active, onBack }: { thread: AppChatThread; active: boolean; onBack: () => void }) {
  const [messages, setMessages] = useState<AppChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottom = useRef<HTMLDivElement | null>(null)
  const threadId = thread.thread_id

  useEffect(() => {
    let alive = true
    fetchAppChatMessages(threadId)
      .then((rows) => {
        if (!alive) return
        setMessages(rows)
        setLoading(false)
      })
      .catch((reason: Error) => {
        if (!alive) return
        setError(reason.message)
        setLoading(false)
      })
    if (!supabase) return () => void (alive = false)
    const client = supabase
    const channel = client
      .channel(`app-chat-thread-${threadId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'app_chat_messages', filter: `thread_id=eq.${threadId}` }, (change) => {
        setMessages((current) => mergeAppChatMessages(current, [change.new as AppChatMessage]))
      })
      .subscribe()
    return () => {
      alive = false
      void client.removeChannel(channel)
    }
  }, [threadId])

  // Opening a thread written to me reads it (an admin only looking does not).
  useEffect(() => {
    if (active && thread.mine && thread.unread_for_staff > 0) void markAppChatRead(threadId)
  }, [active, thread.mine, thread.unread_for_staff, threadId])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  async function send() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setError(null)
    try {
      await replyAppChat(threadId, text)
      setDraft('')
      setMessages(await fetchAppChatMessages(threadId))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send. Try again.')
    } finally {
      setSending(false)
    }
  }

  const tooLong = draft.length > APP_CHAT_MAX_LENGTH
  const read = appChatSeenByStudent(thread, messages)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <button type="button" onClick={onBack} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Back to chats">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-900">{appChatStudentLabel(thread)}</p>
          <p className="truncate text-xs text-slate-500">
            Student app · to {thread.mine ? 'you' : thread.staff_name} ({appChatRoleLabel(thread.role)})
          </p>
        </div>
        {!thread.mine && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
            <Eye className="h-3.5 w-3.5" /> Viewing
          </span>
        )}
      </header>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-slate-50 px-4 py-4">
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        {messages.map((message) => {
          const fromStaff = message.sender === 'staff'
          return (
            <div key={message.id} className={cn('flex', fromStaff ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm',
                  fromStaff ? 'rounded-br-md bg-indigo-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800',
                )}
              >
                {message.body}
                <span className={cn('mt-1 block text-right text-[10px]', fromStaff ? 'text-indigo-100' : 'text-slate-400')}>
                  {timeLabel(message.created_at)}
                </span>
              </div>
            </div>
          )
        })}
        {read && <p className="text-right text-[11px] text-slate-400">Read</p>}
        <div ref={bottom} />
      </div>
      {error && <p className="px-4 py-1 text-xs text-rose-600">{error}</p>}
      {thread.mine ? (
        <div className="flex items-end gap-2 border-t border-slate-200 p-3">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
            rows={1}
            placeholder={`Reply to ${thread.student_name}`}
            className="max-h-36 min-h-10 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!draft.trim() || sending || tooLong}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            <PaperPlaneRight className="h-4 w-4" /> Send
          </button>
        </div>
      ) : (
        <p className="border-t border-slate-200 p-3 text-center text-xs text-slate-500">
          Only {thread.staff_name} can answer this chat. Admins can read it to keep students safe.
        </p>
      )}
    </div>
  )
}
