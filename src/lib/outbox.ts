// What happens between pressing Send and a message reaching the parent. Messages
// leave one at a time, in the order they were written, so a quick text never
// overtakes the slower video typed before it.

export type OutgoingPart = { content: string; files: File[] }

// One press of Send can hold several files and up to three texts. Every file
// goes as its own message, then each text as its own message, in the order
// written. A text is never glued to a picture or video as its caption.
export function splitForSending(content: string, files: File[], moreTexts: string[] = []): OutgoingPart[] {
  const texts = [content, ...moreTexts].map((text) => text.trim()).filter(Boolean)
  return [
    ...files.map((file) => ({ content: '', files: [file] })),
    ...texts.map((text) => ({ content: text, files: [] })),
  ]
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
