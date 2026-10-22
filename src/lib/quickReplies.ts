import { MAX_VIDEO_BYTES, MAX_VIDEO_MB } from './outbox'

// Quick replies: ready-made WhatsApp messages with optional photos, videos or
// PDFs. This file holds the rules (search, filling in names, which files are
// allowed) apart from the screens so they are easy to test.

export type QuickReplyMedia = { path: string; name: string; type: string; size: number }

// One row of a quick reply: a text, or a file. Each is sent to the parent as its own message.
export type QuickReplyStep = { kind: 'text'; text: string } | { kind: 'media'; media: QuickReplyMedia }

// Rows a new quick reply starts with, when it is made from messages picked in a chat.
export type QuickReplyStart = {
  steps: ({ kind: 'text'; text: string } | { kind: 'file'; file: File })[]
  // What could not be copied, shown above the rows.
  note?: string
}

export type QuickReply = {
  id: number
  title: string
  // In the order they are sent.
  steps: QuickReplyStep[]
  isActive: boolean
  // The person it belongs to: only they see it. Empty for the team's quick replies.
  ownerId?: string | null
}

export const MAX_QUICK_REPLY_STEPS = 10
// The most WhatsApp accepts for a video or document.
export const MAX_QUICK_REPLY_FILE_BYTES = 16 * 1024 * 1024
// A video may be bigger, the same limit as a video typed into a chat.
export const MAX_QUICK_REPLY_VIDEO_BYTES = MAX_VIDEO_BYTES
// What the storage bucket holds per file: the bigger of the two.
export const QUICK_REPLY_BUCKET_BYTES = Math.max(MAX_QUICK_REPLY_FILE_BYTES, MAX_QUICK_REPLY_VIDEO_BYTES)
// A voice message is an audio file: WhatsApp voice notes are OGG (opus), and the others are what people record or save.
export const QUICK_REPLY_AUDIO_TYPES = ['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav']
export const QUICK_REPLY_FILE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'video/mp4',
  'application/pdf',
  ...QUICK_REPLY_AUDIO_TYPES,
]

// The same audio goes by several names; this is the one the rest of the app and the storage bucket know.
const AUDIO_TYPE_NAMES: Record<string, string> = {
  'audio/oga': 'audio/ogg',
  'audio/opus': 'audio/ogg',
  'application/ogg': 'audio/ogg',
  'audio/mp3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/x-mp4': 'audio/mp4',
  'audio/x-aac': 'audio/aac',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
}
const AUDIO_EXTENSIONS: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
}

// A file ready to be kept as a quick reply row. An audio file gets the plain type and the ending the
// WhatsApp bridge reads (it tells a voice message from a video by the file name). knownAudio: the chat already
// said this is a voice message, so a file with no useful type is taken as the OGG that WhatsApp voice notes are.
export function normalizeQuickReplyFile(file: File, knownAudio = false): File {
  const bare = file.type.split(';')[0].trim().toLowerCase()
  const named = AUDIO_TYPE_NAMES[bare] ?? bare
  const isAudio = named.startsWith('audio/') || (knownAudio && (bare === '' || bare === 'application/octet-stream'))
  if (!isAudio) {
    return file
  }
  const type = AUDIO_EXTENSIONS[named] ? named : knownAudio ? 'audio/ogg' : named
  const extension = AUDIO_EXTENSIONS[type]
  if (!extension) {
    return file
  }
  const hasEnding = file.name.toLowerCase().endsWith(`.${extension}`)
  const name = hasEnding ? file.name : `${file.name.replace(/\.[A-Za-z0-9]{1,5}$/, '') || 'voice'}.${extension}`
  return type === file.type && name === file.name ? file : new File([file], name, { type })
}

export const QUICK_REPLY_VARIABLES = [
  { token: '{parent name}', label: 'Parent name' },
  { token: '{child name}', label: 'Child name' },
  { token: '{trial date}', label: 'Trial date' },
  { token: '{my name}', label: 'My name' },
] as const

export type VariableValues = Partial<Record<(typeof QUICK_REPLY_VARIABLES)[number]['token'], string>>

