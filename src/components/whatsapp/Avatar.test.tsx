import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'

describe('Avatar (WhatsApp pictures, 2026-10-23)', () => {
  it('shows the initials when there is no picture', () => {
    const { container } = render(<Avatar initials="AL" tone="bg-pink-100" />)
    expect(screen.getByText('AL')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })

  it('shows the picture in place of the initials', () => {
    const { container } = render(<Avatar initials="AL" tone="bg-pink-100" src="https://wa.example/rails/active_storage/a.jpg" />)
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://wa.example/rails/active_storage/a.jpg')
    expect(screen.queryByText('AL')).not.toBeInTheDocument()
  })

  it('goes back to the initials when the picture does not load', () => {
    const { container } = render(<Avatar initials="AL" tone="bg-pink-100" src="https://wa.example/gone.jpg" />)
    fireEvent.error(container.querySelector('img')!)
    expect(screen.getByText('AL')).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })
})
