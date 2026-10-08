import { describe, expect, it } from 'vitest'
import type { Lead, LeadOption, Student } from '../types/domain'
import type { ChatwootMessage } from './whatsappInbox'
import {
  appendLeaveNote,
  canonicalPhone,
  findLeadsByPhone,
  findStudentsByPhone,
  getFirstMessage,
  guessSourceAndTags,
  makeLeadResolver,
  suggestLeadsByName,
} from './chatLink'

const lead = (id: number, phone: string | null, childPhone: string | null = null): Lead =>
  ({
    id,
    phone,
    children: childPhone ? [{ name: 'Kid', age: 8, phone: childPhone }] : [],
  }) as Lead

const option = (id: number, kind: LeadOption['kind'], label: string, legacyKey: string | null = null): LeadOption => ({
  id,
  kind,
  label,
  isActive: true,
  legacyKey,
  color: null,
})

const message = (patch: Partial<ChatwootMessage>): ChatwootMessage => ({
  id: 1,
  content: 'hello',
  message_type: 0,
  created_at: 100,
  private: false,
  status: 'sent',
  ...patch,
})

describe('canonicalPhone', () => {
  it('treats 012-345 6789 and +60 12-345 6789 as the same number', () => {
    expect(canonicalPhone('012-345 6789')).toBe('60123456789')
    expect(canonicalPhone('+60 12-345 6789')).toBe('60123456789')
  })

  it('adds the Singapore code to an eight digit number', () => {
    expect(canonicalPhone('9123 4567')).toBe('6591234567')
  })

  it('returns nothing for a number too short to mean anything', () => {
    expect(canonicalPhone('123')).toBeNull()
    expect(canonicalPhone(null)).toBeNull()
  })
})

describe('phone matching', () => {
  it('finds leads by parent or child number, newest first', () => {
    const found = findLeadsByPhone('60123456789', [lead(1, '0123456789'), lead(2, null, '012 345 6789'), lead(3, '0199999999')])
    expect(found.map((entry) => entry.id)).toEqual([2, 1])
  })

  it('finds nothing without a number', () => {
    expect(findLeadsByPhone(null, [lead(1, '0123456789')])).toEqual([])
  })

  it('finds students by number', () => {
    const students = [{ id: 5, phone: '012-3456789' }, { id: 6, phone: null }] as Student[]
    expect(findStudentsByPhone('60123456789', students).map((entry) => entry.id)).toEqual([5])
  })
})

describe('getFirstMessage', () => {
  it('skips our own messages and private notes', () => {
    const first = getFirstMessage([
      message({ id: 1, message_type: 1, content: 'hi from us' }),
      message({ id: 2, private: true, content: 'note' }),
      message({ id: 3, content: '  Hi, I saw your Facebook ad  ', created_at: 300 }),
    ])
    expect(first).toEqual({ text: 'Hi, I saw your Facebook ad', attachments: [], at: 300 })
  })

  it('names the photo when the first message has no words', () => {
    const first = getFirstMessage([
      message({
        content: null,
        attachments: [{ id: 1, file_type: 'image', data_url: 'x' }],
      }),
    ])
    expect(first?.attachments).toEqual(['Photo'])
  })

  it('returns nothing when the parent has not written', () => {
    expect(getFirstMessage([message({ message_type: 1 })])).toBeNull()
  })
})

describe('guessSourceAndTags', () => {
  const options = [
    option(1, 'source', 'Facebook'),
    option(2, 'source', 'Other', 'other'),
    option(3, 'tag', 'Coding for kids'),
    option(4, 'tag', 'Holiday camp'),
  ]

  it('picks the source and tags named in the message', () => {
    const guess = guessSourceAndTags('Saw your Facebook post about the holiday camp', options)
    expect(guess.source?.id).toBe(1)
    expect(guess.tags.map((tag) => tag.id)).toEqual([4])
  })

  it('never guesses Other', () => {
    expect(guessSourceAndTags('other things', options).source).toBeNull()
  })

  it('ignores hidden options and empty text', () => {
    expect(guessSourceAndTags('', options)).toEqual({ source: null, tags: [] })
    const hidden = [{ ...option(1, 'source', 'Facebook'), isActive: false }]
    expect(guessSourceAndTags('facebook', hidden).source).toBeNull()
  })
})

describe('appendLeaveNote', () => {
  it('starts the notes when there are none', () => {
    expect(appendLeaveNote(null, { date: '2026-10-12', text: ' Sick ', by: 'Amy' })).toBe(
      'Leave (noted 2026-10-12 by Amy): Sick',
    )
  })

  it('keeps what is already there', () => {
    expect(appendLeaveNote('Likes Scratch', { date: '2026-10-12', text: 'Trip', by: 'Amy' })).toBe(
      'Likes Scratch\nLeave (noted 2026-10-12 by Amy): Trip',
    )
  })
})

describe('suggestLeadsByName', () => {
  const named = (id: number, fullName: string | null, child?: string) =>
    ({ id, fullName, phone: null, children: child ? [{ name: child, age: 8, phone: null }] : [] }) as Lead

  it('finds the lead with the same name, ignoring capitals and punctuation', () => {
    const found = suggestLeadsByName('Mei-Ling Tan', [named(1, 'mei ling tan'), named(2, 'Aisha')])
    expect(found.map((lead) => lead.id)).toEqual([1])
  })

  it('also matches the child name and a name that holds the other', () => {
    const found = suggestLeadsByName('Ethan', [named(1, 'Mei Ling', 'Ethan Tan'), named(2, 'Ethan')])
    expect(found.map((lead) => lead.id)).toEqual([2, 1])
  })

  it('works for a Chinese name of two characters', () => {
    expect(suggestLeadsByName('奕婷', [named(1, '陈奕婷')]).map((lead) => lead.id)).toEqual([1])
  })

  it('does not guess from a name too short to mean anything', () => {
    expect(suggestLeadsByName('Al', [named(1, 'Alice')])).toEqual([])
    expect(suggestLeadsByName('', [named(1, 'Alice')])).toEqual([])
  })

  it('returns at most three, closest first', () => {
    const leads = [1, 2, 3, 4].map((id) => named(id, `Sam ${id}`))
    expect(suggestLeadsByName('Sam', leads)).toHaveLength(3)
  })
})

describe('makeLeadResolver', () => {
  it('finds the linked lead first, then a lead by phone, the newest when two share it', () => {
    const resolve = makeLeadResolver([lead(1, '0123456789'), lead(2, '012-345 6789'), lead(3, '0199999999')])

    expect(resolve(3, '60123456789')?.id).toBe(3)
    expect(resolve(null, '60123456789')?.id).toBe(2)
    expect(resolve(99, '60123456789')?.id).toBe(2)
    expect(resolve(null, '60100000000')).toBeNull()
    expect(resolve(null, null)).toBeNull()
  })

  it('matches a child phone too', () => {
    expect(makeLeadResolver([lead(4, null, '0161234567')])(null, '60161234567')?.id).toBe(4)
  })
})
