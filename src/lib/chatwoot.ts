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

// A photo, video or voice message of a chat lives at an address the inbox server wrote into the message, which is
// not always the address this school's site talks to (both schools share one Chatwoot, so a message may carry the
// other school's address). The browser only lets a site read a file from the address that allows it, so a file is
// fetched through the address of this school's own inbox. Any other address is left as it is.
export function ownMediaUrl(url: string, apiUrl: string | null | undefined) {
  try {
    const file = new URL(url)
    const own = apiUrl ? new URL(apiUrl) : null
    if (!own || !file.pathname.startsWith('/rails/active_storage/') || file.origin === own.origin) {
      return url
    }
    return `${own.origin}${file.pathname}${file.search}`
  } catch {
    return url
  }
}
