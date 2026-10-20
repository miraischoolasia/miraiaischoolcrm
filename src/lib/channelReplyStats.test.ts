import { describe, expect, it } from 'vitest'
import { buildChannelReport, channelInfo, channelNames, kindOfChannelType, UNKNOWN_CHANNEL } from './channelReplyStats'
import type { ChannelDayRow } from './teamReplyDaysApi'
import type { DayRow } from '../../supabase/functions/team-replies/logic'

function work(day: string, replier: DayRow['replier'], inboxId: number, waits: number[], chatIds: number[], doneChatIds: number[] = []): DayRow {
  return {
    day, replier, staffId: replier.startsWith('staff:') ? Number(replier.slice(6)) : null, replies: Math.max(1, waits.length),
    chatIds, waits, withinTarget: waits.filter((wait) => wait <= 1800).length, slowest: waits.length ? Math.max(...waits) : null,
    inboxId, doneChatIds,
  }
}

function channelDay(day: string, inboxId: number, extra: Partial<ChannelDayRow> = {}): ChannelDayRow {
  return { day, inboxId, incomingMessages: 0, incomingChatIds: [], repliedChatIds: [], doneChatIds: [], firstWaits: [], ...extra }
}

const names = channelNames(
  [{ inboxId: 6, label: 'EduHero WhatsApp 2', kind: 'whatsapp' }],
  [
    { id: 3, name: 'EduHero WhatsApp', channelType: 'Channel::Api' },
    { id: 6, name: 'whatsapp-eduhero-2', channelType: 'Channel::Api' },
    { id: 4, name: 'EduHero Page', channelType: 'Channel::FacebookPage' },
  ],
)
const staff = [{ id: 1, name: 'Mei' }, { id: 2, name: 'Jun' }]

const channelRows = [
  channelDay('2026-10-18', 3, { incomingMessages: 10, incomingChatIds: [1, 2, 3], repliedChatIds: [1, 2], doneChatIds: [1], firstWaits: [60, 300] }),
  channelDay('2026-10-19', 3, { incomingMessages: 4, incomingChatIds: [1], repliedChatIds: [1], firstWaits: [120] }),
  channelDay('2026-10-19', 6, { incomingMessages: 2, incomingChatIds: [9], repliedChatIds: [], doneChatIds: [9] }),
]
const dayRows = [
  work('2026-10-18', 'staff:1', 3, [60, 600], [1, 2], [1]),
  work('2026-10-19', 'staff:1', 3, [120], [1]),
  work('2026-10-19', 'staff:1', 6, [], [9], [9]),
  work('2026-10-19', 'staff:2', 4, [30], [20]),
  work('2026-10-19', 'phone', 3, [3600], [3]),
]

describe('channel names', () => {
  it('uses the school\'s own name first, then Chatwoot\'s, then the number', () => {
    expect(channelInfo(names, 6)).toEqual({ inboxId: 6, name: 'EduHero WhatsApp 2', kind: 'whatsapp' })
    expect(channelInfo(names, 4)).toEqual({ inboxId: 4, name: 'EduHero Page', kind: 'messenger' })
    expect(channelInfo(names, 12).name).toBe('Inbox 12')
    expect(channelInfo(names, 0).name).toBe(UNKNOWN_CHANNEL)
    expect(kindOfChannelType('Channel::Instagram')).toBe('instagram')
  })
})

describe('buildChannelReport', () => {
  it('adds each channel\'s days together and keeps the channels apart', () => {
    const report = buildChannelReport({ channelRows, dayRows, names, staff })
    const main = report.channels!.find((entry) => entry.inboxId === 3)!
    expect(main).toMatchObject({
      name: 'EduHero WhatsApp', incomingMessages: 14, incomingChats: 4, repliedChats: 3, doneChats: 1,
      firstAnswers: 3, firstAverageSeconds: 160, firstMedianSeconds: 120, replies: 4, answers: 4,
    })
    expect(main.averageSeconds).toBe(Math.round((60 + 600 + 120 + 3600) / 4))
    expect(main.days.map((entry) => [entry.day, entry.incomingMessages, entry.repliedChats])).toEqual([
      ['2026-10-18', 10, 2],
      ['2026-10-19', 4, 1],
    ])
    const second = report.channels!.find((entry) => entry.inboxId === 6)!
    expect([second.incomingMessages, second.repliedChats, second.doneChats, second.firstAverageSeconds]).toEqual([2, 0, 1, null])
    // A channel with replies but nothing kept for it (the Page) still shows.
    expect(report.channels!.map((entry) => entry.inboxId)).toEqual([3, 6, 4])
  })

  it('says per person which channels they answered', () => {
    const report = buildChannelReport({ channelRows, dayRows, names, staff })
    const mei = report.staff.find((entry) => entry.key === 'staff:1')!
    expect(mei.name).toBe('Mei')
    expect(mei.total).toMatchObject({ channels: 2, replies: 4, chats: 3, done: 2, answers: 3 })
    expect(mei.lines.map((line) => [line.channel, line.replies, line.chats, line.done, line.averageSeconds])).toEqual([
      ['EduHero WhatsApp', 3, 2, 1, 260],
      ['EduHero WhatsApp 2', 1, 1, 1, null],
    ])
    expect(report.staff.map((entry) => entry.name)).toEqual(['Mei', 'Jun', 'Sent from the phone'])
  })

  it('filters by channel and by person', () => {
    const one = buildChannelReport({ channelRows, dayRows, names, staff, inboxFilter: 6 })
    expect(one.channels!.map((entry) => entry.inboxId)).toEqual([6])
    expect(one.staff.map((entry) => entry.key)).toEqual(['staff:1'])
    const jun = buildChannelReport({ channelRows, dayRows, names, staff, staffFilter: 'staff:2' })
    expect(jun.staff.map((entry) => entry.key)).toEqual(['staff:2'])
    // The channel numbers stay the whole team's.
    expect(jun.channels!.find((entry) => entry.inboxId === 3)!.incomingMessages).toBe(14)
  })

  it('has no channel numbers when they cannot be read, but still splits each person', () => {
    const report = buildChannelReport({ channelRows: null, dayRows, names, staff })
    expect(report.channels).toBeNull()
    expect(report.staff[0].lines).toHaveLength(2)
  })

  it('puts days kept before the split under an unknown channel', () => {
    const old: DayRow = { day: '2026-10-01', replier: 'staff:2', staffId: 2, replies: 2, chatIds: [5], waits: [100], withinTarget: 1, slowest: 100 }
    const report = buildChannelReport({ channelRows: [], dayRows: [old], names, staff })
    expect(report.staff[0].lines[0].channel).toBe(UNKNOWN_CHANNEL)
    expect(report.staff[0].lines[0].done).toBe(0)
  })
})
