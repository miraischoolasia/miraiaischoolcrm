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

  it('searches the words inside messages and returns the matching message', async () => {
    const fetchMock = stubFetch({ payload: [{ id: 5, messages: [{ content: '  The fees are RM100 ' }] }, { id: 6, messages: [] }] })
    const client = createChatwootClient('https://wa.example.com', '1', async () => 'login-token')

    const found = await client.searchMessages('fees & more')

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://wa.example.com/api/v1/accounts/1/conversations/search?q=fees%20%26%20more&page=1',
    )
    expect(found).toEqual([
      { conversationId: 5, snippet: 'The fees are RM100' },
      { conversationId: 6, snippet: '' },
    ])
  })

  it('fails with the status when the gateway refuses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })))
    const client = createChatwootClient('https://wa.example.com', '1', async () => 'login-token')

    await expect(client.listMessages(7)).rejects.toThrow('403')
  })
})
