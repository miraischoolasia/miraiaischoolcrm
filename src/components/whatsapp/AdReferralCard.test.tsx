import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetChatAdReferralsForTests, type ChatAdReferral } from '../../lib/chatAdReferrals'
import { AdReferralBanner, AdReferralLine } from './AdReferralCard'

const ad = (id: number, patch: Partial<ChatAdReferral> = {}): ChatAdReferral => ({
  id, channel: 'whatsapp', conversationId: 9, leadId: 3, adId: '120211234567890', campaignName: null,
  title: 'Free HOA class', body: 'Book a free class for your child this week. Seats are limited.', mediaType: 'image',
  thumbnailPath: 'ads/abc.jpg', viewUrl: 'https://fb.me/abc', sourceApp: 'facebook', sourceType: 'ad',
  clickedAt: '2026-10-21T03:00:00Z', isFirst: false, ...patch,
})

describe('AdReferralBanner', () => {
  beforeEach(() => resetChatAdReferralsForTests())

  it('shows nothing for a chat that did not come from an ad', () => {
    const { container } = render(<AdReferralBanner conversationId={9} ads={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the newest ad, opens the ad in a new tab, lists every click and closes', async () => {
    render(<AdReferralBanner conversationId={9} ads={[ad(2, { title: 'Holiday camp' }), ad(1, { isFirst: true })]} />)

    const card = screen.getByRole('region', { name: 'Came from an ad' })
    expect(card).toHaveTextContent('Holiday camp')
    expect(card).toHaveTextContent('WhatsApp ad · came in 21 Oct · from Facebook')
    expect(screen.getAllByRole('link', { name: /View ad/ })[0]).toHaveAttribute('target', '_blank')

    await userEvent.click(screen.getByRole('button', { name: /2 ad clicks/ }))
    expect(screen.getByRole('list', { name: 'Every ad click' })).toHaveTextContent('Free HOA classFirst')

    await userEvent.click(screen.getByRole('button', { name: 'Close the ad card' }))
    expect(screen.queryByRole('region', { name: 'Came from an ad' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Came from an ad/ }))
    expect(screen.getByRole('region', { name: 'Came from an ad' })).toBeInTheDocument()
  })
})

describe('AdReferralLine', () => {
  it("shows the lead's first ad in one line", () => {
    render(<AdReferralLine ad={ad(1, { title: null, campaignName: 'Oct leads' })} />)
    expect(screen.getByLabelText('Source ad')).toHaveTextContent('Source ad: Oct leads')
  })
})
