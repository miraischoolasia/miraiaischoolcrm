import { describe, expect, it } from 'vitest'
import { fileKind, splitForSending } from './outbox'

const file = (name: string, type = 'image/png') => new File(['x'], name, { type })

describe('splitForSending', () => {
  it('sends nothing for an empty message', () => {
    expect(splitForSending('   ', [])).toEqual([])
  })

  it('keeps a lone text as one message', () => {
    expect(splitForSending(' Hello ', [])).toEqual([{ content: 'Hello', files: [] }])
  })

  it('sends a single file on its own and the text after it, never as a caption', () => {
    const video = file('a.mp4', 'video/mp4')
    expect(splitForSending('Look', [video])).toEqual([
      { content: '', files: [video] },
      { content: 'Look', files: [] },
    ])
  })

  it('sends several files one by one and the text last', () => {
    const one = file('1.png')
    const two = file('2.mp4', 'video/mp4')
    expect(splitForSending('Here you go', [one, two])).toEqual([
      { content: '', files: [one] },
      { content: '', files: [two] },
      { content: 'Here you go', files: [] },
    ])
  })

  it('sends each of several texts as its own message, after the files', () => {
    const photo = file('1.png')
    expect(splitForSending(' First ', [photo], ['Second', '  ', 'Third'])).toEqual([
      { content: '', files: [photo] },
      { content: 'First', files: [] },
      { content: 'Second', files: [] },
      { content: 'Third', files: [] },
    ])
  })

  it('sends several files without a text message when there is no text', () => {
    const one = file('1.png')
    const two = file('2.png')
    expect(splitForSending('', [one, two])).toHaveLength(2)
  })
})

describe('fileKind', () => {
  it('tells photos, videos, voice and other files apart', () => {
    expect(fileKind({ type: 'image/jpeg' })).toBe('image')
    expect(fileKind({ type: 'video/mp4' })).toBe('video')
    expect(fileKind({ type: 'audio/webm' })).toBe('audio')
    expect(fileKind({ type: 'application/pdf' })).toBe('file')
  })
})
