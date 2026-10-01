import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicFormPage } from './PublicFormPage'
import { createField, defaultFormSettings } from '../lib/forms'
import type { PublicForm } from '../types/domain'

const api = vi.hoisted(() => ({
  fetchPublicForm: vi.fn(),
  submitPublicForm: vi.fn(),
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

beforeEach(() => {
  api.fetchPublicForm.mockReset().mockResolvedValue(form)
  api.submitPublicForm.mockReset().mockResolvedValue(undefined)
})

describe('PublicFormPage', () => {
  it('says so when the form does not exist or is unpublished', async () => {
    api.fetchPublicForm.mockResolvedValue(null)
    render(<PublicFormPage formId="nope" />)

    expect(await screen.findByText('This form is not available.')).toBeInTheDocument()
  })

  it('blocks sending until required answers are valid', async () => {
    render(<PublicFormPage formId="form-1" />)

    await userEvent.click(await screen.findByRole('button', { name: 'Submit' }))
    expect(await screen.findByText('This field is required.')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/Phone/), 'abc')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(await screen.findByText('Enter a valid phone number.')).toBeInTheDocument()
    expect(api.submitPublicForm).not.toHaveBeenCalled()
  })

  it('sends the answers and shows the thank-you message', async () => {
    render(<PublicFormPage formId="form-1" />)

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

  it('shows the server message when sending fails and keeps the answers', async () => {
    api.submitPublicForm.mockRejectedValue({ message: 'This form is not available.' })
    render(<PublicFormPage formId="form-1" />)

    await userEvent.type(await screen.findByLabelText(/Phone/), '012-345 6789')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This form is not available.')
    expect(screen.getByLabelText(/Phone/)).toHaveValue('012-345 6789')
  })
})
