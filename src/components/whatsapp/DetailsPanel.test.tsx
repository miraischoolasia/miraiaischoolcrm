import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Lead, LeadOption, Package, Student, TrialBooking } from '../../types/domain'
import type { ChatwootConversation, ChatwootMessage } from '../../lib/whatsappInbox'
import type { SourceRule } from '../../lib/sourceRules'
import type { WhatsAppCrm } from './crm'
import { DetailsPanel } from './DetailsPanel'

// The enrolment steps have their own tests; here only where they are placed matters.
vi.mock('./EnrolPanel', () => ({ EnrolPanel: () => <div>Enrol steps</div> }))

const conversation = (attributes: ChatwootConversation['custom_attributes'] = {}): ChatwootConversation => ({
  id: 7,
  status: 'open',
  unread_count: 0,
  waiting_since: 0,
  timestamp: 0,
  last_activity_at: 0,
  custom_attributes: attributes,
  meta: { sender: { id: 3, name: 'Mei Ling', phone_number: '+60123456789', identifier: null } },
})

const option = (id: number, kind: LeadOption['kind'], label: string, legacyKey: string | null = null): LeadOption => ({
  id,
  kind,
  label,
  isActive: true,
  legacyKey,
  color: null,
})

const lead = {
  id: 11,
  fullName: 'Mei Ling',
  phone: '012-345 6789',
  sourceId: 1,
  picId: null,
  state: null,
  tagIds: [],
  checks: {},
  status: 'contacted',
  children: [{ name: 'Ethan', age: 9, phone: null }],
  notes: null,
  followUps: [],
  tasks: [],
  convertedStudentId: null,
  addedDate: '2026-10-01',
  createdAt: '',
  updatedAt: '',
} as Lead

const firstMessage: ChatwootMessage = {
  id: 1,
  content: 'Hi, I saw your Facebook ad',
  message_type: 0,
  created_at: 1_790_000_000,
  private: false,
  status: 'sent',
}

function makeCrm(patch: Partial<WhatsAppCrm> = {}): WhatsAppCrm {
  return {
    leads: [],
    students: [],
    classrooms: [],
    packages: [],
    trialBookings: [],
    listHoaSlots: () => [],
    describeHoaBooking: () => '',
    onBookHoa: vi.fn().mockResolvedValue(null),
    onCancelHoa: vi.fn().mockResolvedValue(null),
    leadOptions: [option(1, 'source', 'Facebook'), option(2, 'source', 'Other', 'other')],
    canEditLeads: true,
    canEditStudents: true,
    canBookMakeup: true,
    onCreateLead: vi.fn().mockResolvedValue({ leadId: 55, error: null }),
    onUpdateLead: vi.fn().mockResolvedValue(null),
    trialDateFor: () => null,
    onAddOption: vi.fn().mockResolvedValue(null),
    onRecordLeave: vi.fn().mockResolvedValue(null),
    onSetStudentPhone: vi.fn().mockResolvedValue(null),
    onOpenLead: vi.fn(),
    leadIdsWithForms: new Set<number>(),
    onOpenFormAnswers: vi.fn(),
    loadFormAnswers: vi.fn().mockResolvedValue([]),
    onOpenStudent: vi.fn(),
    onOpenMakeup: vi.fn(),
    ...patch,
  }
}

function renderPanel(
  crm: WhatsAppCrm,
  attributes?: ChatwootConversation['custom_attributes'],
  onLinkLead = vi.fn().mockResolvedValue(true),
  rules: SourceRule[] = [],
  onLinkStudents = vi.fn().mockResolvedValue(true),
) {
  render(
    <DetailsPanel
      conversation={conversation(attributes)}
      messages={[firstMessage]}
      hasOlder={false}
      crm={crm}
      sourceRules={rules}
      onLoadOlder={vi.fn()}
      onLinkLead={onLinkLead}
      onLinkStudents={onLinkStudents}
    />,
  )
  return onLinkLead
}

