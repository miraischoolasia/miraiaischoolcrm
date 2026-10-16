// A Messenger / Instagram person's photo, voice message or video reaches the inbox (through the GoHighLevel bridge
// and the history import) as the link to the file, written as the message's text. These helpers find such links so the
// chat can show the picture or play the sound instead of a long web address.

export type LinkedMediaKind = 'image' | 'audio' | 'video' | 'file'

export type LinkedMedia = { url: string; kind: LinkedMediaKind }

const IMAGE = /\.(jpe?g|png|gif|webp|heic|bmp)$/i
const AUDIO = /\.(mp3|m4a|aac|ogg|oga|opus|wav|amr)$/i
// A voice message from Messenger is an audio-only .mp4, so a video link may turn out to be a voice message.
const VIDEO = /\.(mp4|mov|webm|3gp|m4v)$/i
const FILE = /\.(pdf|docx?|xlsx?|pptx?|zip|csv|txt)$/i

export function mediaKindOfUrl(url: string): LinkedMediaKind | null {
  let path: string
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null
    }
    path = decodeURIComponent(parsed.pathname)
  } catch {
    return null
  }
  if (IMAGE.test(path)) {
    return 'image'
  }
  if (AUDIO.test(path)) {
    return 'audio'
  }
  if (VIDEO.test(path)) {
    return 'video'
  }
  return FILE.test(path) ? 'file' : null
}

// The lines of a message that are only a link to a file, and what is left of the text.
export function splitLinkedMedia(text: string): { media: LinkedMedia[]; rest: string } {
  const media: LinkedMedia[] = []
  const rest: string[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    const kind = /^https?:\/\/\S+$/.test(trimmed) ? mediaKindOfUrl(trimmed) : null
    if (kind) {
      media.push({ url: trimmed, kind })
    } else {
      rest.push(line)
    }
  }
  return { media, rest: rest.join('\n').trim() }
}

// What the chat list says for a message that is only links to files.
export function linkedMediaLabel(text: string): string | null {
  const { media, rest } = splitLinkedMedia(text)
  if (media.length === 0 || rest) {
    return null
  }
  switch (media[0].kind) {
    case 'image':
      return 'Photo'
    case 'audio':
      return 'Voice message'
    case 'video':
      return 'Voice message or video'
    default:
      return 'File'
  }
}
