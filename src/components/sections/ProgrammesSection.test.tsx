import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ProgrammesState } from '../../hooks/useProgrammes'
import type { Programme } from '../../lib/programmes'
import { ProgrammesView } from './ProgrammesSection'

const make = (id: number, name: string, category: string | null = null): Programme => ({
  id,
  name,
  category,
  legacyKey: null,
  outcome: 'booking',
  messageTemplate: '',
  isActive: true,
  sortOrder: id * 10,
  steps: [],
})

function makeState(programmes: Programme[], patch: Partial<ProgrammesState> = {}): ProgrammesState {
  return {
    programmes,
    isLoading: false,
    error: null,
    reload: vi.fn(),
    add: vi.fn(),
    save: vi.fn().mockResolvedValue(null),
    remove: vi.fn(),
    move: vi.fn(),
    putStep: vi.fn(),
    removeStep: vi.fn(),
    moveStep: vi.fn(),
    ...patch,
  } as unknown as ProgrammesState
}

describe('ProgrammesView categories', () => {
  it('lists the programmes under their category, the ones with none last', () => {
    render(<ProgrammesView canEdit state={makeState([make(1, 'Maths F1', 'Form 1'), make(2, 'Starter kit'), make(3, 'Maths F2', 'Form 2')])} />)

    const headings = screen.getAllByRole('heading', { level: 3 }).map((entry) => entry.textContent)
    expect(headings).toEqual(['Form 1 (1)', 'Form 2 (1)', 'Other (1)'])
  })

  it('offers a search once there are many programmes, and finds by category', async () => {
    const many = Array.from({ length: 8 }, (_, index) => make(index + 1, `Course ${index + 1}`, index < 4 ? 'Form 1' : 'Products'))
    render(<ProgrammesView canEdit state={makeState(many)} />)

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search programmes' }), 'products')

    expect(screen.queryByText('Course 1')).not.toBeInTheDocument()
    expect(screen.getByText('Course 8')).toBeInTheDocument()
  })

  it('has no search for a few programmes', () => {
    render(<ProgrammesView canEdit state={makeState([make(1, 'Maths'), make(2, 'English')])} />)

    expect(screen.queryByRole('searchbox', { name: 'Search programmes' })).not.toBeInTheDocument()
  })

  it('saves the category typed for a programme, and suggests the ones already used', async () => {
    const state = makeState([make(1, 'Maths F1', 'Form 1'), make(2, 'English F2')])
    render(<ProgrammesView canEdit state={state} />)

    await userEvent.click(screen.getByRole('button', { name: /^English F2/ }))
    const field = screen.getByLabelText(/^Category/)
    expect(document.querySelector('datalist option[value="Form 1"]')).not.toBeNull()
    await userEvent.type(field, 'Form 2')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(state.save).toHaveBeenCalledWith(2, expect.objectContaining({ name: 'English F2', category: 'Form 2' })),
    )
  })
})
