import { describe, expect, it, vi } from 'vitest'
import { findChatByPhone, normalizePhoneInput, startChat } from './startChat'

function fakeClient(patch: Record<string, unknown> = {}) {
  return {
    getInboxId: vi.fn().mockResolvedValue(1),
    findContactByPhone: vi.fn().mockResolvedValue(null),
    createContact: vi.fn().mockResolvedValue({ id: 50 }),
    listContactConversations: vi.fn().mockResolvedValue([]),
    createConversation: vi.fn().mockResolvedValue({ id: 900 }),
    setStatus: vi.fn().mockResolvedValue(undefined),
    ...patch,
  }
}

describe('normalizePhoneInput', () => {
  it('writes every common form of a Malaysian number the same way', () => {
    expect(normalizePhoneInput('012 345 6789')).toBe('60123456789')
    expect(normalizePhoneInput('+60 12-345 6789')).toBe('60123456789')
    expect(normalizePhoneInput('60123456789')).toBe('60123456789')
  })

  it('refuses what cannot be a number', () => {
    expect(normalizePhoneInput('12345')).toBeNull()
    expect(normalizePhoneInput('abc')).toBeNull()
    expect(normalizePhoneInput('1'.repeat(20))).toBeNull()
  })
})

describe('startChat', () => {
  it('makes the contact and the chat for a number nobody has written from yet', async () => {
    const client = fakeClient()

    const result = await startChat(client, { phone: '012-345 6789', name: ' Mei Ling ' })

    expect(client.createContact).toHaveBeenCalledWith(1, '60123456789', 'Mei Ling')
    expect(client.createConversation).toHaveBeenCalledWith(50, 1)
    expect(result).toEqual({ conversationId: 900, created: true, reopened: false, error: null })
  })

  it('opens the chat that is already open instead of making a second one', async () => {
    const client = fakeClient({
      findContactByPhone: vi.fn().mockResolvedValue({ id: 7 }),
      listContactConversations: vi.fn().mockResolvedValue([
        { id: 4, status: 'resolved', inbox_id: 1 },
        { id: 6, status: 'open', inbox_id: 1 },
      ]),
    })

    const result = await startChat(client, { phone: '60123456789', name: '' })

    expect(result).toEqual({ conversationId: 6, created: false, reopened: false, error: null })
    expect(client.createContact).not.toHaveBeenCalled()
    expect(client.createConversation).not.toHaveBeenCalled()
  })

  it('reopens the latest finished chat of a contact that has no open one', async () => {
    const client = fakeClient({
      findContactByPhone: vi.fn().mockResolvedValue({ id: 7 }),
      listContactConversations: vi.fn().mockResolvedValue([
        { id: 4, status: 'resolved', inbox_id: 1 },
        { id: 5, status: 'resolved', inbox_id: 1 },
      ]),
    })

    const result = await startChat(client, { phone: '60123456789', name: '' })

    expect(client.setStatus).toHaveBeenCalledWith(5, 'open')
    expect(result).toEqual({ conversationId: 5, created: false, reopened: true, error: null })
  })

  it('ignores chats that belong to another inbox', async () => {
    const client = fakeClient({
      findContactByPhone: vi.fn().mockResolvedValue({ id: 7 }),
      listContactConversations: vi.fn().mockResolvedValue([{ id: 4, status: 'open', inbox_id: 2 }]),
    })

    const result = await startChat(client, { phone: '60123456789', name: '' })

    expect(client.createConversation).toHaveBeenCalledWith(7, 1)
    expect(result.conversationId).toBe(900)
  })

  it('says so for a number that is too short, without calling anything', async () => {
    const client = fakeClient()

    const result = await startChat(client, { phone: '123', name: '' })

    expect(result.error).toMatch(/full number/)
    expect(client.getInboxId).not.toHaveBeenCalled()
  })

  it('reports a failure instead of throwing', async () => {
    const client = fakeClient({ getInboxId: vi.fn().mockRejectedValue(new Error('down')) })

    const result = await startChat(client, { phone: '60123456789', name: '' })

    expect(result).toMatchObject({ conversationId: null, error: expect.stringMatching(/Couldn't start/) })
  })
})

describe('findChatByPhone', () => {
  it('finds the open chat of a number without making anything', async () => {
    const client = fakeClient({
      findContactByPhone: vi.fn().mockResolvedValue({ id: 7 }),
      listContactConversations: vi.fn().mockResolvedValue([
        { id: 4, status: 'resolved', inbox_id: 1 },
        { id: 6, status: 'open', inbox_id: 1 },
        { id: 9, status: 'open', inbox_id: 2 },
      ]),
    })

    expect(await findChatByPhone(client, '012-345 6789')).toBe(6)
    expect(client.findContactByPhone).toHaveBeenCalledWith('60123456789')
    expect(client.createContact).not.toHaveBeenCalled()
    expect(client.createConversation).not.toHaveBeenCalled()
  })

  it('falls back to the latest finished chat, and leaves it finished', async () => {
    const client = fakeClient({
      findContactByPhone: vi.fn().mockResolvedValue({ id: 7 }),
      listContactConversations: vi.fn().mockResolvedValue([
        { id: 4, status: 'resolved', inbox_id: 1 },
        { id: 5, status: 'resolved', inbox_id: 1 },
      ]),
    })

    expect(await findChatByPhone(client, '60123456789')).toBe(5)
    expect(client.setStatus).not.toHaveBeenCalled()
  })

  it('says there is none for a number nobody has written from, or one that is too short', async () => {
    const client = fakeClient()

    expect(await findChatByPhone(client, '60123456789')).toBeNull()
    expect(await findChatByPhone(client, '123')).toBeNull()
    expect(client.findContactByPhone).toHaveBeenCalledTimes(1)
    expect(client.createContact).not.toHaveBeenCalled()
  })
})
