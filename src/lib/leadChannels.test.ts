import { describe, expect, it } from 'vitest'
import {
  channelsByLead,
  contactSiblings,
  isHiddenNumberName,
  leadOfContacts,
  matchesChannelFilter,
  NO_CHANNEL_FILTER,
  placeChoices,
  socialLines,
  whatsappChatLines,
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

describe('contactSiblings', () => {
  it('ties the two WhatsApp contacts of one lead together (a phone number and a hidden ID)', () => {
    const siblings = contactSiblings([
      row({ id: 1, channel: 'whatsapp', leadId: 7, contactId: 482 }),
      row({ id: 2, channel: 'whatsapp', leadId: 7, contactId: 390 }),
      row({ id: 3, channel: 'whatsapp', leadId: 8, contactId: 100 }),
      row({ id: 4, channel: 'instagram', leadId: 7, contactId: 55 }),
    ])
    expect(siblings.get(482)).toEqual([390, 482])
    expect(siblings.get(390)).toEqual([390, 482])
    // A lead with one WhatsApp contact, and a Messenger / Instagram contact, are left out.
    expect(siblings.has(100)).toBe(false)
    expect(siblings.has(55)).toBe(false)
  })
})

describe('leadOfContacts', () => {
  it('maps each chat contact to its lead', () => {
    const map = leadOfContacts([
      row({ id: 1, channel: 'whatsapp', leadId: 7, contactId: 482 }),
      row({ id: 2, channel: 'whatsapp', leadId: 7, contactId: 390 }),
      row({ id: 3, channel: 'instagram', leadId: 9, contactId: 55 }),
    ])
    expect(map.get(390)).toBe(7)
    expect(map.get(55)).toBe(9)
    expect(map.get(1)).toBeUndefined()
  })
})

describe('isHiddenNumberName', () => {
  it('is true for a long WhatsApp ID used as the name of a lead with no phone', () => {
    expect(isHiddenNumberName('236998554123456', null)).toBe(true)
    expect(isHiddenNumberName('+236 998 554 123 456', '')).toBe(true)
  })

  it('is false for a real name, a short number, or a lead that has a phone', () => {
    expect(isHiddenNumberName('Mei Tan', null)).toBe(false)
    expect(isHiddenNumberName('60123456789', null)).toBe(false)
    expect(isHiddenNumberName('236998554123456', '60123456789')).toBe(false)
    expect(isHiddenNumberName(null, null)).toBe(false)
  })
})

describe('whatsappChatLines', () => {
  it('lists each WhatsApp chat once and leaves the other channels out', () => {
    const lines = whatsappChatLines([
      row({ id: 1, channel: 'whatsapp', leadId: 7, contactId: 21, inboxId: 1, conversationId: 201 }),
      row({ id: 2, channel: 'whatsapp', leadId: 7, contactId: 21, inboxId: 1, conversationId: 201 }),
      row({ id: 3, channel: 'whatsapp', leadId: 7, contactId: 22, inboxId: 2, conversationId: null }),
      row({ id: 4, channel: 'instagram', leadId: 7, contactId: 55, inboxId: 3 }),
    ])
    expect(lines.map((line) => [line.contactId, line.conversationId])).toEqual([
      [21, 201],
      [22, null],
    ])
  })
})
