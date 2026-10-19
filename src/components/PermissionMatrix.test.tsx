import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PermissionMatrix } from './PermissionMatrix'

describe('PermissionMatrix', () => {
  it('sets a level, and only offers delete once edit is picked', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<PermissionMatrix value={{}} onChange={onChange} />)

    expect(screen.getByRole('checkbox', { name: 'Leads: can delete' })).toBeDisabled()
    const leadsRow = screen.getByRole('radiogroup', { name: 'Leads access' })
    await userEvent.click(leadsRow.querySelectorAll('[role="radio"]')[2] as HTMLElement)
    expect(onChange).toHaveBeenLastCalledWith({ leads: { level: 'edit', delete: false } })

    rerender(<PermissionMatrix value={{ leads: { level: 'edit' } }} onChange={onChange} />)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Leads: can delete' }))
    expect(onChange).toHaveBeenLastCalledWith({ leads: { level: 'edit', delete: true } })
  })

  it('drops delete when going back to view, and removes the module on no access', async () => {
    const onChange = vi.fn()
    render(
      <PermissionMatrix
        value={{ leads: { level: 'edit', delete: true }, forms: { level: 'view' } }}
        onChange={onChange}
      />,
    )

    const leads = screen.getByRole('radiogroup', { name: 'Leads access' })
    await userEvent.click(leads.querySelectorAll('[role="radio"]')[1] as HTMLElement)
    expect(onChange).toHaveBeenLastCalledWith({ leads: { level: 'view' }, forms: { level: 'view' } })

    const forms = screen.getByRole('radiogroup', { name: 'Forms access' })
    await userEvent.click(forms.querySelectorAll('[role="radio"]')[0] as HTMLElement)
    expect(onChange).toHaveBeenLastCalledWith({ leads: { level: 'edit', delete: true } })
  })

  it('limits Leads, Inbox and Team Replies to whose rows, and keeps that when the level changes', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<PermissionMatrix value={{ inbox: { level: 'view' } }} onChange={onChange} />)

    expect(screen.getByRole('combobox', { name: 'Leads: whose' })).toBeDisabled()
    expect(screen.queryByRole('combobox', { name: 'Calendar: whose' })).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Inbox: whose' }), 'own')
    expect(onChange).toHaveBeenLastCalledWith({ inbox: { level: 'view', scope: 'own' } })

    rerender(<PermissionMatrix value={{ inbox: { level: 'view', scope: 'own' } }} onChange={onChange} />)
    const inbox = screen.getByRole('radiogroup', { name: 'Inbox access' })
    await userEvent.click(inbox.querySelectorAll('[role="radio"]')[2] as HTMLElement)
    expect(onChange).toHaveBeenLastCalledWith({ inbox: { level: 'edit', delete: false, scope: 'own' } })

    // Team Replies: everyone's or only own.
    const teamReplies = screen.getByRole('combobox', { name: 'Team Replies: whose' })
    expect(Array.from(teamReplies.querySelectorAll('option')).map((option) => option.value)).toEqual(['all', 'own'])
  })

  it('says what the teams already give', () => {
    render(
      <PermissionMatrix
        value={{}}
        onChange={vi.fn()}
        inherited={{ leads: { from: ['Sales', 'Office'], text: 'edit' } }}
      />,
    )
    expect(screen.getByText('From Sales, Office: edit')).toBeInTheDocument()
  })

  it('offers the activity log as view only', () => {
    render(<PermissionMatrix value={{}} onChange={vi.fn()} />)
    const activity = screen.getByRole('radiogroup', { name: 'Activity Log access' })

    expect(activity.querySelectorAll('[role="radio"]')).toHaveLength(2)
    expect(screen.queryByRole('checkbox', { name: 'Activity Log: can delete' })).not.toBeInTheDocument()
  })
})
