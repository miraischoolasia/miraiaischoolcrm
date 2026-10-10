import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from 'react'
import type { VariableValues } from '../../lib/quickReplies'
import { ArrowCounterClockwise, CaretDown, CaretLeft, CheckCircle, EnvelopeSimple, Info, PushPin, UserCircle } from '@phosphor-icons/react'
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
import type { Draft } from '../../lib/draft'
import { Avatar } from './Avatar'
import { Composer } from './Composer'
import { MessageBubble, type BubbleAvatar, type BubbleExtras } from './MessageBubble'
import { summarizeMessage } from '../../lib/specialMessages'
import { NO_EVENTS, waIdOf, type MessageEvents, type SpecialMessage } from '../../lib/waActions'
import { isEditCopy, withoutEditHeading } from '../../lib/editCopy'
import { isCheckingReaction } from '../../lib/reactionPreview'

type ChatPanelProps = {
  conversation: ChatwootConversation
  // The parent's name on the lead this chat belongs to, used when WhatsApp gave no name.
  leadName?: string | null
  messages: ChatwootMessage[]
  // Messages still waiting their turn on this computer.
  waitingMessages: ChatwootMessage[]
  hasOlder: boolean
  staff: Sender[]
  // Who looks after the chat when that is more than what the chat itself says (the lead's person in charge).
  handledBy?: { id: number; name: string } | null
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
  // Text written for the message box by the enrol steps.
  draftRequest?: { id: number; text: string } | null
  // Opens the lead's full page; only for a chat that belongs to a lead.
  onOpenLead?: () => void
  // What is left unsent in this chat's message box, and where changes to it are reported.
  draft?: Draft | null
  onDraftChange?: (draft: Draft | null) => void
  // What happened to the messages on WhatsApp (reactions, edits, deletes), and what the team can do about it.
  messageEvents?: MessageEvents
  onReact?: (message: ChatwootMessage, emoji: string) => void
  onEditMessage?: (message: ChatwootMessage, text: string) => Promise<boolean>
  onDeleteMessage?: (message: ChatwootMessage) => Promise<boolean>
  onSendSpecial?: (message: SpecialMessage) => Promise<string | null>
  // Shows the parent we are typing; called as the team writes a reply.
  onTyping?: () => void
  // Pinned chats stay at the top of the list, for the whole team.
  pinned?: boolean
  onTogglePin?: () => void
  // Starred messages of this chat (by Chatwoot id); the team shares them.
  starredIds?: number[]
  onToggleStar?: (message: ChatwootMessage) => void
  onForward?: (message: ChatwootMessage) => void
}

// The round icon buttons at the top of a chat.
const HEADER_ICON_BUTTON =
  'inline-flex h-9 w-9 items-center justify-center rounded-full border border-pink-200/80 bg-white text-slate-600 shadow-sm transition hover:border-pink-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fc0c97]/40'

const EDIT_WINDOW_SECONDS = 15 * 60
const DELETE_WINDOW_SECONDS = 48 * 3600

