import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from 'react'
import type { VariableValues } from '../../lib/quickReplies'
import { ArrowBendUpRight, ArrowCounterClockwise, ArrowDown, CaretDown, CaretLeft, CaretUp, CheckCircle, EnvelopeSimple, Info, Lightning, MagnifyingGlass, PushPin, UserCircle, X } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import type { Sender } from '../../lib/chatwootClient'
import type { SendInput } from '../../hooks/useWhatsAppInbox'
import {
  confirmsBySource,
  formatDayLabel,
  getChatIdentity,
  getInitials,
  getOwner,
  getSenderLabel,
  socialKindOf,
  type ChatwootConversation,
  type ChatwootMessage,
} from '../../lib/whatsappInbox'
import { parentTone, staffTone } from '../../lib/avatarTone'
import type { Draft } from '../../lib/draft'
import { Avatar } from './Avatar'
import { Composer } from './Composer'
import { MessageBubble, type BubbleAvatar, type BubbleExtras } from './MessageBubble'
import { ImageViewer } from './ImageViewer'
import { findMessageMatches } from '../../lib/chatSearch'
import { isSticker, summarizeMessage } from '../../lib/specialMessages'
import { NO_EVENTS, waIdOf, type MessageEvents, type SpecialMessage } from '../../lib/waActions'
import { isEditCopy, withoutEditHeading } from '../../lib/editCopy'
import { isCheckingReaction } from '../../lib/reactionPreview'
import { useAiSuggestion } from '../../hooks/useAiSuggestion'
import { recordAiDraftSent, type AiDraftContext } from '../../lib/aiDraft'
import type { ChatSwitchOption } from '../../lib/chatSwitch'

