import { describe, expect, it } from 'vitest'
import { adSourceLine, adTitle, mapAdReferral } from './chatAdReferrals'

describe('chat ad referrals', () => {
  it('names the ad by its title, else the campaign, else the end of its number', () => {
    expect(adTitle({ title: 'Free HOA class', campaignName: 'Oct', adId: '120211234567890' })).toBe('Free HOA class')
    expect(adTitle({ title: ' ', campaignName: 'Oct leads', adId: '120211234567890' })).toBe('Oct leads')
    expect(adTitle({ title: null, campaignName: null, adId: '120211234567890' })).toBe('From an ad (…567890)')
    expect(adTitle({ title: null, campaignName: null, adId: null })).toBe('From an ad')
  })

  it('says the app, the day in Malaysia time and where the ad ran', () => {
    // 21 Oct 2026, 17:30 UTC is 22 Oct 01:30 in Kuala Lumpur.
    expect(adSourceLine({ channel: 'whatsapp', sourceApp: 'instagram', sourceType: 'ad', clickedAt: '2026-10-21T17:30:00Z' })).toBe(
      'WhatsApp ad · came in 22 Oct · from Instagram',
    )
    expect(adSourceLine({ channel: 'messenger', sourceApp: null, sourceType: 'post', clickedAt: '2026-10-21T03:00:00Z' })).toBe(
      'Messenger post · came in 21 Oct',
    )
  })

  it('reads a row', () => {
    const ad = mapAdReferral({
      id: 1, channel: 'whatsapp', conversation_id: 9, lead_id: null, ad_id: '1', campaign_name: null, title: 'T', body: null,
      media_type: 'image', thumbnail_path: 'ads/abc.jpg', view_url: 'https://fb.me/x', source_app: 'facebook', source_type: 'ad',
      clicked_at: '2026-10-21T03:00:00Z', is_first: null,
    })
    expect(ad).toMatchObject({ conversationId: 9, thumbnailPath: 'ads/abc.jpg', isFirst: false })
  })
})
