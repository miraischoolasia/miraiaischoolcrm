import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TeamRepliesCard, type TeamRepliesCardProps } from './TeamRepliesCard'
import type { ChatwootMessage } from '../../lib/whatsappInbox'

const FROM = 1_000_000
let id = 1
const parent = (at: number): ChatwootMessage => ({ id: id++, content: 'hi', message_type: 0, created_at: at, private: false, status: 'sent' })
const ours = (at: number, staffId: number): ChatwootMessage => ({
  id: id++, content: 'hello', message_type: 1, created_at: at, private: false, status: 'sent',
  content_attributes: { crm_sender: { id: staffId } },
})

function renderCard(props: Partial<TeamRepliesCardProps> = {}) {
  const onLoad = vi.fn()
  render(
    <TeamRepliesCard
      staff={[{ id: 1, name: 'Mei' }, { id: 2, name: 'Jun' }]}
      data={null}
      isLoading={false}
      progress={null}
      error={null}
      onLoad={onLoad}
      {...props}
    />,
  )
  return onLoad
}

describe('TeamRepliesCard', () => {
  it('waits for a period to be picked, then asks for it', async () => {
    const onLoad = renderCard()

    expect(screen.getByText('Pick a period to see the numbers.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Last 7 days' }))
    expect(onLoad).toHaveBeenCalledWith('7d')
  })

  it('shows the progress while the chats are read', () => {
    renderCard({ isLoading: true, progress: { done: 12, total: 40 } })

    expect(screen.getByRole('status')).toHaveTextContent('Reading chats… 12 of 40')
  })

  it('shows each person with their reply speed and the chats waiting for them', () => {
    renderCard({
      data: {
        range: 'today',
        from: FROM,
        to: FROM + 86_400,
        loadedAt: (FROM + 50_000) * 1000,
        chats: [
          { id: 10, status: 'open', waitingSince: 0, ownerId: 1, messages: [parent(FROM + 100), ours(FROM + 400, 1)] },
          { id: 11, status: 'open', waitingSince: 0, ownerId: 2, messages: [parent(FROM + 100), ours(FROM + 100 + 7200, 2)] },
          { id: 12, status: 'open', waitingSince: FROM + 200, ownerId: 2, messages: [parent(FROM + 200)] },
        ],
      },
    })

    const table = screen.getByRole('table')
    const mei = within(within(table).getByRole('row', { name: /^Mei/ }))
    // One answer: the typical, average and slowest are the same.
    expect(mei.getAllByText('5 min')).toHaveLength(3)
    expect(mei.getByText('100%')).toBeInTheDocument()
    const jun = within(within(table).getByRole('row', { name: /^Jun/ }))
    expect(jun.getAllByText('2 h')).toHaveLength(3)
    expect(jun.getByText('0%')).toBeInTheDocument()
    // Waiting now is the last column: one open chat of Jun's has a parent waiting.
    expect(jun.getAllByRole('cell').at(-1)).toHaveTextContent('1')
    expect(screen.getByText(/replies in/)).toHaveTextContent('2 replies in 2 chats')
  })

  it('says so when the chats could not be read', () => {
    renderCard({ error: "Couldn't read the WhatsApp chats. Check the inbox connection and try again." })

    expect(screen.getByText(/Couldn't read the WhatsApp chats/)).toBeInTheDocument()
  })
})
