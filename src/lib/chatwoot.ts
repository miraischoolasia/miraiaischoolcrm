// Where the team's shared WhatsApp inbox (Chatwoot) lives, e.g.
// https://chat.example.com. Nothing is shown in the app until this is set.
export function getChatwootUrl(raw: string | undefined) {
  const value = raw?.trim()
  if (!value) {
    return null
  }

  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '')
  } catch {
    return null
  }
}
