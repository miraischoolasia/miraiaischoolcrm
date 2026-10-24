import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RoleNamesSetting } from './RoleNamesSetting'

const saveRoleNames = vi.fn(async () => null)

vi.mock('../lib/roleNames', () => ({
  useRoleNames: () => ({ ec: 'EC', lc: 'LC' }),
  saveRoleNames: (...args: unknown[]) => saveRoleNames(...(args as [])),
}))

describe('Today page names setting', () => {
  it('saves the school\'s own words', async () => {
    render(<RoleNamesSetting />)
    const sales = screen.getByLabelText('Sales (leads)')
    await userEvent.clear(sales)
    await userEvent.type(sales, 'Sales')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(saveRoleNames).toHaveBeenCalledWith({ ec: 'Sales', lc: 'LC' })
    expect(await screen.findByText('Saved.')).toBeInTheDocument()
  })

  it('will not save an empty name', async () => {
    render(<RoleNamesSetting />)
    await userEvent.clear(screen.getByLabelText('Sales (leads)'))
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })
})
