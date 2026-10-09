import { useState } from 'react'
import { ArrowBendUpLeft, ArrowBendUpRight, Check, Checks, CircleNotch, FileText, MapPin, PencilSimple, Phone, Prohibit, Smiley, Star, Trash, WarningCircle } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import {
  formatMessageTime,
  getSendState,
  getSenderLabel,
  type ChatwootAttachment,
  type ChatwootMessage,
} from '../../lib/whatsappInbox'
import { isSticker, parseSpecialMessage, type ContactCard, type LocationCard, type PollCard } from '../../lib/specialMessages'
import type { Reaction } from '../../lib/waActions'
import { Avatar } from './Avatar'
import { WaveformPlayer } from './WaveformPlayer'

function fileName(attachment: ChatwootAttachment) {
  const last = attachment.data_url.split('/').pop() ?? 'file'
  return decodeURIComponent(last.split('?')[0])
}

function formatSize(bytes?: number | null) {
  if (!bytes) {
    return ''
  }
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`
}

function Attachment({ attachment }: { attachment: ChatwootAttachment }) {
  if (isSticker(attachment)) {
    return <img src={attachment.data_url} alt="Sticker" loading="lazy" className="max-h-36 max-w-[9rem] object-contain" />
  }
  if (attachment.file_type === 'image') {
    return (
      <a href={attachment.data_url} target="_blank" rel="noopener noreferrer">
        <img
          src={attachment.data_url}
          alt="Photo in this chat"
          loading="lazy"
          className="max-h-64 max-w-full rounded-lg object-cover"
        />
      </a>
    )
  }
  if (attachment.file_type === 'video') {
    return <video controls preload="metadata" src={attachment.data_url} className="max-h-64 max-w-full rounded-lg" />
  }
  if (attachment.file_type === 'audio') {
    return <WaveformPlayer src={attachment.data_url} seed={attachment.id} />
  }
  return (
    <a
      href={attachment.data_url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-700 hover:bg-white"
    >
      <FileText size={20} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{fileName(attachment)}</span>
      <span className="text-xs text-slate-500">{formatSize(attachment.file_size)}</span>
    </a>
  )
}

function LocationView({ card }: { card: LocationCard }) {
  return (
    <a
      href={card.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 hover:bg-white"
    >
      <MapPin size={20} weight="fill" className="mt-0.5 shrink-0 text-red-500" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block font-medium text-slate-900">{card.name ?? 'Shared location'}</span>
        {card.address && <span className="block text-xs text-slate-600">{card.address}</span>}
        <span className="block text-xs text-slate-500">
          {card.lat}, {card.lng} · Open in Google Maps
        </span>
      </span>
    </a>
  )
}

function ContactView({ card }: { card: ContactCard }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white/70 px-3 py-2">
      <Phone size={20} weight="fill" className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block font-medium text-slate-900">{card.name}</span>
        {card.numbers.map((number) => (
          <span key={number} className="block text-xs text-slate-600">
            {number}
          </span>
        ))}
      </span>
    </div>
  )
}

function PollView({ card }: { card: PollCard }) {
  return (
    <div className="min-w-[12rem] rounded-lg border border-slate-200 bg-white/70 px-3 py-2">
      <div className="font-medium text-slate-900">{card.question}</div>
      <ul className="mt-1.5 space-y-1">
        {card.options.map((option) => (
          <li key={option} className="flex items-center gap-2 text-slate-700">
            <span className="size-3.5 shrink-0 rounded-full border border-slate-400" aria-hidden="true" />
            {option}
          </li>
        ))}
      </ul>
    </div>
  )
}

export type BubbleAvatar = { initials: string; tone: string }

// What WhatsApp knows about this message beyond its text: the one it answers, who reacted, a changed text.
export type BubbleExtras = {
  quote?: { author: string; text: string } | null
  reactions?: Reaction[]
  editedText?: string | null
  deletedForEveryone?: boolean
  // Only for what we sent: WhatsApp allows a change for 15 minutes and a delete for a limited time.
  canEdit?: boolean
  canDelete?: boolean
  starred?: boolean
}

export type BubbleActions = {
  onReply?: () => void
  onReact?: (emoji: string) => void
  onEdit?: (text: string) => Promise<boolean>
  onDelete?: () => Promise<boolean>
  onStar?: () => void
  onForward?: () => void
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '👏']

function groupReactions(reactions: Reaction[]) {
  const groups = new Map<string, { emoji: string; count: number; byUs: boolean }>()
  for (const reaction of reactions) {
    const group = groups.get(reaction.emoji) ?? { emoji: reaction.emoji, count: 0, byUs: false }
    group.count += 1
    group.byUs = group.byUs || reaction.byUs
    groups.set(reaction.emoji, group)
  }
  return [...groups.values()]
}

type MessageBubbleProps = {
  message: ChatwootMessage
  avatar: BubbleAvatar | null
  // The picture shows on the first message of a run; later ones keep the space.
  showAvatar: boolean
  nowSeconds: number
  // For a message that never left this computer: remove it from the chat.
  onDismiss?: () => void
  extras?: BubbleExtras
  actions?: BubbleActions
}

export function MessageBubble({ message, avatar, showAvatar, nowSeconds, onDismiss, extras = {}, actions = {} }: MessageBubbleProps) {
  const [reacting, setReacting] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  if (message.content_attributes?.deleted) {
    return null
  }
  if (message.message_type === 2) {
    return <div className="my-2 text-center text-xs text-slate-400">{message.content}</div>
  }

  const outgoing = message.message_type === 1
  const isNote = message.private
  const sender = getSenderLabel(message)
  const local = message.local
  const sendState = local ? (local === 'cancelled' ? 'failed' : 'sending') : getSendState(message, nowSeconds)
  const text = (extras.editedText ?? message.content ?? '').trim()
  const deletedForEveryone = extras.deletedForEveryone === true
  const special = parseSpecialMessage(text)
  // A sticker stands alone, without a bubble behind it.
  const stickerOnly = !text && message.attachments?.length === 1 && isSticker(message.attachments[0])

  const picture = avatar ? (
    showAvatar ? (
      <Avatar initials={avatar.initials} tone={avatar.tone} size="sm" className="mt-0.5" />
    ) : (
      <span className="w-7 shrink-0" aria-hidden="true" />
    )
  ) : null

  return (
    <div
      className={cn(
        'flex items-start gap-2',
        extras.reactions && extras.reactions.length > 0 && !deletedForEveryone ? 'mb-6' : 'mb-2',
        outgoing ? 'justify-end' : 'justify-start',
      )}
    >
      {!outgoing && picture}
      <div
        className={cn(
          'group relative max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm',
          stickerOnly
            ? 'bg-transparent shadow-none'
            : isNote
            ? 'border border-amber-200 bg-amber-50 text-amber-950'
            : outgoing
              ? 'bg-emerald-100 text-slate-900'
              : 'border border-slate-200 bg-white text-slate-900',
        )}
      >
        {!local && !deletedForEveryone && !isNote && (actions.onReply || actions.onReact || actions.onStar) && (
          <div
            className={cn(
              'absolute -top-3.5 z-10 hidden items-center gap-0.5 rounded-full border border-slate-200 bg-white px-1 py-0.5 shadow group-focus-within:flex group-hover:flex',
              outgoing ? 'right-2' : 'left-2',
            )}
          >
            {actions.onReply && (
              <button type="button" onClick={actions.onReply} aria-label="Reply to this message" title="Reply" className="rounded-full p-1 text-slate-600 hover:bg-slate-100">
                <ArrowBendUpLeft size={14} />
              </button>
            )}
            {actions.onReact && (
              <button
                type="button"
                onClick={() => setReacting((open) => !open)}
                aria-label="React to this message"
                aria-expanded={reacting}
                title="React"
                className="rounded-full p-1 text-slate-600 hover:bg-slate-100"
              >
                <Smiley size={14} />
              </button>
            )}
            {actions.onStar && (
              <button
                type="button"
                onClick={actions.onStar}
                aria-label={extras.starred ? 'Remove the star from this message' : 'Star this message'}
                title={extras.starred ? 'Remove star' : 'Star'}
                className="rounded-full p-1 text-slate-600 hover:bg-slate-100"
              >
                <Star size={14} weight={extras.starred ? 'fill' : 'regular'} className={extras.starred ? 'text-amber-500' : undefined} />
              </button>
            )}
            {actions.onForward && (
              <button type="button" onClick={actions.onForward} aria-label="Forward this message" title="Forward" className="rounded-full p-1 text-slate-600 hover:bg-slate-100">
                <ArrowBendUpRight size={14} />
              </button>
            )}
            {extras.canEdit && actions.onEdit && (
              <button type="button" onClick={() => setEditing(text)} aria-label="Edit this message" title="Edit" className="rounded-full p-1 text-slate-600 hover:bg-slate-100">
                <PencilSimple size={14} />
              </button>
            )}
            {extras.canDelete && actions.onDelete && (
              <button type="button" onClick={() => setConfirmingDelete(true)} aria-label="Delete this message for everyone" title="Delete for everyone" className="rounded-full p-1 text-slate-600 hover:bg-red-50 hover:text-red-700">
                <Trash size={14} />
              </button>
            )}
          </div>
        )}
        {reacting && actions.onReact && (
          <div className={cn('absolute -top-12 z-20 flex gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-lg', outgoing ? 'right-2' : 'left-2')} role="group" aria-label="Pick a reaction">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setReacting(false)
                  actions.onReact?.(emoji)
                }}
                aria-label={`React with ${emoji}`}
                className="rounded-full px-1 text-lg hover:bg-slate-100"
              >
                {emoji}
              </button>
            ))}
            {extras.reactions?.some((reaction) => reaction.byUs) && (
              <button
                type="button"
                onClick={() => {
                  setReacting(false)
                  actions.onReact?.('')
                }}
                aria-label="Take my reaction back"
                title="Take my reaction back"
                className="rounded-full px-1.5 text-xs text-slate-500 hover:bg-slate-100"
              >
                Remove
              </button>
            )}
          </div>
        )}
        {isNote && <div className="mb-1 text-[11px] font-semibold text-amber-700">Private note, only your team sees this</div>}
        {extras.quote && !deletedForEveryone && (
          <div className="mb-1 rounded-lg border-l-4 border-[#fc0c97] bg-black/5 px-2 py-1 text-xs">
            <div className="font-semibold text-[#be185d]">{extras.quote.author}</div>
            <div className="line-clamp-2 whitespace-pre-wrap text-slate-600">{extras.quote.text}</div>
          </div>
        )}
        {deletedForEveryone && (
          <div className="flex items-center gap-1.5 italic text-slate-500">
            <Prohibit size={14} aria-hidden="true" />
            This message was deleted
          </div>
        )}
        {!deletedForEveryone && message.attachments && message.attachments.length > 0 && (
          <div className="mb-1 space-y-1">
            {message.attachments.map((attachment) => (
              <Attachment key={attachment.id} attachment={attachment} />
            ))}
          </div>
        )}
        {!deletedForEveryone && editing === null && special?.kind === 'location' && <LocationView card={special} />}
        {!deletedForEveryone && editing === null && special?.kind === 'contact' && <ContactView card={special} />}
        {!deletedForEveryone && editing === null && special?.kind === 'poll' && <PollView card={special} />}
        {!deletedForEveryone && editing === null && text && !special && <div className="whitespace-pre-wrap break-words">{text}</div>}
        {!deletedForEveryone && editing !== null && (
          <div className="space-y-1.5">
            <textarea
              value={editing}
              rows={3}
              autoFocus
              aria-label="Edit message"
              onChange={(event) => setEditing(event.target.value)}
              className="w-full resize-none rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-[#fc0c97]"
            />
            <div className="flex justify-end gap-2 text-xs">
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !editing.trim() || editing.trim() === text}
                onClick={async () => {
                  setBusy(true)
                  const done = await actions.onEdit?.(editing.trim())
                  setBusy(false)
                  if (done) {
                    setEditing(null)
                  }
                }}
                className="rounded-lg bg-[#fc0c97] px-2.5 py-1 font-semibold text-white hover:bg-[#e00a87] disabled:opacity-60"
              >
                {busy ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}
        {confirmingDelete && (
          <div className="mt-1 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-800">
            <span>Delete for everyone? The parent will see it was deleted.</span>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                await actions.onDelete?.()
                setBusy(false)
                setConfirmingDelete(false)
              }}
              className="rounded-lg bg-red-600 px-2 py-0.5 font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              Delete
            </button>
            <button type="button" onClick={() => setConfirmingDelete(false)} className="rounded-lg border border-red-200 bg-white px-2 py-0.5 font-medium">
              Cancel
            </button>
          </div>
        )}
        <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-slate-500">
          {sender && <span>{sender}</span>}
          {extras.starred && <Star size={12} weight="fill" className="text-amber-500" aria-label="Starred" />}
          {extras.editedText != null && !deletedForEveryone && <span>Edited</span>}
          <span>{formatMessageTime(message.created_at)}</span>
          {sendState === 'sending' && <CircleNotch size={13} className="animate-spin" aria-label="Sending" />}
          {sendState === 'stalled' && <CircleNotch size={13} className="animate-spin text-amber-600" aria-label="Still sending" />}
          {sendState === 'sent' &&
            (message.status === 'delivered' || message.status === 'read' ? (
              <Checks
                size={13}
                weight={message.status === 'read' ? 'fill' : 'regular'}
                className={message.status === 'read' ? 'text-sky-600' : undefined}
                aria-label={message.status === 'read' ? 'Read' : 'Delivered'}
              />
            ) : (
              <Check size={13} aria-label="Sent" />
            ))}
        </div>
        {extras.reactions && extras.reactions.length > 0 && !deletedForEveryone && (
          <div className={cn('-mb-4 mt-1 flex gap-1', outgoing ? 'justify-end' : 'justify-start')} aria-label="Reactions">
            {groupReactions(extras.reactions).map((group) => (
              <span
                key={group.emoji}
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-full border bg-white px-1.5 py-0.5 text-xs shadow-sm',
                  group.byUs ? 'border-[#fc0c97]' : 'border-slate-200',
                )}
              >
                {group.emoji}
                {group.count > 1 && <span className="text-[10px] text-slate-500">{group.count}</span>}
              </span>
            ))}
          </div>
        )}
        {sendState === 'stalled' && (
          <div className="mt-1 text-[11px] font-medium text-amber-700">
            Still sending. If this stays here, check the WhatsApp connection.
          </div>
        )}
        {local === 'queued' && (
          <div className="mt-1 text-[11px] text-slate-500">Waiting for the message above to be sent first.</div>
        )}
        {sendState === 'failed' && (
          <div
            className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-red-600"
            title={message.content_attributes?.external_error}
          >
            <span className="flex items-center gap-1">
              <WarningCircle size={13} aria-hidden="true" />
              {local === 'cancelled' ? 'Not sent. The message before it did not go through.' : 'Failed to send'}
            </span>
            {local === 'cancelled' && onDismiss && (
              <button type="button" onClick={onDismiss} className="underline hover:text-red-800">
                Remove
              </button>
            )}
          </div>
        )}
      </div>
      {outgoing && picture}
    </div>
  )
}
