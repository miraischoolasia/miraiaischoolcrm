import type { ChatwootMessage } from './whatsappInbox'

// Evolution writes a reaction into the chat as a message that holds only the emoji and quotes the message
// reacted to, so in the chat list it would read "You: 😂". WhatsApp itself shows "You reacted 😂 to: ...".

// One emoji, with its skin tone or joined parts (a family, a heart that is on fire).
const ONE_EMOJI =
  /^\p{Extended_Pictographic}[️\p{Emoji_Modifier}]*(‍\p{Extended_Pictographic}[️\p{Emoji_Modifier}]*)*$/u

// A message that may be a reaction: a single emoji that quotes another message and was not typed in the CRM.
// Only WhatsApp can say for sure, so this just keeps the number of lookups small.
export function mayBeReaction(message: ChatwootMessage | null | undefined) {
  if (!message || message.private || message.local) {
    return false
  }
  const attributes = message.content_attributes
  return (
    Boolean(attributes?.in_reply_to_external_id) &&
    !attributes?.crm_sender &&
    ONE_EMOJI.test((message.content ?? '').trim()) &&
    (message.source_id ?? '').startsWith('WAID:')
  )
}

export type ReactionPreview = { emoji: string; target: string }

type WaRecord = {
  messageType?: string
  message?: {
    conversation?: string
    extendedTextMessage?: { text?: string }
    imageMessage?: { caption?: string }
    videoMessage?: { caption?: string }
    audioMessage?: { seconds?: number }
    documentMessage?: { fileName?: string; title?: string }
    documentWithCaptionMessage?: { message?: { documentMessage?: { fileName?: string; title?: string } } }
    contactMessage?: { displayName?: string }
    locationMessage?: { name?: string }
    stickerMessage?: object
  }
}

function clock(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

// A short line for a message WhatsApp holds, written the way WhatsApp's own chat list writes it.
export function describeWaRecord(record: WaRecord | null | undefined) {
  const message = record?.message
  if (!message) {
    return ''
  }
  const text = message.conversation ?? message.extendedTextMessage?.text
  if (text) {
    return text.trim().replace(/\s+/g, ' ')
  }
  if (message.audioMessage) {
    return `🎤 ${clock(message.audioMessage.seconds ?? 0)}`
  }
  if (message.imageMessage) {
    return `📷 ${message.imageMessage.caption?.trim() || 'Photo'}`
  }
  if (message.videoMessage) {
    return `🎥 ${message.videoMessage.caption?.trim() || 'Video'}`
  }
  const document = message.documentMessage ?? message.documentWithCaptionMessage?.message?.documentMessage
  if (document) {
    return `📄 ${document.fileName || document.title || 'Document'}`
  }
  if (message.stickerMessage) {
    return 'Sticker'
  }
  if (message.contactMessage) {
    return `👤 ${message.contactMessage.displayName || 'Contact'}`
  }
  if (message.locationMessage) {
    return `📍 ${message.locationMessage.name || 'Location'}`
  }
  return ''
}

// The line the chat list shows for a reaction. `byUs` is true for a reaction the team made.
export function formatReactionLine(emoji: string, target: string | null | undefined, byUs: boolean) {
  const who = byUs ? 'You reacted' : 'Reacted'
  const text = target?.trim()
  return text ? `${who} ${emoji} to: "${text}"` : `${who} ${emoji} to a message`
}
