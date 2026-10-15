import { getSupabaseAccessToken } from './accessToken'

// 'unavailable': this school has no number to link from here (the gateway has no such door), or the
// signed-in person may not.
export type WaLinkState = 'open' | 'connecting' | 'close' | 'unavailable'

export type WaQr = { image: string | null; pairingCode: string | null }

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

    // A fresh QR code. WhatsApp only accepts one for about a minute, so ask again to get a new one.
    async qr(): Promise<WaQr> {
      const response = await get('/qr')
      if (!response.ok) {
        throw new Error(`Could not get a QR code (${response.status}).`)
      }
      const data = (await response.json().catch(() => null)) as { base64?: unknown; pairingCode?: unknown } | null
      const image =
        typeof data?.base64 === 'string' && data.base64.startsWith('data:image/png;base64,') ? data.base64 : null
      const pairingCode = typeof data?.pairingCode === 'string' && data.pairingCode ? data.pairingCode : null
      return { image, pairingCode }
    },
  }
}
