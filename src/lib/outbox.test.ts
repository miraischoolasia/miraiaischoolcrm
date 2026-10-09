import { describe, expect, it } from 'vitest'
import { fileKind, splitSequence } from './outbox'

const file = (name: string, type = 'image/png') => new File(['x'], name, { type })

describe('splitSequence', () => {
  it('sends nothing for empty texts', () => {
    expect(splitSequence(['   ', ''])).toEqual([])
  })

  it('keeps a lone text as one message', () => {
    expect(splitSequence([' Hello '])).toEqual([{ content: 'Hello', files: [] }])
  })

  it('sends each text and each file as its own message, in the order given', () => {
    const photo = file('1.png')
    const video = file('2.mp4', 'video/mp4')
    expect(splitSequence(['First', photo, 'Second', video, ' ', 'Third'])).toEqual([
      { content: 'First', files: [] },
      { content: '', files: [photo] },
      { content: 'Second', files: [] },
      { content: '', files: [video] },
      { content: 'Third', files: [] },
    ])
  })
})

describe('fileKind', () => {
  it('tells pictures, videos, sound and other files apart', () => {
    expect(fileKind(file('a.png', 'image/png'))).toBe('image')
    expect(fileKind(file('a.mp4', 'video/mp4'))).toBe('video')
    expect(fileKind(file('a.ogg', 'audio/ogg'))).toBe('audio')
    expect(fileKind(file('a.pdf', 'application/pdf'))).toBe('file')
  })
})
