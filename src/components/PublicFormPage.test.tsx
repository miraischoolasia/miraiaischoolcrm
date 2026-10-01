import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicFormPage } from './PublicFormPage'
import { createField, createStarterFields, defaultFormSettings } from '../lib/forms'
import type { PublicForm } from '../types/domain'

const api = vi.hoisted(() => ({
  fetchPublicForm: vi.fn(),
  submitPublicForm: vi.fn(),
  recordFormView: vi.fn(),
}))

vi.mock('../lib/api', () => api)

const phone = { ...createField('phone'), id: 'p', label: 'Phone', required: true }
const days = { ...createField('checkbox'), id: 'd', label: 'Days', options: ['Mon', 'Tue'] }
const form: PublicForm = {
  id: 'form-1',
  name: 'Contact Us',
  fields: [phone, days],
  settings: { ...defaultFormSettings, successMessage: 'Got it, thanks!' },
}

const originalLocation = window.location

beforeEach(() => {
  window.sessionStorage.clear()
  api.fetchPublicForm.mockReset().mockResolvedValue(form)
  api.submitPublicForm.mockReset().mockResolvedValue(undefined)
  api.recordFormView.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
})

describe('PublicFormPage', () => {
  it('says so when the form does not exist or is unpublished', async () => {
    api.fetchPublicForm.mockResolvedValue(null)
    render(<PublicFormPage formKey="nope" />)

    expect(await screen.findByText('This form is not available.')).toBeInTheDocument()
    expect(api.recordFormView).not.toHaveBeenCalled()
  })

  it('looks the form up by the key in the link and counts the visit once per session', async () => {
    const first = render(<PublicFormPage formKey="trial-class" />)
    await screen.findByRole('button', { name: 'Submit' })
    first.unmount()
    render(<PublicFormPage formKey="trial-class" />)
    await screen.findByRole('button', { name: 'Submit' })

    expect(api.fetchPublicForm).toHaveBeenCalledWith('trial-class')
    expect(api.recordFormView).toHaveBeenCalledTimes(1)
    expect(api.recordFormView).toHaveBeenCalledWith('form-1')
  })

  it('blocks sending until required answers are valid', async () => {
    render(<PublicFormPage formKey="form-1" />)

    await userEvent.click(await screen.findByRole('button', { name: 'Submit' }))
    expect(await screen.findByText('This field is required.')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/Phone/), 'abc')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(await screen.findByText('Enter a valid phone number.')).toBeInTheDocument()
    expect(api.submitPublicForm).not.toHaveBeenCalled()
  })

  it('sends the answers and shows the thank-you message', async () => {
    render(<PublicFormPage formKey="form-1" />)

    await userEvent.type(await screen.findByLabelText(/Phone/), '012-345 6789')
    await userEvent.click(screen.getByLabelText('Mon'))
    await userEvent.click(screen.getByLabelText('Tue'))
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() =>
      expect(api.submitPublicForm).toHaveBeenCalledWith(
        'form-1',
        { p: '012-345 6789', d: ['Mon', 'Tue'] },
        '',
      ),
    )
    expect(await screen.findByText('Got it, thanks!')).toBeInTheDocument()
  })

  it('goes to the chosen web address after sending instead of showing the message', async () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...originalLocation, assign }, writable: true })
    api.fetchPublicForm.mockResolvedValue({
      ...form,
      settings: {
        ...form.settings,
        afterSubmit: 'redirect',
        redirectUrl: ' https://mirai.my/thanks ',
      },
    })
    render(<PublicFormPage formKey="form-1" />)

    await userEvent.type(await screen.findByLabelText(/Phone/), '012-345 6789')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://mirai.my/thanks'))
    expect(screen.queryByText('Got it, thanks!')).not.toBeInTheDocument()
  })

  it('shows the message when the saved address is not a safe web address', async () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...originalLocation, assign }, writable: true })
    api.fetchPublicForm.mockResolvedValue({
      ...form,
      settings: { ...form.settings, afterSubmit: 'redirect', redirectUrl: 'javascript:alert(1)' },
    })
    render(<PublicFormPage formKey="form-1" />)

    await userEvent.type(await screen.findByLabelText(/Phone/), '012-345 6789')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('Got it, thanks!')).toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  })

  it('shows the server message when sending fails and keeps the answers', async () => {
    api.submitPublicForm.mockRejectedValue({ message: 'This form is not available.' })
    render(<PublicFormPage formKey="form-1" />)

    await userEvent.type(await screen.findByLabelText(/Phone/), '012-345 6789')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This form is not available.')
    expect(screen.getByLabelText(/Phone/)).toHaveValue('012-345 6789')
  })
})

