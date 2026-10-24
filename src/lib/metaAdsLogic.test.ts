import { describe, expect, it, vi } from 'vitest'
import {
  accountWarning,
  actionValue,
  cleanError,
  insightsUrl,
  pullRange,
  readAccount,
  readAccountIds,
  readAd,
  readAllPages,
  readInsight,
  todayInKL,
  withToken,
} from '../../supabase/functions/_shared/metaAds/logic.ts'

// Data Center part 3: the meta-ads-sync function's reading of Meta's answers, with made-up answers.

describe('the ad accounts and the days', () => {
  it('reads the account ids however they are written', () => {
    expect(readAccountIds(' 123456, act_789012,,act_123456, abc')).toEqual(['act_123456', 'act_789012'])
    expect(readAccountIds(undefined)).toEqual([])
  })

  it('pulls the last 3 full days by default, or from a day; never today, never more than 37 months back', () => {
    expect(pullRange('2026-10-23', {})).toEqual({ since: '2026-10-20', until: '2026-10-22' })
    expect(pullRange('2026-10-23', { days: 1 })).toEqual({ since: '2026-10-22', until: '2026-10-22' })
    expect(pullRange('2026-10-23', { since: '2026-07-25' })).toEqual({ since: '2026-07-25', until: '2026-10-22' })
    expect(pullRange('2026-10-23', { since: '2026-10-23' })).toBeNull()
    expect(pullRange('2026-10-23', { since: 'yesterday' })).toBeNull()
    expect(pullRange('2026-10-23', { since: '2020-01-01' })!.since > '2023-08-01').toBe(true)
  })

  it('Malaysia days', () => {
    expect(todayInKL(new Date('2026-10-23T17:00:00Z'))).toBe('2026-10-24')
  })
})

describe('reading Meta', () => {
  it('asks per ad, per day, the fields we keep; the token is added apart', () => {
    const u = new URL(insightsUrl('act_1234', { since: '2026-10-20', until: '2026-10-22' }))
    expect(u.pathname).toBe('/v23.0/act_1234/insights')
    expect(u.searchParams.get('level')).toBe('ad')
    expect(u.searchParams.get('time_increment')).toBe('1')
    expect(u.searchParams.get('fields')).toContain('spend')
    expect(u.searchParams.has('access_token')).toBe(false)
    expect(withToken(u.toString(), 'T0K+N')).toContain('access_token=T0K%2BN')
  })

  it('one day of one ad: spend, conversations started, Meta leads', () => {
    const row = readInsight(
      {
        ad_id: '120210000000001',
        ad_name: 'P4 Math trial',
        campaign_id: '9001',
        campaign_name: 'Oct trial',
        spend: '45.678',
        impressions: '1200',
        clicks: '80',
        inline_link_clicks: '30',
        actions: [
          { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '12' },
          { action_type: 'lead', value: '2' },
          { action_type: 'onsite_conversion.lead_grouped', value: '3' },
        ],
        date_start: '2026-10-21',
      },
      'act_1',
    )
    expect(row).toMatchObject({ ad_id: '120210000000001', day: '2026-10-21', spend: 45.68, impressions: 1200, link_clicks: 30, conversations: 12, meta_leads: 3 })
  })

  it('drops empty or broken rows', () => {
    expect(readInsight({ ad_id: '1', date_start: '2026-10-21', spend: '0', impressions: '0' }, 'act_1')).toBeNull()
    expect(readInsight({ ad_id: 'x1', date_start: '2026-10-21', spend: '5' }, 'act_1')).toBeNull()
    expect(readInsight({ ad_id: '1', spend: '5' }, 'act_1')).toBeNull()
    expect(actionValue(undefined, ['lead'])).toBe(0)
  })

  it('an ad: words and picture (https only)', () => {
    expect(readAd({ id: '55', name: 'Ad', effective_status: 'ACTIVE', campaign: { id: '9', name: 'C' }, creative: { title: 'Free trial', thumbnail_url: 'https://x/t.jpg' } }, 'act_1')).toMatchObject({
      ad_id: '55', campaign_name: 'C', title: 'Free trial', thumbnail_url: 'https://x/t.jpg',
    })
    expect(readAd({ id: '55', creative: { thumbnail_url: 'http://x/t.jpg' } }, 'act_1')?.thumbnail_url).toBeNull()
  })

  it('warns, never converts, when an account is not MYR or not Malaysia time', () => {
    const a = readAccount({ name: 'EduHero', currency: 'USD', timezone_name: 'America/Los_Angeles', account_status: 1 }, 'act_1')
    expect(accountWarning(a)).toMatch(/USD, not MYR.*America\/Los_Angeles/)
    expect(accountWarning(readAccount({ currency: 'MYR', timezone_name: 'Asia/Kuala_Lumpur' }, 'act_1'))).toBeNull()
  })
})

describe('pages and errors', () => {
  it('reads every page Meta links to', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }], paging: { next: 'https://graph.facebook.com/next?access_token=SECRET' } })
      .mockResolvedValueOnce({ data: [{ id: 3 }] })
    expect(await readAllPages('https://graph.facebook.com/first', get)).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('stops on Meta’s error', async () => {
    const get = vi.fn().mockResolvedValue({ error: { message: 'Invalid OAuth access token.' } })
    await expect(readAllPages('https://graph.facebook.com/first', get)).rejects.toThrow('Invalid OAuth access token.')
  })

  it('an error never carries the key or a link', () => {
    const text = cleanError(new Error('Failed: https://graph.facebook.com/v23.0/act_1/insights?access_token=EAAB123 token EAAB123 bad'), 'EAAB123')
    expect(text).not.toContain('EAAB123')
    expect(text).not.toContain('graph.facebook.com')
    expect(cleanError('x access_token=abc&y')).toBe('x access_token=[key]&y')
  })
})
