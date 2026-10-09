import { fireEvent, render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ModalShell } from './ModalShell'

describe('ModalShell layer', () => {
  it('defaults to the base stacking layer', () => {
    const { getByRole } = render(<ModalShell onClose={() => {}}>content</ModalShell>)

    // A second ModalShell mounted later (e.g. a confirm() prompt opened from
    // inside this one) must render above it even though it mounts after this
    // one in the DOM — see the 'overlay' test below and ModalShell's `layer`
    // prop doc comment.
    expect(getByRole('dialog').parentElement?.parentElement).toHaveClass('z-50')
  })

  it('renders above a base-layer modal when given the overlay layer, regardless of mount order', () => {
    const { getByRole } = render(
      <ModalShell onClose={() => {}} layer="overlay">
        content
      </ModalShell>,
    )

    const overlayRoot = getByRole('dialog').parentElement?.parentElement
    expect(overlayRoot).toHaveClass('z-[60]')
    expect(overlayRoot).not.toHaveClass('z-50')
  })
})

describe('ModalShell placement', () => {
  it('is a centred dialog by default', () => {
    const { getByRole } = render(<ModalShell onClose={() => {}}>content</ModalShell>)

    expect(getByRole('dialog')).toHaveAttribute('data-modal-shell')
  })

  it('can be a drawer on the right edge that still closes on Escape and on the backdrop', async () => {
    const onClose = vi.fn()
    const { getByRole } = render(
      <ModalShell onClose={onClose} placement="right">
        content
      </ModalShell>,
    )
    const dialog = getByRole('dialog')

    expect(dialog).toHaveAttribute('data-drawer-shell')
    expect(dialog.parentElement).toHaveClass('justify-end', 'z-50')

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.mouseDown(dialog.parentElement as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
