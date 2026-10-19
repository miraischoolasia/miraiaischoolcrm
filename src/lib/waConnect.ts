import { getSupabaseAccessToken } from './accessToken'

// 'unavailable': this school has no number to link from here (the gateway has no such door), or the
// signed-in person may not.
export type WaLinkState = 'open' | 'connecting' | 'close' | 'unavailable'

// count: which code this is in the current linking (Evolution counts 1, 2, 3...); key: tells one code from the next
// (the count, else the code itself); linked: the phone was linked meanwhile (Evolution answers with its state).
export type WaQr = { image: string | null; pairingCode: string | null; count: number | null; key: string | null; linked: boolean }

export type WaConnect = ReturnType<typeof createWaConnect>

// Linking the school's WhatsApp number: the admin asks for a QR code and scans it with the phone.
// The gateway only lets admins in, and only ever talks about this school's own instance.
export function createWaConnect(apiUrl: string, getAccessToken: () => Promise<string | null> = getSupabaseAccessToken) {
  async function get(path: string) {
    const token = await getAccessToken()
    const headers = new Headers()
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    return fetch(`${apiUrl}/wa/connect${path}`, { headers })
  }

  return {
    async state(): Promise<WaLinkState> {
      const response = await get('/state')
      if (!response.ok) {
        return 'unavailable'
      }
      const data = (await response.json().catch(() => null)) as { instance?: { state?: string }; state?: string } | null
      const state = data?.instance?.state ?? data?.state
      return state === 'open' || state === 'connecting' ? state : 'close'
    },

    // The QR code WhatsApp gave for linking right now. The first ask starts the linking; while it is going on,
    // asking again only reads the current code (WhatsApp itself makes a new one about every 20 seconds). If the
    // linking has ended, asking again starts a new one: the panel stops instead of doing that over and over.
    async qr(): Promise<WaQr> {
      const response = await get('/qr')
      if (!response.ok) {
        throw new Error(`Could not get a QR code (${response.status}).`)
      }
      const data = (await response.json().catch(() => null)) as {
        base64?: unknown
        pairingCode?: unknown
        code?: unknown
        count?: unknown
        instance?: { state?: unknown }
        state?: unknown
      } | null
      const image =
        typeof data?.base64 === 'string' && data.base64.startsWith('data:image/png;base64,') ? data.base64 : null
      const pairingCode = typeof data?.pairingCode === 'string' && data.pairingCode ? data.pairingCode : null
      const count = typeof data?.count === 'number' && Number.isInteger(data.count) ? data.count : null
      const code = typeof data?.code === 'string' && data.code ? data.code : null
      const linked = (data?.instance?.state ?? data?.state) === 'open'
      return { image, pairingCode, count, key: count !== null ? `#${count}` : (code ?? image), linked }
    },
  }
}
