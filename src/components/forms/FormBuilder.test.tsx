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
  slug: null,
  viewCount: 0,
  createdAt: '',
  updatedAt: '',
  updatedByTeacherId: null,
}

function renderBuilder(overrides: Partial<Form> = {}) {
  const onSave = vi.fn().mockResolvedValue(true)
  const onBack = vi.fn()
  const onUploadImage = vi.fn().mockResolvedValue('https://img.test/poster.png')
  render(
    <FormBuilder
      form={{ ...form, ...overrides }}
      isSaving={false}
      onSave={onSave}
      onUploadImage={onUploadImage}
      onBack={onBack}
      onOpenEmbed={vi.fn()}
    />,
  )
  return { onSave, onBack, onUploadImage }
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
    expect(labelsInOrder().slice(0, 2)).toEqual(["Field: Child's name", "Field: Parent's name"])

    await userEvent.click(screen.getByRole('button', { name: 'Delete field' }))
    expect(labelsInOrder()[0]).toBe("Field: Child's name")
    expect(labelsInOrder()).toHaveLength(4)
  })

  it('asks before leaving with unsaved changes', async () => {
    const { onBack } = renderBuilder()

    await userEvent.type(screen.getByLabelText('Form name'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'All forms' }))
    expect(onBack).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('saves a redirect address chosen in the form settings', async () => {
    const { onSave } = renderBuilder()

    await userEvent.click(screen.getByRole('button', { name: 'Form settings' }))
    await userEvent.click(screen.getByLabelText('Go to a web address'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('web address')
    expect(onSave).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Web address to go to'), 'https://mirai.my/thanks')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave.mock.calls[0][0].settings).toMatchObject({
      afterSubmit: 'redirect',
      redirectUrl: 'https://mirai.my/thanks',
    })
  })

  it('saves the choice to let visitors add another child', async () => {
    const { onSave } = renderBuilder()

    await userEvent.click(screen.getByRole('button', { name: 'Form settings' }))
    await userEvent.click(screen.getByLabelText(/Let visitors add another child/))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave.mock.calls[0][0].settings.allowMoreChildren).toBe(true)
  })

  describe('image field', () => {
    async function addImageField() {
      const view = renderBuilder()
      await userEvent.click(screen.getByRole('button', { name: /Image \/ poster/ }))
      return view
    }

    const png = () => new File(['x'], 'poster.png', { type: 'image/png' })

    it('shows only what an image needs: a description and an upload', async () => {
      await addImageField()

      expect(screen.getByRole('group', { name: 'Field: Poster' })).toBeInTheDocument()
      expect(screen.getByText('No image yet. Upload one on the right.')).toBeInTheDocument()
      expect(screen.getByLabelText(/Image description/)).toHaveValue('Poster')
      expect(screen.getByLabelText('Choose image file')).toBeInTheDocument()
      expect(screen.queryByLabelText('Required')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Fills on the lead')).not.toBeInTheDocument()
    })

    it('will not save until the image is uploaded', async () => {
      const { onSave } = await addImageField()

      await userEvent.click(screen.getByRole('button', { name: 'Save' }))

      expect(await screen.findByRole('alert')).toHaveTextContent('no image yet')
      expect(onSave).not.toHaveBeenCalled()
    })

    it('uploads the chosen file, shows it, and saves its address', async () => {
      const { onSave, onUploadImage } = await addImageField()

      await userEvent.upload(screen.getByLabelText('Choose image file'), png())

      expect(onUploadImage).toHaveBeenCalledTimes(1)
      const preview = await screen.findByRole('img', { name: 'Poster' })
      expect(preview).toHaveAttribute('src', 'https://img.test/poster.png')
      expect(screen.getByText('Replace image')).toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Save' }))
      const saved = onSave.mock.calls[0][0].fields.at(-1)
      expect(saved).toMatchObject({ type: 'image', imageUrl: 'https://img.test/poster.png', required: false })
    })

    it('refuses a file that is not an allowed image, without uploading', async () => {
      const { onUploadImage } = await addImageField()

      await userEvent.upload(
        screen.getByLabelText('Choose image file'),
        new File(['x'], 'poster.svg', { type: 'image/svg+xml' }),
        { applyAccept: false },
      )

      expect(await screen.findByRole('alert')).toHaveTextContent('PNG, JPG, WebP or GIF')
      expect(onUploadImage).not.toHaveBeenCalled()
    })

    it('drops the "no image yet" message once the image is uploaded', async () => {
      await addImageField()
      await userEvent.click(screen.getByRole('button', { name: 'Save' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('no image yet')

      await userEvent.upload(screen.getByLabelText('Choose image file'), png())

      await screen.findByRole('img', { name: 'Poster' })
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('shows the upload error and keeps the form unchanged', async () => {
      const { onUploadImage } = await addImageField()
      onUploadImage.mockRejectedValue({ message: 'The resource already exists' })

      await userEvent.upload(screen.getByLabelText('Choose image file'), png())

      expect(await screen.findByRole('alert')).toHaveTextContent('The resource already exists')
      expect(screen.getByText('No image yet. Upload one on the right.')).toBeInTheDocument()
    })

    it('removes the image', async () => {
      await addImageField()
      await userEvent.upload(screen.getByLabelText('Choose image file'), png())
      await screen.findByRole('img', { name: 'Poster' })

      await userEvent.click(screen.getByRole('button', { name: 'Remove image' }))

      expect(screen.queryByRole('img', { name: 'Poster' })).not.toBeInTheDocument()
      expect(screen.getByText('Upload image')).toBeInTheDocument()
    })
  })
})
