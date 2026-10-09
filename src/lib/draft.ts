// What was written in a chat's message box and not sent, kept per chat so it is still there
// after going to another chat or another page.

export type ComposerItem = { id: number; kind: 'text'; text: string } | { id: number; kind: 'file'; file: File }

export type Draft = {
  mode: 'reply' | 'note'
  text: string
  // Rows from a quick reply, sent in this order before anything else.
  queue: ComposerItem[]
  // Files attached by hand.
  files: File[]
}

export function isEmptyDraft(draft: Pick<Draft, 'text' | 'queue' | 'files'>) {
  return (
    !draft.text.trim() &&
    draft.files.length === 0 &&
    draft.queue.every((item) => item.kind === 'text' && !item.text.trim())
  )
}

const FILE_WORDS = { image: 'Photo', video: 'Video', audio: 'Voice message', file: 'File' } as const

// One short line for the chat list: the first words written, else what is attached.
export function draftPreview(draft: Draft): string {
  const written = [draft.text, ...draft.queue.flatMap((item) => (item.kind === 'text' ? [item.text] : []))]
    .map((text) => text.trim().replace(/\s+/g, ' '))
    .find(Boolean)
  if (written) {
    return written
  }
  const file = [...draft.queue.flatMap((item) => (item.kind === 'file' ? [item.file] : [])), ...draft.files][0]
  if (!file) {
    return ''
  }
  const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'file'
  return FILE_WORDS[kind]
}

// Chats with a draft first; everyone else keeps their order.
export function draftsFirst<T extends { id: number }>(items: T[], hasDraft: (id: number) => boolean): T[] {
  return [...items.filter((item) => hasDraft(item.id)), ...items.filter((item) => !hasDraft(item.id))]
}
