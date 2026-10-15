import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LinkWhatsAppPanel } from './LinkWhatsAppPanel'
import type { WaConnect } from '../../lib/waConnect'

function fakeConnect(states: ('open' | 'close' | 'unavailable')[], image = 'data:image/png;base64,AAAA') {
  let index = 0
  return {
    state: vi.fn(async () => states[Math.min(index++, states.length - 1)]),
    qr: vi.fn(async () => ({ image, pairingCode: null })),
  } as unknown as WaConnect & { state: ReturnType<typeof vi.fn>; qr: ReturnType<typeof vi.fn> }
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
}

describe('LinkWhatsAppPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows nothing when this school has no number to link here', async () => {
    const connect = fakeConnect(['unavailable'])
    const { container } = render(<LinkWhatsAppPanel apiUrl="https://wa.example" connect={connect} />)
    await flush()
    expect(container).toBeEmptyDOMElement()
  })

  it('asks for no QR code until the admin presses the button', async () => {
    const connect = fakeConnect(['close'])
    render(<LinkWhatsAppPanel apiUrl="https://wa.example" connect={connect} />)
    await flush()
    expect(screen.getByText(/Not linked yet/)).toBeInTheDocument()
    expect(connect.qr).not.toHaveBeenCalled()

    await act(async () => {
      screen.getByRole('button', { name: 'Show QR code' }).click()
    })
    await flush()
    expect(connect.qr).toHaveBeenCalledTimes(1)
    expect(screen.getByAltText('WhatsApp QR code')).toBeInTheDocument()
  })

  it('gets a new code every 20 seconds and closes itself once the phone is linked', async () => {
    const connect = fakeConnect(['close', 'close', 'open'])
    render(<LinkWhatsAppPanel apiUrl="https://wa.example" connect={connect} />)
    await flush()
    await act(async () => {
      screen.getByRole('button', { name: 'Show QR code' }).click()
    })
    await flush()
    expect(connect.qr).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(screen.getByAltText('WhatsApp QR code')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(screen.queryByAltText('WhatsApp QR code')).not.toBeInTheDocument()
    expect(screen.getByText('Linked')).toBeInTheDocument()
  })

  it('says linked straight away when the phone is already linked', async () => {
    const connect = fakeConnect(['open'])
    render(<LinkWhatsAppPanel apiUrl="https://wa.example" connect={connect} />)
    await flush()
    expect(screen.getByText('Linked')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show QR code' })).not.toBeInTheDocument()
  })
})
