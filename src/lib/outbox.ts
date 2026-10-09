// What happens between pressing Send and a message reaching the parent. Messages
// leave one at a time, in the order they were written, so a quick text never
// overtakes the slower video typed before it.

export type OutgoingPart = { content: string; files: File[] }

// One press of Send can hold several texts and files. Each one goes as its own
// message, in the order given. A text is never glued to a picture or video as its caption.
export function splitSequence(items: (string | File)[]): OutgoingPart[] {
  return items.flatMap((item): OutgoingPart[] => {
    if (typeof item === 'string') {
      const text = item.trim()
      return text ? [{ content: text, files: [] }] : []
    }
    return [{ content: '', files: [item] }]
  })
}

export function fileKind(file: Pick<File, 'type'>) {
  if (file.type.startsWith('image/')) {
    return 'image'
  }
  if (file.type.startsWith('video/')) {
    return 'video'
  }
  if (file.type.startsWith('audio/')) {
    return 'audio'
  }
  return 'file'
}

export const CONFIRM_POLL_MS = 1500
// Past this the message is treated as not sent, and the ones queued behind it
// stay unsent rather than jumping ahead.
export const CONFIRM_TIMEOUT_MS = 180_000
