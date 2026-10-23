import { ownMediaUrl } from './chatwoot'
import { numberKey } from './studentNumberCheck'

// A WhatsApp contact's profile picture. Chatwoot fetches it when the contact first writes and keeps its own copy
// (an /rails/active_storage/ address on the inbox server, which does not expire), so the CRM only shows it.
// Contacts who hide their picture, and hidden numbers (@lid), have none: the initials stay.

// The address to show, through this school's own inbox address (as photos in chats are); null when there is none.
export function contactPictureUrl(thumbnail: unknown, apiUrl: string | null | undefined): string | null {
  if (typeof thumbnail !== 'string') {
    return null
  }
  const url = thumbnail.trim()
  if (!/^https?:\/\//i.test(url)) {
    return null
  }
  return ownMediaUrl(url, apiUrl)
}

// Pictures by the number's last 9 digits (the way the CRM matches numbers), for pages that know a phone, not a chat.
export function picturesByPhone(rows: { phone: string | null; thumbnail: string | null }[], apiUrl: string | null | undefined) {
  const result = new Map<string, string>()
  for (const row of rows) {
    const key = numberKey(row.phone)
    const url = contactPictureUrl(row.thumbnail, apiUrl)
    if (key && url && !result.has(key)) {
      result.set(key, url)
    }
  }
  return result
}

export function pictureForPhone(pictures: Map<string, string>, phone: string | null | undefined) {
  const key = numberKey(phone)
  return key ? (pictures.get(key) ?? null) : null
}
