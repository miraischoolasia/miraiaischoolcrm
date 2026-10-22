import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Classroom, Lead, LeadOption, Package, Student, TrialBooking } from '../../types/domain'
import type { Person } from '../../lib/peopleApi'
import type { ChatwootConversation, ChatwootMessage } from '../../lib/whatsappInbox'
import type { SourceRule } from '../../lib/sourceRules'
import type { Programme } from '../../lib/programmes'
import type { WhatsAppCrm } from './crm'
import { DetailsPanel } from './DetailsPanel'
import { saveSecondParentPhone } from '../../lib/studentNumberCheck'

// Saving the second parent phone talks to the database; here only that it is asked for matters.
vi.mock('../../lib/studentNumberCheck', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/studentNumberCheck')>()),
  fetchStudentNumbers: vi.fn(async (_id: number, phone: string | null) => ({ phone, secondParentPhone: null })),
  saveSecondParentPhone: vi.fn().mockResolvedValue({ status: 'saved' }),
}))
// The enrolment steps have their own tests; here only where they are placed matters.
vi.mock('./EnrolPanel', () => ({ EnrolPanel: () => <div>Enrol steps</div> }))
vi.mock('./ProgrammePanel', () => ({
  ProgrammePanel: ({ programme }: { programme: { name: string } }) => <div>Steps of {programme.name}</div>,
}))

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
    classesOfStudent: () => [],
    describeHoaBooking: () => '',
    onBookHoa: vi.fn().mockResolvedValue(null),
    onCancelHoa: vi.fn().mockResolvedValue(null),
    onEnrolCamp: vi.fn().mockResolvedValue(null),
    leadOptions: [option(1, 'source', 'Facebook'), option(2, 'source', 'Other', 'other')],
    canEditLeads: true,
    canEditStudents: true,
    canBookMakeup: true,
    onCreateLead: vi.fn().mockResolvedValue({ leadId: 55, error: null }),
    onUpdateLead: vi.fn().mockResolvedValue(null),
    trialDateFor: () => null,
    onAddOption: vi.fn().mockResolvedValue(null),
    onSetStudentPhone: vi.fn().mockResolvedValue(null),
    onOpenLead: vi.fn(),
    leadChannels: [],
    refreshLeadChannels: vi.fn(),
    onMergeLeads: vi.fn().mockResolvedValue({ leadId: 1, error: null }),
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
    await userEvent.click(screen.getByRole('button', { name: /Source Keyword/ }))
    expect(screen.getByText('Hi, I saw your Facebook ad')).toBeInTheDocument()
    expect(screen.getByText('Looks like it came from: Facebook.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add as a new lead' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Where did they find us/)).toHaveValue('1')
  })

  it('in the Student Inbox, offers no lead form by itself, only "Also a lead?" (2026-10-22)', async () => {
    render(
      <DetailsPanel
        conversation={conversation()}
        messages={[firstMessage]}
        hasOlder={false}
        crm={makeCrm()}
        sourceRules={[]}
        onLoadOlder={vi.fn()}
        onLinkLead={vi.fn().mockResolvedValue(true)}
        onLinkStudents={vi.fn().mockResolvedValue(true)}
        studentZone
      />,
    )
    expect(screen.queryByRole('heading', { name: 'Add as a new lead' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Source Keyword/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Also a lead? Add or find the lead' }))
    expect(screen.getByRole('heading', { name: 'Add as a new lead' })).toBeInTheDocument()
  })

  it('does not make a second lead for a number that already has one', async () => {
    const owner = { ...lead, id: 21, fullName: '@yvonne.ywbl', phone: '0198888888' } as Lead
    const crm = makeCrm({ leads: [owner] })
    renderPanel(crm)

    await userEvent.clear(screen.getByLabelText('Phone number'))
    await userEvent.type(screen.getByLabelText('Phone number'), '019-888 8888')
    await userEvent.click(screen.getByRole('button', { name: 'Save lead' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('already belongs to the lead "@yvonne.ywbl"')
    expect(crm.onCreateLead).not.toHaveBeenCalled()
  })

  it('says so when the server already has a lead for the number (the page list was behind)', async () => {
    const crm = makeCrm({
      onCreateLead: vi.fn().mockResolvedValue({
        leadId: null,
        error: 'This number already belongs to the lead "@yvonne.ywbl".',
        existingLeadId: 21,
      }),
    })
    renderPanel(crm)

    await userEvent.type(screen.getByLabelText('Contact name'), 'Mei')
    await userEvent.click(screen.getByRole('button', { name: 'Save lead' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('already belongs to the lead "@yvonne.ywbl"')
  })

  it('does not guess a lead from the name; the team finds it by searching, and the chat number is saved on it', async () => {
    const named = { ...lead, id: 21, fullName: 'Mei Ling Tan', phone: '0198888888', children: [{ name: 'Ethan', age: 9, phone: null }] } as Lead
    const crm = makeCrm({ leads: [named] })
    const onLinkLead = renderPanel(crm)

    expect(screen.queryByText('Could this parent be one of your leads?')).not.toBeInTheDocument()
    await userEvent.clear(screen.getByLabelText('Phone number'))
    await userEvent.type(screen.getByLabelText('Phone number'), 'Mei')
    await userEvent.click(screen.getByRole('button', { name: /Mei Ling Tan/ }))

    expect(onLinkLead).toHaveBeenCalledWith(21)
    // The chat's number becomes the lead's number; the number it had stays with the child.
    await waitFor(() =>
      expect(crm.onUpdateLead).toHaveBeenCalledWith(
        21,
        expect.objectContaining({
          phone: '60123456789',
          children: [{ name: 'Ethan', age: 9, phone: '0198888888' }],
        }),
      ),
    )
    expect(await screen.findByText("This parent's number is now saved on the lead.")).toBeInTheDocument()
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

    await userEvent.click(screen.getByRole('button', { name: /Source Keyword/ }))
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

    await userEvent.click(screen.getByRole('button', { name: /Source Keyword/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Make a source keyword from this message' }))
    expect(onManageRules).toHaveBeenCalledWith('Hi, I saw your Facebook ad')
  })

  it('saves the lead and ties the chat to it', async () => {
    const crm = makeCrm()
    const onLinkLead = renderPanel(crm)

    // The name WhatsApp gives is not copied in; the team writes the parent name.
    expect(screen.getByLabelText('Contact name')).toHaveValue('')
    await userEvent.type(screen.getByLabelText('Contact name'), 'Mei Ling')
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

  it('has no Unlink for a lead with the same number as the chat, since the number would find it again', () => {
    renderPanel(makeCrm({ leads: [lead] }), { crm_lead_id: 11 })

    expect(screen.getByText('Lead (same number as this chat)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Unlink/ })).not.toBeInTheDocument()
  })

  it('unlinks a lead tied to the chat that has another number', async () => {
    const onLinkLead = renderPanel(makeCrm({ leads: [{ ...lead, phone: '019-888 7777' }] }), { crm_lead_id: 11 })

    await userEvent.click(screen.getByRole('button', { name: /Unlink/ }))
    expect(onLinkLead).toHaveBeenCalledWith(null)
  })

  it('starts a fresh form once Unlink has taken the lead off, not keeping the old lead name and number', () => {
    const props = {
      messages: [firstMessage],
      hasOlder: false,
      sourceRules: [],
      onLoadOlder: vi.fn(),
      onLinkLead: vi.fn().mockResolvedValue(true),
      onLinkStudents: vi.fn().mockResolvedValue(true),
    }
    const linked = makeCrm({ leads: [{ ...lead, phone: '019-888 7777' }] })
    const { rerender } = render(<DetailsPanel conversation={conversation({ crm_lead_id: 11 })} crm={linked} {...props} />)
    expect(screen.getByLabelText('Contact name')).toHaveValue('Mei Ling')

    rerender(<DetailsPanel conversation={conversation({ crm_lead_id: null })} crm={makeCrm({ leads: [] })} {...props} />)
    expect(screen.getByLabelText('Contact name')).toHaveValue('')
    expect(screen.getByLabelText('Phone number')).toHaveValue('+60123456789')
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
    expect(screen.getByLabelText('Contact name')).toHaveValue('Mei Ling')
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

    expect(screen.getByLabelText('Contact name')).toBeDisabled()
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

    expect(screen.getByText('This family has another chat')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /jiayu/ }))
    expect(onOpenChat).toHaveBeenCalledWith(9)
  })

  it('does not repeat the name, the number and who handles the chat, which the chat header shows', () => {
    renderPanel(makeCrm({ leads: [lead] }), { crm_lead_id: 11, crm_owner_id: 5, crm_owner_name: 'Admin Demo' })

    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
    expect(screen.queryByText(/Handled by/)).not.toBeInTheDocument()
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

    it('does not ask about a student whose number is this chat number (the chat already finds them)', () => {
      renderPanel(makeCrm({ students: [{ ...ethan, phone: '012 345 6789' }], packages }))

      expect(screen.getByText('Ethan Lim')).toBeInTheDocument()
      expect(screen.queryByLabelText('Check the number')).not.toBeInTheDocument()
    })

    describe('a number the school does not have for the student', () => {
      const other = { ...ethan, phone: '019 888 7777' } as Student

      it('asks before tying the chat, and saves it as another parent when the team says so', async () => {
        const onLinkStudents = vi.fn().mockResolvedValue(true)
        renderPanel(makeCrm({ students: [other], packages }), {}, vi.fn().mockResolvedValue(true), [], onLinkStudents)

        await userEvent.type(screen.getByLabelText('Is this the parent of a student? Find the child'), 'ethan')
        await userEvent.click(screen.getByRole('button', { name: /Ethan Lim/ }))

        const prompt = await screen.findByLabelText('Check the number')
        expect(prompt).toHaveTextContent("This number is not Ethan Lim's registered number")
        expect(onLinkStudents).not.toHaveBeenCalled()

        await userEvent.click(within(prompt).getByRole('button', { name: 'Save as another parent' }))

        await waitFor(() => expect(onLinkStudents).toHaveBeenCalledWith([1]))
        expect(saveSecondParentPhone).toHaveBeenCalledWith(1, '60123456789')
        expect(screen.queryByLabelText('Check the number')).not.toBeInTheDocument()
        expect(screen.getByText("Saved as Ethan Lim's second parent phone.")).toBeInTheDocument()
      })

      it('ties the chat without saving the number when the team is sure it is the child', async () => {
        vi.mocked(saveSecondParentPhone).mockClear()
        const onLinkStudents = vi.fn().mockResolvedValue(true)
        const crm = makeCrm({ students: [other], packages })
        renderPanel(crm, {}, vi.fn().mockResolvedValue(true), [], onLinkStudents)

        await userEvent.type(screen.getByLabelText('Is this the parent of a student? Find the child'), 'ethan')
        await userEvent.click(screen.getByRole('button', { name: /Ethan Lim/ }))
        await userEvent.click(await screen.findByRole('button', { name: "Sure, the child's phone" }))

        await waitFor(() => expect(onLinkStudents).toHaveBeenCalledWith([1]))
        expect(saveSecondParentPhone).not.toHaveBeenCalled()
        expect(crm.onSetStudentPhone).not.toHaveBeenCalled()
      })

      it('asks before the chat is set as the student themself, and sets parent when it is another parent', async () => {
        const onSetRole = vi.fn().mockResolvedValue(true)
        const view = (
          <DetailsPanel
            conversation={conversation({ crm_student_ids: [1] })}
            messages={[firstMessage]}
            hasOlder={false}
            crm={makeCrm({ students: [other], packages })}
            sourceRules={[]}
            onLoadOlder={vi.fn()}
            onLinkLead={vi.fn()}
            onLinkStudents={vi.fn()}
            role={null}
            onSetRole={onSetRole}
          />
        )
        render(view)

        await userEvent.click(screen.getByRole('button', { name: 'Ethan Lim themself' }))
        expect(onSetRole).not.toHaveBeenCalled()
        await userEvent.click(await screen.findByRole('button', { name: 'Save as another parent' }))

        await waitFor(() => expect(onSetRole).toHaveBeenCalledWith('parent'))
        expect(onSetRole).not.toHaveBeenCalledWith('student')
      })

      it('sets the student themself when the team says it is the child, and does not ask when the number matches', async () => {
        const onSetRole = vi.fn().mockResolvedValue(true)
        const make = (student: Student) => (
          <DetailsPanel
            conversation={conversation({ crm_student_ids: [1] })}
            messages={[firstMessage]}
            hasOlder={false}
            crm={makeCrm({ students: [student], packages })}
            sourceRules={[]}
            onLoadOlder={vi.fn()}
            onLinkLead={vi.fn()}
            onLinkStudents={vi.fn()}
            role={null}
            onSetRole={onSetRole}
          />
        )
        const first = render(make(other))
        await userEvent.click(screen.getByRole('button', { name: 'Ethan Lim themself' }))
        await userEvent.click(await screen.findByRole('button', { name: "Sure, the child's phone" }))
        await waitFor(() => expect(onSetRole).toHaveBeenCalledWith('student'))
        first.unmount()

        onSetRole.mockClear()
        render(make({ ...ethan, phone: '+60 12-345 6789' } as Student))
        await userEvent.click(screen.getByRole('button', { name: 'Ethan Lim themself' }))
        await waitFor(() => expect(onSetRole).toHaveBeenCalledWith('student'))
        expect(screen.queryByLabelText('Check the number')).not.toBeInTheDocument()
      })
    })

    it('shows a student tied by hand first, and can take the tie away again', async () => {
      const onLinkStudents = vi.fn().mockResolvedValue(true)
      renderPanel(makeCrm({ students: [ethan], packages }), { crm_student_ids: [1] }, vi.fn(), [], onLinkStudents)

      expect(screen.getByText('Ethan Lim')).toBeInTheDocument()
      expect(screen.getByText('Regular · 3 Months')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Not their child? Unlink' }))

      expect(onLinkStudents).toHaveBeenCalledWith([])
    })

    it('puts the HOA steps away for a parent who already has a student in a class', async () => {
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

      await userEvent.click(screen.getByRole('button', { name: 'Sign-up' }))
      const summary = screen.getByText('Enrol another child in HOA')
      expect(summary.closest('details')).not.toHaveAttribute('open')
    })

    it('keeps the HOA steps open for a lead nobody has enrolled yet', async () => {
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

      await userEvent.click(screen.getByRole('button', { name: 'Sign-up' }))
      expect(screen.getByText('Enrol steps')).toBeInTheDocument()
      expect(screen.queryByText('Enrol another child in HOA')).not.toBeInTheDocument()
    })

    it('shows the student and their number without an add-lead form, which opens on request', async () => {
      const withPhone = { ...ethan, phone: '01111940144' } as Student
      renderPanel(makeCrm({ students: [withPhone], packages }), { crm_student_ids: [1] })

      expect(screen.getByText('Ethan Lim')).toBeInTheDocument()
      expect(screen.getByText('01111940144')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Add as a new lead' })).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Also a lead? Add or find the lead' }))
      expect(screen.getByRole('heading', { name: 'Add as a new lead' })).toBeInTheDocument()
    })

    it('asks who is on a chat that has a student, and saves the answer', async () => {
      const onSetRole = vi.fn().mockResolvedValue(true)
      render(
        <DetailsPanel
          conversation={conversation({ crm_student_ids: [1] })}
          messages={[firstMessage]}
          hasOlder={false}
          crm={makeCrm({ students: [ethan], packages })}
          sourceRules={[]}
          onLoadOlder={vi.fn()}
          onLinkLead={vi.fn()}
          onLinkStudents={vi.fn()}
          role={null}
          onSetRole={onSetRole}
        />,
      )

      await userEvent.click(screen.getByRole('button', { name: 'Parent of Ethan Lim' }))

      expect(onSetRole).toHaveBeenCalledWith('parent')
    })

    it('asks who is on the chat for a lead that is not a student yet, using the child on the lead', async () => {
      const onSetRole = vi.fn().mockResolvedValue(true)
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
          onSetRole={onSetRole}
        />,
      )

      await userEvent.click(screen.getByRole('button', { name: 'Ethan themself' }))

      expect(onSetRole).toHaveBeenCalledWith('student')
    })

    it('asks who is on a new chat too, before there is any child written down', async () => {
      const onSetRole = vi.fn().mockResolvedValue(true)
      render(
        <DetailsPanel
          conversation={conversation()}
          messages={[firstMessage]}
          hasOlder={false}
          crm={makeCrm()}
          sourceRules={[]}
          onLoadOlder={vi.fn()}
          onLinkLead={vi.fn()}
          onLinkStudents={vi.fn()}
          onSetRole={onSetRole}
        />,
      )

      expect(screen.getByText('Who is on this chat?')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Parent' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'The student themself' }))
      expect(onSetRole).toHaveBeenCalledWith('student')
    })
  })

  describe('the family card', () => {
    const person = (id: number, patch: Partial<Person>): Person => ({
      id,
      kind: 'contact',
      name: null,
      phone: null,
      email: null,
      contactId: null,
      parentId: null,
      leadId: null,
      studentId: null,
      ...patch,
    })
    // The chat's contact is 3 (see conversation()).
    const family = [
      person(1, { kind: 'parent', name: 'Mei Ling', phone: '60123456789', contactId: 3, leadId: 11 }),
      person(2, { kind: 'student', name: 'Ethan', parentId: 1 }),
    ]

    function renderWithFamily(crm: WhatsAppCrm) {
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
          onOpenChat={vi.fn()}
          people={family}
          chatOfContact={() => null}
        />,
      )
    }

    it('shows the parent and the children from the family table', () => {
      renderWithFamily(makeCrm({ leads: [lead] }))

      const card = screen.getByRole('region', { name: 'Family' })
      expect(card).toHaveTextContent('Mei Ling')
      expect(card).toHaveTextContent('This chat')
      expect(card).toHaveTextContent('Ethan')
      // The age comes from the child written on the lead.
      expect(card).toHaveTextContent('9 years')
    })

    it("says first that a child's own chat is the child, and that the lead below is the parent's", () => {
      // Like Lucas (his own number) in Michelle Hew's family: the chat is the child, the lead is the mother's.
      const childFamily = [
        person(1, { kind: 'parent', name: 'Mei Ling', phone: '60127633881', contactId: 99, leadId: 11 }),
        person(2, { kind: 'student', name: 'Ethan', phone: '60123456789', contactId: 3, parentId: 1 }),
      ]
      render(
        <DetailsPanel
          conversation={conversation({ crm_lead_id: 11 })}
          messages={[firstMessage]}
          hasOlder={false}
          crm={makeCrm({ leads: [{ ...lead, fullName: null, phone: '012-763 3881' } as unknown as Lead] })}
          sourceRules={[]}
          onLoadOlder={vi.fn()}
          onLinkLead={vi.fn()}
          onLinkStudents={vi.fn()}
          onOpenChat={vi.fn()}
          people={childFamily}
          chatOfContact={() => null}
        />,
      )

      const who = screen.getByRole('region', { name: 'Whose chat this is' })
      expect(who).toHaveTextContent('This chat is the child')
      expect(who).toHaveTextContent('Ethan · +60 12-345 6789')
      // The lead's header is the parent's name (the lead has none: the family's parent), never the child's.
      expect(screen.getByText('Family lead · the parent')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Mei Ling' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: "Family lead details (the parent's)" })).toBeInTheDocument()
      // The family's part is shown, not typed over: no parent box, no child row to remove, no "Add a child".
      const familyPart = screen.getByLabelText('The family')
      expect(familyPart).toHaveTextContent('012-763 3881')
      expect(screen.queryByLabelText("Parent's phone number (not this chat's)")).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add a child' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Remove child/ })).not.toBeInTheDocument()
    })

    it("never saves the child's own name or number as the parent's, and keeps the children (Lucas, 2026-10-20)", async () => {
      const childFamily = [
        person(1, { kind: 'parent', name: 'Michelle Hew', phone: '60127633881', contactId: 99, leadId: 11 }),
        person(2, { kind: 'student', name: 'Lucas Chin Jun Hao', phone: '60123456789', contactId: 3, parentId: 1 }),
      ]
      const familyLead = {
        ...lead,
        fullName: 'Michelle Hew',
        phone: '60127633881',
        children: [{ name: 'Lucas Chin Jun Hao', age: 15, phone: '60123456789' }],
      } as Lead
      const crm = makeCrm({ leads: [familyLead] })
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
          onOpenChat={vi.fn()}
          people={childFamily}
          chatOfContact={() => null}
        />,
      )

      const familyPart = screen.getByLabelText('The family')
      expect(familyPart).toHaveTextContent('Michelle Hew')
      expect(familyPart).toHaveTextContent('Lucas Chin Jun Hao')
      expect(familyPart).toHaveTextContent('15 years')

      await userEvent.click(screen.getByRole('button', { name: "Change the parent's name or number" }))
      const name = screen.getByLabelText("Parent's name (not Lucas Chin Jun Hao)")
      await userEvent.clear(name)
      await userEvent.type(name, 'Lucas Chin Jun Hao')
      expect(await screen.findByRole('alert')).toHaveTextContent('Lucas Chin Jun Hao is this chat (the child)')
      const phoneBox = screen.getByLabelText("Parent's phone number (not this chat's)")
      await userEvent.clear(name)
      await userEvent.type(name, 'Michelle Hew')
      await userEvent.clear(phoneBox)
      await userEvent.type(phoneBox, '012-345 6789')
      expect(await screen.findByRole('alert')).toHaveTextContent("That is this chat's number")
      expect(crm.onUpdateLead).not.toHaveBeenCalledWith(11, expect.objectContaining({ fullName: 'Lucas Chin Jun Hao' }))
      expect(crm.onUpdateLead).not.toHaveBeenCalledWith(11, expect.objectContaining({ phone: '012-345 6789' }))

      // A real change of the parent's number is saved, with the children as they were.
      await userEvent.clear(phoneBox)
      await userEvent.type(phoneBox, '012-763 3882')
      await waitFor(() =>
        expect(crm.onUpdateLead).toHaveBeenLastCalledWith(
          11,
          expect.objectContaining({
            fullName: 'Michelle Hew',
            phone: '012-763 3882',
            children: [{ name: 'Lucas Chin Jun Hao', age: 15, phone: '60123456789' }],
          }),
        ),
      )
    })

    it("keeps the parent's own chat as it was", () => {
      renderWithFamily(makeCrm({ leads: [lead] }))

      expect(screen.queryByRole('region', { name: 'Whose chat this is' })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Lead details' })).toBeInTheDocument()
      expect(screen.getByLabelText('Phone number')).toBeInTheDocument()
    })

    it('folds the boxes that say who this is, and the other-chat box, once the card knows', () => {
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
          onSetRole={vi.fn()}
          onOpenChat={vi.fn()}
          otherChats={[{ id: 9, title: 'Old chat', lastActivity: 0, isDone: false }]}
          people={family}
          chatOfContact={() => null}
        />,
      )

      expect(screen.getByText('Not right? Change who this is').closest('details')).not.toBeNull()
      // The pickers are inside the folded box, not loose in the panel.
      expect(screen.getByText('Who is on this chat?').closest('details')).not.toBeNull()
      expect(screen.queryByText('This family has another chat')).not.toBeInTheDocument()
      // Children are added in one place: the lead form.
      expect(screen.getAllByRole('button', { name: /Add a child/ })).toHaveLength(1)
    })

    it('keeps the boxes in the open when the chat is not placed yet', () => {
      render(
        <DetailsPanel
          conversation={conversation()}
          messages={[firstMessage]}
          hasOlder={false}
          crm={makeCrm()}
          sourceRules={[]}
          onLoadOlder={vi.fn()}
          onLinkLead={vi.fn()}
          onLinkStudents={vi.fn()}
          onSetRole={vi.fn()}
          onOpenChat={vi.fn()}
          people={[]}
        />,
      )

      expect(screen.queryByText('Not right? Change who this is')).not.toBeInTheDocument()
      expect(screen.getByText('Who is on this chat?').closest('details')).toBeNull()
      expect(screen.getByRole('button', { name: /Add a child/ })).toBeInTheDocument()
    })

    it('shows nothing when the chat is not in the family table', () => {
      render(
        <DetailsPanel
          conversation={conversation()}
          messages={[firstMessage]}
          hasOlder={false}
          crm={makeCrm()}
          sourceRules={[]}
          onLoadOlder={vi.fn()}
          onLinkLead={vi.fn()}
          onLinkStudents={vi.fn()}
          onOpenChat={vi.fn()}
          people={[]}
        />,
      )

      expect(screen.queryByRole('region', { name: 'Family' })).not.toBeInTheDocument()
    })
  })

  describe('when the student is the one writing', () => {
    const ethan = { id: 1, name: 'Ethan Lim', phone: null, studentType: 'regular', packageId: 2, isActive: true } as Student
    const packages = [{ id: 2, name: '3 Months', kind: 'regular' } as Package]

    function renderTied(role: 'student' | 'parent') {
      render(
        <DetailsPanel
          conversation={conversation({ crm_lead_id: 11 })}
          messages={[firstMessage]}
          hasOlder={false}
          crm={makeCrm({ leads: [{ ...lead, convertedStudentId: 1 }], students: [ethan], packages })}
          sourceRules={[]}
          onLoadOlder={vi.fn()}
          onLinkLead={vi.fn()}
          onLinkStudents={vi.fn()}
          onWriteMessage={vi.fn()}
          role={role}
          onSetRole={vi.fn()}
        />,
      )
    }

    it('does not offer to link another child, and does not call the sign-up "another child"', async () => {
      renderTied('student')
      await userEvent.click(screen.getByRole('button', { name: 'Sign-up' }))

      expect(screen.queryByRole('button', { name: 'Link another child' })).not.toBeInTheDocument()
      expect(screen.queryByText(/Enrol another child/)).not.toBeInTheDocument()
      expect(screen.getByText('Sign up for another HOA class')).toBeInTheDocument()
    })

    it('says in the header that the student is the one writing, and what the parent still has to give', () => {
      renderTied('student')

      expect(screen.getByText('Lead · the student themself')).toBeInTheDocument()
      // The lead has a name (Mei Ling) but only one number, which is the student's own.
      expect(screen.getByRole('note')).toHaveTextContent("The parent's number is not saved yet.")
      expect(screen.getByRole('note')).toHaveTextContent('Payment and the registration form need the parent.')
    })

    it('does not remind about the parent when the chat is a parent chat', () => {
      renderTied('parent')

      expect(screen.queryByRole('note')).not.toBeInTheDocument()
      expect(screen.queryByText('Lead · the student themself')).not.toBeInTheDocument()
    })

    it('still offers both to a parent', async () => {
      renderTied('parent')

      expect(screen.getByRole('button', { name: 'Link another child' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Sign-up' }))
      expect(screen.getByText('Enrol another child in HOA')).toBeInTheDocument()
    })

    function renderStudentPanel(crm: WhatsAppCrm, attributes: ChatwootConversation['custom_attributes'] = {}) {
      render(
        <DetailsPanel
          conversation={conversation(attributes)}
          messages={[firstMessage]}
          hasOlder={false}
          crm={crm}
          sourceRules={[]}
          onLoadOlder={vi.fn()}
          onLinkLead={vi.fn().mockResolvedValue(true)}
          onLinkStudents={vi.fn()}
          role="student"
          onSetRole={vi.fn()}
        />,
      )
    }

    it('asks for the student\'s own details instead of the parent\'s and the children', () => {
      renderStudentPanel(makeCrm())

      expect(screen.getByLabelText('Student name')).toBeInTheDocument()
      expect(screen.getByLabelText('Student age')).toBeInTheDocument()
      expect(screen.getByLabelText("Student's phone number")).toHaveValue('+60123456789')
      expect(screen.getByLabelText(/Contact name/)).toBeInTheDocument()
      expect(screen.getByLabelText(/Parent's phone number/)).toHaveValue('')
      expect(screen.queryByRole('button', { name: 'Add a child' })).not.toBeInTheDocument()
      expect(screen.getByText('Is this a student we already have? Find them')).toBeInTheDocument()
    })

    it('saves the student as the child, with their own number, and no parent yet', async () => {
      const crm = makeCrm()
      renderStudentPanel(crm)

      await userEvent.type(screen.getByLabelText('Student name'), 'Ethan')
      await userEvent.selectOptions(screen.getByLabelText('Student age'), '12')
      await userEvent.click(screen.getByRole('button', { name: 'Save lead' }))

      await waitFor(() =>
        expect(crm.onCreateLead).toHaveBeenCalledWith(
          expect.objectContaining({
            fullName: '',
            phone: '+60123456789',
            children: [{ name: 'Ethan', age: 12, phone: '+60123456789' }],
          }),
        ),
      )
    })

    it('keeps the student\'s number on the child when the parent\'s number is added, and the lead takes the parent\'s', async () => {
      const crm = makeCrm()
      renderStudentPanel(crm)

      await userEvent.type(screen.getByLabelText('Student name'), 'Ethan')
      await userEvent.selectOptions(screen.getByLabelText('Student age'), '12')
      await userEvent.type(screen.getByLabelText(/Parent's phone number/), '0198887777')
      await userEvent.click(screen.getByRole('button', { name: 'Save lead' }))

      await waitFor(() =>
        expect(crm.onCreateLead).toHaveBeenCalledWith(
          expect.objectContaining({
            phone: '0198887777',
            children: [{ name: 'Ethan', age: 12, phone: '+60123456789' }],
          }),
        ),
      )
    })

    it('shows a lead that holds a student and a parent number in the right boxes', () => {
      const both = {
        ...lead,
        fullName: 'Mei Ling',
        phone: '0198887777',
        children: [{ name: 'Ethan', age: 12, phone: '0123456789' }],
      } as Lead
      renderStudentPanel(makeCrm({ leads: [both] }), { crm_lead_id: 11 })

      expect(screen.getByLabelText('Student name')).toHaveValue('Ethan')
      expect(screen.getByLabelText("Student's phone number")).toHaveValue('0123456789')
      expect(screen.getByLabelText(/Contact name/)).toHaveValue('Mei Ling')
      expect(screen.getByLabelText(/Parent's phone number/)).toHaveValue('0198887777')
    })
  })
})

describe('a chat whose number WhatsApp hides', () => {
  const hidden = (name: string, attributes: ChatwootConversation['custom_attributes'] = {}): ChatwootConversation => ({
    ...conversation(attributes),
    meta: { sender: { id: 3, name, phone_number: null, identifier: null } },
  })

  function renderHidden(crm: WhatsAppCrm, chat: ChatwootConversation) {
    render(
      <DetailsPanel
        conversation={chat}
        messages={[firstMessage]}
        hasOlder={false}
        crm={crm}
        sourceRules={[]}
        onLoadOlder={vi.fn()}
        onLinkLead={vi.fn().mockResolvedValue(true)}
        onLinkStudents={vi.fn().mockResolvedValue(true)}
      />,
    )
  }

  it('writes the name the chat shows as the parent name of a new lead', () => {
    renderHidden(makeCrm(), hidden('jasmineooi'))
    expect(screen.getByLabelText('Contact name')).toHaveValue('jasmineooi')
  })

  it('leaves the parent name empty when the chat has a real number, or only digits for a name', () => {
    renderHidden(makeCrm(), conversation())
    expect(screen.getByLabelText('Contact name')).toHaveValue('')
  })

  it('does not copy a name that is only digits', () => {
    renderHidden(makeCrm(), hidden('+60 12 345 6789'))
    expect(screen.getByLabelText('Contact name')).toHaveValue('')
  })

  it('fills and saves the name of a lead that has none', async () => {
    const crm = makeCrm({ leads: [{ ...lead, fullName: null, phone: null } as unknown as Lead] })
    renderHidden(crm, hidden('jasmineooi', { crm_lead_id: 11 }))

    expect(screen.getByLabelText('Contact name')).toHaveValue('jasmineooi')
    await waitFor(() =>
      expect(crm.onUpdateLead).toHaveBeenCalledWith(11, expect.objectContaining({ fullName: 'jasmineooi' })),
    )
  })

  it('keeps the name a lead already has', async () => {
    const crm = makeCrm({ leads: [{ ...lead, fullName: 'Mrs Ooi', phone: null } as Lead] })
    renderHidden(crm, hidden('jasmineooi', { crm_lead_id: 11 }))

    expect(screen.getByLabelText('Contact name')).toHaveValue('Mrs Ooi')
    expect(crm.onUpdateLead).not.toHaveBeenCalled()
  })

  it('lets a second child be added to a lead that has one', async () => {
    const crm = makeCrm({ leads: [{ ...lead, fullName: 'Mrs Ooi', phone: null } as Lead] })
    renderHidden(crm, hidden('jasmineooi', { crm_lead_id: 11 }))

    await userEvent.click(screen.getByRole('button', { name: 'Add a child' }))
    expect(screen.getByLabelText('Child 2 age')).toBeInTheDocument()
  })
})

describe('DetailsPanel programmes', () => {
  const programme = (id: number, name: string, patch: Partial<Programme> = {}): Programme => ({
    id,
    name,
    legacyKey: null,
    outcome: 'booking',
    messageTemplate: '',
    isActive: true,
    sortOrder: id * 10,
    steps: [],
    ...patch,
  })

  const room = (id: number, name: string, ageGroup: string, subjectId: number | null, programmeId: number | null) =>
    ({ id, name, ageGroup, subjectId, programmeId, status: 'active', category: 'regular', programLevel: '常规班', teacherId: null, notes: null, archivedAt: null }) as Classroom

  function renderEnrol(programmes: Programme[], classrooms: Classroom[] = []) {
    render(
      <DetailsPanel
        conversation={conversation({ crm_lead_id: 11 })}
        messages={[firstMessage]}
        hasOlder={false}
        crm={makeCrm({
          leads: [lead],
          programmes,
          classrooms,
          subjects: [
            { id: 1, name: 'MM', sortOrder: 10 },
            { id: 2, name: 'SCI', sortOrder: 20 },
          ],
        })}
        sourceRules={[]}
        onLoadOlder={vi.fn()}
        onLinkLead={vi.fn()}
        onLinkStudents={vi.fn()}
        onWriteMessage={vi.fn()}
      />,
    )
  }

  it('shows each flow under its own name, and lists the classes of the flow that was picked', async () => {
    renderEnrol(
      [programme(5, 'Regular sign-up'), programme(6, 'Exam class sign-up')],
      [room(31, 'MM Form 1', 'Form 1', 1, 5), room(32, 'SCI Form 1', 'Form 1', 2, 5), room(33, 'MM Form 2 exam', 'Form 2', 1, 6)],
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sign-up' }))

    expect(screen.queryByRole('button', { name: 'A class' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'HOA class' })).not.toBeInTheDocument()
    // The first flow is open: only its classes.
    expect(screen.getByRole('button', { name: 'MM Form 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'SCI Form 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'MM Form 2 exam' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'SCI Form 1' }))
    expect(screen.getByText('Steps of Regular sign-up')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Exam class sign-up' }))
    expect(screen.queryByText(/Steps of/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'MM Form 2 exam' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'SCI Form 1' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'MM Form 2 exam' }))
    expect(screen.getByText('Steps of Exam class sign-up')).toBeInTheDocument()
  })

  it('offers only flows that are on and have a class', async () => {
    renderEnrol(
      [programme(5, 'Regular sign-up'), programme(7, 'Old course', { isActive: false }), programme(8, 'Empty flow')],
      [room(31, 'MM Form 1', 'Form 1', 1, 5), room(34, 'Old class', 'Form 1', 1, 7)],
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sign-up' }))
    // One flow is left, so there is nothing to switch between and its class is listed.
    expect(screen.queryByRole('group', { name: 'What are they signing up for' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'MM Form 1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Old class' })).not.toBeInTheDocument()
  })

  it('groups flows that have a Category: pick the category, then the flow', async () => {
    renderEnrol(
      [
        programme(1, 'HOA class', { legacyKey: 'hoa' }),
        programme(5, 'Regular Class'),
        programme(6, 'Form 4 exam', { category: 'Exam' }),
        programme(7, 'Form 5 exam', { category: 'Exam' }),
      ],
      [room(31, 'MM Form 1', 'Form 1', 1, 5), room(33, 'MM Form 4', 'Form 4', 1, 6), room(35, 'MM Form 5', 'Form 5', 1, 7)],
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sign-up' }))

    // HOA, Regular Class and the Exam category sit side by side.
    expect(screen.getByRole('button', { name: 'HOA class' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Regular Class' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Form 5 exam' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Exam/ }))
    expect(screen.getByRole('button', { name: 'Form 4 exam' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Form 5 exam' }))
    await userEvent.click(screen.getByRole('button', { name: 'MM Form 5' }))
    expect(screen.getByText('Steps of Form 5 exam')).toBeInTheDocument()
  })

  it("keeps Mirai's HOA class on its own screen", async () => {
    renderEnrol([programme(1, 'HOA class', { legacyKey: 'hoa' })])
    await userEvent.click(screen.getByRole('button', { name: 'Sign-up' }))

    expect(screen.getByText('Enrol steps')).toBeInTheDocument()
    expect(screen.queryByText(/Steps of/)).not.toBeInTheDocument()
  })

  it('offers the HOA class next to the flows of the school', async () => {
    renderEnrol([programme(1, 'HOA class', { legacyKey: 'hoa' }), programme(5, 'Regular sign-up')], [room(31, 'MM Form 1', 'Form 1', 1, 5)])
    await userEvent.click(screen.getByRole('button', { name: 'Sign-up' }))
    await userEvent.click(screen.getByRole('button', { name: 'Regular sign-up' }))
    expect(screen.getByRole('button', { name: 'MM Form 1' })).toBeInTheDocument()
  })

  it('says there is nothing to sign up for when no class has a flow', async () => {
    renderEnrol([programme(5, 'Regular sign-up')])
    await userEvent.click(screen.getByRole('button', { name: 'Sign-up' }))

    expect(screen.getByText(/Nothing to sign up for yet/)).toBeInTheDocument()
    expect(screen.queryByText('Enrol steps')).not.toBeInTheDocument()
  })

  it('has icons for Contact and Sign-up for a lead, and Chat notes only when there is something in them', async () => {
    const crm = makeCrm({ leads: [lead] })
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
        starredMessages={[{ id: 3, text: 'Fee is RM300', at: 1_800_000_000 }]}
      />,
    )

    const rail = screen.getByRole('navigation', { name: 'Panel sections' })
    expect(within(rail).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Contact', 'Sign-up', 'Chat notes'])
    // The contact part is on show first; the starred message is on its own icon.
    expect(screen.queryByText('Fee is RM300')).not.toBeInTheDocument()
    await userEvent.click(within(rail).getByRole('button', { name: 'Chat notes' }))
    expect(screen.getByText('Fee is RM300')).toBeInTheDocument()
  })
})

describe('DetailsPanel optional lead fields', () => {
  it('shows the Chinese name and the second phone of the lead, filled in', () => {
    renderPanel(makeCrm({ leads: [{ ...lead, nameZh: '美玲', secondParentPhone: '0123450099' } as Lead] }), { crm_lead_id: 11 })

    expect(screen.getByLabelText('Chinese name (optional)')).toHaveValue('美玲')
    expect(screen.getByLabelText("Another parent's phone (optional)")).toHaveValue('0123450099')
  })

  it('saves them with the lead', async () => {
    const crm = makeCrm({ leads: [lead] })
    renderPanel(crm, { crm_lead_id: 11 })

    await userEvent.type(screen.getByLabelText("Another parent's phone (optional)"), '0123450099')

    await waitFor(() =>
      expect(crm.onUpdateLead).toHaveBeenLastCalledWith(11, expect.objectContaining({ secondParentPhone: '0123450099', nameZh: '' })),
    )
  })
})
