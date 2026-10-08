import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from 'react'
import type { VariableValues } from '../../lib/quickReplies'
import { ArrowCounterClockwise, CaretDown, CaretLeft, CheckCircle, EnvelopeSimple, Info } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import type { Sender } from '../../lib/chatwootClient'
import type { SendInput } from '../../hooks/useWhatsAppInbox'
import {
  formatDayLabel,
  getChatIdentity,
  getInitials,
  getOwner,
  getSenderLabel,
  type ChatwootConversation,
  type ChatwootMessage,
} from '../../lib/whatsappInbox'
import { parentTone, staffTone } from '../../lib/avatarTone'
import { Avatar } from './Avatar'
import { Composer } from './Composer'
import { MessageBubble, type BubbleAvatar } from './MessageBubble'

type ChatPanelProps = {
  conversation: ChatwootConversation
  // The parent's name on the lead this chat belongs to, used when WhatsApp gave no name.
  leadName?: string | null
  messages: ChatwootMessage[]
  // Messages still waiting their turn on this computer.
  waitingMessages: ChatwootMessage[]
  hasOlder: boolean
  staff: Sender[]
  actionError: string | null
  className?: string
  onBack: () => void
  // Opens the side panel; only shown where the panel is not already beside the chat.
  onOpenDetails: () => void
  onLoadOlder: () => void
  onSend: (input: SendInput) => Promise<boolean>
  onDismissUnsent: (tempId: number) => void
  onSetOwner: (owner: Sender | null) => void
  onSetStatus: (status: 'open' | 'resolved') => void
  // Puts the chat back as not opened yet and closes it.
  onMarkUnread: () => void
  quickReplies: ComponentProps<typeof Composer>['quickReplies']
  quickReplyValues: VariableValues
  onManageQuickReplies?: () => void
}

export function ChatPanel({
  conversation,
  leadName,
  messages,
  waitingMessages,
  hasOlder,
  staff,
  actionError,
  className,
  onBack,
  onOpenDetails,
  onLoadOlder,
  onSend,
  onDismissUnsent,
  onSetOwner,
  onSetStatus,
  onMarkUnread,
  quickReplies,
  quickReplyValues,
  onManageQuickReplies,
}: ChatPanelProps) {
  const identity = getChatIdentity(conversation.meta.sender, leadName)
  const owner = getOwner(conversation)
  const done = conversation.status === 'resolved'
  const scroller = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const lastConversation = useRef<number | null>(null)
  // Ticks so a message that waits too long for WhatsApp gets a warning.
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000))

  useEffect(() => {
    const timer = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 10_000)
    return () => window.clearInterval(timer)
  }, [])

  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) {
      return
    }
    const changedChat = lastConversation.current !== conversation.id
    if (changedChat || stickToBottom.current) {
      element.scrollTop = element.scrollHeight
    }
    if (messages.length > 0) {
      lastConversation.current = conversation.id
    }
  }, [conversation.id, messages, waitingMessages])

  useEffect(() => {
    stickToBottom.current = true
  }, [conversation.id])

  let lastDay = ''
  let lastRun = ''

  function avatarFor(message: ChatwootMessage): BubbleAvatar | null {
    if (message.message_type === 0) {
      return { initials: identity.initials, tone: parentTone }
    }
    if (message.message_type === 1) {
      const name = getSenderLabel(message) ?? 'Us'
      return { initials: getInitials(name), tone: staffTone(name) }
    }
    return null
  }

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-col bg-slate-50', className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-pink-100 bg-pink-50 px-3 py-3 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to all chats"
          className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden"
        >
          <CaretLeft size={20} />
        </button>
        <Avatar initials={identity.initials} tone={parentTone} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">{identity.title}</div>
          <div className={cn('truncate text-xs', identity.hasRealPhone ? 'text-slate-500' : 'text-amber-700')}>
            {identity.subtitle}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenDetails}
          aria-label="Lead and student details"
          title="Lead and student details"
          className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 xl:hidden"
        >
          <Info size={16} />
        </button>
        <label className="relative">
          <span className="sr-only">Handled by</span>
          <select
            value={owner?.id ?? ''}
            onChange={(event) => {
              const chosen = staff.find((person) => String(person.id) === event.target.value)
              onSetOwner(chosen ?? null)
            }}
            className="max-w-[170px] appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-2.5 pr-7 text-xs text-slate-700 outline-none focus:border-[#fc0c97]"
          >
            <option value="">Handled by: no one yet</option>
            {owner && !staff.some((person) => person.id === owner.id) && (
              <option value={owner.id}>Handled by: {owner.name}</option>
            )}
            {staff.map((person) => (
              <option key={person.id} value={person.id}>
                Handled by: {person.name}
              </option>
            ))}
          </select>
          <CaretDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" />
        </label>
        {!done && (
          <button
            type="button"
            onClick={onMarkUnread}
            aria-label="Mark as unread"
            title="Mark as unread, for a chat you opened by mistake"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <EnvelopeSimple size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Mark as unread</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onSetStatus(done ? 'open' : 'resolved')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {done ? <ArrowCounterClockwise size={14} /> : <CheckCircle size={14} />}
          {done ? 'Reopen' : 'Mark as done'}
        </button>
      </div>

      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget
          stickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4"
      >
        {hasOlder && (
          <div className="mb-3 text-center">
            <button
              type="button"
              onClick={onLoadOlder}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Load earlier messages
            </button>
          </div>
        )}
        {[...messages, ...waitingMessages].map((message) => {
          if (message.content_attributes?.deleted) {
            return null
          }
          const day = formatDayLabel(message.created_at)
          const showDay = day !== lastDay
          lastDay = day
          const avatar = avatarFor(message)
          // A new picture whenever the person who is writing changes.
          const run = avatar ? `${message.message_type}:${getSenderLabel(message) ?? ''}` : ''
          const showAvatar = showDay || run !== lastRun
          if (avatar) {
            lastRun = run
          }
          return (
            <div key={message.id}>
              {showDay && (
                <div className="my-3 text-center">
                  <span className="rounded-full bg-slate-200/70 px-3 py-0.5 text-[11px] font-medium text-slate-600">{day}</span>
                </div>
              )}
              <MessageBubble
                message={message}
                avatar={avatar}
                showAvatar={showAvatar}
                nowSeconds={nowSeconds}
                onDismiss={message.local ? () => onDismissUnsent(-message.id) : undefined}
              />
            </div>
          )
        })}
      </div>

      {actionError && (
        <p role="alert" className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
          {actionError}
        </p>
      )}
      <Composer
        key={conversation.id}
        onSend={onSend}
        quickReplies={quickReplies}
        variables={quickReplyValues}
        onManageQuickReplies={onManageQuickReplies}
      />
    </div>
  )
}
