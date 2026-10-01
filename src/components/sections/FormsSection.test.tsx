import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FormsSection } from './FormsSection'
import { createStarterFields, defaultFormSettings, mapSubmissionRow } from '../../lib/forms'
import type { Form, Teacher } from '../../types/domain'

const api = vi.hoisted(() => ({
  FORM_SUBMISSIONS_FETCH_LIMIT: 2000,
  fetchFormsFromSupabase: vi.fn(),
  fetchFormSubmissionsFromSupabase: vi.fn(),
  createFormInSupabase: vi.fn(),
  saveFormInSupabase: vi.fn(),
  deleteFormInSupabase: vi.fn(),
  deleteFormSubmissionInSupabase: vi.fn(),
  saveFormSlugInSupabase: vi.fn(),
  uploadFormImageToSupabase: vi.fn(),
}))

vi.mock('../../lib/api', () => api)

function makeForm(id: string, name: string, patch: Partial<Form> = {}): Form {
  return {
    id,
    name,
    fields: createStarterFields(),
    settings: defaultFormSettings,
    isPublished: true,
    slug: null,
    viewCount: 0,
    createdAt: '2026-10-01T02:00:00Z',
    updatedAt: '2026-10-01T02:00:00Z',
    updatedByTeacherId: 1,
    ...patch,
  }
}

const teachers = new Map([[1, { id: 1, fullName: 'Lex Chew' } as Teacher]])

function submission(id: number, formId: string, name: string) {
  return mapSubmissionRow({
    id,
    form_id: formId,
    answers: [{ id: 'a', label: "Parent's name", value: name }],
    lead_id: id,
    lead_was_existing: false,
    status: 'completed',
    last_page: null,
    created_at: '2026-10-01T03:00:00Z',
  })
}

beforeEach(() => {
  Object.values(api).forEach((entry) => typeof entry === 'function' && entry.mockReset())
  api.fetchFormsFromSupabase.mockResolvedValue([
    makeForm('f1', 'Contact Us', { slug: 'contact-us', viewCount: 8 }),
    makeForm('f2', 'Newsletter', { isPublished: false }),
  ])
  api.fetchFormSubmissionsFromSupabase.mockResolvedValue([
    submission(1, 'f1', 'Mrs Lim'),
    submission(2, 'f1', 'Mr Tan'),
  ])
})

const bodyRows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)

