import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { useConfirm } from './useConfirm'
import { ModalShell } from '../components/ModalShell'

function TestHarness() {
  const { confirm, dialog } = useConfirm()
  const [result, setResult] = useState<string>('pending')

  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          const value = await confirm('Delete this record?')
          setResult(value ? 'confirmed' : 'cancelled')
        }}
      >
        Trigger
      </button>
      <div data-testid="result">{result}</div>
      {dialog}
    </div>
  )
}

describe('useConfirm', () => {
  it('shows no dialog until confirm() is called', () => {
    render(<TestHarness />)
    expect(screen.queryByText('Delete this record?')).not.toBeInTheDocument()
  })

  it('resolves true and hides the dialog when Confirm is clicked', async () => {
    const user = userEvent.setup()
    render(<TestHarness />)

    await user.click(screen.getByText('Trigger'))
    expect(screen.getByText('Delete this record?')).toBeInTheDocument()

    await user.click(screen.getByText('Confirm'))

    expect(screen.getByTestId('result')).toHaveTextContent('confirmed')
    expect(screen.queryByText('Delete this record?')).not.toBeInTheDocument()
  })

  it('resolves false and hides the dialog when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<TestHarness />)

    await user.click(screen.getByText('Trigger'))
    await user.click(screen.getByText('Cancel'))

    expect(screen.getByTestId('result')).toHaveTextContent('cancelled')
    expect(screen.queryByText('Delete this record?')).not.toBeInTheDocument()
  })

  it('stacks above a modal that is still open underneath it, even though that modal mounted first', async () => {
    // Regression test: e.g. ScheduleModal calls confirm() while it is still
    // showing, so its ModalShell (mounted first, DOM-earlier) and the confirm
    // dialog's ModalShell (mounted after) are both on screen at once. Equal
    // z-index would let plain DOM order put the earlier modal on top,
    // hiding the prompt behind it — the confirm dialog must out-rank it.
    function HarnessWithModalUnderneath() {
      const { confirm, dialog } = useConfirm()

      return (
        <div>
          <ModalShell onClose={() => {}}>
            <button type="button" onClick={() => confirm('Cancel this schedule?')}>
              Trigger
            </button>
          </ModalShell>
          {dialog}
        </div>
      )
    }

    const user = userEvent.setup()
    render(<HarnessWithModalUnderneath />)

    await user.click(screen.getByText('Trigger'))

    const dialogs = screen.getAllByRole('dialog')
    expect(dialogs).toHaveLength(2)
    const [underneathModal, confirmModal] = dialogs
    const underneathRoot = underneathModal.parentElement?.parentElement
    const confirmRoot = confirmModal.parentElement?.parentElement

    expect(underneathRoot).toHaveClass('z-50')
    expect(confirmRoot).toHaveClass('z-[60]')
  })
})
