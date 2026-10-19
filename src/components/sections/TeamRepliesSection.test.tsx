import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { periodDays, TeamRepliesSection } from './TeamRepliesSection'
import type { ChatwootClient } from '../../lib/chatwootClient'
import type { ChatwootConversation } from '../../lib/whatsappInbox'
import type { DayRow } from '../../../supabase/functions/team-replies/logic'

const fetchKeptDays = vi.fn()
const fetchToday = vi.fn()
vi.mock('../../lib/teamReplyDaysApi', () => ({
  fetchKeptDays: (...args: unknown[]) => fetchKeptDays(...args),
  fetchToday: () => fetchToday(),
  fetchCopySummary: async () => ({ chats: 3, messages: 40, copiedChats: 1, chatsToCopy: 0, firstMessageAt: '2026-09-01T00:00:00Z' }),
  SETUP_MISSING: 'Team Replies is not set up in the database yet.',
  teamRepliesErrorMessage: () => 'Team Replies is not set up in the database yet.',
}))

// 2026-10-19 10:00 in Kuala Lumpur.
const NOW = new Date('2026-10-19T02:00:00Z')
const TODAY_FROM = Date.parse('2026-10-18T16:00:00Z') / 1000

function kept(day: string, replier: DayRow['replier'], waits: number[], chatIds = [1]): DayRow {
  return {
    day, replier, staffId: replier.startsWith('staff:') ? Number(replier.slice(6)) : null, replies: waits.length,
    chatIds, waits, withinTarget: waits.filter((wait) => wait <= 1800).length, slowest: Math.max(...waits),
  }
}

function conversation(id: number, extra: Partial<ChatwootConversation> = {}): ChatwootConversation {
  return {
    id, status: 'open', unread_count: 0, waiting_since: 0, timestamp: TODAY_FROM, last_activity_at: TODAY_FROM - 9000,
    meta: { sender: { id: id * 10, name: `P${id}`, phone_number: null, identifier: null } }, ...extra,
  }
}

function client(conversations: ChatwootConversation[]) {
  return {
    listConversations: vi.fn(async (status: string, page: number) =>
      status === 'open' && page === 1 ? { conversations, totalCount: conversations.length } : { conversations: [], totalCount: 0 },
    ),
  } as unknown as ChatwootClient
}

const staff = [{ id: 1, name: 'Mei' }, { id: 2, name: 'Jun' }]

beforeEach(() => {
  fetchKeptDays.mockReset()
  fetchToday.mockReset()
})

describe('periodDays', () => {
  it('ends every kept period yesterday', () => {
    expect(periodDays('7d', '2026-10-19', '', { from: '', to: '' })).toEqual({ first: '2026-10-12', last: '2026-10-18' })
    expect(periodDays('30d', '2026-10-19', '', { from: '', to: '' })).toEqual({ first: '2026-09-19', last: '2026-10-18' })
    expect(periodDays('month', '2026-10-19', '2026-09', { from: '', to: '' })).toEqual({ first: '2026-09-01', last: '2026-09-30' })
    expect(periodDays('month', '2026-10-19', '2026-10', { from: '', to: '' })).toEqual({ first: '2026-10-01', last: '2026-10-18' })
    expect(periodDays('custom', '2026-10-19', '', { from: '2026-10-01', to: '2026-12-01' })).toEqual({ first: '2026-10-01', last: '2026-10-18' })
  })
})

describe('TeamRepliesSection', () => {
  it('adds up the kept days of the last 7 days, with the live open chats', async () => {
    fetchKeptDays.mockResolvedValue({
      rows: [kept('2026-10-17', 'staff:1', [60, 120]), kept('2026-10-18', 'staff:1', [3000]), kept('2026-10-18', 'automation', [30], [9])],
      doneDays: new Set(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']),
    })
    render(
      <TeamRepliesSection
        staff={staff}
        client={client([conversation(1, { waiting_since: TODAY_FROM, custom_attributes: { crm_owner_id: 2 } })])}
        now={NOW}
      />,
    )

    expect(fetchKeptDays).toHaveBeenCalledWith('2026-10-12', '2026-10-18')
    const table = await screen.findByRole('table', { name: '' })
    const mei = within(table).getByRole('row', { name: /Mei/ })
    // 3 answers over two days: the middle one is 2 min, not the middle of the daily middles.
    expect(mei).toHaveTextContent('3')
    expect(mei).toHaveTextContent('2 min')
    expect(within(table).getByRole('row', { name: /Automation/ })).toBeInTheDocument()
    await waitFor(() => expect(within(table).getByRole('row', { name: /Jun/ })).toHaveTextContent('1'))
    expect(screen.getByRole('img', { name: 'Replies per day' })).toBeInTheDocument()
  })

  it('says which days are not worked out yet', async () => {
    fetchKeptDays.mockResolvedValue({ rows: [], doneDays: new Set(['2026-10-18']) })
    render(<TeamRepliesSection staff={staff} client={null} now={NOW} />)

    expect(await screen.findByText('6 of 7 days not worked out yet.')).toBeInTheDocument()
  })

  it('works today out on the spot from the inbox copy', async () => {
    fetchKeptDays.mockResolvedValue({ rows: [], doneDays: new Set() })
    fetchToday.mockResolvedValue([kept('2026-10-19', 'staff:2', [300])])
    render(<TeamRepliesSection staff={staff} client={null} now={NOW} />)

    await userEvent.click(screen.getByRole('button', { name: 'Today' }))
    const jun = await screen.findByRole('row', { name: /Jun/ })
    expect(jun).toHaveTextContent('5 min')
    // Nothing is waiting to be read: no trend for a single day, and no live columns without the inbox.
    expect(screen.queryByRole('img', { name: 'Replies per day' })).not.toBeInTheDocument()
  })

  it('offers "Copy old chats" to an admin only', async () => {
    fetchKeptDays.mockResolvedValue({ rows: [], doneDays: new Set() })
    const { unmount } = render(<TeamRepliesSection staff={staff} client={null} now={NOW} />)
    expect(screen.queryByRole('heading', { name: 'Copy old chats' })).not.toBeInTheDocument()
    unmount()

    render(<TeamRepliesSection staff={staff} client={null} canCopy now={NOW} />)
    expect(await screen.findByRole('heading', { name: 'Copy old chats' })).toBeInTheDocument()
    expect(await screen.findByText(/40 messages in 3 chats/)).toBeInTheDocument()
  })
})
