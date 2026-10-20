import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWaNumbersApi, numberServerMessage } from './waNumbersApi'

function reply(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const call = (fetchMock: ReturnType<typeof vi.fn>, index = 0) => {
  const [url, init] = fetchMock.mock.calls[index] as unknown as [string, RequestInit]
  return { url, method: init.method, auth: (init.headers as Headers).get('Authorization'), body: init.body ? JSON.parse(String(init.body)) : undefined }
}

describe('createWaNumbersApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  const api = () => createWaNumbersApi('https://wa.example', async () => 'tok')

  it('lists the numbers the WhatsApp server has, with the login', async () => {
    const fetchMock = reply(200, [
      { instance: 'school-1', inboxId: 3, label: 'Main', state: 'open', active: true },
      { instance: 'school-2', inboxId: 6, label: 'Second', state: 'close', active: false },
      { bad: true },
    ])
    expect(await api().list()).toEqual([
      { instance: 'school-1', inboxId: 3, label: 'Main', state: 'open', active: true },
      { instance: 'school-2', inboxId: 6, label: 'Second', state: 'close', active: false },
    ])
    expect(call(fetchMock)).toMatchObject({ url: 'https://wa.example/wa/numbers', method: 'GET', auth: 'Bearer tok' })
  })

  it('says null when the server cannot add numbers (no such door, or not an admin)', async () => {
    reply(404, {})
    expect(await api().list()).toBeNull()
    reply(403, {})
    expect(await api().list()).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    expect(await api().list()).toBeNull()
  })

  it('adds a number by its name only; the server picks its Evolution name', async () => {
    const fetchMock = reply(201, { id: 9, instance: 'school-3', inboxId: 7 })
    expect(await api().add('  Sales ')).toEqual({ instance: 'school-3', inboxId: 7 })
    expect(call(fetchMock)).toMatchObject({ url: 'https://wa.example/wa/numbers', method: 'POST', body: { label: 'Sales' } })
  })

  it('says in plain words why a number could not be added', async () => {
    reply(409, { error: 'daily limit' })
    await expect(api().add('Sales')).rejects.toThrow('At most 5 numbers can be added in one day')
    reply(409, { error: 'limit' })
    await expect(api().add('Sales')).rejects.toThrow('the most numbers it can have (10)')
    reply(502, { error: 'evolution failed' })
    await expect(api().add('Sales')).rejects.toThrow('nothing was kept')
  })

  it('turns a number off and on by its name', async () => {
    const fetchMock = reply(200, { ok: true })
    await api().turnOff('school-2')
    await api().turnOn('school-2')
    expect(call(fetchMock, 0)).toMatchObject({ url: 'https://wa.example/wa/numbers/school-2/disable', method: 'POST' })
    expect(call(fetchMock, 1)).toMatchObject({ url: 'https://wa.example/wa/numbers/school-2/enable', method: 'POST' })
  })
})

describe('numberServerMessage', () => {
  it('tells a name taken apart from the limits', () => {
    expect(numberServerMessage(409, 'already exists')).toContain('Pick another name')
    expect(numberServerMessage(400, 'label')).toContain('1 to 60')
    expect(numberServerMessage(403, null)).toContain('Only an admin')
  })
})
