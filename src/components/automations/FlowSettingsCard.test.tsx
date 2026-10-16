import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FlowSettingsCard } from './FlowSettingsCard'

describe('FlowSettingsCard channels', () => {
  it('shows WhatsApp ticked when nothing is set, as a flow without the setting only sends there', () => {
    render(<FlowSettingsCard settings={undefined} readOnly={false} onChange={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: 'WhatsApp' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Messenger' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Instagram' })).not.toBeChecked()
  })

  it('adds a channel to the ones already ticked', async () => {
    const onChange = vi.fn()
    render(<FlowSettingsCard settings={undefined} readOnly={false} onChange={onChange} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Messenger' }))
    expect(onChange).toHaveBeenCalledWith({ channels: ['whatsapp', 'messenger'] })
  })

  it('removes a channel', async () => {
    const onChange = vi.fn()
    render(<FlowSettingsCard settings={{ channels: ['whatsapp', 'messenger'] }} readOnly={false} onChange={onChange} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'WhatsApp' }))
    expect(onChange).toHaveBeenCalledWith({ channels: ['messenger'] })
  })

  it('cannot be changed when the flow is read only', () => {
    render(<FlowSettingsCard settings={undefined} readOnly onChange={vi.fn()} />)
    expect(screen.getByRole('checkbox', { name: 'Messenger' })).toBeDisabled()
  })
})
