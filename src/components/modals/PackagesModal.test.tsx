import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PackagesModal } from './PackagesModal'
import type { Package } from '../../types/domain'

const sixMonths: Package = {
  id: 3,
  name: '6 Months',
  kind: 'regular',
  classCount: 24,
  durationMonths: 6,
  includesFees: true,
  isActive: true,
  sortOrder: 30,
}

function renderModal() {
  const props = {
    packages: [sixMonths],
    onClose: vi.fn(),
    onAdd: vi.fn(async () => true),
    onSave: vi.fn(async () => true),
    onSetActive: vi.fn(),
  }
  render(<PackagesModal {...props} />)
  return props
}

describe('PackagesModal', () => {
  it('saves a changed package only after Save', async () => {
    const props = renderModal()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()

    const classes = screen.getByRole('spinbutton', { name: '6 Months classes' })
    await userEvent.clear(classes)
    await userEvent.type(classes, '26')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(props.onSave).toHaveBeenCalledWith(sixMonths, {
      name: '6 Months',
      kind: 'regular',
      classCount: 26,
      durationMonths: 6,
      includesFees: true,
    })
  })

  it('hides a package', async () => {
    const props = renderModal()

    await userEvent.click(screen.getByRole('button', { name: 'Hide 6 Months' }))
    expect(props.onSetActive).toHaveBeenCalledWith(sixMonths, false)
  })

  it('adds a camp package without fees, and needs a name first', async () => {
    const props = renderModal()
    const add = screen.getByRole('button', { name: 'Add package' })
    expect(add).toBeDisabled()

    await userEvent.type(screen.getByRole('textbox', { name: 'New package name' }), ' Winter Camp ')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'New package type' }), 'Camp')
    expect(screen.getByRole('checkbox', { name: 'New package includes fees' })).not.toBeChecked()
    await userEvent.click(add)

    expect(props.onAdd).toHaveBeenCalledWith({
      name: 'Winter Camp',
      kind: 'camp',
      classCount: 4,
      durationMonths: 1,
      includesFees: false,
    })
  })
})
