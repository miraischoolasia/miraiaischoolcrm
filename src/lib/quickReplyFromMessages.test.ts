import { describe, expect, it } from 'vitest'
import { quickReplyStartFrom } from './quickReplyFromMessages'
import { typeOfFileName } from './quickReplies'
import type { ChatwootMessage } from './whatsappInbox'

const message = (id: number, content: string | null, attachments?: ChatwootMessage['attachments']): ChatwootMessage => ({
  id,
  content: content as string,
  message_type: 1,
  created_at: 1_800_000_000 + id,
  private: false,
  status: 'sent',
  source_id: null,
  attachments,
})

const attachment = (file_type: string, data_url: string) =>
  ({ id: 1, file_type, data_url, extension: null, file_size: 10 }) as unknown as NonNullable<ChatwootMessage['attachments']>[number]

const VOICE_LINK = 'https://firebasestorage.googleapis.com/v0/b/x/o/templates%2Fvoice-1.mp4?alt=media&token=abc'

describe('quickReplyStartFrom', () => {
  it('copies text, then each file, in the order of the messages', async () => {
    const start = await quickReplyStartFrom(
      [message(1, 'Hello'), message(2, '', [attachment('image', 'https://wa.example/a/map.png')])],
      async () => new Blob(['x'], { type: 'image/png' }),
    )

    expect(start.steps.map((step) => step.kind)).toEqual(['text', 'file'])
    expect(start.steps[0]).toEqual({ kind: 'text', text: 'Hello' })
    expect(start.note).toBeUndefined()
  })

  it('turns a voice message that is only a link in the text (Messenger and Instagram) into a file row', async () => {
    const loaded: string[] = []
    const start = await quickReplyStartFrom([message(1, VOICE_LINK)], async (url) => {
      loaded.push(url)
      return new Blob(['x'], { type: 'video/mp4' })
    })

    expect(loaded).toEqual([VOICE_LINK])
    expect(start.steps).toHaveLength(1)
    const [step] = start.steps
    expect(step.kind).toBe('file')
    expect(step.kind === 'file' && step.file.name).toBe('voice-1.mp4')
    expect(start.note).toBeUndefined()
  })

  it('keeps the words that come with a link, before the file', async () => {
    const start = await quickReplyStartFrom([message(1, `Listen to this\n${VOICE_LINK}`)], async () => new Blob(['x'], { type: 'video/mp4' }))

    expect(start.steps.map((step) => step.kind)).toEqual(['text', 'file'])
  })

  it('keeps the link as a text row, and says so, when the file cannot be fetched', async () => {
    const start = await quickReplyStartFrom([message(1, VOICE_LINK)], async () => {
      throw new Error('blocked')
    })

    expect(start.steps).toEqual([{ kind: 'text', text: VOICE_LINK }])
    expect(start.note).toBe('One photo or file could not be loaded.')
  })

  it('takes a voice attachment of unknown type as an OGG voice message', async () => {
    const start = await quickReplyStartFrom(
      [message(1, '', [attachment('audio', 'https://wa.example/a/AUD-77')])],
      async () => new Blob(['x'], { type: '' }),
    )

    const [step] = start.steps
    expect(step.kind === 'file' && [step.file.name, step.file.type]).toEqual(['AUD-77.ogg', 'audio/ogg'])
  })

  it('says what was left out, and why nothing was copied when there is nothing', async () => {
    const odd = await quickReplyStartFrom(
      [message(1, '', [attachment('file', 'https://wa.example/a/note.docx')])],
      async () => new Blob(['x'], { type: 'application/msword' }),
    )
    expect(odd.steps).toEqual([])
    expect(odd.note).toMatch(/^Left out: note\.docx is not a photo/)

    const empty = await quickReplyStartFrom([message(1, null)], async () => new Blob([]))
    expect(empty.note).toBe('There was no text, photo or file in the messages picked.')
  })

  it('holds at most 5 rows and says so', async () => {
    const start = await quickReplyStartFrom(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((text, index) => message(index + 1, text)),
      async () => new Blob([]),
    )

    expect(start.steps).toHaveLength(5)
    expect(start.note).toMatch(/only the first 5/)
  })
})

describe('typeOfFileName', () => {
  it('knows the endings of the files a quick reply can hold', () => {
    expect(typeOfFileName('a.mp4')).toBe('video/mp4')
    expect(typeOfFileName('a.M4A?x=1')).toBe('audio/mp4')
    expect(typeOfFileName('a.jpeg')).toBe('image/jpeg')
    expect(typeOfFileName('a.docx')).toBe('')
    expect(typeOfFileName('noending')).toBe('')
  })
})
