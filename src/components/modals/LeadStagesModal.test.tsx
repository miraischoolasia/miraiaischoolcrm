import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LeadStagesState } from '../../hooks/useLeadStages'
import { DEFAULT_STAGES, type LeadStage } from '../../lib/leadStages'
import { LeadStagesModal } from './LeadStagesModal'

const custom: LeadStage = { key: 'stage_ab12cd34ef', label: 'Placement test', color: 'teal', sortOrder: 35, isActive: true, isSystem: false }

function makeState(patch: Partial<LeadStagesState> = {}): LeadStagesState {
  return {
    stages: [...DEFAULT_STAGES, custom].sort((a, b) => a.sortOrder - b.sortOrder),
    error: null,
    reload: vi.fn(),
    add: vi.fn().mockResolvedValue(null),
    change: vi.fn().mockResolvedValue(null),
    remove: vi.fn().mockResolvedValue(null),
    move: vi.fn().mockResolvedValue(null),
    ...patch,
  }
}

describe('LeadStagesModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('lists every stage, and only a stage of its own can be deleted', () => {
    render(<LeadStagesModal state={makeState()} onClose={vi.fn()} />)

    expect(screen.getByRole('textbox', { name: 'Name of Placement test' })).toHaveValue('Placement test')
    expect(screen.getByRole('button', { name: 'Delete Placement test' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Lost' })).not.toBeInTheDocument()
  })

  it('has no switch for the stages that are always on', () => {
    render(<LeadStagesModal state={makeState()} onClose={vi.fn()} />)

    expect(screen.queryByRole('switch', { name: 'New is on' })).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Contacted is on' })).toBeInTheDocument()
  })

  it('adds a stage with a name and a colour', async () => {
    const state = makeState()
    render(<LeadStagesModal state={state} onClose={vi.fn()} />)

    await userEvent.type(screen.getByRole('textbox', { name: 'Name of the new stage' }), 'Deposit paid')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Colour of the new stage' }), 'orange')
    await userEvent.click(screen.getByRole('button', { name: 'Add stage' }))

    await waitFor(() => expect(state.add).toHaveBeenCalledWith('Deposit paid', 'orange'))
  })

  it('shows why a stage could not be added', async () => {
    const state = makeState({ add: vi.fn().mockResolvedValue('Another stage has this name.') })
    render(<LeadStagesModal state={state} onClose={vi.fn()} />)

    await userEvent.type(screen.getByRole('textbox', { name: 'Name of the new stage' }), 'Lost')
    await userEvent.click(screen.getByRole('button', { name: 'Add stage' }))

    expect(await screen.findByText('Another stage has this name.')).toBeInTheDocument()
  })

  it('renames a stage when the name is left', async () => {
    const state = makeState()
    render(<LeadStagesModal state={state} onClose={vi.fn()} />)

    const box = screen.getByRole('textbox', { name: 'Name of Contacted' })
    await userEvent.clear(box)
    await userEvent.type(box, 'Reached out')
    await userEvent.tab()

    await waitFor(() => expect(state.change).toHaveBeenCalledWith('contacted', { label: 'Reached out' }))
  })

  it("shows the database's reason when a stage with leads is turned off", async () => {
    const state = makeState({ change: vi.fn().mockResolvedValue('4 lead(s) are in "Contacted". Move them to another stage first.') })
    render(<LeadStagesModal state={state} onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('switch', { name: 'Contacted is on' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('4 lead(s) are in "Contacted"')
  })

  it('moves a stage up and cannot move the first one further', async () => {
    const state = makeState()
    render(<LeadStagesModal state={state} onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Move New up' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Move Contacted up' }))

    await waitFor(() => expect(state.move).toHaveBeenCalledWith('contacted', -1))
  })
})
