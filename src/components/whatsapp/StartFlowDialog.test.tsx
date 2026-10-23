import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StartFlowDialog, type StartFlowApi } from './StartFlowDialog'
import type { StartableFlow } from '../../lib/startFlow'

const target = {
  conversationId: 42,
  contactId: 7,
  inboxId: 1,
  channel: 'whatsapp' as const,
  phone: '60123456789',
  leadId: 9,
  parentName: 'Puan Aminah',
}

const flows: StartableFlow[] = [
  { id: 1, name: 'Trial follow-up', startable: true, why: null, firstStep: 'Message 3 minutes after the start: “Hi”', sendsItself: false },
  { id: 2, name: 'Class reminder', startable: false, why: 'Timed before a class.', firstStep: '', sendsItself: false },
]

function makeApi(overrides: Partial<StartFlowApi> = {}): StartFlowApi {
  return {
    listStartableFlows: vi.fn().mockResolvedValue(flows),
    fetchFlowState: vi.fn().mockResolvedValue({ running: false }),
    startFlowNow: vi.fn().mockResolvedValue({ started: true, id: 5 }),
    ...overrides,
  }
}

describe('StartFlowDialog', () => {
  it('lists the flows, greys out the ones that cannot start, and starts one now', async () => {
    const api = makeApi()
    const onStarted = vi.fn()
    render(<StartFlowDialog target={target} onClose={() => {}} onStarted={onStarted} api={api} />)

    expect(await screen.findByRole('button', { name: /Class reminder/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /Trial follow-up/ }))

    expect(screen.getByText('Puan Aminah · +60123456789')).toBeInTheDocument()
    expect(screen.getByText('Wait for approval under ⚡ Auto before they go.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start now' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Start now' }))

    expect(api.startFlowNow).toHaveBeenCalledWith(target, 1, false)
    expect(await screen.findByRole('status')).toHaveTextContent('Started “Trial follow-up” for Puan Aminah')
    expect(onStarted).toHaveBeenCalled()
  })

  it('finds a flow by name', async () => {
    render(<StartFlowDialog target={target} onClose={() => {}} api={makeApi()} />)
    await screen.findByRole('button', { name: /Trial follow-up/ })
    await userEvent.type(screen.getByLabelText('Search flows'), 'remind')
    expect(screen.queryByRole('button', { name: /Trial follow-up/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Class reminder/ })).toBeInTheDocument()
  })

  it('tells when the person is already in the flow, and starts again only when asked', async () => {
    const api = makeApi({
      fetchFlowState: vi.fn().mockResolvedValue({ running: true, since: new Date().toISOString(), startedBy: 'Mei', runs: 1 }),
    })
    render(<StartFlowDialog target={target} onClose={() => {}} api={api} />)
    await userEvent.click(await screen.findByRole('button', { name: /Trial follow-up/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Puan Aminah is already in this flow')
    expect(screen.getByRole('alert')).toHaveTextContent('started by Mei')
    await userEvent.click(screen.getByRole('button', { name: 'Start again from the first step' }))
    expect(api.startFlowNow).toHaveBeenCalledWith(target, 1, true)
  })

  it('shows why it could not start', async () => {
    const api = makeApi({ startFlowNow: vi.fn().mockRejectedValue({ code: '22023', message: 'This flow is switched off.' }) })
    render(<StartFlowDialog target={target} onClose={() => {}} api={api} />)
    await userEvent.click(await screen.findByRole('button', { name: /Trial follow-up/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start now' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: 'Start now' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This flow is switched off.')
  })
})
