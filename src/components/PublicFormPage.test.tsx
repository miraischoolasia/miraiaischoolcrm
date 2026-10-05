import { act, render, screen, waitFor, within } from '@testing-library/react'
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

// Most forms in these tests are open and send no alerts, so those two parts
// are optional here.
type FormFixture = Omit<PublicForm, 'notify' | 'closedReason'> &
  Partial<Pick<PublicForm, 'notify' | 'closedReason'>>

const api = vi.hoisted(() => ({
  fetchPublicForm: vi.fn(),
  submitPublicForm: vi.fn(),
  recordFormView: vi.fn(),
  saveFormProgress: vi.fn(),
  notifyFormSubmission: vi.fn(),
}))

vi.mock('../lib/api', () => api)

const phone = { ...createField('phone'), id: 'p', label: 'Phone', required: true }
const days = { ...createField('checkbox'), id: 'd', label: 'Days', options: ['Mon', 'Tue'] }
const form: FormFixture = {
  id: 'form-1',
  name: 'Contact Us',
  fields: [phone, days],
  settings: { ...defaultFormSettings, successMessage: 'Got it, thanks!' },
}

const originalLocation = window.location

// Pictures load instantly unless a test says otherwise, so the page does not
// wait for them. `created` lists every picture the page asked for.
const pictures = { auto: true, created: [] as FakeImage[] }

class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private address = ''

  get src() {
    return this.address
  }

  set src(value: string) {
    this.address = value
    pictures.created.push(this)
    if (pictures.auto) {
      queueMicrotask(() => this.onload?.())
    }
  }
}

