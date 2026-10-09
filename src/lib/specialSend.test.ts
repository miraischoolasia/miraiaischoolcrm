import { describe, expect, it, vi } from 'vitest'
import { describeSent, parseSpecialMessage } from './specialMessages'
import { createWaActions } from './waActions'

describe('describeSent', () => {
  it('writes a location so the chat reads it back as the same card', () => {
    const text = describeSent({ kind: 'location', latitude: 3.139, longitude: 101.6869, name: 'Mirai School', address: 'Jalan 1' })

    expect(parseSpecialMessage(text)).toMatchObject({ kind: 'location', lat: '3.139', lng: '101.6869', name: 'Mirai School', address: 'Jalan 1' })
  })

  it('writes a contact so the chat reads it back as the same card', () => {
    const text = describeSent({ kind: 'contact', fullName: 'Yun', phone: '60 11-5772 5709' })

    expect(parseSpecialMessage(text)).toEqual({ kind: 'contact', name: 'Yun', numbers: ['+601157725709'] })
  })

  it('lists the answers of a poll under its question', () => {
    expect(describeSent({ kind: 'poll', question: 'Which day?', options: ['Sat', 'Sun'] })).toBe('*Poll:* Which day?\n1. Sat\n2. Sun')
    expect(parseSpecialMessage(describeSent({ kind: 'poll', question: 'Which day?', options: ['Sat', 'Sun'] }))).toEqual({
      kind: 'poll',
      question: 'Which day?',
      options: ['Sat', 'Sun'],
    })
  })
})

describe('sendSpecial', () => {
  function setup() {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/chat/findMessages')
        ? new Response(JSON.stringify({ messages: { records: [{ key: { id: 'A1', fromMe: false, remoteJid: 'chat@lid' } }] } }), { status: 200 })
        : new Response(JSON.stringify({ key: { id: 'SENT1' } }), { status: 201 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    return { actions: createWaActions('https://gw.example', async () => 'token'), fetchMock }
  }
  const lastBody = (fetchMock: ReturnType<typeof vi.fn>) => JSON.parse(String((fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body))
  const lastUrl = (fetchMock: ReturnType<typeof vi.fn>) => (fetchMock.mock.calls.at(-1) as unknown as [string])[0]

  it('sends a location into the chat of the message it is anchored to and returns the id WhatsApp gave it', async () => {
    const { actions, fetchMock } = setup()

    const id = await actions.sendSpecial('A1', { kind: 'location', latitude: 3.1, longitude: 101.6, name: 'School', address: 'KL' })

    expect(id).toBe('SENT1')
    expect(lastUrl(fetchMock)).toBe('https://gw.example/wa/evo/message/sendLocation')
    expect(lastBody(fetchMock)).toEqual({ number: 'chat@lid', latitude: 3.1, longitude: 101.6, name: 'School', address: 'KL' })
  })

  it('sends a contact with digits only, and a poll with how many answers can be picked', async () => {
    const { actions, fetchMock } = setup()

    await actions.sendSpecial('A1', { kind: 'contact', fullName: 'Yun', phone: '+60 11-5772 5709' })
    expect(lastBody(fetchMock)).toEqual({ number: 'chat@lid', contact: [{ fullName: 'Yun', wuid: '601157725709', phoneNumber: '+601157725709' }] })

    await actions.sendSpecial('A1', { kind: 'poll', question: 'Which day?', options: ['Sat', 'Sun'], selectableCount: 1 })
    expect(lastUrl(fetchMock)).toBe('https://gw.example/wa/evo/message/sendPoll')
    expect(lastBody(fetchMock)).toEqual({ number: 'chat@lid', name: 'Which day?', selectableCount: 1, values: ['Sat', 'Sun'] })
  })

  it('sends a sticker as base64', async () => {
    const { actions, fetchMock } = setup()

    await actions.sendSpecial('A1', { kind: 'sticker', file: new File(['hello'], 's.png', { type: 'image/png' }) })

    expect(lastUrl(fetchMock)).toBe('https://gw.example/wa/evo/message/sendSticker')
    expect(lastBody(fetchMock)).toEqual({ number: 'chat@lid', sticker: 'aGVsbG8=' })
  })
})

describe('showTyping', () => {
  it('shows the parent typing for a few seconds', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const actions = createWaActions('https://gw.example', async () => 'token')

    await actions.showTyping('60123456789')

    const [url, init] = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit]
    expect(url).toBe('https://gw.example/wa/evo/chat/sendPresence')
    expect(JSON.parse(String(init.body))).toEqual({ number: '60123456789', presence: 'composing', delay: 3500 })
  })
})

describe('labelsOf', () => {
  it('names the labels put on the chat on the phone, leaving out the ones with no name', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/label/findLabels')
        ? new Response(
            JSON.stringify([
              { id: '4', name: 'HOA Ads', color: '1' },
              { id: '6', name: '', color: '2' },
              { id: '5', name: 'HOA', color: '0' },
            ]),
            { status: 200 },
          )
        : new Response(JSON.stringify([{ remoteJid: 'chat@lid', labels: ['4', '6'] }]), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const actions = createWaActions('https://gw.example', async () => 'token')

    const labels = await actions.labelsOf(['chat@lid'])

    expect(labels.map((label) => label.name)).toEqual(['HOA Ads'])
    const names = fetchMock.mock.calls.map((call) => (call as unknown as [string])[0])
    expect(names).toContain('https://gw.example/wa/evo/chat/findChats')
  })

  it('asks for the label names only once', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/label/findLabels')
        ? new Response(JSON.stringify([{ id: '4', name: 'HOA Ads', color: '1' }]), { status: 200 })
        : new Response(JSON.stringify([{ labels: '["4"]' }]), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const actions = createWaActions('https://gw.example', async () => 'token')

    await actions.labelsOf(['a@lid'])
    const again = await actions.labelsOf(['a@lid'])

    expect(again.map((label) => label.name)).toEqual(['HOA Ads'])
    expect(fetchMock.mock.calls.filter((call) => String((call as unknown as [string])[0]).endsWith('/label/findLabels'))).toHaveLength(1)
  })
})
