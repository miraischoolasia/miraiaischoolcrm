import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ChannelAlertBar } from './ChannelAlertBar'
import type { ChannelAlert } from '../lib/channelAlerts'
import type { WaConnect } from '../lib/waConnect'

const NOW = Date.parse('2026-10-20T10:00:00Z')

const loggedOut: ChannelAlert = {
  key: 'whatsapp:6:logged_out:x',
  channel: 'whatsapp',
  name: 'Second (60120000002)',
  problem: 'logged_out',
  since: new Date(NOW - 30 * 60_000).toISOString(),
  inboxId: 6,
  instance: 'school-2',
  detail: 'device_removed',
}

const connect: WaConnect = {
  state: async () => 'close',
  qr: async () => ({ base64: '', count: 1, code: 'x' }),
} as unknown as WaConnect

afterEach(() => {
  window.localStorage.clear()
})

describe('ChannelAlertBar', () => {
  it('shows nothing when every channel works', () => {
    const { container } = render(<ChannelAlertBar alerts={[]} isAdmin apiUrl="https://wa.example" now={NOW} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('tells an admin what happened and opens the QR code of that number', async () => {
    render(<ChannelAlertBar alerts={[loggedOut]} isAdmin apiUrl="https://wa.example" connect={connect} now={NOW} />)
    expect(screen.getByRole('alert')).toHaveTextContent('WhatsApp Second (60120000002) is logged out')
    expect(screen.getByRole('alert')).toHaveTextContent('Next step:')
    expect(screen.getByText('Server says: device_removed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Scan QR code/ }))
    expect(await screen.findByText('Link the phone again')).toBeInTheDocument()
  })

  it('tells staff to fetch an admin, without the QR button', () => {
    render(<ChannelAlertBar alerts={[loggedOut]} isAdmin={false} apiUrl="https://wa.example" now={NOW} />)
    expect(screen.getByText(/Only an admin can scan the QR code/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Scan QR code/ })).toBeNull()
    expect(screen.queryByText(/Server says/)).toBeNull()
  })

  it('offers no QR code when scanning cannot help', () => {
    render(<ChannelAlertBar alerts={[{ ...loggedOut, problem: 'restricted' }]} isAdmin apiUrl="https://wa.example" now={NOW} />)
    expect(screen.getByRole('alert')).toHaveTextContent('restricted by WhatsApp')
    expect(screen.queryByRole('button', { name: /Scan QR code/ })).toBeNull()
  })

  it('hides one for an hour', () => {
    render(<ChannelAlertBar alerts={[loggedOut]} isAdmin apiUrl="https://wa.example" now={NOW} />)
    fireEvent.click(screen.getByRole('button', { name: 'Hide for 1 hour' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
