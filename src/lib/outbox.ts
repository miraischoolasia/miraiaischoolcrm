// What happens between pressing Send and a message reaching the parent. Messages
// leave one at a time, in the order they were written, so a quick text never
// overtakes the slower video typed before it.

export type OutgoingPart = { content: string; files: File[] }

// One press of Send can hold a text and several files. One file keeps its text
// as a caption; several files go one by one, and the text follows them last, the
// way they are laid out above the message box.
export function splitForSending(content: string, files: File[]): OutgoingPart[] {
  const text = content.trim()
  if (files.length === 0) {
    return text ? [{ content: text, files: [] }] : []
  }
  if (files.length === 1) {
    return [{ content: text, files }]
  }
  const parts: OutgoingPart[] = files.map((file) => ({ content: '', files: [file] }))
  if (text) {
    parts.push({ content: text, files: [] })
  }
  return parts
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
