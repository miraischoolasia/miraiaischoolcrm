import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Lead, LeadOption } from '../../types/domain'
import type { ChatwootConversation, ChatwootMessage } from '../../lib/whatsappInbox'
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
    leadOptions: [option(1, 'source', 'Facebook'), option(2, 'source', 'Other', 'other')],
    canEditLeads: true,
    canEditStudents: true,
    canBookMakeup: true,
    onCreateLead: vi.fn().mockResolvedValue({ leadId: 55, error: null }),
    onChangeLeadStatus: vi.fn().mockResolvedValue(undefined),
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

function renderPanel(crm: WhatsAppCrm, attributes?: ChatwootConversation['custom_attributes'], onLinkLead = vi.fn().mockResolvedValue(true)) {
  render(
    <DetailsPanel
      conversation={conversation(attributes)}
      messages={[firstMessage]}
      hasOlder={false}
      crm={crm}
      onLoadOlder={vi.fn()}
      onSavePhone={vi.fn()}
      onLinkLead={onLinkLead}
    />,
  )
  return onLinkLead
}

describe('DetailsPanel', () => {
  it('shows the first message and the add-lead form for a parent who is not a lead', () => {
    renderPanel(makeCrm())

    expect(screen.getByText('Hi, I saw your Facebook ad')).toBeInTheDocument()
    expect(screen.getByText('Looks like it came from: Facebook.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add as a new lead' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Where did they find us/)).toHaveValue('1')
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

    await userEvent.click(screen.getByRole('button', { name: 'Facebook' }))
    expect(crm.onOpenFormAnswers).toHaveBeenCalledWith(11)
  })

  it('shows the linked lead and changes its stage', async () => {
    const crm = makeCrm({ leads: [lead] })
    renderPanel(crm, { crm_lead_id: 11 })

    expect(screen.queryByText('Add as a new lead')).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Stage'), 'trial_scheduled')
    expect(crm.onChangeLeadStatus).toHaveBeenCalledWith(11, 'trial_scheduled')
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
})
