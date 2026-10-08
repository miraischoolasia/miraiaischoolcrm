import { Check, Checks, CircleNotch, FileText, WarningCircle } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import {
  formatMessageTime,
  getSendState,
  getSenderLabel,
  type ChatwootAttachment,
  type ChatwootMessage,
} from '../../lib/whatsappInbox'
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

export type BubbleAvatar = { initials: string; tone: string }

type MessageBubbleProps = {
  message: ChatwootMessage
  avatar: BubbleAvatar | null
  // The picture shows on the first message of a run; later ones keep the space.
  showAvatar: boolean
  nowSeconds: number
  // For a message that never left this computer: remove it from the chat.
  onDismiss?: () => void
}

export function MessageBubble({ message, avatar, showAvatar, nowSeconds, onDismiss }: MessageBubbleProps) {
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
  const text = (message.content ?? '').trim()

  const picture = avatar ? (
    showAvatar ? (
      <Avatar initials={avatar.initials} tone={avatar.tone} size="sm" className="mt-0.5" />
    ) : (
      <span className="w-7 shrink-0" aria-hidden="true" />
    )
  ) : null

  return (
    <div className={cn('mb-2 flex items-start gap-2', outgoing ? 'justify-end' : 'justify-start')}>
      {!outgoing && picture}
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm',
          isNote
            ? 'border border-amber-200 bg-amber-50 text-amber-950'
            : outgoing
              ? 'bg-emerald-100 text-slate-900'
              : 'border border-slate-200 bg-white text-slate-900',
        )}
      >
        {isNote && <div className="mb-1 text-[11px] font-semibold text-amber-700">Private note, only your team sees this</div>}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mb-1 space-y-1">
            {message.attachments.map((attachment) => (
              <Attachment key={attachment.id} attachment={attachment} />
            ))}
          </div>
        )}
        {text && <div className="whitespace-pre-wrap break-words">{text}</div>}
        <div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-slate-500">
          {sender && <span>{sender}</span>}
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
