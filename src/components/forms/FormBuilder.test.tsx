import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FormBuilder } from './FormBuilder'
import { createField, createStarterFields, defaultFormSettings } from '../../lib/forms'
import type { Form } from '../../types/domain'

const form: Form = {
  id: 'form-1',
  name: 'Contact Us',
  fields: createStarterFields(),
  settings: defaultFormSettings,
  isPublished: true,
  createdAt: '',
  updatedAt: '',
  updatedByTeacherId: null,
}

function renderBuilder(overrides: Partial<Form> = {}) {
  const onSave = vi.fn().mockResolvedValue(true)
  const onBack = vi.fn()
  render(
    <FormBuilder
      form={{ ...form, ...overrides }}
      isSaving={false}
      onSave={onSave}
      onBack={onBack}
      onOpenEmbed={vi.fn()}
    />,
  )
  return { onSave, onBack }
}

describe('FormBuilder', () => {
  it('starts saved, and Save turns on after an edit', async () => {
    renderBuilder()
    expect(screen.getByRole('button', { name: 'Saved' })).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Form name'), ' 2')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('adds a field when its type is clicked and selects it', async () => {
    renderBuilder()

    await userEvent.click(screen.getByRole('button', { name: /Dropdown/ }))

    expect(screen.getByRole('group', { name: 'Field: Choose one' })).toBeInTheDocument()
    expect(screen.getByLabelText('Option 1')).toHaveValue('Option 1')
  })

  it('saves what was changed, with the name trimmed', async () => {
    const { onSave } = renderBuilder()

    await userEvent.type(screen.getByLabelText('Form name'), ' Form ')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: 'Contact Us Form', isPublished: true })
    expect(await screen.findByRole('button', { name: 'Saved' })).toBeDisabled()
  })

  it('explains what is wrong instead of saving', async () => {
    const { onSave } = renderBuilder({ fields: [{ ...createField('short_text'), label: 'Name' }] })

    await userEvent.clear(screen.getByLabelText('Label'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Every field needs a label.')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('moves the selected field down and removes it', async () => {
    renderBuilder()
    const labelsInOrder = () =>
      screen.getAllByRole('group').map((group) => group.getAttribute('aria-label'))

    await userEvent.click(screen.getByRole('group', { name: "Field: Parent's name" }))
    await userEvent.click(screen.getByRole('button', { name: 'Move field down' }))
    expect(labelsInOrder()).toEqual(['Field: Phone', "Field: Parent's name"])

    await userEvent.click(screen.getByRole('button', { name: 'Delete field' }))
    expect(labelsInOrder()).toEqual(['Field: Phone'])
  })

  it('asks before leaving with unsaved changes', async () => {
    const { onBack } = renderBuilder()

    await userEvent.type(screen.getByLabelText('Form name'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'All forms' }))
    expect(onBack).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})