type ChatPanelProps = {
  conversation: ChatwootConversation
  // A message to show as soon as it is loaded (a search result), flashed like a quote jump; then onFocused.
  focusMessageId?: number | null
  onFocused?: () => void
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
  // Puts a message that did not go out (and the ones held back behind it) in the queue again.
  onRetryUnsent?: (tempId: number) => void
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
  // The "+" menu's Automation row, and what is scheduled for this chat (shown above the message box).
  onSchedule?: () => void
  scheduledSlot?: React.ReactNode
  // The Follow up button for the message box, and a line under the header with the next follow-up.
  followUpControl?: React.ReactNode
  followUpChip?: React.ReactNode
  // Shows the parent we are typing; called as the team writes a reply.
  onTyping?: () => void
  // Pinned chats stay at the top of the list, for the whole team.
  pinned?: boolean
  onTogglePin?: () => void
  // Starred messages of this chat (by Chatwoot id); the team shares them.
  starredIds?: number[]
  onToggleStar?: (message: ChatwootMessage) => void
  // Messages pinned at the top of the chat (newest first), and pinning or unpinning one.
  pinnedMessageIds?: number[]
  onTogglePinMessage?: (messageId: number) => void
  // Forwards one or several messages, oldest first.
  onForward?: (messages: ChatwootMessage[]) => void
  // Starts a quick reply of one or several messages, oldest first.
  onMakeQuickReply?: (messages: ChatwootMessage[]) => void
  // Turns on the grey AI reply suggestion for this chat, with what the AI may know about the child.
  // Left out where the feature is not wanted (people who cannot edit leads).
  aiContext?: AiDraftContext | null
  // Where a reply goes out from (the WhatsApp number, or the Page), shown above the message box: its short name
  // and colour when it has them, with the full name on a long look.
  sendingFrom?: string | null
  sendingFromColor?: string | null
  sendingFromTitle?: string | null
  // The family's other chats, to switch to from "Sending from".
  chatChoices?: ChatSwitchOption[]
  onSwitchChat?: (option: ChatSwitchOption) => void
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
  focusMessageId = null,
  onFocused,
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
  onRetryUnsent,
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
  onSchedule,
  scheduledSlot,
  followUpControl,
  followUpChip,
  onTyping,
  pinned = false,
  onTogglePin,
  starredIds = [],
  onToggleStar,
  pinnedMessageIds = [],
  onTogglePinMessage,
  onForward,
  onMakeQuickReply,
  aiContext = null,
  sendingFrom = null,
  sendingFromColor = null,
  sendingFromTitle = null,
  chatChoices,
  onSwitchChat,
}: ChatPanelProps) {
  const identity = getChatIdentity(conversation.meta.sender, leadName, conversation.meta.channel)
  // The grey reply suggestion; asked for only when the box is empty and the parent wrote last.
  const ai = useAiSuggestion({
    enabled: aiContext !== null,
    conversationId: conversation.id,
    messages,
    context: aiContext ?? { children: [], teamName: null },
    hasDraft: draft != null,
  })
  // What goes out is recorded against the AI draft made for the parent message it answers, so the
  // draft can later be compared with what the team really wrote. The id is read before sending,
  // because the parent message stops needing a reply the moment ours is on its way.
  async function sendAndRecord(input: SendInput) {
    const draftId = ai.draftId
    const sent = await onSend(input)
    if (sent && draftId !== null && !input.isPrivate) {
      const written = input.sequence
        .filter((part): part is string => typeof part === 'string')
        .map((part) => part.trim())
        .filter((part) => part !== '')
        .join('\n\n')
      if (written !== '') {
        void recordAiDraftSent(draftId, written)
      }
    }
    return sent
  }
  const owner = handledBy ?? getOwner(conversation)
  const done = conversation.status === 'resolved'
  // The message the next one will answer (quote).
  const [replyTo, setReplyTo] = useState<{ conversationId: number; message: ChatwootMessage } | null>(null)
  // Messages ticked to forward together; kept with the chat they were ticked in.
  const [picked, setPicked] = useState<{ conversationId: number; ids: number[] } | null>(null)
  const pickedIds = picked && picked.conversationId === conversation.id ? picked.ids : null
  const togglePicked = (id: number) =>
    setPicked((current) => {
      const ids = current && current.conversationId === conversation.id ? current.ids : []
      const next = ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id]
      return next.length > 0 ? { conversationId: conversation.id, ids: next } : null
    })
  const replying = replyTo?.conversationId === conversation.id ? replyTo.message : null
  // The ticked messages in the order they were written, whatever order they were ticked in.
  const pickedInOrder = () =>
    [...messages, ...waitingMessages]
      .filter((message) => pickedIds?.includes(message.id))
      .sort((a, b) => a.created_at - b.created_at || a.id - b.id)
  useEffect(() => {
    if (!pickedIds) {
      return undefined
    }
    const leave = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPicked(null)
      }
    }
    window.addEventListener('keydown', leave)
    return () => window.removeEventListener('keydown', leave)
  }, [pickedIds])
  const scroller = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const lastConversation = useRef<number | null>(null)
  const lastIncomingId = useRef(0)
  const flashTimer = useRef<number | null>(null)
  const dropCount = useRef(0)

  // Looking for words in this chat.
  const [searchOpen, setSearchOpen] = useState(false)
  const [chatQuery, setChatQuery] = useState('')
  const [hitPosition, setHitPosition] = useState(0)
  // A message the person was just taken to (the one a quote answers); it glows for a moment.
  const [flashId, setFlashId] = useState<number | null>(null)
  const [viewer, setViewer] = useState<number | null>(null)
  // Files being dragged over the chat, and the ones dropped.
  const [dragging, setDragging] = useState(false)
  const [dropped, setDropped] = useState<{ id: number; files: File[] } | null>(null)
  // Scrolled away from the newest message, and how many parent messages came in meanwhile.
  const [away, setAway] = useState(false)
  const [newCount, setNewCount] = useState(0)
  // How many messages were unread when the chat was opened: the line "N unread messages" is drawn above them.
  const unreadWhenOpened = (chat: ChatwootConversation) =>
    chat.status === 'resolved' || chat.custom_attributes?.crm_marked_unread ? 0 : chat.unread_count
  const [opened, setOpened] = useState({ id: conversation.id, unread: unreadWhenOpened(conversation) })
  if (opened.id !== conversation.id) {
    setOpened({ id: conversation.id, unread: unreadWhenOpened(conversation) })
    setSearchOpen(false)
    setChatQuery('')
    setHitPosition(0)
    setFlashId(null)
    setViewer(null)
    setDropped(null)
    setAway(false)
    setNewCount(0)
  }
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
    const newestIncoming = messages.reduce((newest, entry) => (entry.message_type === 0 && entry.id > newest ? entry.id : newest), 0)
    if (changedChat) {
      // Like WhatsApp, a chat with unread messages opens at the line that says so; the others at the newest message.
      const divider = messages.length > 0 ? element.querySelector('[data-unread-divider]') : null
      if (divider) {
        stickToBottom.current = false
        divider.scrollIntoView?.({ block: 'start' })
      } else {
        stickToBottom.current = true
        element.scrollTop = element.scrollHeight
      }
      lastIncomingId.current = newestIncoming
    } else {
      if (stickToBottom.current) {
        element.scrollTop = element.scrollHeight
      } else if (newestIncoming > lastIncomingId.current) {
        const fresh = messages.filter((entry) => entry.message_type === 0 && entry.id > lastIncomingId.current).length
        setNewCount((count) => count + fresh)
      }
      lastIncomingId.current = Math.max(lastIncomingId.current, newestIncoming)
    }
    if (messages.length > 0) {
      lastConversation.current = conversation.id
    }
  }, [conversation.id, messages, waitingMessages])

  useEffect(
    () => () => {
      if (flashTimer.current !== null) {
        window.clearTimeout(flashTimer.current)
      }
    },
    [],
  )

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

  function quotedOf(message: ChatwootMessage) {
    const attributes = message.content_attributes
    return (
      (attributes?.in_reply_to ? byId.get(attributes.in_reply_to) : undefined) ??
      (attributes?.in_reply_to_external_id ? byWaId.get(attributes.in_reply_to_external_id) : undefined)
    )
  }

  // The words a message shows (an edited text counts as it is now).
  function textOf(message: ChatwootMessage) {
    const waId = waIdOf(message.source_id)
    const edited = waId ? changedText(message, messageEvents.edits.get(waId) ?? messageEvents.texts.get(waId)) : null
    return (edited ?? message.content ?? '').trim()
  }

  // Scrolls to a message of this chat, when it is loaded.
  function scrollToMessage(id: number) {
    const target = scroller.current?.querySelector(`[data-message-id="${id}"]`)
    if (!target) {
      return false
    }
    stickToBottom.current = false
    target.scrollIntoView?.({ block: 'center' })
    return true
  }

  function jumpTo(id: number) {
    if (!scrollToMessage(id)) {
      return
    }
    setFlashId(id)
    if (flashTimer.current !== null) {
      window.clearTimeout(flashTimer.current)
    }
    flashTimer.current = window.setTimeout(() => setFlashId(null), 1600)
  }

  // A search result: once its message is on screen it is shown and flashed (after the chat's own first scroll).
  useEffect(() => {
    if (focusMessageId === null || !messages.some((message) => message.id === focusMessageId)) {
      return
    }
    const timer = window.setTimeout(() => {
      jumpTo(focusMessageId)
      onFocused?.()
    }, 60)
    return () => window.clearTimeout(timer)
    // jumpTo only reads refs and sets the flash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMessageId, messages])

  function scrollToNewest() {
    const element = scroller.current
    if (!element) {
      return
    }
    stickToBottom.current = true
    setNewCount(0)
    if (element.scrollTo) {
      element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' })
    } else {
      element.scrollTop = element.scrollHeight
    }
  }

  // The messages that hold the searched words, oldest first. Hidden ones (reactions, copies of edits) are not searched.
  const searchable = [...messages, ...waitingMessages].filter((entry) => {
    const waId = waIdOf(entry.source_id)
    return !(waId && messageEvents.reactionIds.has(waId)) && !(isEditCopy(entry.content) && waId && idsOfOriginals.has(waId))
  })
  const hits = searchOpen ? findMessageMatches(searchable, chatQuery, textOf) : []
  const hitAt = hits.length > 0 ? Math.min(Math.max(hitPosition, 0), hits.length - 1) : 0
  const currentHitId = hits.length > 0 ? hits[hitAt] : null
  const lastHitScrolled = useRef<number | null>(null)
  useEffect(() => {
    if (currentHitId === null) {
      lastHitScrolled.current = null
      return
    }
    if (lastHitScrolled.current !== currentHitId) {
      lastHitScrolled.current = currentHitId
      scrollToMessage(currentHitId)
    }
    // scrollToMessage only reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHitId])
  function stepHit(direction: -1 | 1) {
    if (hits.length > 0) {
      setHitPosition((hitAt + direction + hits.length) % hits.length)
    }
  }

  // The photos of this chat, oldest first, for the viewer.
  const photos = messages.flatMap((entry) => {
    const waId = waIdOf(entry.source_id)
    if (entry.content_attributes?.deleted || (waId && messageEvents.deleted.has(waId))) {
      return []
    }
    return (entry.attachments ?? [])
      .filter((attachment) => attachment.file_type === 'image' && !isSticker(attachment))
      .map((attachment) => ({
        id: attachment.id,
        src: attachment.data_url,
        label: `${authorOf(entry)}, ${new Date(entry.created_at * 1000).toLocaleString()}`,
      }))
  })
  const viewerIndex = viewer === null ? -1 : photos.findIndex((photo) => photo.id === viewer)

  // The first of the messages that were unread when the chat was opened.
  const incomingOrder = messages.filter((entry) => entry.message_type === 0 && !entry.private).sort((a, b) => a.created_at - b.created_at || a.id - b.id)
  const firstUnreadId =
    opened.id === conversation.id && opened.unread > 0 && incomingOrder.length > 0
      ? incomingOrder[Math.max(0, incomingOrder.length - opened.unread)].id
      : null

  const isSocialChat = socialKindOf(conversation.meta.channel, conversation.meta.sender) !== null
  const channelLabel = socialKindOf(conversation.meta.channel, conversation.meta.sender) === 'messenger'
    ? 'Messenger'
    : socialKindOf(conversation.meta.channel, conversation.meta.sender) === 'instagram'
      ? 'Instagram'
      : 'WhatsApp'

  function extrasFor(message: ChatwootMessage): BubbleExtras {
    const waId = waIdOf(message.source_id)
    const quoted = quotedOf(message)
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
      pinned: pinnedMessageIds.includes(message.id),
      highlight: searchOpen ? chatQuery : undefined,
      channelLabel,
      authorName: authorOf(message),
    }
  }

  const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes('Files')

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
    <div
      className={cn('relative flex min-h-0 min-w-0 flex-col bg-slate-50', className)}
      onDragEnter={(event) => {
        if (hasFiles(event) && !pickedIds) {
          event.preventDefault()
          setDragging(true)
        }
      }}
      onDragOver={(event) => {
        if (hasFiles(event) && !pickedIds) {
          event.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDragging(false)
        }
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) {
          return
        }
        event.preventDefault()
        setDragging(false)
        if (!pickedIds && event.dataTransfer.files.length > 0) {
          dropCount.current += 1
          setDropped({ id: dropCount.current, files: Array.from(event.dataTransfer.files) })
        }
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-lg border-2 border-dashed border-[#fc0c97] bg-pink-50/90 text-base font-semibold text-[#be185d]">
          Drop files to attach them to your message
        </div>
      )}
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
        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto sm:flex-wrap sm:justify-end">
          {/* Who is looking after this chat. The select itself is invisible and covers the pill. */}
          <label className="relative flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-2 sm:w-[168px] sm:flex-none rounded-full border border-pink-200/80 bg-white pl-1.5 pr-3 shadow-sm transition hover:border-pink-300 focus-within:ring-2 focus-within:ring-[#fc0c97]/40">
            {owner ? (
              <Avatar initials={getInitials(owner.name)} tone={staffTone(owner.name)} size="sm" />
            ) : (
              <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <UserCircle size={18} />
              </span>
            )}
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-400 max-sm:hidden">Handled by</span>
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
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenDetails}
              aria-label="Lead and student details"
              title="Lead and student details"
              className={cn(HEADER_ICON_BUTTON, 'xl:hidden')}
            >
              <Info size={16} />
            </button>
            <button
              type="button"
              onClick={() => setSearchOpen((open) => !open)}
              aria-label="Search in this chat"
              aria-pressed={searchOpen}
              title="Search for words in this chat"
              className={cn(HEADER_ICON_BUTTON, searchOpen && 'border-[#fc0c97] text-[#fc0c97] hover:text-[#fc0c97]')}
            >
              <MagnifyingGlass size={16} />
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
              'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] sm:px-4 font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fc0c97]/40',
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

      {pinnedMessageIds.length > 0 && (
        <div aria-label="Pinned messages" className="border-b border-pink-100 bg-pink-50/40 px-3 py-1.5">
          {pinnedMessageIds.map((id) => {
            const pinnedMessage = messages.find((message) => message.id === id)
            const text = pinnedMessage ? (pinnedMessage.content?.trim() || (pinnedMessage.attachments?.length ? 'Photo or file' : 'Message')) : 'A message further up the chat'
            return (
              <div key={id} className="flex items-center gap-2 py-0.5">
                <PushPin size={13} weight="fill" aria-hidden="true" className="shrink-0 text-[#be185d]" />
                <button
                  type="button"
                  onClick={() => jumpTo(id)}
                  title={pinnedMessage ? 'Show this message' : 'Load earlier messages to see it'}
                  className="min-w-0 flex-1 truncate text-left text-xs text-slate-700 hover:underline min-h-0!"
                >
                  {text}
                </button>
                {onTogglePinMessage && (
                  <button
                    type="button"
                    onClick={() => onTogglePinMessage(id)}
                    aria-label="Unpin this message"
                    title="Unpin"
                    className="shrink-0 rounded p-0.5 text-slate-500 hover:bg-white min-h-0!"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {searchOpen && (
        <div role="search" className="flex flex-wrap items-center gap-2 border-b border-pink-100 bg-white px-3 py-2">
          <MagnifyingGlass size={16} aria-hidden="true" className="shrink-0 text-slate-400" />
          <input
            type="search"
            autoFocus
            value={chatQuery}
            onChange={(event) => {
              setChatQuery(event.target.value)
              // Starts at the newest match.
              setHitPosition(Number.MAX_SAFE_INTEGER)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                stepHit(event.shiftKey ? 1 : -1)
              } else if (event.key === 'Escape') {
                event.stopPropagation()
                setSearchOpen(false)
              }
            }}
            placeholder="Search in this chat"
            aria-label="Search in this chat"
            className="min-w-[8rem] flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-[#fc0c97]"
          />
          <span aria-live="polite" className="shrink-0 text-xs text-slate-500">
            {chatQuery.trim() === '' ? '' : hits.length === 0 ? 'No messages found' : `${hitAt + 1} of ${hits.length}`}
          </span>
          <button type="button" onClick={() => stepHit(-1)} disabled={hits.length === 0} aria-label="Previous match, older" title="Older match" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40">
            <CaretUp size={16} />
          </button>
          <button type="button" onClick={() => stepHit(1)} disabled={hits.length === 0} aria-label="Next match, newer" title="Newer match" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40">
            <CaretDown size={16} />
          </button>
          <button type="button" onClick={() => setSearchOpen(false)} aria-label="Close the search" title="Close (Esc)" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100">
            <X size={16} />
          </button>
          {hasOlder && (
            <button type="button" onClick={onLoadOlder} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
              Only the messages loaded so far are searched. Load earlier messages
            </button>
          )}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget
          const distance = element.scrollHeight - element.scrollTop - element.clientHeight
          stickToBottom.current = distance < 80
          setAway(distance > 240)
          if (distance < 80) {
            setNewCount(0)
          }
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
          const canPick = Boolean(onForward || onMakeQuickReply) && !message.local && !message.private
          const isPicked = pickedIds?.includes(message.id) ?? false
          return (
            <div key={message.id} data-message-id={message.id}>
              {showDay && (
                <div className="my-3 text-center">
                  <span className="rounded-full bg-slate-200/70 px-3 py-0.5 text-[11px] font-medium text-slate-600">{day}</span>
                </div>
              )}
              {message.id === firstUnreadId && (
                <div data-unread-divider className="my-3 flex items-center gap-3 text-[11px] font-semibold text-[#be185d]">
                  <span className="h-px flex-1 bg-pink-200" />
                  {opened.unread} unread {opened.unread === 1 ? 'message' : 'messages'}
                  <span className="h-px flex-1 bg-pink-200" />
                </div>
              )}
              <div
                className={cn(
                  'transition-colors duration-500',
                  pickedIds && canPick && 'flex cursor-pointer items-start gap-2 rounded-lg',
                  isPicked && 'bg-pink-50',
                  flashId === message.id && 'rounded-lg bg-yellow-100',
                  currentHitId === message.id && 'rounded-lg bg-yellow-50 ring-1 ring-yellow-300',
                )}
                onClickCapture={(event) => {
                  if (pickedIds && canPick) {
                    event.preventDefault()
                    event.stopPropagation()
                    togglePicked(message.id)
                  }
                }}
              >
              {pickedIds && canPick && (
                <input
                  type="checkbox"
                  checked={isPicked}
                  readOnly
                  aria-label="Include this message"
                  className="mt-3 h-4 w-4 shrink-0 accent-[#fc0c97]"
                />
              )}
              <div className={cn(pickedIds && canPick && 'pointer-events-none min-w-0 flex-1')}>
              <MessageBubble
                message={shown}
                avatar={avatar}
                showAvatar={showAvatar}
                nowSeconds={nowSeconds}
                idConfirms={confirmsBySource(conversation.meta.sender)}
                onDismiss={message.local ? () => onDismissUnsent(-message.id) : undefined}
                onRetry={message.local && onRetryUnsent ? () => onRetryUnsent(-message.id) : undefined}
                extras={extrasFor(message)}
                actions={{
                  onReply: message.local ? undefined : () => setReplyTo({ conversationId: conversation.id, message }),
                  onReact: onReact && waIdOf(message.source_id) ? (emoji) => onReact(message, emoji) : undefined,
                  onEdit: onEditMessage ? (text) => onEditMessage(message, text) : undefined,
                  onDelete: onDeleteMessage ? () => onDeleteMessage(message) : undefined,
                  onStar: onToggleStar && !message.local ? () => onToggleStar(message) : undefined,
                  onPin: onTogglePinMessage && !message.local && message.id > 0 ? () => onTogglePinMessage(message.id) : undefined,
                  // Like WhatsApp: Forward first turns on picking (with this message ticked), then the Forward button below sends.
                  onForward: canPick && onForward ? () => togglePicked(message.id) : undefined,
                  onSelect: canPick ? () => togglePicked(message.id) : undefined,
                  onJumpToQuote: quotedOf(message) ? () => jumpTo((quotedOf(message) as ChatwootMessage).id) : undefined,
                  onOpenImage: message.local ? undefined : (attachmentId) => setViewer(attachmentId),
                }}
              />
              </div>
              </div>
            </div>
          )
        })}
      </div>
      {away && (
        <button
          type="button"
          onClick={scrollToNewest}
          aria-label={newCount > 0 ? `Scroll to the newest message, ${newCount} new` : 'Scroll to the newest message'}
          title="Go to the newest message"
          className="absolute bottom-3 right-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-lg hover:bg-slate-50"
        >
          <ArrowDown size={18} />
          {newCount > 0 && (
            <span className="absolute -top-2 left-1/2 min-w-5 -translate-x-1/2 rounded-full bg-[#fc0c97] px-1.5 py-0.5 text-center text-[11px] font-bold leading-none text-white">
              {newCount > 99 ? '99+' : newCount}
            </span>
          )}
        </button>
      )}
      </div>

      {viewer !== null && viewerIndex >= 0 && (
        <ImageViewer
          images={photos.map((photo) => ({ src: photo.src, label: photo.label }))}
          index={viewerIndex}
          onIndex={(next) => setViewer(photos[next]?.id ?? null)}
          onClose={() => setViewer(null)}
        />
      )}

      {pickedIds && (onForward || onMakeQuickReply) && (
        <div className="flex items-center justify-between gap-2 border-t border-pink-100 bg-pink-50 px-4 py-2 text-sm">
          <span className="font-medium text-slate-800">{pickedIds.length} selected</span>
          <span className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            {onMakeQuickReply && (
              <button
                type="button"
                onClick={() => {
                  const chosen = pickedInOrder()
                  setPicked(null)
                  onMakeQuickReply(chosen)
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-pink-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#be185d] hover:bg-pink-50"
              >
                <Lightning size={14} aria-hidden="true" />
                Quick reply
              </button>
            )}
            {onForward && (
              <button
                type="button"
                onClick={() => {
                  const chosen = pickedInOrder()
                  setPicked(null)
                  onForward(chosen)
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#fc0c97] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#de0a84]"
              >
                <ArrowBendUpRight size={14} aria-hidden="true" />
                Forward
              </button>
            )}
          </span>
        </div>
      )}

      {actionError && (
        <p role="alert" className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
          {actionError}
        </p>
      )}
      {followUpChip}
      {scheduledSlot}
      {identity.isGroup && (
        <p className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          This is a WhatsApp group. Everyone in it reads your reply.
        </p>
      )}
      <div className={pickedIds && (onForward || onMakeQuickReply) ? 'hidden' : undefined}>
      <Composer
        key={conversation.id}
        onSend={sendAndRecord}
        quickReplies={quickReplies}
        variables={quickReplyValues}
        onManageQuickReplies={onManageQuickReplies}
        draftRequest={draftRequest}
        droppedFiles={dropped}
        sendingFrom={sendingFrom}
        sendingFromColor={sendingFromColor}
        sendingFromTitle={sendingFromTitle}
        chatChoices={chatChoices}
        onSwitchChat={onSwitchChat}
        draft={draft}
        onDraftChange={onDraftChange}
        replyTo={replying ? { id: replying.id, author: authorOf(replying), text: describeMessage(replying) } : null}
        onClearReply={() => setReplyTo(null)}
        // Location, contact, poll and sticker go through WhatsApp only; Messenger and Instagram have no such messages here.
        onSendSpecial={isSocialChat ? undefined : onSendSpecial}
        voiceAsWav={isSocialChat}
        onSchedule={onSchedule}
        followUpControl={followUpControl}
        onTyping={onTyping}
        aiSuggestion={ai.suggestion ? { text: ai.suggestion.text, note: ai.suggestion.note } : null}
        aiLoading={ai.isLoading}
        aiError={ai.error}
        aiSkipNote={ai.skipNote}
        aiAvailable={ai.available}
        onAiSuggest={aiContext !== null ? ai.suggest : undefined}
        onAiUse={ai.markUsed}
        onAiDismiss={ai.dismiss}
      />
      </div>
    </div>
  )
}
