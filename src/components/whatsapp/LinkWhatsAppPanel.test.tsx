import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LinkWhatsAppPanel, QR_LOOK_MS, QR_TRY_MS } from './LinkWhatsAppPanel'
import type { WaConnect, WaQr } from '../../lib/waConnect'

const code = (count: number, extra: Partial<WaQr> = {}): WaQr => ({
  image: `data:image/png;base64,CODE${count}`, pairingCode: null, count, key: `#${count}`, linked: false, ...extra,
})

function fakeConnect(states: ('open' | 'close' | 'connecting' | 'unavailable')[], codes: WaQr[] = [code(1)]) {
  let stateIndex = 0
  let codeIndex = 0
  return {
    state: vi.fn(async () => states[Math.min(stateIndex++, states.length - 1)]),
    qr: vi.fn(async () => codes[Math.min(codeIndex++, codes.length - 1)]),
  } as unknown as WaConnect & { state: ReturnType<typeof vi.fn>; qr: ReturnType<typeof vi.fn> }
}

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function press(name: string) {
  await act(async () => {
    screen.getByRole('button', { name }).click()
  })
  await wait(0)
}

describe('LinkWhatsAppPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('says linking from here is not turned on when the school server has no such door, and asks for nothing', async () => {
    const connect = fakeConnect(['unavailable'])
    render(<LinkWhatsAppPanel apiUrl="https://wa.example" connect={connect} />)
    await wait(30_000)
    expect(screen.getByText(/not turned on for this school yet/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show QR code' })).not.toBeInTheDocument()
    expect(connect.qr).not.toHaveBeenCalled()
    expect(connect.state).toHaveBeenCalledTimes(1)
  })

  it('asks for no QR code, and does not keep checking, until the admin presses the button', async () => {
    const connect = fakeConnect(['close'])
    render(<LinkWhatsAppPanel apiUrl="https://wa.example" connect={connect} />)
    await wait(30_000)
    expect(screen.getByText(/Not linked yet/)).toBeInTheDocument()
    expect(connect.qr).not.toHaveBeenCalled()
    // One look at the link when the panel opened, nothing after.
    expect(connect.state).toHaveBeenCalledTimes(1)

    await press('Show QR code')
    expect(connect.qr).toHaveBeenCalledTimes(1)
    expect(screen.getByAltText('WhatsApp QR code')).toHaveAttribute('src', 'data:image/png;base64,CODE1')
  })

  it('changes the picture only when WhatsApp has made a new code', async () => {
    // WhatsApp's code stays the same for a while, then a new one comes.
    const connect = fakeConnect(['close'], [code(1), code(1), code(1), code(2)])
    render(<LinkWhatsAppPanel apiUrl="https://wa.example" connect={connect} />)
    await wait(0)
    await press('Show QR code')
    const first = screen.getByAltText('WhatsApp QR code')

    await wait(QR_LOOK_MS * 2)
    expect(screen.getByAltText('WhatsApp QR code')).toBe(first)
    expect(first).toHaveAttribute('src', 'data:image/png;base64,CODE1')

    await wait(QR_LOOK_MS)
    expect(screen.getByAltText('WhatsApp QR code')).toHaveAttribute('src', 'data:image/png;base64,CODE2')
    // Never more often than before (a code every 20 seconds and the link every 3 seconds).
    expect(connect.qr.mock.calls.length + connect.state.mock.calls.length).toBeLessThanOrEqual(1 + Math.ceil((QR_LOOK_MS * 3) / 3_000) + 1)
  })

  it('stops by itself after 2 minutes and says how to try again', async () => {
    const connect = fakeConnect(['close'], [code(1), code(2), code(3), code(4), code(5), code(6), code(7)])
    render(<LinkWhatsAppPanel apiUrl="https://wa.example" connect={connect} />)
    await wait(0)
    await press('Show QR code')

    await wait(QR_TRY_MS + QR_LOOK_MS)
    expect(screen.queryByAltText('WhatsApp QR code')).not.toBeInTheDocument()
    expect(screen.getByText('Stopped. Press the button to try again.')).toBeInTheDocument()
    expect(screen.getByText(/newest version.*4 linked devices.*wait 30 minutes/)).toBeInTheDocument()
    const asked = connect.qr.mock.calls.length
    await wait(60_000)
    expect(connect.qr.mock.calls.length).toBe(asked)

    // The button starts a new try.
    await press('Show QR code')
    expect(connect.qr.mock.calls.length).toBe(asked + 1)
  })

  it('stops instead of starting the linking again when WhatsApp ended it', async () => {
    // The count goes back to 1: asking again began a new linking.
    const connect = fakeConnect(['close'], [code(4), code(5), code(1)])
    render(<LinkWhatsAppPanel apiUrl="https://wa.example" connect={connect} />)
    await wait(0)
    await press('Show QR code')
    await wait(QR_LOOK_MS * 2)
    expect(screen.getByText('Stopped. Press the button to try again.')).toBeInTheDocument()
    const asked = connect.qr.mock.calls.length
    await wait(QR_LOOK_MS * 3)
    expect(connect.qr.mock.calls.length).toBe(asked)
  })

  it('closes the code once the phone is linked', async () => {
    const connect = fakeConnect(['close'], [code(1), code(1, { linked: true, image: null })])
    render(<LinkWhatsAppPanel apiUrl="https://wa.example" connect={connect} />)
    await wait(0)
    await press('Show QR code')
    await wait(QR_LOOK_MS)
    expect(screen.queryByAltText('WhatsApp QR code')).not.toBeInTheDocument()
    expect(screen.getByText('Linked')).toBeInTheDocument()
  })

  it('stops when the panel closes', async () => {
    const connect = fakeConnect(['close'])
    const { unmount } = render(<LinkWhatsAppPanel apiUrl="https://wa.example" connect={connect} />)
    await wait(0)
    await press('Show QR code')
    unmount()
    const asked = connect.qr.mock.calls.length
    await wait(QR_LOOK_MS * 5)
    expect(connect.qr.mock.calls.length).toBe(asked)
  })

  it('shows the code at once for a number just added, without the button', async () => {
    const connect = fakeConnect(['close'])
    render(<LinkWhatsAppPanel apiUrl="https://wa.example" connect={connect} autoStart />)
    await wait(0)
    expect(connect.qr).toHaveBeenCalledTimes(1)
    expect(screen.getByAltText('WhatsApp QR code')).toBeInTheDocument()
  })

  it('says linked straight away when the phone is already linked, and asks for no code', async () => {
    const connect = fakeConnect(['open'])
    render(<LinkWhatsAppPanel apiUrl="https://wa.example" connect={connect} />)
    await wait(60_000)
    expect(screen.getByText('Linked')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show QR code' })).not.toBeInTheDocument()
    expect(connect.qr).not.toHaveBeenCalled()
    expect(connect.state).toHaveBeenCalledTimes(1)
  })
})
