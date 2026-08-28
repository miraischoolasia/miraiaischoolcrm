import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { useConfirm } from './useConfirm'

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
})
