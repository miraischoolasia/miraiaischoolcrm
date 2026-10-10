import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { WhatsAppLink, WhatsAppOpenProvider } from './WhatsAppLink'

describe('WhatsAppLink', () => {
  it('opens the chat on wa.me when the app has no WhatsApp page to open it in', () => {
    render(<WhatsAppLink phone="012-345 6789" name="Mei Ling" />)

    expect(screen.getByRole('link', { name: 'WhatsApp Mei Ling' })).toHaveAttribute('href', 'https://wa.me/60123456789')
  })

  it('asks the app to open the chat on the WhatsApp page, with the lead it sits on', async () => {
    const openChat = vi.fn()
    const onOpened = vi.fn()
    render(
      <WhatsAppOpenProvider value={openChat}>
        <WhatsAppLink phone="012-345 6789" name="Mei Ling" leadId={12} onOpened={onOpened} />
      </WhatsAppOpenProvider>,
    )

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'WhatsApp Mei Ling' }))

    expect(openChat).toHaveBeenCalledWith({ phone: '012-345 6789', name: 'Mei Ling', leadId: 12 })
    expect(onOpened).toHaveBeenCalled()
  })

  it('shows nothing for a number that is too short', () => {
    const { container } = render(<WhatsAppLink phone="123" />)

    expect(container).toBeEmptyDOMElement()
  })
})
