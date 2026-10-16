import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Lead } from '../../types/domain'
import { LeadMatches } from './LeadFinder'

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

function Phone({ currentLeadId, onPick, start = '' }: { currentLeadId: number | null; onPick: (lead: Lead) => Promise<string | null>; start?: string }) {
  const [phone, setPhone] = useState(start)
  return (
    <div>
      <label>
        Phone number
        <input value={phone} onChange={(event) => setPhone(event.target.value)} />
      </label>
      <LeadMatches query={phone} leads={leads} currentLeadId={currentLeadId} onPick={onPick} />
    </div>
  )
}

describe('LeadMatches', () => {
  it('offers nothing until something is typed, and nothing when no lead matches', async () => {
    render(<Phone currentLeadId={null} onPick={vi.fn()} />)
    expect(screen.queryByText(/Already a lead/)).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Phone number'), '0999999999')
    expect(screen.queryByText(/Already a lead/)).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Leads that match' })).not.toBeInTheDocument()
  })

  it('finds a lead by the number typed in the phone field and ties a chat that is not a lead yet to it, at once', async () => {
    const onPick = vi.fn().mockResolvedValue(null)
    render(<Phone currentLeadId={null} onPick={onPick} />)

    await userEvent.type(screen.getByLabelText('Phone number'), '012 345 6789')
    expect(screen.getByText('Already a lead? Pick them')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Mei Ling Tan/ }))

    expect(onPick).toHaveBeenCalledWith(leads[1])
  })

  it('asks before joining two leads, and never offers the lead itself', async () => {
    const onPick = vi.fn().mockResolvedValue(null)
    render(<Phone currentLeadId={1} onPick={onPick} />)

    await userEvent.type(screen.getByLabelText('Phone number'), 'mei')
    expect(screen.queryByRole('button', { name: /Messenger Mei/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Mei Ling Tan/ }))

    expect(onPick).not.toHaveBeenCalled()
    expect(screen.getByText(/phone number stays/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Join them' }))
    expect(onPick).toHaveBeenCalledWith(leads[1])
  })

  it('shows why a join failed', async () => {
    const onPick = vi.fn().mockResolvedValue('Not allowed.')
    render(<Phone currentLeadId={1} onPick={onPick} />)

    await userEvent.type(screen.getByLabelText('Phone number'), 'ling')
    await userEvent.click(screen.getByRole('button', { name: /Mei Ling Tan/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Join them' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed.')
  })
})
