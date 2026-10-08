// Quick replies: ready-made WhatsApp messages with optional photos, videos or
// PDFs. This file holds the rules (search, filling in names, which files are
// allowed) apart from the screens so they are easy to test.

export type QuickReplyMedia = { path: string; name: string; type: string; size: number }

export type QuickReply = {
  id: number
  title: string
  // Up to three texts, each sent as its own message after the photos and videos.
  messages: string[]
  media: QuickReplyMedia[]
  isActive: boolean
}

export const MAX_QUICK_REPLY_FILES = 5
export const MAX_QUICK_REPLY_MESSAGES = 3
// The most WhatsApp accepts for a video or document.
export const MAX_QUICK_REPLY_FILE_BYTES = 16 * 1024 * 1024
export const QUICK_REPLY_FILE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'application/pdf']

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
    return `${file.name} is not a photo (PNG, JPG, WebP), an MP4 video or a PDF.`
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
        reply.title.toLowerCase().includes(text) || reply.messages.some((message) => message.toLowerCase().includes(text)),
    )
    .sort((a, b) => Number(starts(b)) - Number(starts(a)))
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

export function mediaKind(type: string): 'image' | 'video' | 'file' {
  if (type.startsWith('image/')) {
    return 'image'
  }
  if (type.startsWith('video/')) {
    return 'video'
  }
  return 'file'
}
