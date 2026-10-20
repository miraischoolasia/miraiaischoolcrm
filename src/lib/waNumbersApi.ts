import { getSupabaseAccessToken } from './accessToken'

// The school's WhatsApp numbers on the server: an admin adds one by name (the server makes the phone link and its
// inbox, and writes the number into the numbers table itself), turns one off (the phone is logged out, the chats
// stay) or on again (then its QR code is scanned again). A school whose gateway has no such door (Mirai, for now)
// gets null from list(), and the Numbers window works as before.

export type ServerNumberState = 'open' | 'connecting' | 'close'

export type ServerNumber = { instance: string; inboxId: number; label: string; state: ServerNumberState; active: boolean }

export type WaNumbersApi = ReturnType<typeof createWaNumbersApi>

// What to tell the admin when the server says no. Unknown answers get a plain "try again".
export function numberServerMessage(status: number, error: string | null): string {
  if (status === 400) {
    return 'The name needs 1 to 60 letters.'
  }
  if (status === 403 || status === 401) {
    return 'Only an admin can change the WhatsApp numbers.'
  }
  if (status === 409 && error === 'limit') {
    return 'The school already has the most numbers it can have (10).'
  }
  if (status === 409 && error === 'daily limit') {
    return 'At most 5 numbers can be added in one day. Try again tomorrow.'
  }
  if (status === 409) {
    return 'A number or inbox already has this name. Pick another name.'
  }
  if (status === 502) {
    return 'The WhatsApp server could not make the number, and nothing was kept. Try again in a few minutes.'
  }
  return `The WhatsApp server did not answer as expected (${status}). Try again.`
}

export function createWaNumbersApi(apiUrl: string, getAccessToken: () => Promise<string | null> = getSupabaseAccessToken) {
  async function send(method: 'GET' | 'POST', path: string, body?: unknown) {
    const token = await getAccessToken()
    const headers = new Headers()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    if (body !== undefined) {
      headers.set('Content-Type', 'application/json')
    }
    return fetch(`${apiUrl}/wa/numbers${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  }

  async function fail(response: Response): Promise<never> {
    const data = (await response.json().catch(() => null)) as { error?: unknown } | null
    throw new Error(numberServerMessage(response.status, typeof data?.error === 'string' ? data.error : null))
  }

  return {
    // Null when this school's gateway cannot add numbers (no such door), or this person may not.
    async list(): Promise<ServerNumber[] | null> {
      const response = await send('GET', '').catch(() => null)
      if (!response || !response.ok) {
        return null
      }
      const data = (await response.json().catch(() => null)) as unknown
      if (!Array.isArray(data)) {
        return null
      }
      return data.flatMap((row: Record<string, unknown>) =>
        typeof row?.instance === 'string' && typeof row.inboxId === 'number'
          ? [{
              instance: row.instance,
              inboxId: row.inboxId,
              label: typeof row.label === 'string' ? row.label : row.instance,
              state: row.state === 'open' || row.state === 'connecting' ? row.state : 'close',
              active: row.active !== false,
            }]
          : [],
      )
    },

    async add(label: string): Promise<{ instance: string; inboxId: number }> {
      const response = await send('POST', '', { label: label.trim() })
      if (!response.ok) {
        return fail(response)
      }
      const data = (await response.json().catch(() => null)) as { instance?: unknown; inboxId?: unknown } | null
      if (typeof data?.instance !== 'string' || typeof data.inboxId !== 'number') {
        throw new Error('The number was made, but the server did not say its name. Close this window and open it again.')
      }
      return { instance: data.instance, inboxId: data.inboxId }
    },

    async turnOff(instance: string) {
      const response = await send('POST', `/${encodeURIComponent(instance)}/disable`)
      if (!response.ok) {
        await fail(response)
      }
    },

    async turnOn(instance: string) {
      const response = await send('POST', `/${encodeURIComponent(instance)}/enable`)
      if (!response.ok) {
        await fail(response)
      }
    },
  }
}