beforeEach(() => {
  pictures.auto = true
  pictures.created = []
  vi.stubGlobal('Image', FakeImage)
  window.sessionStorage.clear()
  api.fetchPublicForm.mockReset().mockResolvedValue(form)
  api.submitPublicForm.mockReset().mockResolvedValue(undefined)
  api.recordFormView.mockReset().mockResolvedValue(undefined)
  api.saveFormProgress.mockReset().mockResolvedValue(undefined)
  api.notifyFormSubmission.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
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

    // Letters never get into the box, so it is still empty.
    await userEvent.type(screen.getByLabelText(/Phone/), 'abc')
    expect(screen.getByLabelText(/Phone/)).toHaveValue('')

    await userEvent.type(screen.getByLabelText(/Phone/), '123')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
    expect(await screen.findByText(/Enter a Malaysian phone number without the 0/)).toBeInTheDocument()
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
        { p: '+60123456789', d: ['Mon', 'Tue'] },
        '',
        // Every submission carries its session token now, even on a one-page form.
        expect.any(String),
        null,
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
    // A loading animation while the page changes, not a thank-you message.
    expect(screen.getByRole('status')).toHaveTextContent('Loading be taken around 3 sec...')
    expect(screen.queryByText(/Thank you/)).not.toBeInTheDocument()
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByRole('form')).not.toBeInTheDocument()
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
    expect(screen.getByLabelText(/Phone/)).toHaveValue('123456789')
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
      expect(api.submitPublicForm).toHaveBeenCalledWith('form-1', { p: '+60123456789' }, '', expect.any(String), null),
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

    expect(await screen.findByText(/then be taken to https:\/\/mirai.my\/thanks/)).toBeInTheDocument()
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

  it('shows the company footer on its own page, and none inside another website', async () => {
    const own = render(<PublicFormPage formKey="form-1" />)
    await screen.findByLabelText(/Phone/)
    expect(
      screen.getByText(/All rights reserved\./, { exact: false }).textContent,
    ).toContain(`\u00a9 ${new Date().getFullYear()} Mirai AI School. All rights reserved.`)
    expect(screen.getByText(/operated by EGENIUS SDN\. BHD\./)).toBeInTheDocument()
    expect(document.querySelector('footer img')).toBeInTheDocument()
    own.unmount()

    Object.defineProperty(window, 'parent', { value: { postMessage: vi.fn() }, configurable: true })
    render(<PublicFormPage formKey="form-1" />)
    await screen.findByLabelText(/Phone/)
    expect(screen.queryByText(/EGENIUS SDN/)).not.toBeInTheDocument()
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
  const multi: FormFixture = {
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
      [parentPhone.id]: '+60123456789',
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

describe('PublicFormPage with several pages', () => {
  const name = { ...createField('short_text', 'p1'), id: 'name', label: 'Parent name', required: true }
  const goal = {
    ...createField('radio', 'p1'),
    id: 'goal',
    label: 'Goal',
    required: true,
    options: ['Coding', 'Robotics', 'Other'],
  }
  const level = {
    ...createField('dropdown', 'p2'),
    id: 'lvl',
    label: 'Level',
    required: true,
    options: ['Beginner', 'Advanced'],
  }
  const note = { ...createField('long_text', 'p3'), id: 'note', label: 'Anything else', required: true }
  const endRule = (message = 'Sorry, this is not for you.', ending: 'message' | 'redirect' = 'message', url = '') => ({
    id: 'r1',
    fieldId: 'goal',
    op: 'is' as const,
    value: 'Other',
    action: { type: 'end' as const, ending, message, redirectUrl: url },
  })
  const jumpRule = {
    id: 'r2',
    fieldId: 'goal',
    op: 'is' as const,
    value: 'Robotics',
    action: { type: 'page' as const, pageId: 'p3' },
  }
  const survey: FormFixture = {
    id: 'form-3',
    name: 'Survey',
    fields: [name, goal, level, note],
    settings: {
      ...defaultFormSettings,
      pages: [
        { id: 'p1', title: 'About you', description: 'Tell us a little.', rules: [endRule(), jumpRule] },
        { id: 'p2', title: 'Your level', description: '', rules: [] },
        { id: 'p3', title: 'Last thing', description: '', rules: [] },
      ],
    },
  }

  beforeEach(() => api.fetchPublicForm.mockResolvedValue(survey))

  const fillPageOne = async (choice: string) => {
    await userEvent.type(await screen.findByLabelText(/Parent name/), 'Mrs Lim')
    await userEvent.click(screen.getByLabelText(choice))
  }

  it('shows one page at a time, with its title and how far along the visitor is', async () => {
    render(<PublicFormPage formKey="form-3" />)

    expect(await screen.findByText('Step 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Progress' })).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByRole('heading', { name: 'About you' })).toBeInTheDocument()
    expect(screen.getByText('Tell us a little.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Parent name/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Level/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Next/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument()
  })

  it('will not move on while this page has missing answers, and saves nothing yet', async () => {
    render(<PublicFormPage formKey="form-3" />)

    await userEvent.click(await screen.findByRole('button', { name: /Next/ }))

    expect(await screen.findAllByText('This field is required.')).toHaveLength(2)
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument()
    expect(api.saveFormProgress).not.toHaveBeenCalled()
  })

  it('goes to the next page, saves the answers so far, and Back keeps them', async () => {
    render(<PublicFormPage formKey="form-3" />)
    await fillPageOne('Coding')

    await userEvent.click(screen.getByRole('button', { name: /Next/ }))

    expect(await screen.findByText('Step 2 of 3')).toBeInTheDocument()
    expect(screen.getByLabelText(/Level/)).toBeInTheDocument()
    expect(api.saveFormProgress).toHaveBeenCalledWith(
      'form-3',
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      { name: 'Mrs Lim', goal: 'Coding' },
      2,
    )

    await userEvent.click(screen.getByRole('button', { name: /Back/ }))
    expect(await screen.findByText('Step 1 of 3')).toBeInTheDocument()
    expect(screen.getByLabelText(/Parent name/)).toHaveValue('Mrs Lim')
    expect(screen.getByLabelText('Coding')).toBeChecked()
  })

  it('skips the pages a rule jumps over, and does not send answers from skipped pages', async () => {
    render(<PublicFormPage formKey="form-3" />)
    await fillPageOne('Coding')
    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    await userEvent.selectOptions(await screen.findByLabelText(/Level/), 'Beginner')
    await userEvent.click(screen.getByRole('button', { name: /Back/ }))

    // Changing the answer changes the route: Robotics jumps past the level page.
    await userEvent.click(screen.getByLabelText('Robotics'))
    await userEvent.click(screen.getByRole('button', { name: /Next/ }))

    expect(await screen.findByText('Step 3 of 3')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Level/)).not.toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/Anything else/), 'hello')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(api.submitPublicForm).toHaveBeenCalledTimes(1))
    const [formId, sent, , token] = api.submitPublicForm.mock.calls[0]
    expect(formId).toBe('form-3')
    expect(sent).toEqual({ name: 'Mrs Lim', goal: 'Robotics', note: 'hello' })
    expect(token).toMatch(/^[0-9a-f-]{36}$/)
    expect(token).toBe(api.saveFormProgress.mock.calls[0][1])
  })

  it('Back after a jump returns to the page the visitor really came from', async () => {
    render(<PublicFormPage formKey="form-3" />)
    await fillPageOne('Robotics')
    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    await screen.findByText('Step 3 of 3')

    await userEvent.click(screen.getByRole('button', { name: /Back/ }))

    expect(await screen.findByText('Step 1 of 3')).toBeInTheDocument()
  })

  it('ends the form at a rule, with its own message, without asking for the pages after it', async () => {
    render(<PublicFormPage formKey="form-3" />)
    await fillPageOne('Other')

    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('Sorry, this is not for you.')).toBeInTheDocument()
    expect(api.submitPublicForm.mock.calls[0][1]).toEqual({ name: 'Mrs Lim', goal: 'Other' })
  })

  it('shows the form\'s usual message when the ending rule has none of its own', async () => {
    api.fetchPublicForm.mockResolvedValue({
      ...survey,
      settings: {
        ...survey.settings,
        successMessage: 'Usual thanks',
        pages: [{ ...survey.settings.pages[0], rules: [endRule('  ')] }, ...survey.settings.pages.slice(1)],
      },
    })
    render(<PublicFormPage formKey="form-3" />)
    await fillPageOne('Other')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText('Usual thanks')).toBeInTheDocument()
  })

  it('sends the visitor to the address a rule gives, not the form\'s usual one', async () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...originalLocation, assign }, writable: true })
    api.fetchPublicForm.mockResolvedValue({
      ...survey,
      settings: {
        ...survey.settings,
        afterSubmit: 'redirect',
        redirectUrl: 'https://mirai.my/usual',
        pages: [
          { ...survey.settings.pages[0], rules: [endRule('', 'redirect', 'https://mirai.my/not-eligible')] },
          ...survey.settings.pages.slice(1),
        ],
      },
    })
    render(<PublicFormPage formKey="form-3" />)
    await fillPageOne('Other')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://mirai.my/not-eligible'))
  })

  it('does not save progress or send anything in a preview', async () => {
    window.localStorage.clear()
    savePreviewDraft('form-3', { name: 'Survey', fields: survey.fields, settings: survey.settings })
    render(<PublicFormPage formKey="form-3" preview />)
    await fillPageOne('Robotics')
    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    await screen.findByText('Step 3 of 3')
    await userEvent.type(screen.getByLabelText(/Anything else/), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByText(/Nothing you fill in here is sent/)).toBeInTheDocument()
    expect(api.saveFormProgress).not.toHaveBeenCalled()
    expect(api.submitPublicForm).not.toHaveBeenCalled()
  })

  it('shows no steps, Back or token on a form with one page', async () => {
    api.fetchPublicForm.mockResolvedValue({ ...form })
    render(<PublicFormPage formKey="form-1" />)

    await screen.findByRole('button', { name: 'Submit' })
    expect(screen.queryByText(/Step 1/)).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Back/ })).not.toBeInTheDocument()
  })

  it('offers extra children only on the page that holds the child questions', async () => {
    const childName = { ...createField('short_text', 'p2'), id: 'kid', label: "Child's name", mapTo: 'child_name' as const }
    api.fetchPublicForm.mockResolvedValue({
      ...survey,
      fields: [name, goal, childName],
      settings: { ...survey.settings, allowMoreChildren: true, pages: survey.settings.pages.slice(0, 2).map((page) => ({ ...page, rules: [] })) },
    })
    render(<PublicFormPage formKey="form-3" />)
    await fillPageOne('Coding')
    expect(screen.queryByRole('button', { name: /Add another child/ })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(await screen.findByRole('button', { name: /Add another child/ })).toBeInTheDocument()
  })
})