describe('FormsSection', () => {
  it('lists forms with status, submission count and who updated them', async () => {
    render(<FormsSection teacherMap={teachers} />)

    expect(await screen.findByText('Contact Us')).toBeInTheDocument()
    const [contact, newsletter] = bodyRows()
    expect(within(contact).getByText('Published')).toBeInTheDocument()
    expect(within(contact).getByText('2')).toBeInTheDocument()
    expect(within(contact).getByText('Lex Chew')).toBeInTheDocument()
    expect(within(newsletter).getByText('Draft')).toBeInTheDocument()
  })

  it('filters by name', async () => {
    render(<FormsSection teacherMap={teachers} />)
    await screen.findByText('Contact Us')

    await userEvent.type(screen.getByLabelText('Search for forms'), 'news')

    expect(bodyRows()).toHaveLength(1)
    expect(screen.queryByText('Contact Us')).not.toBeInTheDocument()
  })

  it('creates a form and opens it in the builder', async () => {
    api.createFormInSupabase.mockResolvedValue(makeForm('f3', 'Untitled form'))
    render(<FormsSection teacherMap={teachers} />)
    await screen.findByText('Contact Us')

    await userEvent.click(screen.getByRole('button', { name: 'Create form' }))

    expect(await screen.findByLabelText('Form name')).toHaveValue('Untitled form')
    expect(api.createFormInSupabase).toHaveBeenCalledWith(
      'Untitled form',
      expect.arrayContaining([expect.objectContaining({ mapTo: 'parent_name' })]),
      defaultFormSettings,
    )
  })

  it('deletes a form after confirming, with its submissions', async () => {
    api.deleteFormInSupabase.mockResolvedValue(undefined)
    render(<FormsSection teacherMap={teachers} />)
    await screen.findByText('Contact Us')

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Contact Us' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(screen.getByText(/and its 2 submissions/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(api.deleteFormInSupabase).toHaveBeenCalledWith('f1')
    expect(screen.queryByText('Contact Us')).not.toBeInTheDocument()
  })

  it('shows submissions, filtered by form and search', async () => {
    render(<FormsSection teacherMap={teachers} />)
    await screen.findByText('Contact Us')

    await userEvent.click(screen.getByRole('tab', { name: 'Submissions' }))
    expect(bodyRows()).toHaveLength(2)

    await userEvent.type(screen.getByLabelText('Search submissions'), 'lim')
    expect(bodyRows()).toHaveLength(1)
    await userEvent.click(within(bodyRows()[0]).getByRole('button', { name: 'View' }))
    expect(screen.getByText('A lead was created from this submission.')).toBeInTheDocument()
  })

  it('tells the admin when the database update has not been run', async () => {
    api.fetchFormsFromSupabase.mockRejectedValue({ code: 'PGRST205', message: 'missing' })
    render(<FormsSection teacherMap={teachers} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('npm run db:push')
    expect(screen.getByRole('button', { name: 'Create form' })).toBeDisabled()
  })

  it('shows views and the share of views that became submissions', async () => {
    render(<FormsSection teacherMap={teachers} />)
    await screen.findByText('Contact Us')

    const [contact, newsletter] = bodyRows()
    expect(within(contact).getByText('8')).toBeInTheDocument()
    expect(within(contact).getByText('25%')).toBeInTheDocument()
    expect(within(newsletter).getAllByText('-')).toContain(within(newsletter).getByText('-', { selector: 'td' }))
  })

  it('changes the link name from Share / Embed', async () => {
    api.saveFormSlugInSupabase.mockResolvedValue({
      form: makeForm('f1', 'Contact Us', { slug: 'trial-class' }),
      taken: false,
    })
    render(<FormsSection teacherMap={teachers} />)
    await screen.findByText('Contact Us')

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Contact Us' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Share / Embed' }))
    const input = screen.getByLabelText('Link name')
    expect(input).toHaveValue('contact-us')

    await userEvent.clear(input)
    await userEvent.type(input, 'Trial Class')
    expect(input).toHaveValue('trial-class')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(api.saveFormSlugInSupabase).toHaveBeenCalledWith('f1', 'trial-class')
    await vi.waitFor(() =>
      expect((screen.getByLabelText('Link') as HTMLTextAreaElement).value).toMatch(/\?form=trial-class$/),
    )
  })

  it('says when the link name belongs to another form', async () => {
    api.saveFormSlugInSupabase.mockResolvedValue({ form: null, taken: true })
    render(<FormsSection teacherMap={teachers} />)
    await screen.findByText('Contact Us')

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Contact Us' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Share / Embed' }))
    await userEvent.type(screen.getByLabelText('Link name'), '-2')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('already used')
  })

  it('reports the newest submission as seen when Submissions opens', async () => {
    const onSubmissionsSeen = vi.fn()
    render(<FormsSection teacherMap={teachers} onSubmissionsSeen={onSubmissionsSeen} />)
    await screen.findByText('Contact Us')
    expect(onSubmissionsSeen).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('tab', { name: 'Submissions' }))

    await vi.waitFor(() => expect(onSubmissionsSeen).toHaveBeenCalledWith('2026-10-01T03:00:00Z'))
  })

  it('marks a submission whose phone already had a lead', async () => {
    api.fetchFormSubmissionsFromSupabase.mockResolvedValue([
      mapSubmissionRow({
        id: 9,
        form_id: 'f1',
        answers: [{ id: 'a', label: "Parent's name", value: 'Mrs Lim' }],
        lead_id: 4,
        lead_was_existing: true,
        status: 'completed',
        last_page: null,
        created_at: '2026-10-01T03:00:00Z',
      }),
    ])
    render(<FormsSection teacherMap={teachers} />)
    await screen.findByText('Contact Us')

    await userEvent.click(screen.getByRole('tab', { name: 'Submissions' }))

    expect(await screen.findByText('Added to existing lead')).toBeInTheDocument()
  })

  describe('unfinished submissions', () => {
    const unfinished = mapSubmissionRow({
      id: 20,
      form_id: 'f1',
      answers: [{ id: 'a', label: "Parent's name", value: 'Mr Unfinished' }],
      lead_id: null,
      lead_was_existing: false,
      status: 'partial',
      last_page: 2,
      created_at: '2026-10-02T09:00:00Z',
    })

    beforeEach(() => {
      api.fetchFormSubmissionsFromSupabase.mockResolvedValue([
        unfinished,
        submission(1, 'f1', 'Mrs Lim'),
      ])
    })

    it('are not counted as submissions in the forms list', async () => {
      render(<FormsSection teacherMap={teachers} />)
      await screen.findByText('Contact Us')

      const [contact] = bodyRows()
      // 8 views, 1 finished submission (not 2): 13%.
      expect(within(contact).getByText('13%')).toBeInTheDocument()
    })

    it('show up in Submissions as unfinished, with the page they stopped on', async () => {
      render(<FormsSection teacherMap={teachers} />)
      await screen.findByText('Contact Us')
      await userEvent.click(screen.getByRole('tab', { name: 'Submissions' }))

      expect(await screen.findByText('Unfinished, stopped on page 2')).toBeInTheDocument()
      expect(bodyRows()).toHaveLength(2)

      await userEvent.click(within(bodyRows()[0]).getByRole('button', { name: 'View' }))
      expect(screen.getByText(/stopped on page 2 and did not finish/)).toBeInTheDocument()
    })

    it('can be filtered to unfinished only, or hidden', async () => {
      render(<FormsSection teacherMap={teachers} />)
      await screen.findByText('Contact Us')
      await userEvent.click(screen.getByRole('tab', { name: 'Submissions' }))
      await screen.findByText('Unfinished, stopped on page 2')

      await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'partial')
      expect(bodyRows()).toHaveLength(1)
      expect(screen.getByText('Mr Unfinished')).toBeInTheDocument()

      await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'completed')
      expect(bodyRows()).toHaveLength(1)
      expect(screen.queryByText('Unfinished, stopped on page 2')).not.toBeInTheDocument()
    })

    it('do not count as new when marking submissions as seen', async () => {
      const onSubmissionsSeen = vi.fn()
      render(<FormsSection teacherMap={teachers} onSubmissionsSeen={onSubmissionsSeen} />)
      await screen.findByText('Contact Us')

      await userEvent.click(screen.getByRole('tab', { name: 'Submissions' }))

      await vi.waitFor(() => expect(onSubmissionsSeen).toHaveBeenCalledWith('2026-10-01T03:00:00Z'))
    })
  })
})
