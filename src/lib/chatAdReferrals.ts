import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// The ad a parent clicked to start (or come back to) a chat: WhatsApp click-to-chat ads, Messenger ads and the
// EduHero GoHighLevel ones, kept in chat_ad_referrals by the server (⑤'s plan, chat-ad-source-plan.md). The CRM only
// reads it: a card above the chat, and the lead's first ad on the lead and the Family card.
export type ChatAdReferral = {
  id: number
  channel: 'whatsapp' | 'messenger' | 'instagram'
  conversationId: number | null
  leadId: number | null
  adId: string | null
  campaignName: string | null
  title: string | null
  body: string | null
  mediaType: 'image' | 'video' | 'none' | null
  thumbnailPath: string | null
  viewUrl: string | null
  sourceApp: 'facebook' | 'instagram' | null
  sourceType: 'ad' | 'post' | null
  clickedAt: string
  isFirst: boolean
}

type Row = {
  id: number
  channel: ChatAdReferral['channel']
  conversation_id: number | null
  lead_id: number | null
  ad_id: string | null
  campaign_name: string | null
  title: string | null
  body: string | null
  media_type: ChatAdReferral['mediaType']
  thumbnail_path: string | null
  view_url: string | null
  source_app: ChatAdReferral['sourceApp']
  source_type: ChatAdReferral['sourceType']
  clicked_at: string
  is_first: boolean | null
}

const COLUMNS =
  'id, channel, conversation_id, lead_id, ad_id, campaign_name, title, body, media_type, thumbnail_path, view_url, source_app, source_type, clicked_at, is_first'

export function mapAdReferral(row: Row): ChatAdReferral {
  return {
    id: row.id,
    channel: row.channel,
    conversationId: row.conversation_id,
    leadId: row.lead_id,
    adId: row.ad_id,
    campaignName: row.campaign_name,
    title: row.title,
    body: row.body,
    mediaType: row.media_type,
    thumbnailPath: row.thumbnail_path,
    viewUrl: row.view_url,
    sourceApp: row.source_app,
    sourceType: row.source_type,
    clickedAt: row.clicked_at,
    isFirst: Boolean(row.is_first),
  }
}

// What the card calls the ad: its title, else the campaign's name, else the end of its number.
export function adTitle(ad: Pick<ChatAdReferral, 'title' | 'campaignName' | 'adId'>) {
  const title = ad.title?.trim() || ad.campaignName?.trim()
  if (title) {
    return title
  }
  return ad.adId ? `From an ad (…${ad.adId.slice(-6)})` : 'From an ad'
}

const CHANNEL_LABELS: Record<ChatAdReferral['channel'], string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
}

// "WhatsApp ad · came in 21 Oct · from Instagram": the chat's app, the day (Malaysia time) and where the ad ran.
export function adSourceLine(ad: Pick<ChatAdReferral, 'channel' | 'sourceApp' | 'sourceType' | 'clickedAt'>) {
  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' }).format(
    new Date(ad.clickedAt),
  )
  const where = ad.sourceApp ? ` · from ${ad.sourceApp === 'instagram' ? 'Instagram' : 'Facebook'}` : ''
  return `${CHANNEL_LABELS[ad.channel]} ${ad.sourceType === 'post' ? 'post' : 'ad'} · came in ${day}${where}`
}

// The ad's picture (a public bucket: ad pictures are public anyway).
export function adThumbnailUrl(path: string | null) {
  const base = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
  return path && base ? `${base}/storage/v1/object/public/chat-ad-thumbnails/${path}` : null
}

// Before the table exists (or without rights to it) there is simply no ad to show.
function isMissing(error: { code?: string } | null) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === '42501'
}

// A chat's ads, newest first; read once per chat while the page is open.
const byChat = new Map<number, Promise<ChatAdReferral[]>>()

export function fetchChatAdReferrals(conversationId: number): Promise<ChatAdReferral[]> {
  const known = byChat.get(conversationId)
  if (known) {
    return known
  }
  const read = (async () => {
    if (!supabase) {
      return []
    }
    try {
      const { data, error } = await supabase
        .from('chat_ad_referrals' as never)
        .select(COLUMNS)
        .eq('conversation_id', conversationId)
        .order('clicked_at', { ascending: false })
        .limit(20)
      if (error) {
        if (!isMissing(error)) byChat.delete(conversationId)
        return []
      }
      return ((data ?? []) as unknown as Row[]).map(mapAdReferral)
    } catch {
      byChat.delete(conversationId)
      return []
    }
  })()
  byChat.set(conversationId, read)
  return read
}

// The first ad a lead clicked: the view lead_first_ads (one row a lead; the earliest click that was an ad, not a post).
const FIRST_AD_COLUMNS =
  'referral_id, lead_id, channel, conversation_id, ad_id, campaign_name, title, body, media_type, thumbnail_path, view_url, source_app, source_type, clicked_at'

export async function fetchLeadFirstAd(leadId: number): Promise<ChatAdReferral | null> {
  if (!supabase) {
    return null
  }
  try {
    const { data, error } = await supabase
      .from('lead_first_ads' as never)
      .select(FIRST_AD_COLUMNS)
      .eq('lead_id', leadId)
      .limit(1)
    if (error) {
      return null
    }
    const row = ((data ?? []) as unknown as (Omit<Row, 'id' | 'is_first'> & { referral_id: number })[])[0]
    return row ? mapAdReferral({ ...row, id: row.referral_id, is_first: true }) : null
  } catch {
    return null
  }
}

export function useChatAdReferrals(conversationId: number | null) {
  const [ads, setAds] = useState<{ conversationId: number; rows: ChatAdReferral[] } | null>(null)
  useEffect(() => {
    if (conversationId === null) {
      return
    }
    let live = true
    void fetchChatAdReferrals(conversationId).then((rows) => {
      if (live) setAds({ conversationId, rows })
    })
    return () => {
      live = false
    }
  }, [conversationId])
  return ads && ads.conversationId === conversationId ? ads.rows : []
}

export function useLeadFirstAd(leadId: number | null) {
  const [ad, setAd] = useState<{ leadId: number; row: ChatAdReferral | null } | null>(null)
  useEffect(() => {
    if (leadId === null) {
      return
    }
    let live = true
    void fetchLeadFirstAd(leadId).then((row) => {
      if (live) setAd({ leadId, row })
    })
    return () => {
      live = false
    }
  }, [leadId])
  return ad && ad.leadId === leadId ? ad.row : null
}

// Chats whose ad card the team closed, while the page is open: closing it once is enough for that chat.
export const closedAdChats = new Set<number>()

// Tests: forget what was read and open every card again.
export function resetChatAdReferralsForTests() {
  byChat.clear()
  closedAdChats.clear()
}
