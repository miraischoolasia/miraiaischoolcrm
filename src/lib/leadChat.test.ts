import { describe, expect, it } from 'vitest'
import { chatTargetForLead } from './leadChat'
import type { LeadChannel } from './leadChannels'

const channel = (extra: Partial<LeadChannel>): LeadChannel => ({
  id: 1, leadId: 7, channel: 'messenger', contactId: 900, inboxId: 4, inboxName: 'EduHero Online', conversationId: 55,
  name: 'Foong See Mun', pageName: 'EduHero', firstSeenAt: '2026-10-01T00:00:00Z', ...extra,
})
const lead = (phone: string | null) => ({ id: 7, fullName: 'Foong See Mun', phone })

describe('chatTargetForLead', () => {
  it('opens a WhatsApp lead with a number by its number', () => {
    expect(chatTargetForLead(lead('60123456789'), [])).toEqual({ phone: '60123456789', name: 'Foong See Mun', leadId: 7 })
  })

  it('opens a Messenger lead with no phone at its Messenger chat', () => {
    expect(chatTargetForLead(lead(null), [channel({})])).toEqual({
      phone: '', name: 'Foong See Mun', leadId: 7, chat: { conversationId: 55, contactId: 900 },
    })
  })

  it('opens an Instagram lead with no phone at its newest Instagram chat', () => {
    const target = chatTargetForLead(lead(null), [
      channel({ id: 2, channel: 'instagram', conversationId: 60, contactId: 901, firstSeenAt: '2026-09-01T00:00:00Z' }),
      channel({ id: 3, channel: 'instagram', conversationId: 61, contactId: 902, firstSeenAt: '2026-10-10T00:00:00Z' }),
      channel({ id: 4, leadId: 8, conversationId: 99 }),
    ])
    expect(target?.chat).toEqual({ conversationId: 61, contactId: 902 })
  })

  it('opens by the contact when the chat is not known yet', () => {
    expect(chatTargetForLead(lead(null), [channel({ conversationId: null })])?.chat).toEqual({ conversationId: null, contactId: 900 })
  })

  it('opens the chat the follow-up was made in, first', () => {
    expect(chatTargetForLead(lead('60123456789'), [channel({})], 77)?.chat).toEqual({ conversationId: 77, contactId: null })
  })

  it('has nothing to open for a lead with no chat and no number', () => {
    expect(chatTargetForLead(lead(null), [])).toBeNull()
    expect(chatTargetForLead(lead('  '), [])).toBeNull()
    expect(chatTargetForLead(null, [channel({})])).toBeNull()
  })
})
