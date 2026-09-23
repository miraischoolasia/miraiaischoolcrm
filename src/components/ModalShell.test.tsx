import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
