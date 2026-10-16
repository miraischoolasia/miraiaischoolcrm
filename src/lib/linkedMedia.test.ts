import { describe, expect, it } from 'vitest'
import { linkedMediaLabel, mediaKindOfUrl, splitLinkedMedia } from './linkedMedia'

const voice = 'https://www.rearmcrm.com/conversations-assets/location/L/conversations/C/8dc394a5.mp4'

describe('linked media', () => {
  it('tells what a link is from its file name', () => {
    expect(mediaKindOfUrl(voice)).toBe('video')
    expect(mediaKindOfUrl('https://x.test/a/b.M4A?token=1')).toBe('audio')
    expect(mediaKindOfUrl('https://x.test/a/photo.JPG')).toBe('image')
    expect(mediaKindOfUrl('https://x.test/a/form.pdf')).toBe('file')
    expect(mediaKindOfUrl('https://x.test/page')).toBeNull()
    expect(mediaKindOfUrl('javascript:alert(1).mp4')).toBeNull()
  })

  it('pulls the file links out of a message and keeps the words', () => {
    const { media, rest } = splitLinkedMedia(`Here you go\n${voice}\nhttps://x.test/p.png\nSee you`)

    expect(media).toEqual([
      { url: voice, kind: 'video' },
      { url: 'https://x.test/p.png', kind: 'image' },
    ])
    expect(rest).toBe('Here you go\nSee you')
  })

  it('leaves a link inside a sentence, and a link to a web page, alone', () => {
    expect(splitLinkedMedia(`Listen ${voice} ok`).media).toEqual([])
    expect(splitLinkedMedia('https://x.test/page').media).toEqual([])
  })

  it('words the chat list line for a message that is only a file link', () => {
    expect(linkedMediaLabel(voice)).toBe('Voice message or video')
    expect(linkedMediaLabel('https://x.test/p.png')).toBe('Photo')
    expect(linkedMediaLabel('https://x.test/a.m4a')).toBe('Voice message')
    expect(linkedMediaLabel(`Look\n${voice}`)).toBeNull()
    expect(linkedMediaLabel('hello')).toBeNull()
  })
})
