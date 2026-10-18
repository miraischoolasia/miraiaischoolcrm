import { splitLinkedMedia } from './linkedMedia'
import {
  checkQuickReplyFile,
  MAX_QUICK_REPLY_STEPS,
  normalizeQuickReplyFile,
  typeOfFileName,
  type QuickReplyStart,
} from './quickReplies'
import type { ChatwootMessage } from './whatsappInbox'

// Fetches a file of a chat; rejects when it cannot be had.
export type LoadChatFile = (url: string) => Promise<Blob>

// The rows of a new quick reply made of messages picked in a chat, oldest first: each message's text, then its
// photos, videos, voice messages and PDFs. Messenger and Instagram files come as links written in the text.
// What cannot be kept is said in the note, so nothing goes missing without a word.
export async function quickReplyStartFrom(messages: ChatwootMessage[], load: LoadChatFile): Promise<QuickReplyStart> {
  const steps: QuickReplyStart['steps'] = []
  const left: string[] = []
  let notLoaded = 0

  // A voice message is kept as an audio file whatever the server called it. False when it could not be had.
  async function addFile(url: string, knownAudio: boolean) {
    try {
      const blob = await load(url)
      // Firebase writes its folders into the name as %2F, so the name is the last piece after decoding.
      const name = decodeURIComponent(url.split('?')[0].split('/').pop() ?? 'file').split('/').pop() || 'file'
      const type = blob.type && blob.type !== 'application/octet-stream' ? blob.type : typeOfFileName(name) || blob.type
      const file = normalizeQuickReplyFile(new File([blob], name, { type }), knownAudio)
      const problem = checkQuickReplyFile(file)
      if (problem) {
        left.push(problem)
      } else {
        steps.push({ kind: 'file', file })
      }
      return true
    } catch {
      notLoaded += 1
      return false
    }
  }

  for (const message of messages) {
    const { media, rest } = splitLinkedMedia((message.content ?? '').trim())
    if (rest) {
      steps.push({ kind: 'text', text: rest })
    }
    for (const link of media) {
      // A link the browser cannot fetch stays as the link, so it is not lost.
      if (!(await addFile(link.url, link.kind === 'audio'))) {
        steps.push({ kind: 'text', text: link.url })
      }
    }
    for (const attachment of message.attachments ?? []) {
      await addFile(attachment.data_url, attachment.file_type === 'audio')
    }
  }

  const notes = left.length > 0 ? [`Left out: ${left.join(' ')}`] : []
  if (notLoaded > 0) {
    notes.push(notLoaded === 1 ? 'One photo or file could not be loaded.' : `${notLoaded} photos or files could not be loaded.`)
  }
  if (steps.length > MAX_QUICK_REPLY_STEPS) {
    notes.push(`A quick reply holds up to ${MAX_QUICK_REPLY_STEPS} rows, so only the first ${MAX_QUICK_REPLY_STEPS} were copied.`)
  }
  if (steps.length === 0 && notes.length === 0) {
    notes.push('There was no text, photo or file in the messages picked.')
  }
  return { steps: steps.slice(0, MAX_QUICK_REPLY_STEPS), note: notes.length > 0 ? notes.join(' ') : undefined }
}
