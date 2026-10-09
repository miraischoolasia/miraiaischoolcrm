import { describe, expect, it } from 'vitest'
import {
  checkQuickReplyFile,
  fillVariables,
  mediaKind,
  moveItem,
  parseMedia,
  parseSteps,
  replyMedia,
  replyTexts,
  searchQuickReplies,
  unfilledVariables,
  type QuickReply,
} from './quickReplies'

const reply = (id: number, title: string, body = '', isActive = true): QuickReply => ({
  id,
  title,
  steps: body ? [{ kind: 'text', text: body }] : [],
  isActive,
})

describe('fillVariables', () => {
  it('puts the names in place of their tags, whatever the capitals', () => {
    expect(
      fillVariables('Hi {Parent Name}, {child name} is booked on {trial date}.', {
        '{parent name}': 'Mei Ling',
        '{child name}': 'Ethan',
        '{trial date}': '12 Oct',
      }),
    ).toBe('Hi Mei Ling, Ethan is booked on 12 Oct.')
  })

  it('leaves a tag alone when its value is not known', () => {
    expect(fillVariables('Hi {parent name}, see {child name}', { '{parent name}': 'Mei Ling', '{child name}': ' ' })).toBe(
      'Hi Mei Ling, see {child name}',
    )
  })

  it('does not touch other braces', () => {
    expect(fillVariables('{something else}', {})).toBe('{something else}')
  })
})

describe('unfilledVariables', () => {
  it('lists each tag left once', () => {
    expect(unfilledVariables('{child name} and {Child Name} on {trial date}')).toEqual(['{child name}', '{trial date}'])
  })

  it('finds none in a finished message', () => {
    expect(unfilledVariables('All set')).toEqual([])
  })
})

describe('searchQuickReplies', () => {
  const list = [reply(1, 'Trial details', 'Come at 2pm'), reply(2, 'Fees', 'The trial is free'), reply(3, 'Old', '', false)]

  it('shows only active replies when nothing is typed', () => {
    expect(searchQuickReplies(list, '  ').map((item) => item.id)).toEqual([1, 2])
  })

  it('looks in the title and the message, title matches first', () => {
    expect(searchQuickReplies(list, 'trial').map((item) => item.id)).toEqual([1, 2])
    expect(searchQuickReplies(list, 'fee').map((item) => item.id)).toEqual([2])
  })

  it('looks in every message of a reply, not only the first', () => {
    const several: QuickReply = {
      ...reply(9, 'Welcome'),
      steps: [
        { kind: 'text', text: 'Hello' },
        { kind: 'media', media: { path: 'a', name: 'a.png', type: 'image/png', size: 1 } },
        { kind: 'text', text: 'Fees start at RM100' },
      ],
    }
    expect(searchQuickReplies([several], 'rm100').map((item) => item.id)).toEqual([9])
  })

  it('never offers a hidden reply', () => {
    expect(searchQuickReplies(list, 'old')).toEqual([])
  })
})

describe('checkQuickReplyFile', () => {
  it('accepts a photo, an mp4 and a pdf', () => {
    expect(checkQuickReplyFile({ name: 'a.png', type: 'image/png', size: 100 })).toBeNull()
    expect(checkQuickReplyFile({ name: 'a.mp4', type: 'video/mp4', size: 100 })).toBeNull()
    expect(checkQuickReplyFile({ name: 'a.pdf', type: 'application/pdf', size: 100 })).toBeNull()
  })

  it('refuses a type WhatsApp cannot play and anything over 16 MB', () => {
    expect(checkQuickReplyFile({ name: 'a.webm', type: 'video/webm', size: 100 })).toMatch(/not a photo/)
    expect(checkQuickReplyFile({ name: 'big.mp4', type: 'video/mp4', size: 17 * 1024 * 1024 })).toMatch(/16 MB/)
  })
})

describe('parseMedia', () => {
  it('keeps well-formed files and drops the rest', () => {
    expect(parseMedia([{ path: 'a', name: 'A', type: 'image/png', size: 5 }, { path: 1 }, null, 'x'])).toEqual([
      { path: 'a', name: 'A', type: 'image/png', size: 5 },
    ])
    expect(parseMedia(null)).toEqual([])
  })
})

describe('mediaKind', () => {
  it('sorts by type', () => {
    expect(mediaKind('image/webp')).toBe('image')
    expect(mediaKind('video/mp4')).toBe('video')
    expect(mediaKind('application/pdf')).toBe('file')
  })
})

describe('parseSteps', () => {
  it('keeps well-formed rows in their order and drops the rest', () => {
    expect(
      parseSteps([
        { kind: 'text', text: 'Hi' },
        { kind: 'media', media: { path: 'a', name: 'A', type: 'image/png', size: 5 } },
        { kind: 'text', text: 3 },
        { kind: 'media', media: { path: 1 } },
        null,
      ]),
    ).toEqual([
      { kind: 'text', text: 'Hi' },
      { kind: 'media', media: { path: 'a', name: 'A', type: 'image/png', size: 5 } },
    ])
    expect(parseSteps(null)).toEqual([])
  })

  it('splits a reply into its texts and its files', () => {
    const steps = parseSteps([
      { kind: 'media', media: { path: 'a', name: 'A', type: 'image/png', size: 5 } },
      { kind: 'text', text: 'One' },
    ])
    expect(replyTexts({ steps })).toEqual(['One'])
    expect(replyMedia({ steps }).map((item) => item.name)).toEqual(['A'])
  })
})

describe('moveItem', () => {
  it('moves an item to another place and leaves the original list alone', () => {
    const list = ['a', 'b', 'c', 'd']
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a', 'd'])
    expect(moveItem(list, 3, 1)).toEqual(['a', 'd', 'b', 'c'])
    expect(list).toEqual(['a', 'b', 'c', 'd'])
  })

  it('does nothing for the same place or one that does not exist', () => {
    const list = ['a', 'b']
    expect(moveItem(list, 1, 1)).toBe(list)
    expect(moveItem(list, 0, 5)).toBe(list)
  })
})
