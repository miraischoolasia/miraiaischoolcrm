import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RowActionsMenu } from './RowActionsMenu'

function setup() {
  const onView = vi.fn()
  const onDeactivate = vi.fn()
  render(
    <RowActionsMenu
      label="More actions for Ada"
      actions={[
        { label: 'View details', onSelect: onView },
        { label: 'Deactivate', onSelect: onDeactivate, danger: true },
        { label: 'Locked', onSelect: vi.fn(), disabled: true },
      ]}
    />,
  )
  return { onView, onDeactivate }
}

describe('RowActionsMenu', () => {
  it('is closed until the button is pressed', () => {
    setup()

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More actions for Ada' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('runs the chosen action and closes', async () => {
    const { onView, onDeactivate } = setup()

    await userEvent.click(screen.getByRole('button', { name: 'More actions for Ada' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'View details' }))

    expect(onView).toHaveBeenCalledTimes(1)
    expect(onDeactivate).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on Escape and when clicking elsewhere, and does not run disabled actions', async () => {
    setup()
    const trigger = screen.getByRole('button', { name: 'More actions for Ada' })

    await userEvent.click(trigger)
    expect(screen.getByRole('menuitem', { name: 'Locked' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    await userEvent.click(trigger)
    await userEvent.click(document.body)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