describe('DetailsPanel', () => {
  it('shows the first message when opened, and the add-lead form for a parent who is not a lead', async () => {
    renderPanel(makeCrm())

    expect(screen.queryByText('Hi, I saw your Facebook ad')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /How they first contacted you/ }))
    expect(screen.getByText('Hi, I saw your Facebook ad')).toBeInTheDocument()
    expect(screen.getByText('Looks like it came from: Facebook.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add as a new lead' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Where did they find us/)).toHaveValue('1')
  })

  it('suggests a lead with a similar name when the number matches nothing, and links it on confirm', async () => {
    const named = { ...lead, id: 21, fullName: 'Mei Ling Tan', phone: '0198888888', children: [] } as Lead
    const onLinkLead = renderPanel(makeCrm({ leads: [named] }))

    expect(screen.getByText('Could this parent be one of your leads?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Mei Ling Tan/ }))

    expect(onLinkLead).toHaveBeenCalledWith(21)
  })

  it('suggests nothing when no lead has a similar name', () => {
    renderPanel(makeCrm({ leads: [{ ...lead, id: 22, fullName: 'Someone Else', phone: '0198888888', children: [] } as Lead] }))

    expect(screen.queryByText('Could this parent be one of your leads?')).not.toBeInTheDocument()
  })

  it('picks the source and tags from a rule that matches the first message', async () => {
    const crm = makeCrm({
      leadOptions: [
        option(1, 'source', 'Facebook'),
        option(2, 'source', 'Other', 'other'),
        option(3, 'source', 'Google Ads'),
        option(7, 'tag', 'Free HOA'),
      ],
    })
    renderPanel(crm, undefined, undefined, [
      { id: 1, phrase: 'i saw your facebook ad', sourceId: 3, tagIds: [7], isActive: true },
    ])

    await userEvent.click(screen.getByRole('button', { name: /How they first contacted you/ }))
    expect(screen.getByText(/Matched your rule "i saw your facebook ad": Google Ads, Free HOA/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Where did they find us/)).toHaveValue('3')
  })

  it('lets an editor start a rule from the first message', async () => {
    const onManageRules = vi.fn()
    render(
      <DetailsPanel
        conversation={conversation()}
        messages={[firstMessage]}
        hasOlder={false}
        crm={makeCrm()}
        sourceRules={[]}
        onManageRules={onManageRules}
        onLoadOlder={vi.fn()}
        onLinkLead={vi.fn()}
        onLinkStudents={vi.fn().mockResolvedValue(true)}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /How they first contacted you/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Make a rule from this message' }))
    expect(onManageRules).toHaveBeenCalledWith('Hi, I saw your Facebook ad')
  })

  it('saves the lead and ties the chat to it', async () => {
    const crm = makeCrm()
    const onLinkLead = renderPanel(crm)

    // The name WhatsApp gives is not copied in; the team writes the parent name.
    expect(screen.getByLabelText('Parent name')).toHaveValue('')
    await userEvent.type(screen.getByLabelText('Parent name'), 'Mei Ling')
    await userEvent.click(screen.getByRole('button', { name: 'Save lead' }))

    await waitFor(() => expect(onLinkLead).toHaveBeenCalledWith(55))
    expect(crm.onCreateLead).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'Mei Ling', phone: '+60123456789', sourceId: 1 }),
    )
  })

  it('shows the lead that has the same number, with nothing to confirm', () => {
    const onLinkLead = renderPanel(makeCrm({ leads: [lead] }))

    expect(screen.getByText('Lead (found by phone number)')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Add as a new lead' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Unlink/ })).not.toBeInTheDocument()
    expect(onLinkLead).not.toHaveBeenCalled()
  })

  it('reads every form the lead filled in, in the panel, from a Form button by the source', async () => {
    const submission = (id: number, formName: string, value: string) => ({
      id,
      formId: `f${id}`,
      formName,
      createdAt: '2026-10-05T03:00:00.000Z',
      answers: [{ id: 'q1', label: 'Child name', value }],
      wasExisting: false,
      tracking: null,
    })
    const crm = makeCrm({
      leads: [lead],
      leadIdsWithForms: new Set([11]),
      loadFormAnswers: vi.fn().mockResolvedValue([submission(2, 'HOA registration', 'Ethan'), submission(1, 'Open day', 'Ethan Lim')]),
    })
    renderPanel(crm, { crm_lead_id: 11 })

    expect(screen.queryByText('HOA registration')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Form' }))

    expect(await screen.findByText('HOA registration')).toBeInTheDocument()
    expect(screen.getByText('Open day')).toBeInTheDocument()
    expect(crm.loadFormAnswers).toHaveBeenCalledWith(11)
    expect(screen.queryByRole('button', { name: 'Read their form answers' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Form' }))
    expect(screen.queryByText('HOA registration')).not.toBeInTheDocument()
  })

  it('has no Form button for a lead who filled in no form', () => {
    renderPanel(makeCrm({ leads: [lead] }), { crm_lead_id: 11 })

    expect(screen.queryByRole('button', { name: 'Form' })).not.toBeInTheDocument()
  })

  it('shows the linked lead in the same editable form, filled in', () => {
    renderPanel(makeCrm({ leads: [{ ...lead, state: 'Selangor', notes: 'Likes robots' } as Lead] }), { crm_lead_id: 11 })

    expect(screen.queryByText('Add as a new lead')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Lead details' })).toBeInTheDocument()
    expect(screen.getByLabelText('Parent name')).toHaveValue('Mei Ling')
    expect(screen.getByLabelText('State')).toHaveValue('Selangor')
    expect(screen.getByLabelText('Child 1 name')).toHaveValue('Ethan')
    expect(screen.getByLabelText('Child 1 age')).toHaveValue('9')
    expect(screen.getByLabelText('Stage')).toHaveValue('contacted')
    expect(screen.getByLabelText('Notes')).toHaveValue('Likes robots')
  })

  it('saves a change to the lead by itself, with no Save button and no message', async () => {
    const crm = makeCrm({ leads: [lead] })
    renderPanel(crm, { crm_lead_id: 11 })

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('State'), 'Pulau Pinang')
    await userEvent.selectOptions(screen.getByLabelText('Stage'), 'trial_scheduled')

    await waitFor(() =>
      expect(crm.onUpdateLead).toHaveBeenLastCalledWith(
        11,
        expect.objectContaining({ state: 'Pulau Pinang', status: 'trial_scheduled', fullName: 'Mei Ling' }),
      ),
    )
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('State')).toHaveValue('Pulau Pinang')
    expect(screen.getByLabelText('Stage')).toHaveValue('trial_scheduled')
  })

  it('saves typed text a moment after typing stops, once', async () => {
    const crm = makeCrm({ leads: [lead] })
    renderPanel(crm, { crm_lead_id: 11 })

    await userEvent.type(screen.getByLabelText('Notes'), 'Likes robots')
    expect(crm.onUpdateLead).not.toHaveBeenCalled()

    await waitFor(() => expect(crm.onUpdateLead).toHaveBeenCalledTimes(1), { timeout: 2000 })
    expect(crm.onUpdateLead).toHaveBeenCalledWith(11, expect.objectContaining({ notes: 'Likes robots' }))
  })

  it('saves typed text when the panel is closed before the pause ends', async () => {
    const crm = makeCrm({ leads: [lead] })
    const { unmount } = render(
      <DetailsPanel
        conversation={conversation({ crm_lead_id: 11 })}
        messages={[firstMessage]}
        hasOlder={false}
        crm={crm}
        sourceRules={[]}
        onLoadOlder={vi.fn()}
        onLinkLead={vi.fn()}
        onLinkStudents={vi.fn().mockResolvedValue(true)}
      />,
    )
    await userEvent.type(screen.getByLabelText('Notes'), 'Call after 5')
    unmount()

    expect(crm.onUpdateLead).toHaveBeenCalledWith(11, expect.objectContaining({ notes: 'Call after 5' }))
  })

  it('shows why a save failed', async () => {
    const crm = makeCrm({ leads: [lead], onUpdateLead: vi.fn().mockResolvedValue('Failed to save lead record.') })
    renderPanel(crm, { crm_lead_id: 11 })

    await userEvent.selectOptions(screen.getByLabelText('Stage'), 'trial_scheduled')

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to save lead record.')
  })

  it('keeps what the person typed when the lead is refreshed behind it', async () => {
    const crm = makeCrm({ leads: [lead] })
    const { rerender } = render(
      <DetailsPanel
        conversation={conversation({ crm_lead_id: 11 })}
        messages={[firstMessage]}
        hasOlder={false}
        crm={crm}
        sourceRules={[]}
        onLoadOlder={vi.fn()}
        onLinkLead={vi.fn()}
        onLinkStudents={vi.fn().mockResolvedValue(true)}
      />,
    )
    await userEvent.type(screen.getByLabelText('Notes'), 'my edit')

    const newer = { ...lead, notes: 'changed elsewhere', updatedAt: 'later' } as Lead
    rerender(
      <DetailsPanel
        conversation={conversation({ crm_lead_id: 11 })}
        messages={[firstMessage]}
        hasOlder={false}
        crm={{ ...crm, leads: [newer] }}
        sourceRules={[]}
        onLoadOlder={vi.fn()}
        onLinkLead={vi.fn()}
        onLinkStudents={vi.fn().mockResolvedValue(true)}
      />,
    )

    expect(screen.getByLabelText('Notes')).toHaveValue('my edit')
  })

  it('adds and removes children, at most three', async () => {
    renderPanel(makeCrm({ leads: [lead] }), { crm_lead_id: 11 })

    await userEvent.click(screen.getByRole('button', { name: 'Add a child' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add a child' }))
    expect(screen.queryByRole('button', { name: 'Add a child' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remove child 3' }))
    expect(screen.getByRole('button', { name: 'Add a child' })).toBeInTheDocument()
  })

  it('will not save a child with a name but no age', async () => {
    const crm = makeCrm({ leads: [lead] })
    renderPanel(crm, { crm_lead_id: 11 })

    await userEvent.click(screen.getByRole('button', { name: 'Add a child' }))
    await userEvent.type(screen.getByLabelText('Child 2 name'), 'Mia')

    expect(await screen.findByRole('alert', {}, { timeout: 2000 })).toHaveTextContent("Choose the child's age to save.")
    expect(crm.onUpdateLead).not.toHaveBeenCalled()

    await userEvent.selectOptions(screen.getByLabelText('Child 2 age'), '7')
    await waitFor(() =>
      expect(crm.onUpdateLead).toHaveBeenCalledWith(
        11,
        expect.objectContaining({ children: [expect.objectContaining({ name: 'Ethan' }), { name: 'Mia', age: 7, phone: null }] }),
      ),
    )
  })

  it('shows the lead but cannot change it without edit permission', () => {
    renderPanel(makeCrm({ leads: [lead], canEditLeads: false }), { crm_lead_id: 11 })

    expect(screen.getByLabelText('Parent name')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('has no follow-ups block and no open-full-lead button in the panel', () => {
    renderPanel(makeCrm({ leads: [lead] }), { crm_lead_id: 11 })

    expect(screen.queryByText(/Follow-ups/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open full lead' })).not.toBeInTheDocument()
  })

  it('puts Children above State, and Lead details, Tags and the enrol steps under pink headings', () => {
    renderPanel(makeCrm({ leads: [lead] }), { crm_lead_id: 11 })

    const children = screen.getByText('Children')
    const state = screen.getByText('State')
    expect(children.compareDocumentPosition(state) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    for (const name of ['Lead details', 'Tags']) {
      expect(screen.getByRole('heading', { name })).toHaveClass('text-[#be185d]')
    }
  })

  it('does not offer to add a lead without edit permission', () => {
    renderPanel(makeCrm({ canEditLeads: false }))

    expect(screen.queryByRole('heading', { name: 'Add as a new lead' })).not.toBeInTheDocument()
    expect(screen.getByText(/You can look but not add leads/)).toBeInTheDocument()
  })
  it('lists every child of the parent with what they are to the school', () => {
    const crm = makeCrm({
      leads: [lead],
      students: [
        { id: 1, name: 'Ethan Lim', phone: null, studentType: 'regular', packageId: 2, isActive: true } as Student,
        { id: 2, name: 'Mia Lim', phone: null, studentType: 'trial', packageId: null, isActive: true } as Student,
      ],
      packages: [{ id: 2, name: '3 Months', kind: 'regular' } as Package],
      // Mia came to HOA through this lead; Ethan was converted from it.
      trialBookings: [{ id: 1, leadId: 11, studentId: 2, phone: null } as TrialBooking],
    })
    crm.leads[0] = { ...lead, convertedStudentId: 1 }
    renderPanel(crm, { crm_lead_id: 11 })

    expect(screen.getByText('Ethan Lim')).toBeInTheDocument()
    expect(screen.getByText('Regular · 3 Months')).toBeInTheDocument()
    expect(screen.getByText('Mia Lim')).toBeInTheDocument()
    expect(screen.getByText('HOA')).toBeInTheDocument()
  })

  it('offers a way to the other chat of the same parent', async () => {
    const onOpenChat = vi.fn()
    render(
      <DetailsPanel
        conversation={conversation({ crm_lead_id: 11 })}
        messages={[firstMessage]}
        hasOlder={false}
        crm={makeCrm({ leads: [lead] })}
        sourceRules={[]}
        onLoadOlder={vi.fn()}
        onLinkLead={vi.fn()}
        onLinkStudents={vi.fn().mockResolvedValue(true)}
        otherChats={[{ id: 9, title: 'jiayu', lastActivity: 1_790_000_000, isDone: false }]}
        onOpenChat={onOpenChat}
      />,
    )

    expect(screen.getByText('This parent has another chat')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /jiayu/ }))
    expect(onOpenChat).toHaveBeenCalledWith(9)
  })

  it('titles the panel with the parent name from the lead', () => {
    renderPanel(makeCrm({ leads: [lead] }), { crm_lead_id: 11 })

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(lead.fullName ?? '')
  })

  describe('a parent whose number matches no student', () => {
    const ethan = { id: 1, name: 'Ethan Lim', phone: null, studentType: 'regular', packageId: 2, isActive: true } as Student
    const packages = [{ id: 2, name: '3 Months', kind: 'regular' } as Package]

    it('ties a student to the chat and writes the parent number on a student who has none', async () => {
      const crm = makeCrm({ students: [ethan], packages })
      const onLinkStudents = vi.fn().mockResolvedValue(true)
      renderPanel(crm, {}, vi.fn().mockResolvedValue(true), [], onLinkStudents)

      await userEvent.type(screen.getByLabelText('Is this the parent of a student? Find the child'), 'ethan')
      await userEvent.click(screen.getByRole('button', { name: /Ethan Lim/ }))

      await waitFor(() => expect(onLinkStudents).toHaveBeenCalledWith([1]))
      expect(crm.onSetStudentPhone).toHaveBeenCalledWith(1, '60123456789')
    })

    it('does not write a number over one the student already has', async () => {
      const crm = makeCrm({ students: [{ ...ethan, phone: '019 888 7777' }], packages })
      const onLinkStudents = vi.fn().mockResolvedValue(true)
      renderPanel(crm, {}, vi.fn().mockResolvedValue(true), [], onLinkStudents)

      await userEvent.type(screen.getByLabelText('Is this the parent of a student? Find the child'), 'ethan')
      await userEvent.click(screen.getByRole('button', { name: /Ethan Lim/ }))

      await waitFor(() => expect(onLinkStudents).toHaveBeenCalledWith([1]))
      expect(crm.onSetStudentPhone).not.toHaveBeenCalled()
    })

    it('shows a student tied by hand first, and can take the tie away again', async () => {
      const onLinkStudents = vi.fn().mockResolvedValue(true)
      renderPanel(makeCrm({ students: [ethan], packages }), { crm_student_ids: [1] }, vi.fn(), [], onLinkStudents)

      expect(screen.getByText('Ethan Lim')).toBeInTheDocument()
      expect(screen.getByText('Regular · 3 Months')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Not their child? Unlink' }))

      expect(onLinkStudents).toHaveBeenCalledWith([])
    })

    it('puts the HOA steps away for a parent who already has a student in a class', () => {
      const crm = makeCrm({ leads: [{ ...lead, convertedStudentId: 1 }], students: [ethan], packages })
      render(
        <DetailsPanel
          conversation={conversation({ crm_lead_id: 11 })}
          messages={[firstMessage]}
          hasOlder={false}
          crm={crm}
          sourceRules={[]}
          onLoadOlder={vi.fn()}
          onLinkLead={vi.fn()}
          onLinkStudents={vi.fn()}
          onWriteMessage={vi.fn()}
        />,
      )

      const summary = screen.getByText('Enrol another child in HOA')
      expect(summary.closest('details')).not.toHaveAttribute('open')
    })

    it('keeps the HOA steps open for a lead nobody has enrolled yet', () => {
      render(
        <DetailsPanel
          conversation={conversation({ crm_lead_id: 11 })}
          messages={[firstMessage]}
          hasOlder={false}
          crm={makeCrm({ leads: [lead] })}
          sourceRules={[]}
          onLoadOlder={vi.fn()}
          onLinkLead={vi.fn()}
          onLinkStudents={vi.fn()}
          onWriteMessage={vi.fn()}
        />,
      )

      expect(screen.getByText('Enrol steps')).toBeInTheDocument()
      expect(screen.queryByText('Enrol another child in HOA')).not.toBeInTheDocument()
    })
  })
})
