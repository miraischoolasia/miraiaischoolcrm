import { beforeEach, describe, expect, it } from 'vitest'
import { EMOJI_GROUPS, insertAt, readRecentEmoji, rememberEmoji } from './emoji'

describe('EMOJI_GROUPS', () => {
  it('has several groups, each full of emoji with none repeated in a group', () => {
    expect(EMOJI_GROUPS.length).toBeGreaterThanOrEqual(4)
    for (const group of EMOJI_GROUPS) {
      expect(group.emojis.length).toBeGreaterThan(10)
      expect(new Set(group.emojis).size).toBe(group.emojis.length)
    }
  })

  it('writes a plain symbol such as a heart as a picture', () => {
    const hearts = EMOJI_GROUPS.find((group) => group.id === 'hearts')!.emojis
    expect(hearts[0]).toBe('❤️')
  })
})

describe('insertAt', () => {
  it('puts the emoji at the cursor and moves the cursor after it', () => {
    expect(insertAt('Hello world', '😀', 5, 5)).toEqual({ text: 'Hello😀 world', cursor: 7 })
  })

  it('replaces the words that are selected', () => {
    expect(insertAt('Hello world', '👍', 6, 11)).toEqual({ text: 'Hello 👍', cursor: 8 })
  })

  it('copes with a cursor outside the text', () => {
    expect(insertAt('Hi', '😀', 99, 99).text).toBe('Hi😀')
  })
})

describe('recent emoji', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('remembers the newest first without repeats, and at most sixteen', () => {
    rememberEmoji('😀')
    rememberEmoji('👍')
    rememberEmoji('😀')
    expect(readRecentEmoji()).toEqual(['😀', '👍'])

    for (const emoji of ['🔥', '✅', '🎉', '💯', '🙏', '😂', '😍', '🥰', '😎', '🤔', '😭', '😅', '🤗', '🙌', '👏']) {
      rememberEmoji(emoji)
    }
    expect(readRecentEmoji()).toHaveLength(16)
    expect(readRecentEmoji()[0]).toBe('👏')
  })

  it('ignores a damaged saved list', () => {
    window.localStorage.setItem('whatsapp-recent-emoji', '{not json')
    expect(readRecentEmoji()).toEqual([])
  })
})
