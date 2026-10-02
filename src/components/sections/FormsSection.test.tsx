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

describe('FormsSection open and close status', () => {
  const settings = (patch: Partial<Form['settings']>) => ({ ...defaultFormSettings, ...patch })

  it('shows Closed once the deadline has passed, and the time it closed', async () => {
    api.fetchFormsFromSupabase.mockResolvedValue([
      makeForm('f1', 'Event', { settings: settings({ closesAt: '2020-01-01T12:00:00.000Z' }) }),
    ])
    render(<FormsSection teacherMap={teachers} />)

    const [row] = (await screen.findAllByRole('row')).slice(1)
    expect(within(row).getByText('Closed')).toBeInTheDocument()
    expect(within(row).getByText(/closed Jan 01, 2020/)).toBeInTheDocument()
  })

  it('shows Full when the places are taken, and how many are used', async () => {
    api.fetchFormsFromSupabase.mockResolvedValue([
      makeForm('f1', 'Event', { settings: settings({ maxSubmissions: 2 }) }),
    ])
    render(<FormsSection teacherMap={teachers} />)

    const [row] = (await screen.findAllByRole('row')).slice(1)
    expect(within(row).getByText('Full')).toBeInTheDocument()
    expect(within(row).getByText('2/2 places')).toBeInTheDocument()
  })

  it('stays Published with places left and a deadline ahead', async () => {
    api.fetchFormsFromSupabase.mockResolvedValue([
      makeForm('f1', 'Event', {
        settings: settings({ maxSubmissions: 30, closesAt: '2099-01-01T00:00:00.000Z' }),
      }),
    ])
    render(<FormsSection teacherMap={teachers} />)

    const [row] = (await screen.findAllByRole('row')).slice(1)
    expect(within(row).getByText('Published')).toBeInTheDocument()
    expect(within(row).getByText(/2\/30 places · closes /)).toBeInTheDocument()
  })

  it('keeps showing Draft for an unpublished form', async () => {
    api.fetchFormsFromSupabase.mockResolvedValue([
      makeForm('f1', 'Event', {
        isPublished: false,
        settings: settings({ closesAt: '2020-01-01T00:00:00.000Z' }),
      }),
    ])
    render(<FormsSection teacherMap={teachers} />)

    const [row] = (await screen.findAllByRole('row')).slice(1)
    expect(within(row).getByText('Draft')).toBeInTheDocument()
  })
})

describe('FormsSection insights', () => {
  const tracked = (id: number, formId: string, tracking: object | null) =>
    mapSubmissionRow({
      id,
      form_id: formId,
      answers: [{ id: 'a', label: "Parent's name", value: `Parent ${id}` }],
      lead_id: id,
      lead_was_existing: false,
      status: 'completed',
      last_page: null,
      tracking,
      created_at: '2026-10-01T03:00:00Z',
    })

  async function openSubmissions() {
    render(<FormsSection teacherMap={teachers} />)
    await screen.findByText('Contact Us')
    await userEvent.click(screen.getByRole('tab', { name: 'Submissions' }))
  }

  it('shows where submissions came from for the form that is picked', async () => {
    api.fetchFormSubmissionsFromSupabase.mockResolvedValue([
      tracked(1, 'f1', { source: 'facebook', medium: 'cpc', campaign: 'spring' }),
      tracked(2, 'f1', { source: 'facebook', campaign: 'spring' }),
      tracked(3, 'f1', null),
    ])
    await openSubmissions()

    // Not for all forms at once.
    expect(screen.queryByRole('region', { name: /Insights/ })).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Filter by form'), 'Contact Us')
    const insights = await screen.findByRole('region', { name: 'Insights for Contact Us' })
    expect(within(insights).getByText('Where submissions came from')).toBeInTheDocument()
    expect(within(insights).getByText('facebook')).toBeInTheDocument()
    expect(within(insights).getByText('· spring')).toBeInTheDocument()
    expect(within(insights).getByText('2 (67%)')).toBeInTheDocument()
    expect(within(insights).getByText('Direct')).toBeInTheDocument()
    // One page: no funnel.
    expect(within(insights).queryByText('Where people stop')).not.toBeInTheDocument()
  })

  it('has a Source column on every row', async () => {
    api.fetchFormSubmissionsFromSupabase.mockResolvedValue([
      tracked(1, 'f1', { source: 'facebook' }),
      tracked(2, 'f1', null),
    ])
    await openSubmissions()

    const rows = bodyRows()
    expect(within(rows[0]).getByText('facebook')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Direct')).toBeInTheDocument()
  })

  it('says where people stop on a form with several pages', async () => {
    const [first, second] = createStarterFields().map((field, index) => ({
      ...field,
      pageId: index < 2 ? 'p1' : 'p2',
    }))
    const pageFields = [first, second, ...createStarterFields().slice(2).map((f) => ({ ...f, pageId: 'p2' }))]
    api.fetchFormsFromSupabase.mockResolvedValue([
      makeForm('f1', 'Contact Us', {
        viewCount: 5,
        fields: pageFields,
        settings: {
          ...defaultFormSettings,
          pages: [
            { id: 'p1', title: 'You', description: '', rules: [] },
            { id: 'p2', title: 'Your child', description: '', rules: [] },
          ],
        },
      }),
    ])
    api.fetchFormSubmissionsFromSupabase.mockResolvedValue([
      tracked(1, 'f1', null),
      mapSubmissionRow({
        id: 2,
        form_id: 'f1',
        answers: [{ id: first.id, label: first.label, value: 'Mrs Lim' }],
        lead_id: null,
        lead_was_existing: false,
        status: 'partial',
        last_page: 2,
        created_at: '2026-10-01T03:00:00Z',
      }),
    ])
    await openSubmissions()
    await userEvent.selectOptions(screen.getByLabelText('Filter by form'), 'Contact Us')

    const insights = await screen.findByRole('region', { name: 'Insights for Contact Us' })
    expect(within(insights).getByText('Where people stop')).toBeInTheDocument()
    // 5 views: 2 got past page 1's start (one finished, one stopped on page 2), 3 left at once.
    expect(within(insights).getByText('Page 1: You')).toBeInTheDocument()
    const lines = within(insights)
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(lines[0]).toContain('Page 1: You5 reached · 3 stopped here')
    expect(lines[1]).toContain('Page 2: Your child2 reached · 1 stopped here')
  })
})

describe('FormsSection a submission that came from a campaign', () => {
  it('says so when the submission is opened', async () => {
    api.fetchFormSubmissionsFromSupabase.mockResolvedValue([
      mapSubmissionRow({
        id: 1,
        form_id: 'f1',
        answers: [{ id: 'a', label: "Parent's name", value: 'Mrs Lim' }],
        lead_id: 1,
        lead_was_existing: false,
        status: 'completed',
        last_page: null,
        tracking: { source: 'facebook', medium: 'cpc', campaign: 'spring', referrer: 'l.facebook.com' },
        created_at: '2026-10-01T03:00:00Z',
      }),
    ])
    render(<FormsSection teacherMap={teachers} />)
    await screen.findByText('Contact Us')
    await userEvent.click(screen.getByRole('tab', { name: 'Submissions' }))
    await userEvent.click(await screen.findByRole('button', { name: 'View' }))

    expect(screen.getByText(/Came from: facebook \/ cpc \/ spring \(via l\.facebook\.com\)/)).toBeInTheDocument()
  })
})
