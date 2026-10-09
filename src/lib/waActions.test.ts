import { describe, expect, it, vi } from 'vitest'
import { createWaActions, parseEvents, waIdOf } from './waActions'

const reaction = (target: string, text: string, fromMe: boolean, at: number) => ({
  key: { id: `r${at}`, fromMe, remoteJid: 'chat@lid' },
  messageTimestamp: at,
  message: { reactionMessage: { key: { id: target }, text } },
})

describe('parseEvents', () => {
  it('keeps the newest reaction of each person, and drops one that was taken back', () => {
    const events = parseEvents([
      reaction('m1', '👍', false, 1),
      reaction('m1', '❤️', false, 5),
      reaction('m1', '🙏', true, 2),
      reaction('m2', '😂', false, 1),
      reaction('m2', '', false, 9),
    ])

    expect(events.reactions.get('m1')).toEqual([
      { emoji: '❤️', byUs: false },
      { emoji: '🙏', byUs: true },
    ])
    expect(events.reactions.has('m2')).toBe(false)
  })

  it('reads the newest edit of a message, and the messages taken back', () => {
    const events = parseEvents([
      { messageTimestamp: 1, message: { protocolMessage: { type: 14, key: { id: 'm1' }, editedMessage: { conversation: 'first' } } } },
      {
        messageTimestamp: 3,
        message: { protocolMessage: { type: 'MESSAGE_EDIT', key: { id: 'm1' }, editedMessage: { extendedTextMessage: { text: 'second' } } } },
      },
      { messageTimestamp: 2, message: { protocolMessage: { type: 14, key: { id: 'm1' }, editedMessage: { conversation: 'older' } } } },
      { message: { protocolMessage: { type: 0, key: { id: 'm9' } } } },
    ])

    expect(events.edits.get('m1')).toBe('second')
    expect([...events.deleted]).toEqual(['m9'])
  })

  it('remembers which messages are only a reaction written into the chat', () => {
    const events = parseEvents([reaction('m1', '🙏', false, 3), reaction('m1', '❤️', true, 4)])

    expect([...events.reactionIds].sort()).toEqual(['r3', 'r4'])
  })

  it('holds the text WhatsApp has now for plain messages', () => {
    const events = parseEvents([{ key: { id: 'm1', fromMe: true, remoteJid: 'c@lid' }, message: { conversation: 'changed text' } }])

    expect(events.texts.get('m1')).toBe('changed text')
  })
})

describe('waIdOf', () => {
  it('takes the id WhatsApp uses out of the one Chatwoot keeps', () => {
    expect(waIdOf('WAID:3EB0ABC')).toBe('3EB0ABC')
    expect(waIdOf('other')).toBeNull()
    expect(waIdOf(null)).toBeNull()
  })
})

describe('createWaActions', () => {
  function setup(records: unknown[] = [{ key: { id: 'A1', fromMe: false, remoteJid: 'chat@lid' } }]) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ messages: { records } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    return { actions: createWaActions('https://gw.example', async () => 'token'), fetchMock }
  }
  const lastCall = (fetchMock: ReturnType<typeof vi.fn>) => {
    const [url, init] = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit]
    return { url, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined }
  }

  it('reacts with the key WhatsApp has for the message, through the gateway with the login', async () => {
    const { actions, fetchMock } = setup()

    await actions.react('A1', '👍')

    expect(lastCall(fetchMock)).toEqual({
      url: 'https://gw.example/wa/evo/message/sendReaction',
      method: 'POST',
      body: { key: { id: 'A1', fromMe: false, remoteJid: 'chat@lid' }, reaction: '👍' },
    })
    const headers = (fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit])[1].headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer token')
  })

  it('deletes for everyone and edits with the same key', async () => {
    const { actions, fetchMock } = setup()

    await actions.edit('A1', 'new text')
    expect(lastCall(fetchMock)).toMatchObject({ url: 'https://gw.example/wa/evo/chat/updateMessage', body: { text: 'new text' } })
    await actions.deleteForEveryone('A1')
    expect(lastCall(fetchMock)).toMatchObject({ method: 'DELETE', url: 'https://gw.example/wa/evo/chat/deleteMessageForEveryone' })
  })

  it('asks WhatsApp for a message only once', async () => {
    const { actions, fetchMock } = setup()

    await actions.keyOf('A1')
    await actions.keyOf('A1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refuses a message WhatsApp does not know', async () => {
    const { actions } = setup([])

    await expect(actions.react('nope', '👍')).rejects.toThrow('does not know')
  })
})
