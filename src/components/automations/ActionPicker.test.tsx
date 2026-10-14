import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActionPicker } from './ActionPicker'
import { PICK_GROUPS } from './pickGroups'

describe('ActionPicker', () => {
  it('lists every step in its group and says where it will go', () => {
    render(<ActionPicker where="It goes right after this message." onPick={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('It goes right after this message.')).toBeInTheDocument()
    for (const group of PICK_GROUPS) {
      expect(screen.getByRole('region', { name: group.title })).toBeInTheDocument()
      for (const pick of group.picks) {
        expect(screen.getByRole('button', { name: `${pick.label} ${pick.hint}` })).toBeInTheDocument()
      }
    }
  })

  it('hands back the kind of the step that was picked', async () => {
    const onPick = vi.fn()
    render(<ActionPicker where="x" onPick={onPick} onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Wait for a reply/ }))
    expect(onPick).toHaveBeenCalledWith('wait')
  })

  it('narrows the list while typing and says when nothing matches', async () => {
    render(<ActionPicker where="x" onPick={vi.fn()} onClose={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText('Search steps'), 'tag')
    expect(screen.getByRole('button', { name: /Check the tag/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Check the age/ })).not.toBeInTheDocument()
    await userEvent.clear(screen.getByPlaceholderText('Search steps'))
    await userEvent.type(screen.getByPlaceholderText('Search steps'), 'zzz')
    expect(screen.getByText(/No step matches/)).toBeInTheDocument()
  })

  it('closes', async () => {
    const onClose = vi.fn()
    render(<ActionPicker where="x" onPick={vi.fn()} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })
})
