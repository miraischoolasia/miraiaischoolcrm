import { describe, expect, it } from 'vitest'
import { draftPreview, draftsFirst, isEmptyDraft, type Draft } from './draft'

const draft = (patch: Partial<Draft> = {}): Draft => ({ mode: 'reply', text: '', queue: [], files: [], ...patch })
const photo = new File(['x'], 'a.png', { type: 'image/png' })

describe('isEmptyDraft', () => {
  it('is empty with nothing but spaces and blank rows', () => {
    expect(isEmptyDraft(draft({ text: '  ', queue: [{ id: 1, kind: 'text', text: '' }] }))).toBe(true)
  })

  it('is not empty with text, a row with text, or a file', () => {
    expect(isEmptyDraft(draft({ text: 'Hi' }))).toBe(false)
    expect(isEmptyDraft(draft({ queue: [{ id: 1, kind: 'text', text: 'Hi' }] }))).toBe(false)
    expect(isEmptyDraft(draft({ files: [photo] }))).toBe(false)
    expect(isEmptyDraft(draft({ queue: [{ id: 1, kind: 'file', file: photo }] }))).toBe(false)
  })
})

describe('draftPreview', () => {
  it('shows the first words written on one line', () => {
    expect(draftPreview(draft({ text: 'Hello\n  there' }))).toBe('Hello there')
  })

  it('falls back to the first row with text, then to what is attached', () => {
    expect(draftPreview(draft({ queue: [{ id: 1, kind: 'file', file: photo }, { id: 2, kind: 'text', text: 'Fees' }] }))).toBe('Fees')
    expect(draftPreview(draft({ files: [photo] }))).toBe('Photo')
  })
})

describe('draftsFirst', () => {
  it('puts chats with a draft first and keeps the rest in order', () => {
    const chats = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]
    expect(draftsFirst(chats, (id) => id === 3 || id === 2).map((chat) => chat.id)).toEqual([2, 3, 1, 4])
  })
})
