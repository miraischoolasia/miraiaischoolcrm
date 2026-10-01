import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PublicFormPage } from './PublicFormPage'
import {
  createField,
  createStarterFields,
  defaultFormSettings,
  savePreviewDraft,
} from '../lib/forms'
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
    expect(screen.queryByRole('img', { name: 'Class poster' })).not.toBeInTheDocument()
  })
})

describe('PublicFormPage details and poster size', () => {
  const details = {
    ...createField('text_block'),
    id: 'txt',
    content: 'Join our **free trial**!\n\nBring:\n- laptop\n- water\n\nSee [our site](https://mirai.my)',
  }
  const heading = { ...createField('text_block'), id: 'hd', content: 'Free Trial Class', textStyle: 'heading' as const }
  const poster = {
    ...createField('image'),
    id: 'img',
    label: 'Poster',
    imageUrl: 'https://img.test/p.png',
    imageWidth: 50,
    imageAlign: 'right' as const,
  }

  it('shows the heading, bold words, bullets and links', async () => {
    api.fetchPublicForm.mockResolvedValue({ ...form, fields: [heading, details, phone] })
    render(<PublicFormPage formKey="form-1" />)

    expect(await screen.findByRole('heading', { name: 'Free Trial Class', level: 2 })).toBeInTheDocument()
    expect(screen.getByText('free trial').tagName).toBe('STRONG')
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['laptop', 'water'])
    const link = screen.getByRole('link', { name: 'our site' })
    expect(link).toHaveAttribute('href', 'https://mirai.my')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('never runs markup typed into the details', async () => {
    api.fetchPublicForm.mockResolvedValue({
      ...form,
      fields: [{ ...details, content: '<img src=x onerror=alert(1)> [bad](javascript:alert(1))' }, phone],
    })
    const { container } = render(<PublicFormPage formKey="form-1" />)

    await screen.findByText(/onerror/)
    expect(container.querySelector('img[src="x"]')).toBeNull()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('sizes and places the poster as set in the builder', async () => {
    api.fetchPublicForm.mockResolvedValue({ ...form, fields: [poster, phone] })
    render(<PublicFormPage formKey="form-1" />)

    const image = await screen.findByRole('img', { name: 'Poster' })
    expect(image).toHaveStyle({ width: '50%' })
    expect(image.parentElement).toHaveClass('justify-end')
  })

  it('has no Submit button when the form has nothing to fill in', async () => {
    api.fetchPublicForm.mockResolvedValue({ ...form, fields: [heading, details] })
    render(<PublicFormPage formKey="form-1" />)

    await screen.findByRole('heading', { name: 'Free Trial Class' })
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
  })
})

describe('PublicFormPage preview', () => {
  const draftFields = [phone, { ...createField('text_block'), id: 'txt', content: 'Draft details' }]

  beforeEach(() => {
    window.localStorage.clear()
    savePreviewDraft('form-1', {
      name: 'Unsaved name',
      fields: draftFields,
      settings: { ...defaultFormSettings, successMessage: 'Preview thanks' },
    })
  })

  it('shows the unsaved draft with a banner, without loading or counting anything', async () => {
    render(<PublicFormPage formKey="form-1" preview />)

    expect(await screen.findByRole('heading', { name: 'Unsaved name' })).toBeInTheDocument()
    expect(screen.getByText('Draft details')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Nothing you fill in here is sent')
    expect(api.fetchPublicForm).not.toHaveBeenCalled()
    expect(api.recordFormView).not.toHaveBeenCalled()
  })

  it('checks the answers like the real form but sends nothing', async () => {
    render(<PublicFormPage formKey="form-1" preview />)

    await userEvent.click(await screen.findByRole('button', { name: 'Submit' }))
    expect(await screen.findByText('This field is required.')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/Phone/), '012-345 6789')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('Preview thanks')).toBeInTheDocument()
    expect(api.submitPublicForm).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Back to the form' }))
    expect(await screen.findByLabelText(/Phone/)).toHaveValue('')
  })

  it('says where visitors would go instead of leaving when the form redirects', async () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...originalLocation, assign }, writable: true })
    savePreviewDraft('form-1', {
      name: 'Unsaved name',
      fields: draftFields,
      settings: { ...defaultFormSettings, afterSubmit: 'redirect', redirectUrl: 'https://mirai.my/thanks' },
    })
    render(<PublicFormPage formKey="form-1" preview />)

    await userEvent.type(await screen.findByLabelText(/Phone/), '012-345 6789')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText(/would now be taken to https:\/\/mirai.my\/thanks/)).toBeInTheDocument()
    expect(assign).not.toHaveBeenCalled()
  })

  it('explains when there is no draft to show', async () => {
    window.localStorage.clear()
    render(<PublicFormPage formKey="form-1" preview />)

    expect(await screen.findByText(/preview is not available/)).toBeInTheDocument()
  })

  it('is not reachable as a way to see a draft without the preview switch', async () => {
    render(<PublicFormPage formKey="form-1" />)

    await waitFor(() => expect(api.fetchPublicForm).toHaveBeenCalledWith('form-1'))
    expect(screen.queryByText('Unsaved name')).not.toBeInTheDocument()
  })
})

describe('PublicFormPage inside another website', () => {
  const originalParent = Object.getOwnPropertyDescriptor(window, 'parent')
  const originalObserver = globalThis.ResizeObserver

  afterEach(() => {
    if (originalParent) {
      Object.defineProperty(window, 'parent', originalParent)
    }
    globalThis.ResizeObserver = originalObserver
    document.documentElement.style.background = ''
    document.body.style.background = ''
  })

  it('drops the branded page for just the card, on a see-through background', async () => {
    Object.defineProperty(window, 'parent', { value: { postMessage: vi.fn() }, configurable: true })
    const { container } = render(<PublicFormPage formKey="form-1" />)

    await screen.findByLabelText(/Phone/)
    expect(container.querySelector('header')).toBeNull()
    expect(screen.queryByAltText('Mirai AI School')).not.toBeInTheDocument()
    expect(document.body.style.background).toBe('transparent')
  })

  it('tells the page around it how tall the form is', async () => {
    const postMessage = vi.fn()
    Object.defineProperty(window, 'parent', { value: { postMessage }, configurable: true })
    let notify: () => void = () => {}
    globalThis.ResizeObserver = class {
      constructor(callback: () => void) {
        notify = callback
      }
      observe() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
    render(<PublicFormPage formKey="form-1" />)
    await screen.findByLabelText(/Phone/)

    notify()

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mirai-form-height', formId: 'form-1' }),
      '*',
    )
  })

  it('shows the full branded page when opened on its own', async () => {
    render(<PublicFormPage formKey="form-1" />)

    await screen.findByLabelText(/Phone/)
    expect(screen.getByAltText('Mirai AI School')).toBeInTheDocument()
    expect(document.body.style.background).not.toBe('transparent')
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