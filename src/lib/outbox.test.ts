import { describe, expect, it } from 'vitest'
import { fileKind, fileProblem, splitSequence } from './outbox'

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

describe('fileProblem', () => {
  const MB = 1024 * 1024

  it('lets a video up to 32 MB through and stops a bigger one with its size', () => {
    expect(fileProblem({ name: 'a.mp4', type: 'video/mp4', size: 32 * MB })).toBeNull()
    expect(fileProblem({ name: 'big.mp4', type: 'video/mp4', size: 45 * MB })).toBe(
      '"big.mp4" is 45.0 MB. A video can be at most 32 MB. Make it shorter or smaller first.',
    )
  })

  it('lets any other file up to 40 MB through and stops a bigger one before it fails on the server', () => {
    expect(fileProblem({ name: 'fees.pdf', type: 'application/pdf', size: 40 * MB })).toBeNull()
    expect(fileProblem({ name: 'poster.png', type: 'image/png', size: 12 * MB })).toBeNull()
    expect(fileProblem({ name: 'fees.pdf', type: 'application/pdf', size: 60 * MB })).toBe(
      '"fees.pdf" is 60.0 MB. A file can be at most 40 MB. Make it smaller first.',
    )
  })
})
