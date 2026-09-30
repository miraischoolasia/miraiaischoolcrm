import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LeadOptionPicker } from './LeadOptionPicker'
import type { LeadOption } from '../types/domain'

const alex: LeadOption = { id: 3, kind: 'pic', label: 'Alex', isActive: true, legacyKey: null }
const gone: LeadOption = { id: 4, kind: 'pic', label: 'Old Staff', isActive: false, legacyKey: null }

describe('LeadOptionPicker', () => {
  it('adds a new name from the dropdown and picks it', async () => {
    const onChange = vi.fn()
    const onAdd = vi.fn(async (label: string) => ({ ...alex, id: 7, label }))
    render(
      <LeadOptionPicker
        label="PIC"
        options={[alex]}
        value=""
        emptyLabel="- Not assigned -"
        onChange={onChange}
        onAdd={onAdd}
      />,
    )

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'PIC' }), '+ Add new...')
    await userEvent.type(screen.getByRole('textbox', { name: 'New pic name' }), 'Mei{Enter}')

    expect(onAdd).toHaveBeenCalledWith('Mei')
    expect(onChange).toHaveBeenCalledWith('7')
    expect(screen.getByRole('combobox', { name: 'PIC' })).toBeInTheDocument()
  })

  it('hides hidden names unless the lead already uses one', () => {
    const { rerender } = render(
      <LeadOptionPicker label="PIC" options={[alex, gone]} value="" onChange={vi.fn()} onAdd={vi.fn()} />,
    )
    expect(screen.queryByRole('option', { name: /Old Staff/ })).not.toBeInTheDocument()

    rerender(
      <LeadOptionPicker label="PIC" options={[alex, gone]} value="4" onChange={vi.fn()} onAdd={vi.fn()} />,
    )
    expect(screen.getByRole('option', { name: 'Old Staff (hidden)' })).toBeInTheDocument()
  })
})
