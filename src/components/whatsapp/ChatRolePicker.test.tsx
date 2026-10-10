import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChatRolePicker } from './ChatRolePicker'

describe('ChatRolePicker', () => {
  it('asks who is on the chat and says the options in plain words', async () => {
    const onPick = vi.fn()
    render(<ChatRolePicker role={null} studentName="Albee" canBeStudent onPick={onPick} />)

    expect(screen.getByText('Who is on this chat?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Albee themself' }))

    expect(onPick).toHaveBeenCalledWith('student')
  })

  it('marks the chosen one', () => {
    render(<ChatRolePicker role="parent" studentName="Albee" canBeStudent onPick={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Parent of Albee' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Albee themself' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('only offers the parent when the chat is about several children', () => {
    render(<ChatRolePicker role={null} studentName="Albee & Ben" canBeStudent={false} onPick={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Parent of Albee & Ben' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /themself/ })).not.toBeInTheDocument()
  })

  it('takes the answer back when the chosen one is tapped again', async () => {
    const onPick = vi.fn()
    render(<ChatRolePicker role="parent" studentName="Albee" canBeStudent onPick={onPick} />)

    await userEvent.click(screen.getByRole('button', { name: 'Parent of Albee' }))

    expect(onPick).toHaveBeenCalledWith(null)
  })
})
