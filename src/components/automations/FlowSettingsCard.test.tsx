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

describe('FlowSettingsCard keywords', () => {
  it('asks for the keywords only in a flow that starts from a message', () => {
    const { rerender } = render(<FlowSettingsCard settings={undefined} trigger="lead_created" readOnly={false} onChange={vi.fn()} />)
    expect(screen.queryByRole('textbox', { name: 'Keywords' })).not.toBeInTheDocument()
    rerender(<FlowSettingsCard settings={undefined} trigger="message_keyword" readOnly={false} onChange={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'Keywords' })).toBeInTheDocument()
  })

  it('shows the saved keywords one to a line and sends the lines as typed', async () => {
    const onChange = vi.fn()
    render(
      <FlowSettingsCard
        settings={{ keywords: ['HOA course'] }}
        trigger="message_keyword"
        readOnly={false}
        onChange={onChange}
      />,
    )
    const box = screen.getByRole('textbox', { name: 'Keywords' })
    expect(box).toHaveValue('HOA course')
    await userEvent.type(box, '{Enter}Camp')
    expect(onChange).toHaveBeenLastCalledWith({ keywords: ['HOA course', 'Camp'] })
  })

  it('can start again every time', async () => {
    const onChange = vi.fn()
    render(<FlowSettingsCard settings={{ keywords: ['x'] }} trigger="message_keyword" readOnly={false} onChange={onChange} />)
    await userEvent.click(screen.getByRole('checkbox', { name: /Start again every time/ }))
    expect(onChange).toHaveBeenCalledWith({ everyTime: true })
  })

  it('cannot be changed when the flow is read only', () => {
    render(<FlowSettingsCard settings={{ keywords: ['x'] }} trigger="message_keyword" readOnly onChange={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'Keywords' })).toBeDisabled()
  })
})
