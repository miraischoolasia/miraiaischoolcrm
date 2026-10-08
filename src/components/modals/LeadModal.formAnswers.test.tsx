import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LeadModal } from './LeadModal'
import type { Lead, LeadFormState, LeadFormSubmission } from '../../types/domain'

const lead: Lead = {
  id: 7,
  fullName: 'Mrs Lim',
  phone: '0123456789',
  sourceId: null,
  picId: null,
  state: null,
  tagIds: [],
  checks: {},
  status: 'new',
  children: [],
  notes: null,
  followUps: [],
  tasks: [],
  convertedStudentId: null,
  addedDate: '2026-10-01',
  createdAt: '',
  updatedAt: '',
}

const formState: LeadFormState = {
  fullName: 'Mrs Lim',
  phone: '0123456789',
  sourceId: '',
  picId: '',
  state: '',
  tagIds: [],
  status: 'new',
  children: [],
  notes: '',
  addedDate: '2026-10-01',
}

const submissions: LeadFormSubmission[] = [
  {
    id: 2,
    formId: 'f1',
    formName: 'Trial Class',
    createdAt: '2026-10-02T03:00:00Z',
    wasExisting: true,
    tracking: null,
    answers: [
      { id: 'goal', label: 'Goal', value: 'Robotics' },
      { id: 'days', label: 'Days', value: 'Sat, Sun' },
    ],
  },
  {
    id: 1,
    formId: 'f1',
    formName: 'Trial Class',
    createdAt: '2026-10-01T03:00:00Z',
    wasExisting: false,
    tracking: null,
    answers: [{ id: 'goal', label: 'Goal', value: 'Coding' }],
  },
]

function renderModal(props: Partial<React.ComponentProps<typeof LeadModal>> = {}) {
  render(
    <LeadModal
      editingLead={lead}
      formState={formState}
      saveError={null}
      isSaving={false}
      onClose={vi.fn()}
      onSubmit={vi.fn()}
      onFieldChange={vi.fn()}
      leadOptions={[]}
      onAddLeadOption={vi.fn()}
      {...props}
    />,
  )
}

describe('LeadModal form answers', () => {
  it('lists every submission with its form, time and all its answers, newest first', () => {
    renderModal({ formSubmissions: submissions })

    const section = screen.getByRole('region', { name: 'Form answers' })
    expect(within(section).getByText('2 submissions')).toBeInTheDocument()
    const articles = within(section).getAllByRole('article')
    expect(articles).toHaveLength(2)
    expect(within(articles[0]).getByText('Trial Class')).toBeInTheDocument()
    expect(within(articles[0]).getByText(/filled in again/)).toBeInTheDocument()
    expect(within(articles[0]).getByText('Robotics')).toBeInTheDocument()
    expect(within(articles[0]).getByText('Sat, Sun')).toBeInTheDocument()
    expect(within(articles[1]).getByText('Coding')).toBeInTheDocument()
    expect(within(articles[1]).queryByText(/filled in again/)).not.toBeInTheDocument()
  })

  it('sits above the notes', () => {
    renderModal({ formSubmissions: submissions })

    const section = screen.getByRole('region', { name: 'Form answers' })
    const notes = screen.getByText('Notes')
    expect(section.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('says it is loading while the answers load', () => {
    renderModal({ isLoadingFormSubmissions: true })

    expect(within(screen.getByRole('region', { name: 'Form answers' })).getByText('Loading...')).toBeInTheDocument()
  })

  it('is left out for a lead without form answers, and for a new lead', () => {
    renderModal({ formSubmissions: [] })
    expect(screen.queryByRole('region', { name: 'Form answers' })).not.toBeInTheDocument()
  })

  it('is not shown when adding a new lead', () => {
    renderModal({ editingLead: null, formSubmissions: submissions })
    expect(screen.queryByRole('region', { name: 'Form answers' })).not.toBeInTheDocument()
  })

  it('scrolls to the answers when opened from the Form tag', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    renderModal({ formSubmissions: submissions, focusFormAnswers: true })

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('does not scroll when opened with Edit', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    renderModal({ formSubmissions: submissions, focusFormAnswers: false })

    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})

describe('LeadModal form answers: where it came from and WhatsApp', () => {
  it('says which campaign a submission came from', () => {
    renderModal({
      formSubmissions: [
        {
          ...submissions[0],
          tracking: { source: 'facebook', medium: 'cpc', campaign: 'spring', content: '', referrer: '' },
        },
        submissions[1],
      ],
    })

    const articles = within(screen.getByRole('region', { name: 'Form answers' })).getAllByRole('article')
    expect(within(articles[0]).getByText('Came from facebook · spring')).toBeInTheDocument()
    expect(within(articles[1]).queryByText(/Came from/)).not.toBeInTheDocument()
  })

  it('has a WhatsApp link beside the phone number', () => {
    renderModal({ formSubmissions: [] })

    expect(screen.getByRole('link', { name: 'WhatsApp Mrs Lim' })).toHaveAttribute(
      'href',
      'https://wa.me/60123456789',
    )
  })
})