// The ways the two sides may write the same text (bold marks, spaces) are not an edit.
const plain = (text: string) => text.replace(/[*_~`\s]/g, '')

// The text WhatsApp holds now, when it is not what the message was first shown as.
function changedText(message: ChatwootMessage, current: string | undefined) {
  const shown = message.content ?? ''
  return current !== undefined && current.trim() !== '' && plain(current) !== plain(shown) ? current : null
}

// One short line standing for a message, such as in a quote.
function describeMessage(message: ChatwootMessage) {
  const text = summarizeMessage(message.content)
  if (text) {
    return text
  }
  const kind = message.attachments?.[0]?.file_type
  return kind === 'image' ? 'Photo' : kind === 'video' ? 'Video' : kind === 'audio' ? 'Voice message' : kind ? 'File' : ''
}

export function ChatPanel({
  conversation,
  leadName,
  messages,
  waitingMessages,
  hasOlder,
  staff,
  handledBy,
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
  draftRequest,
  onOpenLead,
  draft,
  onDraftChange,
  messageEvents = NO_EVENTS,
  onReact,
  onEditMessage,
  onDeleteMessage,
  onSendSpecial,
  onTyping,
  pinned = false,
  onTogglePin,
  starredIds = [],
  onToggleStar,
  onForward,
}: ChatPanelProps) {
  const identity = getChatIdentity(conversation.meta.sender, leadName)
  const owner = handledBy ?? getOwner(conversation)
  const done = conversation.status === 'resolved'
  // The message the next one will answer (quote).
  const [replyTo, setReplyTo] = useState<{ conversationId: number; message: ChatwootMessage } | null>(null)
  const replying = replyTo?.conversationId === conversation.id ? replyTo.message : null
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

  const byId = new Map(messages.map((entry) => [entry.id, entry]))
  // The copy Evolution writes when a message is edited is hidden while the edited message itself is here.
  const idsOfOriginals = new Set(
    messages.flatMap((entry) => (waIdOf(entry.source_id) && !isEditCopy(entry.content) ? [waIdOf(entry.source_id) as string] : [])),
  )
  const byWaId = new Map(
    messages.flatMap((entry) =>
      waIdOf(entry.source_id) && !isEditCopy(entry.content) ? [[waIdOf(entry.source_id) as string, entry] as const] : [],
    ),
  )

  function authorOf(message: ChatwootMessage) {
    return message.message_type === 1 ? (getSenderLabel(message) ?? 'You') : identity.title
  }

  function extrasFor(message: ChatwootMessage): BubbleExtras {
    const waId = waIdOf(message.source_id)
    const attributes = message.content_attributes
    const quoted =
      (attributes?.in_reply_to ? byId.get(attributes.in_reply_to) : undefined) ??
      (attributes?.in_reply_to_external_id ? byWaId.get(attributes.in_reply_to_external_id) : undefined)
    const ours = message.message_type === 1 && !message.private && !message.local && waId !== null
    const age = nowSeconds - message.created_at
    return {
      quote: quoted ? { author: authorOf(quoted), text: describeMessage(quoted) } : null,
      reactions: waId ? messageEvents.reactions.get(waId) : undefined,
      editedText: waId ? changedText(message, messageEvents.edits.get(waId) ?? messageEvents.texts.get(waId)) : null,
      deletedForEveryone: waId ? messageEvents.deleted.has(waId) : false,
      canEdit: ours && !message.attachments?.length && Boolean(message.content?.trim()) && age < EDIT_WINDOW_SECONDS,
      canDelete: ours && age < DELETE_WINDOW_SECONDS,
      starred: starredIds.includes(message.id),
    }
  }

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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-pink-100 bg-pink-50 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to all chats"
          className="rounded-lg p-1.5 text-slate-600 hover:bg-pink-100 lg:hidden"
        >
          <CaretLeft size={20} />
        </button>
        {/* The name and picture open the lead's full page, when the chat belongs to a lead. */}
        <button
          type="button"
          disabled={!onOpenLead}
          onClick={onOpenLead}
          title={onOpenLead ? 'Open the full lead' : undefined}
          aria-label={onOpenLead ? `Open the full lead of ${identity.title}` : undefined}
          className={cn(
            'flex min-w-[170px] flex-1 items-center gap-2.5 rounded-xl text-left',
            onOpenLead ? '-m-1 cursor-pointer p-1 hover:bg-pink-100' : 'cursor-default',
          )}
        >
          <Avatar initials={identity.initials} tone={parentTone} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900">{identity.title}</span>
            <span className={cn('block truncate text-xs', identity.hasRealPhone ? 'text-slate-500' : 'text-amber-700')}>
              {identity.subtitle}
            </span>
          </span>
        </button>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          {/* Who is looking after this chat. The select itself is invisible and covers the pill. */}
          <label className="relative flex h-9 w-[168px] cursor-pointer items-center gap-2 rounded-full border border-pink-200/80 bg-white pl-1.5 pr-3 shadow-sm transition hover:border-pink-300 focus-within:ring-2 focus-within:ring-[#fc0c97]/40">
            {owner ? (
              <Avatar initials={getInitials(owner.name)} tone={staffTone(owner.name)} size="sm" />
            ) : (
              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <UserCircle size={18} />
              </span>
            )}
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400">Handled by</span>
              <span className={cn('block truncate text-[13px] font-medium', owner ? 'text-slate-900' : 'text-slate-500')}>
                {owner?.name ?? 'No one yet'}
              </span>
            </span>
            <CaretDown size={12} aria-hidden="true" className="shrink-0 text-slate-400" />
            <select
              aria-label="Handled by"
              value={owner?.id ?? ''}
              onChange={(event) => {
                const chosen = staff.find((person) => String(person.id) === event.target.value)
                onSetOwner(chosen ?? null)
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              <option value="">No one yet</option>
              {owner && !staff.some((person) => person.id === owner.id) && <option value={owner.id}>{owner.name}</option>}
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenDetails}
              aria-label="Lead and student details"
              title="Lead and student details"
              className={cn(HEADER_ICON_BUTTON, 'xl:hidden')}
            >
              <Info size={16} />
            </button>
            {onTogglePin && (
              <button
                type="button"
                onClick={onTogglePin}
                aria-label={pinned ? 'Unpin this chat' : 'Pin this chat'}
                aria-pressed={pinned}
                title={pinned ? 'Unpin: stop keeping it at the top' : 'Pin: keep it at the top of the list for everyone'}
                className={cn(HEADER_ICON_BUTTON, pinned && 'border-[#fc0c97] text-[#fc0c97] hover:text-[#fc0c97]')}
              >
                <PushPin size={16} weight={pinned ? 'fill' : 'regular'} />
              </button>
            )}
            {!done && (
              <button
                type="button"
                onClick={onMarkUnread}
                aria-label="Mark as unread"
                title="Mark as unread, for a chat you opened by mistake"
                className={HEADER_ICON_BUTTON}
              >
                <EnvelopeSimple size={16} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => onSetStatus(done ? 'open' : 'resolved')}
            title={done ? 'Put this chat back in the open list' : 'Close this chat; it comes back when the parent writes again'}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fc0c97]/40',
              done
                ? 'border border-pink-200/80 bg-white text-slate-700 hover:border-pink-300'
                : 'bg-slate-900 text-white hover:bg-slate-800',
            )}
          >
            {done ? <ArrowCounterClockwise size={15} weight="bold" /> : <CheckCircle size={15} weight="bold" />}
            {done ? 'Reopen' : 'Done'}
          </button>
        </div>
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
          // A reaction is also written into the chat as a message of its own; it already shows on the message it is for.
          const ownWaId = waIdOf(message.source_id)
          if (ownWaId && messageEvents.reactionIds.has(ownWaId)) {
            return null
          }
          // Just arrived and looks like a reaction: wait for WhatsApp to say so before showing it as a message.
          if (isCheckingReaction(message, nowSeconds)) {
            return null
          }
          const isCopyOfEdit = isEditCopy(message.content)
          if (isCopyOfEdit && ownWaId && idsOfOriginals.has(ownWaId)) {
            return null
          }
          // The edited message is not here (it is older): show the new text without the heading.
          const shown = isCopyOfEdit ? { ...message, content: withoutEditHeading(message.content) } : message
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
                message={shown}
                avatar={avatar}
                showAvatar={showAvatar}
                nowSeconds={nowSeconds}
                onDismiss={message.local ? () => onDismissUnsent(-message.id) : undefined}
                extras={extrasFor(message)}
                actions={{
                  onReply: message.local ? undefined : () => setReplyTo({ conversationId: conversation.id, message }),
                  onReact: onReact && waIdOf(message.source_id) ? (emoji) => onReact(message, emoji) : undefined,
                  onEdit: onEditMessage ? (text) => onEditMessage(message, text) : undefined,
                  onDelete: onDeleteMessage ? () => onDeleteMessage(message) : undefined,
                  onStar: onToggleStar && !message.local ? () => onToggleStar(message) : undefined,
                  onForward: onForward && !message.local && !message.private ? () => onForward(message) : undefined,
                }}
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
        draftRequest={draftRequest}
        draft={draft}
        onDraftChange={onDraftChange}
        replyTo={replying ? { id: replying.id, author: authorOf(replying), text: describeMessage(replying) } : null}
        onClearReply={() => setReplyTo(null)}
        onSendSpecial={onSendSpecial}
        onTyping={onTyping}
      />
    </div>
  )
}
