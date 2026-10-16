import { describe, expect, it } from 'vitest'
import {
  channelsByLead,
  matchesChannelFilter,
  NO_CHANNEL_FILTER,
  placeChoices,
  socialLines,
  whatsappPlaces,
  type LeadChannel,
} from './leadChannels'

function row(patch: Partial<LeadChannel> & Pick<LeadChannel, 'id' | 'channel'>): LeadChannel {
  return {
    leadId: 1,
    contactId: patch.id,
    inboxId: 1,
    inboxName: null,
    conversationId: null,
    name: null,
    pageName: null,
    firstSeenAt: `2026-10-0${patch.id}T00:00:00Z`,
    ...patch,
  }
}

const rows = [
  row({ id: 3, channel: 'instagram', name: 'viv.tan', pageName: 'EduHero IG', inboxId: 4 }),
  row({ id: 2, channel: 'messenger', name: 'Sim Guatyin', pageName: 'EduHero Online', inboxId: 4 }),
  row({ id: 1, channel: 'whatsapp', inboxName: 'Mirai Main', inboxId: 1 }),
  row({ id: 4, channel: 'whatsapp', leadId: 2, inboxName: 'Mirai Sales', inboxId: 2 }),
]

describe('lead channels', () => {
  it('puts WhatsApp first, then Messenger, then Instagram', () => {
    const list = channelsByLead(rows).get(1) ?? []
    expect(list.map((entry) => entry.channel)).toEqual(['whatsapp', 'messenger', 'instagram'])
  })

  it('lists the Messenger and Instagram names with their Page, never the WhatsApp row', () => {
    const list = channelsByLead(rows).get(1) ?? []
    expect(socialLines(list)).toEqual([
      { kind: 'messenger', name: 'Sim Guatyin', place: 'EduHero Online', conversationId: null, contactId: 2 },
      { kind: 'instagram', name: 'viv.tan', place: 'EduHero IG', conversationId: null, contactId: 3 },
    ])
    expect(whatsappPlaces(list)).toEqual(['Mirai Main'])
  })

  it('offers the Pages of the chosen channel only', () => {
    expect(placeChoices(rows, 'messenger')).toEqual(['EduHero Online'])
    expect(placeChoices(rows, 'whatsapp')).toEqual(['Mirai Main', 'Mirai Sales'])
    expect(placeChoices(rows, 'all')).toHaveLength(4)
  })

  it('filters by channel, and by Page or number inside it', () => {
    const lead1 = channelsByLead(rows).get(1) ?? []
    expect(matchesChannelFilter(NO_CHANNEL_FILTER, lead1, false)).toBe(true)
    expect(matchesChannelFilter({ channel: 'messenger', place: 'all' }, lead1, false)).toBe(true)
    expect(matchesChannelFilter({ channel: 'messenger', place: 'Other Page' }, lead1, false)).toBe(false)
    expect(matchesChannelFilter({ channel: 'whatsapp', place: 'Mirai Sales' }, lead1, true)).toBe(false)
    // A lead with a phone number counts as WhatsApp before any chat of it was seen.
    expect(matchesChannelFilter({ channel: 'whatsapp', place: 'all' }, [], true)).toBe(true)
    expect(matchesChannelFilter({ channel: 'instagram', place: 'all' }, [], true)).toBe(false)
  })
})