// Null when the file may be used, otherwise a plain reason it may not.
export function checkQuickReplyFile(file: Pick<File, 'type' | 'size' | 'name'>): string | null {
  if (!QUICK_REPLY_FILE_TYPES.includes(file.type)) {
    return `${file.name} is not a photo (PNG, JPG, WebP), an MP4 video, a voice message (OGG, MP3, M4A, WAV) or a PDF.`
  }
  if (file.type.startsWith('video/')) {
    if (file.size > MAX_QUICK_REPLY_VIDEO_BYTES) {
      return `${file.name} is over ${MAX_VIDEO_MB} MB. Make the video shorter or smaller first.`
    }
    return null
  }
  if (file.size > MAX_QUICK_REPLY_FILE_BYTES) {
    return `${file.name} is over 16 MB, which WhatsApp will not take.`
  }
  return null
}

const VARIABLE_PATTERN = /\{(parent name|child name|trial date|my name)\}/gi

// Puts each known name in place of its {tag}. A tag with no value is left as
// it is, so the person sending can see what is still missing.
export function fillVariables(text: string, values: VariableValues) {
  return text.replace(VARIABLE_PATTERN, (match, name: string) => {
    const value = values[`{${name.toLowerCase()}}` as keyof VariableValues]?.trim()
    return value ? value : match
  })
}

// The {tags} still in the text, so a message is not sent with one in it.
export function unfilledVariables(text: string) {
  return [...new Set((text.match(VARIABLE_PATTERN) ?? []).map((match) => match.toLowerCase()))]
}

// A person's own quick replies first, then the team's, each keeping the order it was dragged into.
export function mineFirst(replies: QuickReply[]) {
  return [...replies.filter((reply) => reply.ownerId), ...replies.filter((reply) => !reply.ownerId)]
}

// Active replies matching what was typed, titles that start with it first.
export function searchQuickReplies(replies: QuickReply[], query: string) {
  const text = query.trim().toLowerCase()
  const active = replies.filter((reply) => reply.isActive)
  if (!text) {
    return active
  }
  const starts = (reply: QuickReply) => reply.title.toLowerCase().startsWith(text)
  return active
    .filter(
      (reply) =>
        reply.title.toLowerCase().includes(text) || replyTexts(reply).some((message) => message.toLowerCase().includes(text)),
    )
    .sort((a, b) => Number(starts(b)) - Number(starts(a)))
}

export function replyTexts(reply: Pick<QuickReply, 'steps'>) {
  return reply.steps.flatMap((step) => (step.kind === 'text' ? [step.text] : []))
}

export function replyMedia(reply: Pick<QuickReply, 'steps'>) {
  return reply.steps.flatMap((step) => (step.kind === 'media' ? [step.media] : []))
}

// The rows as stored in the database, ignoring anything malformed.
export function parseSteps(value: unknown): QuickReplyStep[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item): QuickReplyStep[] => {
    if (typeof item !== 'object' || item === null) {
      return []
    }
    const { kind, text, media } = item as Record<string, unknown>
    if (kind === 'text' && typeof text === 'string') {
      return [{ kind: 'text', text }]
    }
    if (kind === 'media') {
      const [parsed] = parseMedia([media])
      return parsed ? [{ kind: 'media', media: parsed }] : []
    }
    return []
  })
}

// Moves one item of a list to another place, for drag and drop.
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return list
  }
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

// The attachment list as stored in the database, ignoring anything malformed.
export function parseMedia(value: unknown): QuickReplyMedia[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) {
      return []
    }
    const { path, name, type, size } = item as Record<string, unknown>
    if (typeof path !== 'string' || typeof name !== 'string' || typeof type !== 'string') {
      return []
    }
    return [{ path, name, type, size: typeof size === 'number' ? size : 0 }]
  })
}

export function mediaKind(type: string): 'image' | 'video' | 'audio' | 'file' {
  if (type.startsWith('image/')) {
    return 'image'
  }
  if (type.startsWith('audio/')) {
    return 'audio'
  }
  if (type.startsWith('video/')) {
    return 'video'
  }
  return 'file'
}

const TYPE_OF_ENDING: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
}

// The file type a name says it is, for a file whose server gave no useful type. Empty when it is not one of ours.
export function typeOfFileName(name: string): string {
  return TYPE_OF_ENDING[name.split('?')[0].split('.').pop()?.toLowerCase() ?? ''] ?? ''
}
