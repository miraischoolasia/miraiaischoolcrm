import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { LeadChannel } from '../lib/leadChannels'
import { LeadChannelLines } from './LeadChannelLines'
import { WhatsAppOpenProvider, WhatsAppLink } from './WhatsAppLink'

const channels: LeadChannel[] = [
  {
    id: 1,
    leadId: 7,
    channel: 'messenger',
    contactId: 55,
    inboxId: 4,
    inboxName: null,
    conversationId: 90,
    name: 'Sim Guatyin',
    pageName: 'EduHero Online',
    firstSeenAt: '2026-10-16T00:00:00Z',
  },
  {
    id: 2,
    leadId: 7,
    channel: 'instagram',
    contactId: 56,
    inboxId: 4,
    inboxName: null,
    conversationId: null,
    name: 'viv.tan',
    pageName: null,
    firstSeenAt: '2026-10-16T01:00:00Z',
  },
]

describe('LeadChannelLines', () => {
  it('opens the Messenger chat of the lead when its line is clicked', async () => {
    const openChat = vi.fn()
    render(
      <WhatsAppOpenProvider value={openChat}>
        <LeadChannelLines phone={null} leadId={7} channels={channels} />
      </WhatsAppOpenProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Messenger Sim Guatyin' }))

    expect(openChat).toHaveBeenCalledWith({
      phone: '',
      name: 'Sim Guatyin',
      leadId: 7,
      chat: { conversationId: 90, contactId: 55 },
    })
  })

  it('asks for the Instagram chat by its contact when the chat is not known', async () => {
    const openChat = vi.fn()
    render(
      <WhatsAppOpenProvider value={openChat}>
        <LeadChannelLines phone={null} leadId={7} channels={channels} />
      </WhatsAppOpenProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Instagram viv.tan' }))

    expect(openChat).toHaveBeenCalledWith(expect.objectContaining({ chat: { conversationId: null, contactId: 56 } }))
  })

  it('shows one WhatsApp icon on the phone line, and it is the button that opens the chat', async () => {
    const openChat = vi.fn()
    render(
      <WhatsAppOpenProvider value={openChat}>
        <LeadChannelLines
          phone="+60123456789"
          leadId={7}
          channels={[]}
          phoneAction={<WhatsAppLink phone="+60123456789" name="Mei" leadId={7} />}
        />
      </WhatsAppOpenProvider>,
    )

    // The button is the icon: there is no second, plain WhatsApp icon beside it.
    expect(screen.queryAllByRole('img', { name: 'WhatsApp' })).toHaveLength(0)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'WhatsApp Mei' }))
    expect(openChat).toHaveBeenCalledWith({ phone: '+60123456789', name: 'Mei', leadId: 7 })
  })

  it('is plain text, not a button, where there is no inbox to open', () => {
    render(<LeadChannelLines phone={null} leadId={7} channels={channels} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Sim Guatyin')).toBeInTheDocument()
  })

  it('opens the WhatsApp chat of a lead with no phone from its hidden-number line, and says it is done', async () => {
    const openChat = vi.fn()
    const onOpened = vi.fn()
    render(
      <WhatsAppOpenProvider value={openChat}>
        <LeadChannelLines
          phone={null}
          leadId={7}
          onOpened={onOpened}
          channels={[{ ...channels[0], channel: 'whatsapp', contactId: 21, conversationId: 201, name: '236998554123456' }]}
        />
      </WhatsAppOpenProvider>,
    )

    await userEvent.click(screen.getByRole('button', { name: /Open the WhatsApp chat/ }))

    expect(openChat).toHaveBeenCalledWith(expect.objectContaining({ phone: '', leadId: 7, chat: { conversationId: 201, contactId: 21 } }))
    expect(onOpened).toHaveBeenCalledTimes(1)
  })

  it('shows the hidden-number line as plain text when the chat is not known yet', () => {
    render(<LeadChannelLines phone={null} leadId={7} channels={[{ ...channels[0], channel: 'whatsapp', contactId: 21, conversationId: null }]} />)

    expect(screen.getByText('WhatsApp hidden number')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows no hidden-number line when the lead has a phone', () => {
    render(<LeadChannelLines phone="+60123456789" leadId={7} channels={[{ ...channels[0], channel: 'whatsapp', contactId: 21, conversationId: 201 }]} />)

    expect(screen.queryByText('WhatsApp hidden number')).not.toBeInTheDocument()
  })

  it('shows no hidden-number line where the phone of the lead is shown elsewhere', () => {
    render(
      <LeadChannelLines
        phone={null}
        hasPhoneElsewhere
        leadId={7}
        channels={[{ ...channels[0], channel: 'whatsapp', contactId: 21, conversationId: 201 }]}
      />,
    )

    expect(screen.queryByText('WhatsApp hidden number')).not.toBeInTheDocument()
  })
})
