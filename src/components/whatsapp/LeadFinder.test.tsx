import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Lead } from '../../types/domain'
import { LeadFinder } from './LeadFinder'

function lead(id: number, fullName: string, phone: string | null): Lead {
  return {
    id,
    fullName,
    phone,
    status: 'new',
    notes: '',
    children: [],
    followUps: [],
    tasks: [],
    checks: {},
    tagIds: [],
    sourceId: null,
    picId: null,
    state: null,
    addedDate: '2026-10-01',
  } as unknown as Lead
}

const leads = [lead(1, 'Messenger Mei', null), lead(2, 'Mei Ling Tan', '+60123456789')]

describe('LeadFinder', () => {
  it('ties a chat that is not a lead yet to the lead found, at once', async () => {
    const onPick = vi.fn().mockResolvedValue(null)
    render(<LeadFinder leads={leads} currentLeadId={null} onPick={onPick} />)

    await userEvent.type(screen.getByPlaceholderText('Name or phone number'), 'ling')
    await userEvent.click(screen.getByRole('button', { name: /Mei Ling Tan/ }))

    expect(onPick).toHaveBeenCalledWith(leads[1])
  })

  it('asks before joining two leads, and never offers the lead itself', async () => {
    const onPick = vi.fn().mockResolvedValue(null)
    render(<LeadFinder leads={leads} currentLeadId={1} onPick={onPick} />)

    await userEvent.type(screen.getByPlaceholderText('Name or phone number'), 'mei')
    expect(screen.queryByRole('button', { name: /Messenger Mei/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Mei Ling Tan/ }))

    expect(onPick).not.toHaveBeenCalled()
    expect(screen.getByText(/phone number stays/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Join them' }))
    expect(onPick).toHaveBeenCalledWith(leads[1])
  })

  it('shows why a join failed', async () => {
    const onPick = vi.fn().mockResolvedValue('Not allowed.')
    render(<LeadFinder leads={leads} currentLeadId={1} onPick={onPick} />)

    await userEvent.type(screen.getByPlaceholderText('Name or phone number'), 'ling')
    await userEvent.click(screen.getByRole('button', { name: /Mei Ling Tan/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Join them' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed.')
  })
})
