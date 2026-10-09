import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Lead, LeadOption, Package, Student, TrialBooking } from '../../types/domain'
import type { ChatwootConversation, ChatwootMessage } from '../../lib/whatsappInbox'
import type { SourceRule } from '../../lib/sourceRules'
import type { WhatsAppCrm } from './crm'
import { DetailsPanel } from './DetailsPanel'

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
    leadOptions: [option(1, 'source', 'Facebook'), option(2, 'source', 'Other', 'other')],
    canEditLeads: true,
    canEditStudents: true,
    canBookMakeup: true,
    onCreateLead: vi.fn().mockResolvedValue({ leadId: 55, error: null }),
    onUpdateLead: vi.fn().mockResolvedValue(null),
    trialDateFor: () => null,
    onAddFollowUp: vi.fn().mockResolvedValue(null),
    onAddOption: vi.fn().mockResolvedValue(null),
    onRecordLeave: vi.fn().mockResolvedValue(null),
    onOpenLead: vi.fn(),
    leadIdsWithForms: new Set<number>(),
    onOpenFormAnswers: vi.fn(),
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
) {
  render(
    <DetailsPanel
      conversation={conversation(attributes)}
      messages={[firstMessage]}
      hasOlder={false}
      crm={crm}
      sourceRules={rules}
      onLoadOlder={vi.fn()}
      onSavePhone={vi.fn()}
      onLinkLead={onLinkLead}
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
        onSavePhone={vi.fn()}
        onLinkLead={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /How they first contacted you/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Make a rule from this message' }))
    expect(onManageRules).toHaveBeenCalledWith('Hi, I saw your Facebook ad')
  })

  it('saves the lead and ties the chat to it', async () => {
    const crm = makeCrm()
    const onLinkLead = renderPanel(crm)

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

  it('opens the form answers from the source of a lead that filled in a form', async () => {
    const crm = makeCrm({ leads: [lead], leadIdsWithForms: new Set([11]) })
    renderPanel(crm, { crm_lead_id: 11 })

    await userEvent.click(screen.getByRole('button', { name: 'Read their form answers' }))
    expect(crm.onOpenFormAnswers).toHaveBeenCalledWith(11)
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

  it('saves changes to the lead, says Saved, and the form stays as it is', async () => {
    const crm = makeCrm({ leads: [lead] })
    renderPanel(crm, { crm_lead_id: 11 })

    await userEvent.selectOptions(screen.getByLabelText('State'), 'Pulau Pinang')
    await userEvent.selectOptions(screen.getByLabelText('Stage'), 'trial_scheduled')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
    expect(crm.onUpdateLead).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ state: 'Pulau Pinang', status: 'trial_scheduled', fullName: 'Mei Ling' }),
    )
    expect(screen.getByLabelText('State')).toHaveValue('Pulau Pinang')
    expect(screen.getByLabelText('Stage')).toHaveValue('trial_scheduled')
  })

  it('shows why a save failed and does not say Saved', async () => {
    const crm = makeCrm({ leads: [lead], onUpdateLead: vi.fn().mockResolvedValue('Failed to save lead record.') })
    renderPanel(crm, { crm_lead_id: 11 })

    await userEvent.type(screen.getByLabelText('Notes'), 'x')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to save lead record.')
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
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
        onSavePhone={vi.fn()}
        onLinkLead={vi.fn()}
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
        onSavePhone={vi.fn()}
        onLinkLead={vi.fn()}
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
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByRole('alert')).toHaveTextContent("Add the child's age too.")
    expect(crm.onUpdateLead).not.toHaveBeenCalled()
  })

  it('shows the lead but cannot change it without edit permission', () => {
    renderPanel(makeCrm({ leads: [lead], canEditLeads: false }), { crm_lead_id: 11 })

    expect(screen.getByLabelText('Parent name')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('logs a follow-up on the linked lead', async () => {
    const crm = makeCrm({ leads: [lead] })
    renderPanel(crm, { crm_lead_id: 11 })

    await userEvent.type(screen.getByLabelText('Follow-up note'), 'Called, will decide Friday')
    await userEvent.click(screen.getByRole('button', { name: 'Log follow-up' }))

    expect(crm.onAddFollowUp).toHaveBeenCalledWith(11, 'Called, will decide Friday')
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
        onSavePhone={vi.fn()}
        onLinkLead={vi.fn()}
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

})
