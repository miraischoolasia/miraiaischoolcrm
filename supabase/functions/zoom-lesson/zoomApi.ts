// Calls to Zoom's API with the school's Server-to-Server OAuth app.

export async function zoomToken(accountId: string, clientId: string, clientSecret: string) {
  const response = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`Zoom did not accept the account (${response.status}). Check the Zoom app's secrets.`)
  const data = await response.json()
  return String(data.access_token)
}

export async function zoomApi(token: string, path: string, init: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`https://api.zoom.us/v2${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(20000),
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : {}
  if (!response.ok) throw new Error(`Zoom: ${data?.message ?? response.status}`)
  return data
}