describe('PublicFormPage with a poster', () => {
  const poster = {
    ...createField('image'),
    id: 'img',
    label: 'Class poster',
    imageUrl: 'https://img.test/poster.png',
  }

  it('shows the picture where the field sits and does not ask for an answer', async () => {
    api.fetchPublicForm.mockResolvedValue({ ...form, fields: [poster, phone] })
    render(<PublicFormPage formKey="form-1" />)

    const image = await screen.findByRole('img', { name: 'Class poster' })
    expect(image).toHaveAttribute('src', 'https://img.test/poster.png')

    await userEvent.type(screen.getByLabelText(/Phone/), '012-345 6789')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() =>
      expect(api.submitPublicForm).toHaveBeenCalledWith('form-1', { p: '012-345 6789' }, ''),
    )
  })

  it('shows nothing for a poster without a usable address', async () => {
    api.fetchPublicForm.mockResolvedValue({
      ...form,
      fields: [{ ...poster, imageUrl: 'javascript:alert(1)' }, phone],
    })
    render(<PublicFormPage formKey="form-1" />)

    await screen.findByLabelText(/Phone/)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('PublicFormPage with several children', () => {
  const starter = createStarterFields()
  const [parent, child, parentPhone, , age] = starter
  const multi: PublicForm = {
    id: 'form-2',
    name: 'Trial',
    fields: [parent, child, parentPhone, age],
    settings: { ...defaultFormSettings, allowMoreChildren: true },
  }

  async function fillFirstChild() {
    await userEvent.type(await screen.findByLabelText(/Parent's name/), 'Mrs Lim')
    await userEvent.type(screen.getByLabelText(/Child's name/), 'Ken')
    await userEvent.type(screen.getByLabelText(/Phone number/), '0123456789')
    await userEvent.type(screen.getByLabelText(/Child's age/), '9')
  }

  beforeEach(() => api.fetchPublicForm.mockResolvedValue(multi))

  it('offers no extra child when the form does not allow it', async () => {
    api.fetchPublicForm.mockResolvedValue({ ...multi, settings: defaultFormSettings })
    render(<PublicFormPage formKey="form-2" />)

    await screen.findByRole('button', { name: 'Submit' })
    expect(screen.queryByRole('button', { name: /Add another child/ })).not.toBeInTheDocument()
  })

  it('sends the extra child with its own keys, up to three children', async () => {
    render(<PublicFormPage formKey="form-2" />)
    await fillFirstChild()

    await userEvent.click(screen.getByRole('button', { name: /Add another child/ }))
    const second = screen.getByRole('region', { name: 'Child 2' })
    await userEvent.type(within(second).getByLabelText(/Child's name/), 'Mei')
    await userEvent.type(within(second).getByLabelText(/Child's age/), '12')

    await userEvent.click(screen.getByRole('button', { name: /Add another child/ }))
    expect(screen.getByRole('region', { name: 'Child 3' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add another child/ })).not.toBeInTheDocument()

    await userEvent.click(
      within(screen.getByRole('region', { name: 'Child 3' })).getByRole('button', { name: /Remove/ }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(api.submitPublicForm).toHaveBeenCalledTimes(1))
    expect(api.submitPublicForm.mock.calls[0][1]).toEqual({
      [parent.id]: 'Mrs Lim',
      [child.id]: 'Ken',
      [parentPhone.id]: '0123456789',
      [age.id]: '9',
      [`${child.id}#2`]: 'Mei',
      [`${age.id}#2`]: '12',
    })
  })

  it('checks an added child like the first one', async () => {
    render(<PublicFormPage formKey="form-2" />)
    await fillFirstChild()

    await userEvent.click(screen.getByRole('button', { name: /Add another child/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    const second = screen.getByRole('region', { name: 'Child 2' })
    expect(within(second).getAllByText('This field is required.')).toHaveLength(2)
    expect(api.submitPublicForm).not.toHaveBeenCalled()
  })

  it('rejects an age that is not a whole number', async () => {
    render(<PublicFormPage formKey="form-2" />)
    await fillFirstChild()
    await userEvent.type(screen.getByLabelText(/Child's age/), '.5')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('Enter a whole age from 1 to 99.')).toBeInTheDocument()
  })
})