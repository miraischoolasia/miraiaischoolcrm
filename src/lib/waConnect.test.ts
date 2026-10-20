import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWaConnect } from './waConnect'

function reply(status: number, body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }))
}

describe('createWaConnect', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('asks the gateway with the login token and reads the link state', async () => {
    const fetchMock = reply(200, { instance: { instanceName: 'eduhero', state: 'open' } })
    vi.stubGlobal('fetch', fetchMock)
    const connect = createWaConnect('https://wa.example', async () => 'tok')

    expect(await connect.state()).toBe('open')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://wa.example/wa/connect/state')
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer tok')
  })

  it('asks about one number of the school by its name, and about the one number of the school without', async () => {
    const fetchMock = reply(200, { instance: { state: 'close' } })
    vi.stubGlobal('fetch', fetchMock)
    await createWaConnect('https://wa.example', async () => 'tok', 'school-2').state()
    await createWaConnect('https://wa.example', async () => 'tok', 'school-2').qr()
    await createWaConnect('https://wa.example', async () => 'tok').state()
    const urls = fetchMock.mock.calls.map((call) => (call as unknown as [string])[0])
    expect(urls).toEqual([
      'https://wa.example/wa/connect/state?instance=school-2',
      'https://wa.example/wa/connect/qr?instance=school-2',
      'https://wa.example/wa/connect/state',
    ])
  })

  it('says unavailable when the gateway has no such door or refuses', async () => {
    vi.stubGlobal('fetch', reply(404, {}))
    expect(await createWaConnect('https://wa.example', async () => 'tok').state()).toBe('unavailable')
    vi.stubGlobal('fetch', reply(403, {}))
    expect(await createWaConnect('https://wa.example', async () => 'tok').state()).toBe('unavailable')
  })

  it('treats anything else as not linked', async () => {
    vi.stubGlobal('fetch', reply(200, { instance: { state: 'close' } }))
    expect(await createWaConnect('https://wa.example', async () => 'tok').state()).toBe('close')
  })

  it('returns the QR picture only when it is a PNG data address', async () => {
    vi.stubGlobal('fetch', reply(200, { base64: 'data:image/png;base64,AAAA', pairingCode: 'AB12CD34' }))
    const connect = createWaConnect('https://wa.example', async () => 'tok')
    expect(await connect.qr()).toEqual({ image: 'data:image/png;base64,AAAA', pairingCode: 'AB12CD34', count: null, key: 'data:image/png;base64,AAAA', linked: false })

    vi.stubGlobal('fetch', reply(200, { base64: 'https://evil.example/x.svg' }))
    expect((await connect.qr()).image).toBeNull()
  })

  it('says which code it is, and when the phone got linked meanwhile', async () => {
    vi.stubGlobal('fetch', reply(200, { base64: 'data:image/png;base64,AAAA', code: '2@abc', count: 3, pairingCode: null }))
    const connect = createWaConnect('https://wa.example', async () => 'tok')
    expect(await connect.qr()).toMatchObject({ count: 3, key: '#3', linked: false })

    vi.stubGlobal('fetch', reply(200, { code: '2@xyz' }))
    expect((await connect.qr()).key).toBe('2@xyz')

    vi.stubGlobal('fetch', reply(200, { instance: { instanceName: 'eduhero', state: 'open' } }))
    expect(await connect.qr()).toMatchObject({ image: null, linked: true })
  })

  it('fails with a clear message when no QR can be had', async () => {
    vi.stubGlobal('fetch', reply(500, {}))
    await expect(createWaConnect('https://wa.example', async () => 'tok').qr()).rejects.toThrow(/QR code/)
  })
})