describe('PublicFormPage title', () => {
  it('shows the title written for visitors instead of the form name, and puts it in the tab', async () => {
    api.fetchPublicForm.mockResolvedValue({
      ...form,
      name: 'Eduhero X Mirai 2 (internal)',
      settings: { ...form.settings, title: 'Free AI Class for Kids' },
    })
    render(<PublicFormPage formKey="form-1" />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Free AI Class for Kids' })).toBeInTheDocument()
    expect(screen.queryByText(/internal/)).not.toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Free AI Class for Kids'))
  })

  it('falls back to the form name when no title was written', async () => {
    api.fetchPublicForm.mockResolvedValue({ ...form, name: 'Contact Us', settings: { ...form.settings, title: '' } })
    render(<PublicFormPage formKey="form-1" />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Contact Us' })).toBeInTheDocument()
  })
})

describe('PublicFormPage heading', () => {
  it('has no school-name tag above the title', async () => {
    render(<PublicFormPage formKey="form-1" />)

    const title = await screen.findByRole('heading', { level: 1 })
    expect(title.previousElementSibling).toBeNull()
    expect(screen.queryByText('Mirai AI School', { selector: 'span' })).not.toBeInTheDocument()
  })
})

describe('PublicFormPage when the form is closed', () => {
  it('shows the closed message instead of the form after the deadline', async () => {
    api.fetchPublicForm.mockResolvedValue({ ...form, closedReason: 'deadline' })
    render(<PublicFormPage formKey="form-1" />)

    expect(await screen.findByText(/closed and is no longer accepting responses/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Contact Us' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Phone/)).not.toBeInTheDocument()
  })

  it('says the form is full when every place is taken', async () => {
    api.fetchPublicForm.mockResolvedValue({ ...form, closedReason: 'full' })
    render(<PublicFormPage formKey="form-1" />)

    expect(await screen.findByText(/This form is full/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()
  })

  it('uses the message the admin wrote', async () => {
    api.fetchPublicForm.mockResolvedValue({
      ...form,
      closedReason: 'full',
      settings: { ...form.settings, closedMessage: 'All seats gone. See you at the next class!' },
    })
    render(<PublicFormPage formKey="form-1" />)

    expect(await screen.findByText('All seats gone. See you at the next class!')).toBeInTheDocument()
  })

  it('shows the server message when the form closed while the visitor was filling it in', async () => {
    api.submitPublicForm.mockRejectedValue({ message: 'This form is no longer accepting responses.' })
    render(<PublicFormPage formKey="form-1" />)

    await userEvent.type(await screen.findByLabelText(/Phone/), '012-345 6789')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('no longer accepting responses')
  })
})

describe('PublicFormPage tracking and alerts', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/')
  })

  async function fillAndSubmit() {
    await userEvent.type(await screen.findByLabelText(/Phone/), '012-345 6789')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  }

  it('sends where the visitor came from with the submission', async () => {
    window.history.pushState({}, '', '/?form=form-1&utm_source=facebook&utm_campaign=spring')
    render(<PublicFormPage formKey="form-1" />)
    await fillAndSubmit()

    await waitFor(() => expect(api.submitPublicForm).toHaveBeenCalledTimes(1))
    expect(api.submitPublicForm.mock.calls[0][4]).toEqual({
      source: 'facebook',
      medium: '',
      campaign: 'spring',
      content: '',
      referrer: '',
    })
  })

  it('sends nothing about the source when the link has none', async () => {
    render(<PublicFormPage formKey="form-1" />)
    await fillAndSubmit()

    await waitFor(() => expect(api.submitPublicForm).toHaveBeenCalledTimes(1))
    expect(api.submitPublicForm.mock.calls[0][4]).toBeNull()
  })

  it('asks for the alert email with the same session token once the form is saved', async () => {
    api.fetchPublicForm.mockResolvedValue({ ...form, notify: true })
    render(<PublicFormPage formKey="form-1" />)
    await fillAndSubmit()

    await waitFor(() => expect(api.notifyFormSubmission).toHaveBeenCalledTimes(1))
    const token = api.submitPublicForm.mock.calls[0][3]
    expect(token).toEqual(expect.any(String))
    expect(api.notifyFormSubmission).toHaveBeenCalledWith('form-1', token)
    expect(await screen.findByText('Got it, thanks!')).toBeInTheDocument()
  })

  it('does not ask for an email when alerts are off', async () => {
    render(<PublicFormPage formKey="form-1" />)
    await fillAndSubmit()
    expect(await screen.findByText('Got it, thanks!')).toBeInTheDocument()
    expect(api.notifyFormSubmission).not.toHaveBeenCalled()
  })

  it('never shows the visitor a problem with the alert email', async () => {
    api.fetchPublicForm.mockResolvedValue({ ...form, notify: true })
    api.notifyFormSubmission.mockRejectedValue(new Error('email service down'))
    render(<PublicFormPage formKey="form-1" />)
    await fillAndSubmit()

    expect(await screen.findByText('Got it, thanks!')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('lets the alert request go out before taking the visitor to the other page', async () => {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...originalLocation, assign },
      writable: true,
    })
    let release: () => void = () => {}
    api.notifyFormSubmission.mockReturnValue(new Promise<void>((resolve) => (release = resolve)))
    api.fetchPublicForm.mockResolvedValue({
      ...form,
      notify: true,
      settings: { ...form.settings, afterSubmit: 'redirect', redirectUrl: 'https://mirai.my/thanks' },
    })
    render(<PublicFormPage formKey="form-1" />)
    await fillAndSubmit()

    await waitFor(() => expect(api.notifyFormSubmission).toHaveBeenCalledTimes(1))
    expect(assign).not.toHaveBeenCalled()

    release()
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://mirai.my/thanks'))
  })
})

describe('PublicFormPage phone with the Malaysia code', () => {
  it('shows +60 in front of the box and does not need the 0', async () => {
    render(<PublicFormPage formKey="form-1" />)

    const box = await screen.findByLabelText(/Phone/)
    expect(box.parentElement).toHaveTextContent('+60')
    await userEvent.type(box, '12 345 6789')
    expect(box).toHaveValue('123456789')
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(api.submitPublicForm).toHaveBeenCalledTimes(1))
    expect(api.submitPublicForm.mock.calls[0][1]).toMatchObject({ p: '+60123456789' })
  })

  it.each([
    ['0123456789', '+60123456789'],
    ['+60 12-345 6789', '+60123456789'],
    ['60123456789', '+60123456789'],
  ])('also copes with %s typed or pasted in full', async (typed, kept) => {
    render(<PublicFormPage formKey="form-1" />)

    await userEvent.click(await screen.findByLabelText(/Phone/))
    await userEvent.paste(typed)
    await userEvent.click(screen.getByRole('button', { name: 'Submit' }))

    await waitFor(() => expect(api.submitPublicForm).toHaveBeenCalledTimes(1))
    expect(api.submitPublicForm.mock.calls[0][1]).toMatchObject({ p: kept })
  })
})

describe('PublicFormPage loading screen', () => {
  const poster = {
    ...createField('image'),
    id: 'img',
    label: 'Class poster',
    imageUrl: 'https://img.test/poster.png',
  }
  const withPoster = { ...form, fields: [poster, phone] }
  const addresses = () => pictures.created.map((image) => image.src)

  it('shows only a loading screen until the form and its pictures have arrived', async () => {
    pictures.auto = false
    api.fetchPublicForm.mockResolvedValue(withPoster)
    render(<PublicFormPage formKey="form-1" />)

    // The form has arrived but its pictures have not: still only the spinner.
    await waitFor(() => expect(addresses()).toContain('https://img.test/poster.png'))
    expect(screen.getByRole('status')).toHaveTextContent('Loading...')
    expect(screen.queryByLabelText(/Phone/)).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument()

    // One picture still on its way: still waiting.
    const [first, ...rest] = pictures.created.filter((image) => !image.src.includes('eggy'))
    first.onload?.()
    expect(screen.queryByLabelText(/Phone/)).not.toBeInTheDocument()

    // The last one arrives and the whole page shows at once.
    rest.forEach((image) => image.onload?.())
    expect(await screen.findByLabelText(/Phone/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Class poster' })).toBeInTheDocument()
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })

  it('waits for the school logos as well as the form pictures', async () => {
    pictures.auto = false
    render(<PublicFormPage formKey="form-1" />)

    await waitFor(() => expect(pictures.created.length).toBeGreaterThanOrEqual(2))
    expect(screen.queryByLabelText(/Phone/)).not.toBeInTheDocument()

    pictures.created.forEach((image) => image.onload?.())
    expect(await screen.findByLabelText(/Phone/)).toBeInTheDocument()
  })

  it('does not stay stuck on a picture that cannot be loaded', async () => {
    pictures.auto = false
    api.fetchPublicForm.mockResolvedValue(withPoster)
    render(<PublicFormPage formKey="form-1" />)

    await waitFor(() => expect(addresses()).toContain('https://img.test/poster.png'))
    pictures.created.forEach((image) => image.onerror?.())

    expect(await screen.findByLabelText(/Phone/)).toBeInTheDocument()
  })

  it('shows the loading screen while the form itself is still being fetched', async () => {
    let arrive: (value: typeof form) => void = () => {}
    api.fetchPublicForm.mockReturnValue(new Promise((resolve) => (arrive = resolve)))
    render(<PublicFormPage formKey="form-1" />)

    expect(screen.getByRole('status')).toHaveTextContent('Loading...')
    expect(screen.queryByText('Contact Us')).not.toBeInTheDocument()

    arrive(form)
    expect(await screen.findByLabelText(/Phone/)).toBeInTheDocument()
  })

  it('does not hold back the message when the form cannot be shown', async () => {
    pictures.auto = false
    api.fetchPublicForm.mockResolvedValue(null)
    render(<PublicFormPage formKey="nope" />)

    expect(await screen.findByText('This form is not available.')).toBeInTheDocument()
  })

  it('inside another website it waits only for the form pictures, not the school logos', async () => {
    const originalParent = Object.getOwnPropertyDescriptor(window, 'parent')
    Object.defineProperty(window, 'parent', { value: { postMessage: vi.fn() }, configurable: true })
    try {
      pictures.auto = false
      api.fetchPublicForm.mockResolvedValue(withPoster)
      render(<PublicFormPage formKey="form-1" />)

      await waitFor(() => expect(addresses()).toContain('https://img.test/poster.png'))
      expect(addresses().filter((address) => address.includes('mirai'))).toEqual([])
      pictures.created.find((image) => image.src.includes('poster'))?.onload?.()
      expect(await screen.findByLabelText(/Phone/)).toBeInTheDocument()
    } finally {
      if (originalParent) {
        Object.defineProperty(window, 'parent', originalParent)
      }
    }
  })
})

describe('PublicFormPage when the other address does not open here', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  async function submitToRedirect(preview = false) {
    const assign = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...originalLocation, assign }, writable: true })
    api.fetchPublicForm.mockResolvedValue({
      ...form,
      settings: { ...form.settings, afterSubmit: 'redirect', redirectUrl: 'https://wa.link/abc' },
    })
    if (preview) {
      savePreviewDraft('form-1', {
        name: 'Contact Us',
        fields: form.fields,
        settings: { ...form.settings, afterSubmit: 'redirect', redirectUrl: 'https://wa.link/abc' },
      })
    }
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<PublicFormPage formKey="form-1" preview={preview} />)
    await user.type(await screen.findByLabelText(/Phone/), '12 345 6789')
    await user.click(screen.getByRole('button', { name: 'Submit' }))
    return assign
  }

  it('keeps the spinner for a few seconds, then thanks the visitor and offers a link', async () => {
    const assign = await submitToRedirect()

    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://wa.link/abc'))
    expect(screen.getByRole('status')).toHaveTextContent('Loading be taken around 3 sec...')
    expect(screen.queryByRole('link', { name: /Continue/ })).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000)
    })

    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument()
    expect(screen.getByText('Got it, thanks!')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Continue/ })
    expect(link).toHaveAttribute('href', 'https://wa.link/abc')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('does not do this in the preview, which has its own way back', async () => {
    await submitToRedirect(true)
    await screen.findByText(/then be taken to https:\/\/wa.link\/abc/)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000)
    })

    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Continue/ })).not.toBeInTheDocument()
  })
})
