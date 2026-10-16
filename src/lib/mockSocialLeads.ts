import type { Lead } from '../types/domain'
import type { LeadChannel } from './leadChannels'

// Made-up leads to look at the Messenger / Instagram design with. Only the "mock" Vite mode adds these
// (to what the Leads page shows, nothing is written anywhere); they have negative ids so they can never be
// mistaken for a real lead.

function lead(id: number, fullName: string, phone: string | null, patch: Partial<Lead> = {}): Lead {
  return {
    id,
    fullName,
    phone,
    sourceId: null,
    picId: null,
    state: null,
    tagIds: [],
    checks: {},
    status: 'new',
    children: [],
    notes: null,
    followUps: [],
    tasks: [],
    convertedStudentId: null,
    addedDate: '2026-10-16',
    createdAt: '2026-10-16T01:00:00Z',
    updatedAt: '2026-10-16T01:00:00Z',
    ...patch,
  } as Lead
}

function channel(
  id: number,
  leadId: number,
  kind: LeadChannel['channel'],
  patch: Partial<LeadChannel> = {},
): LeadChannel {
  return {
    id,
    leadId,
    channel: kind,
    contactId: 9000 + id,
    inboxId: 1,
    inboxName: null,
    conversationId: null,
    name: null,
    pageName: null,
    firstSeenAt: `2026-10-16T0${id % 9}:00:00Z`,
    ...patch,
  }
}

export const MOCK_SOCIAL_LEADS: Lead[] = [
  lead(-1, 'Sim Guatyin', null, { children: [{ name: 'Ethan', age: 11, phone: null }] }),
  lead(-2, 'viv.tan', null),
  lead(-3, 'Mei Ling Tan', '+60123456789', { status: 'contacted', children: [{ name: 'Jayden', age: 10, phone: null }] }),
  lead(-4, 'Aisha Rahman', '+60198887777', { children: [{ name: 'Sofea', age: 12, phone: null }] }),
  lead(-5, 'Daniel Wong', '+60171112222', { status: 'trial_scheduled' }),
]

export const MOCK_SOCIAL_CHANNELS: LeadChannel[] = [
  // Messenger only.
  channel(1, -1, 'messenger', { name: 'Sim Guatyin', pageName: 'EduHero 英雄教育 Online', inboxId: 4 }),
  // Instagram only.
  channel(2, -2, 'instagram', { name: 'viv.tan', pageName: 'EduHero IG', inboxId: 4 }),
  // WhatsApp, then Messenger.
  channel(3, -3, 'whatsapp', { name: 'Mei Ling Tan', inboxName: 'Mirai Main', inboxId: 1 }),
  channel(4, -3, 'messenger', { name: 'Mei Ling (Facebook)', pageName: '万能教 Jack老师', inboxId: 4 }),
  // WhatsApp, Messenger and Instagram.
  channel(5, -4, 'whatsapp', { name: 'Aisha Rahman', inboxName: 'Mirai Main', inboxId: 1 }),
  channel(6, -4, 'messenger', { name: 'Aisha R.', pageName: 'EduHero 英雄教育 Online', inboxId: 4 }),
  channel(7, -4, 'instagram', { name: 'aisha.rahman', pageName: 'EduHero IG', inboxId: 4 }),
  // Wrote to two WhatsApp numbers.
  channel(8, -5, 'whatsapp', { name: 'Daniel Wong', inboxName: 'Mirai Main', inboxId: 1 }),
  channel(9, -5, 'whatsapp', { name: 'Daniel Wong', inboxName: 'Mirai Sales', inboxId: 2, contactId: 9008 }),
]
