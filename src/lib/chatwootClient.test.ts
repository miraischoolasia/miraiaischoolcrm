import { afterEach, describe, expect, it, vi } from 'vitest'
import { createChatwootClient } from './chatwootClient'

function stubFetch(body: unknown = { payload: [] }) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createChatwootClient', () => {
  it('sends the login token with every request', async () => {
    const fetchMock = stubFetch({ payload: [] })
    const client = createChatwootClient('https://wa.example.com', '1', async () => 'login-token')

    await client.listMessages(7)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://wa.example.com/api/v1/accounts/1/conversations/7/messages')
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer login-token')
  })

  it('keeps the JSON content type when it adds the token', async () => {
    const fetchMock = stubFetch({})
    const client = createChatwootClient('https://wa.example.com', '1', async () => 'login-token')

    await client.setAttributes(7, { crm_lead_id: 3 })

    const headers = new Headers(fetchMock.mock.calls[0][1].headers)
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('Authorization')).toBe('Bearer login-token')
  })

  it('sends no Authorization header when nobody is signed in', async () => {
    const fetchMock = stubFetch({ payload: [] })
    const client = createChatwootClient('https://wa.example.com', '1', async () => null)

    await client.listMessages(7)

    expect(new Headers(fetchMock.mock.calls[0][1].headers).has('Authorization')).toBe(false)
  })

  it('does not set a content type for a file upload, so the browser can add its own', async () => {
    const fetchMock = stubFetch({ id: 1 })
    const client = createChatwootClient('https://wa.example.com', '1', async () => 'login-token')

    await client.sendMessage(7, {
      content: '',
      isPrivate: false,
      files: [new File(['x'], 'a.png', { type: 'image/png' })],
      sender: { id: 1, name: 'Amy' },
    })

    expect(new Headers(fetchMock.mock.calls[0][1].headers).has('Content-Type')).toBe(false)
  })

  it('fails with the status when the gateway refuses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })))
    const client = createChatwootClient('https://wa.example.com', '1', async () => 'login-token')

    await expect(client.listMessages(7)).rejects.toThrow('403')
  })
})
