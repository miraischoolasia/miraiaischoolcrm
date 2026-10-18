import { describe, expect, it } from 'vitest'
import { findMessageMatches, splitHighlight } from './chatSearch'
import type { ChatwootMessage } from './whatsappInbox'

const message = (id: number, at: number, content: string, extra: Partial<ChatwootMessage> = {}): ChatwootMessage => ({
  id,
  content,
  message_type: 0,
  created_at: at,
  private: false,
  status: 'sent',
  ...extra,
})

describe('splitHighlight', () => {
  it('marks every place the words are, whatever the case', () => {
    expect(splitHighlight('Zoom link: zoom.us/ZOOM', 'zoom')).toEqual([
      { text: 'Zoom', match: true },
      { text: ' link: ', match: false },
      { text: 'zoom', match: true },
      { text: '.us/', match: false },
      { text: 'ZOOM', match: true },
    ])
  })

  it('returns the text as it is when there is nothing to find', () => {
    expect(splitHighlight('Hello', '')).toEqual([{ text: 'Hello', match: false }])
    expect(splitHighlight('Hello', 'xyz')).toEqual([{ text: 'Hello', match: false }])
  })

  it('finds Chinese words too', () => {
    expect(splitHighlight('星期六下午可以吗', '下午')).toEqual([
      { text: '星期六', match: false },
      { text: '下午', match: true },
      { text: '可以吗', match: false },
    ])
  })
})

describe('findMessageMatches', () => {
  it('lists the messages that hold the words, oldest first, and skips deleted ones', () => {
    const messages = [
      message(3, 300, 'Fees are RM100'),
      message(1, 100, 'What are the fees?'),
      message(2, 200, 'Hello'),
      message(4, 400, 'old fees note', { content_attributes: { deleted: true } }),
    ]

    expect(findMessageMatches(messages, ' FEES ', (entry) => entry.content ?? '')).toEqual([1, 3])
    expect(findMessageMatches(messages, '', (entry) => entry.content ?? '')).toEqual([])
  })
})

describe('splitHighlight for phone numbers', () => {
  it('marks the digits whatever the spaces and dashes between them', () => {
    expect(splitHighlight('+60 12-345 6789', '123456')).toEqual([
      { text: '+60 ', match: false },
      { text: '12-345 6', match: true },
      { text: '789', match: false },
    ])
    expect(splitHighlight('+60 12-345 6789', '999')).toEqual([{ text: '+60 12-345 6789', match: false }])
  })
})
