import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Team } from '../../lib/staffTeams'

const saveTeam = vi.fn(async (draft: { id: number | null; name?: string }) => draft.id ?? 42)
const setTeamMembers = vi.fn(async () => undefined)

vi.mock('../../lib/staffTeams', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/staffTeams')>()
  return { ...actual, saveTeam: (draft: { id: number | null }) => saveTeam(draft), setTeamMembers: (...args: unknown[]) => setTeamMembers(...(args as [])) }
})
// The channel and PIC parts read the database themselves; not part of this test.
vi.mock('./ChannelAccessSection', () => ({ ChannelAccessSection: () => null }))
vi.mock('./PicLinksSection', () => ({ PicLinksSection: () => null }))

import { TeamsPanel } from './TeamsPanel'

const people = [
  { id: 1, name: 'Boss', role: 'admin' as const },
  { id: 2, name: 'Amin', role: 'staff' as const },
  { id: 3, name: 'Chen', role: 'teacher' as const },
]

const sales: Team = { id: 7, name: 'Sales', color: '#fc0c97', description: null, permissions: { leads: { level: 'edit' } }, isActive: true, sortOrder: 0 }

describe('TeamsPanel', () => {
  beforeEach(() => {
    saveTeam.mockClear()
    setTeamMembers.mockClear()
  })

  it('offers the suggested teams when there are none', async () => {
    const onChanged = vi.fn()
    render(<TeamsPanel teams={[]} members={new Map()} missing={false} loadError={null} people={people} onChanged={onChanged} />)
    await userEvent.click(screen.getByRole('button', { name: 'Start with suggested teams' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(saveTeam.mock.calls.map(([draft]) => draft.name)).toEqual(['Sales', 'Teachers', 'Office'])
  })

  it('changes a team: its people and its ticks, admins not offered', async () => {
    const onChanged = vi.fn()
    render(
      <TeamsPanel teams={[sales]} members={new Map([[7, [2]]])} missing={false} loadError={null} people={people} onChanged={onChanged} />,
    )

    expect(screen.queryByRole('checkbox', { name: /Boss/ })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Amin/ })).toBeChecked()
    await userEvent.click(screen.getByRole('checkbox', { name: /Chen/ }))
    const inbox = screen.getByRole('radiogroup', { name: 'Inbox access' })
    await userEvent.click(inbox.querySelectorAll('[role="radio"]')[1] as HTMLElement)
    await userEvent.click(screen.getByRole('button', { name: 'Save team' }))

    await waitFor(() => expect(setTeamMembers).toHaveBeenCalledWith(7, [2, 3]))
    expect(saveTeam).toHaveBeenCalledWith(
      expect.objectContaining({ id: 7, name: 'Sales', permissions: { leads: { level: 'edit' }, inbox: { level: 'view' } } }),
    )
    expect(await screen.findByText(/Saved/)).toBeInTheDocument()
  })

  it('stops a nameless team before saving', async () => {
    render(<TeamsPanel teams={[sales]} members={new Map()} missing={false} loadError={null} people={people} onChanged={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /New team/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Make team' }))
    expect(screen.getByText(/Give the team a name/)).toBeInTheDocument()
    expect(saveTeam).not.toHaveBeenCalled()
  })

  it('says when the database has no teams yet', () => {
    render(<TeamsPanel teams={[]} members={new Map()} missing loadError={null} people={people} onChanged={vi.fn()} />)
    expect(screen.getByText(/not set up in the database yet/)).toBeInTheDocument()
  })
})
