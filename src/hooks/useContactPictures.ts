import { useEffect, useState } from 'react'
import { getChatwootUrl } from '../lib/chatwoot'
import { picturesByPhone } from '../lib/contactPicture'
import { supabase } from '../lib/supabase'

const apiUrl = getChatwootUrl(import.meta.env.VITE_WHATSAPP_API_URL)

// Read once per page load and shared by every page that asks: the chats that have a WhatsApp picture are few
// (a few hundred), and a picture changes only when the parent changes it.
let loading: Promise<Map<string, string>> | null = null

async function loadPictures(): Promise<Map<string, string>> {
  if (!supabase) {
    return new Map()
  }
  const { data, error } = await supabase
    .from('inbox_chats')
    .select('contact_phone, thumbnail:raw->meta->sender->>thumbnail')
    .not('raw->meta->sender->>thumbnail', 'is', null)
    .neq('raw->meta->sender->>thumbnail', '')
    .limit(5000)
  if (error || !data) {
    // Someone who may not read the inbox (or a database without the inbox copy) simply sees initials.
    return new Map()
  }
  return picturesByPhone(
    // contact_phone is not in the generated types yet; the column exists (20261024800000_inbox_copy).
    (data as unknown as { contact_phone: string | null; thumbnail: string | null }[]).map((row) => ({
      phone: row.contact_phone,
      thumbnail: row.thumbnail,
    })),
    apiUrl,
  )
}

// WhatsApp pictures by the number's last 9 digits (see pictureForPhone), for pages that show people by phone.
export function useContactPictures(enabled = true) {
  const [pictures, setPictures] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    if (!enabled) {
      return
    }
    let cancelled = false
    loading ??= loadPictures().catch(() => new Map<string, string>())
    void loading.then((found) => {
      if (!cancelled) {
        setPictures(found)
      }
    })
    return () => {
      cancelled = true
    }
  }, [enabled])
  return pictures
}
