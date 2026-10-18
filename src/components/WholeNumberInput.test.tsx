import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { WholeNumberInput } from './WholeNumberInput'

function Harness({ start }: { start: number }) {
  const [value, setValue] = useState(start)
  return (
    <>
      <WholeNumberInput value={value} min={1} max={100} onChange={setValue} aria-label="Percent" />
      <output>{value}</output>
    </>
  )
}

describe('WholeNumberInput', () => {
  it('lets 100 be cleared and 80 typed', async () => {
    render(<Harness start={100} />)
    const box = screen.getByRole('spinbutton', { name: 'Percent' })
    await userEvent.clear(box)
    expect(box).toHaveValue(null)
    await userEvent.type(box, '80')
    expect(box).toHaveValue(80)
    expect(screen.getByRole('status')).toHaveTextContent('80')
  })

  it('puts the number back in range when the box is left', async () => {
    render(<Harness start={50} />)
    const box = screen.getByRole('spinbutton', { name: 'Percent' })
    await userEvent.clear(box)
    await userEvent.type(box, '250')
    await userEvent.tab()
    expect(box).toHaveValue(100)
    expect(screen.getByRole('status')).toHaveTextContent('100')
    await userEvent.clear(box)
    await userEvent.tab()
    expect(box).toHaveValue(100)
  })
})
