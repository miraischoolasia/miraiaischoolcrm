import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CardData } from '../../lib/progressCards'

const api = vi.hoisted(() => ({ markSent: vi.fn(), openChat: vi.fn(), fetchCard: vi.fn() }))

const makeCard = (): CardData => ({
  student: { id: 3, name: 'Caleb Wong', code: 'S100', consultant: 'Amy', sendTo: { phone: '60123456789', name: 'Mrs Wong', contactId: null } },
  month: '2026-10-01',
  lessons: [
    { sessionId: 1, date: '2026-10-02', classroom: 'F1 Math', teacher: 'Teacher Lina', status: 'present', attended: true, hasZoom: true, participation: 90, questions: 4, correct: 3, wrong: 1, points: 30 },
    { sessionId: 2, date: '2026-10-09', classroom: 'F1 Math', teacher: 'Teacher Lina', status: 'present', attended: true, hasZoom: true, participation: 100, questions: 4, correct: 4, wrong: 0, points: 40 },
  ],
  words: [{ date: '2026-10-09', teacher: 'Teacher Lina', text: 'Lovely work.' }],
  sentAt: null,
})

vi.mock('../../lib/progressCards', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/progressCards')>()
  return { ...real, fetchCard: api.fetchCard, markCardSent: api.markSent }
})

vi.mock('../../lib/classQuality', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../lib/classQuality')>()
  return { ...real, fetchQualitySettings: vi.fn(async () => real.DEFAULT_QUALITY_SETTINGS) }
})

vi.mock('../WhatsAppLink', () => ({ useOpenChat: () => api.openChat }))

import { StudentProgressCard } from './StudentProgressCard'

describe('the Progress card tab', () => {
  beforeEach(() => {
    api.markSent.mockReset().mockResolvedValue(null)
    api.openChat.mockReset()
    api.fetchCard.mockReset().mockImplementation(async () => makeCard())
  })

  it('shows the month on one card and puts the text in the family’s chat for the person to send', async () => {
    render(<StudentProgressCard studentId={3} today="2026-10-23" />)
    expect(await screen.findByText('2 / 2')).toBeInTheDocument()
    expect(api.fetchCard).toHaveBeenCalledWith(3, '2026-10-01')
    // Each quiz as a score: 3 of 4, then 4 of 4; 7 of 8 in the month.
    expect(screen.getByText('7 / 8')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Quiz scores: 3/4, 4/4' })).toBeInTheDocument()
    expect(screen.getByText('Lovely work.')).toBeInTheDocument()
    expect(screen.getByText('Not sent this month')).toBeInTheDocument()
    const message = screen.getByRole('textbox', { name: 'Message to the parent' }) as HTMLTextAreaElement
    await waitFor(() => expect(message.value).toMatch(/出席：2\/2 堂课/))
    expect(message.value).toMatch(/答对 7\/8 题/)
    expect(message.value).toMatch(/Teacher Lina：「Lovely work.」/)

    await userEvent.type(message, ' See you!')
    await userEvent.click(screen.getByRole('button', { name: 'Send to parent' }))
    expect(api.openChat).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '60123456789', name: 'Mrs Wong', message: expect.stringMatching(/See you!$/) }),
    )
    expect(api.markSent).toHaveBeenCalledWith(3, '2026-10-01')
    expect(await screen.findByText(/^Sent to the family/)).toBeInTheDocument()
  })

  it('shows when it was sent, and no teacher block without remarks', async () => {
    api.fetchCard.mockImplementation(async () => ({ ...makeCard(), words: [], sentAt: '2026-10-05T03:00:00Z' }))
    render(<StudentProgressCard studentId={3} today="2026-10-23" />)
    expect(await screen.findByText('Sent to the family 5 Oct')).toBeInTheDocument()
    expect(screen.queryByText('From the teacher')).not.toBeInTheDocument()
  })

  it('says so when the card is someone else’s student', async () => {
    api.fetchCard.mockRejectedValue({ code: '42501', message: 'You cannot see this student’s card.' })
    render(<StudentProgressCard studentId={3} today="2026-10-23" />)
    expect(await screen.findByText(/Only this student's Learning Consultant/)).toBeInTheDocument()
  })
})
