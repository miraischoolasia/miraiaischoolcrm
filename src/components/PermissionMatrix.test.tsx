import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PermissionMatrix } from './PermissionMatrix'

describe('PermissionMatrix', () => {
  it('sets a level, and only offers delete once edit is picked', async () => {
    const onChange = vi.fn()
    const { rerender } = render(<PermissionMatrix value={{}} onChange={onChange} />)

    expect(screen.getByRole('checkbox', { name: 'Leads: can delete' })).toBeDisabled()
    await userEvent.click(
      screen.getAllByRole('radio', { name: 'Edit' })[3], // Calendar, Classrooms, Students, Leads
    )
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

  it('offers the activity log as view only', () => {
    render(<PermissionMatrix value={{}} onChange={vi.fn()} />)
    const activity = screen.getByRole('radiogroup', { name: 'Activity Log access' })

    expect(activity.querySelectorAll('[role="radio"]')).toHaveLength(2)
    expect(screen.queryByRole('checkbox', { name: 'Activity Log: can delete' })).not.toBeInTheDocument()
  })
})
