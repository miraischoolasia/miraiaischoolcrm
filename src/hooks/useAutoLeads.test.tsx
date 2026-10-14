import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AUTO_LEADS_FROM } from '../lib/autoLead'
import type { SourceRule } from '../lib/sourceRules'
import type { ChatwootConversation, ChatwootMessage } from '../lib/whatsappInbox'
import type { LeadOption } from '../types/domain'
import { useAutoLeads } from './useAutoLeads'

const NOW = AUTO_LEADS_FROM + 600

const options: LeadOption[] = [
  { id: 1, kind: 'source', label: 'Facebook', isActive: true, legacyKey: null, color: null },
  { id: 9, kind: 'source', label: 'Other', isActive: true, legacyKey: 'other', color: null },
  { id: 2, kind: 'tag', label: 'Free HOA', isActive: true, legacyKey: null, color: null },
]
const rules: SourceRule[] = [{ id: 1, phrase: 'free trial coding', sourceId: 1, tagIds: [2], isActive: true }]

const chat = (
  id: number,
  phone: string | null,
  attributes: ChatwootConversation['custom_attributes'] = null,
  name: string | null = null,
): ChatwootConversation => ({
  id,
  status: 'open',
  unread_count: 1,
  waiting_since: 0,
  timestamp: NOW,
  last_activity_at: NOW,
  custom_attributes: attributes,
  meta: { sender: { id, name, phone_number: phone, identifier: null } },
})

const said = (text: string): ChatwootMessage => ({
  id: 1,
  content: text,
  message_type: 0,
  created_at: NOW - 60,
  private: false,
  status: 'sent',
})

function setup(
  overrides: {
    text?: string
    ready?: boolean
    conversations?: ChatwootConversation[]
    hasLead?: boolean
    created?: { leadId: number | null; error: string | null; existingLeadId?: number }
  } = {},
) {
  const client = {
    listMessages: vi.fn(async () => [said(overrides.text ?? 'I saw the free trial coding advert')]),
    getConversation: vi.fn(async (id: number) => chat(id, '+60123456789')),
  }
  const onCreateLead = vi.fn(async (_values: unknown) => overrides.created ?? { leadId: 77, error: null })
  const linkLead = vi.fn(async () => true)
  const view = renderHook(() =>
    useAutoLeads({
      enabled: true,
      client,
      conversations: overrides.conversations ?? [chat(5, '+60123456789')],
      crm: { leads: [], students: [], leadOptions: options, canEditLeads: true, onCreateLead },
      rules,
      ready: overrides.ready ?? true,
      hasLead: () => overrides.hasLead ?? false,
      hasStudents: () => false,
      linkLead,
      now: () => NOW,
    }),
  )
  return { client, onCreateLead, linkLead, view }
}

describe('useAutoLeads', () => {
  it('saves the lead and ties the chat to it when the first message matches a rule', async () => {
    const { onCreateLead, linkLead } = setup()

    await waitFor(() => expect(linkLead).toHaveBeenCalledWith(5, 77))
    expect(onCreateLead).toHaveBeenCalledTimes(1)
    expect(onCreateLead).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+60123456789', sourceId: 1, tagIds: [2], status: 'new', children: [] }),
    )
  })

  it('remembers which rule the lead came in with', async () => {
    const { onCreateLead } = setup()
    await waitFor(() => expect(onCreateLead).toHaveBeenCalledTimes(1))
    expect(onCreateLead).toHaveBeenCalledWith(expect.objectContaining({ sourceRuleId: 1 }))
  })

  it('does not make a lead when no rule matches', async () => {
    const { client, onCreateLead } = setup({ text: 'How much are the classes?' })

    await waitFor(() => expect(client.listMessages).toHaveBeenCalled())
    expect(onCreateLead).not.toHaveBeenCalled()
  })

  it('never makes a lead of a Messenger chat', async () => {
    const messenger = chat(9, null, null, 'Mei Lin')
    messenger.meta.channel = 'Channel::FacebookPage'
    const { client, onCreateLead } = setup({ conversations: [messenger] })

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(client.listMessages).not.toHaveBeenCalled()
    expect(onCreateLead).not.toHaveBeenCalled()
  })

  it('never makes a lead of a WhatsApp group', async () => {
    const group = chat(8, null, null, 'Mirai Parents (GROUP)')
    group.meta.sender.identifier = '120363000000000000@g.us'
    const { client, onCreateLead } = setup({ conversations: [group] })

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(client.listMessages).not.toHaveBeenCalled()
    expect(onCreateLead).not.toHaveBeenCalled()
  })

  it('waits until the leads, students and rules are loaded', async () => {
    const { client, onCreateLead } = setup({ ready: false })

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(client.listMessages).not.toHaveBeenCalled()
    expect(onCreateLead).not.toHaveBeenCalled()
  })

  it('leaves a chat that already has a lead, or whose number WhatsApp hides', async () => {
    const { client, onCreateLead } = setup({ hasLead: true, conversations: [chat(5, '+60123456789'), chat(6, '+198765432109876')] })

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(client.listMessages).not.toHaveBeenCalled()
    expect(onCreateLead).not.toHaveBeenCalled()
  })

  it('makes a lead of a chat whose number WhatsApp hides, using the username as the parent name', async () => {
    const { onCreateLead, linkLead } = setup({ conversations: [chat(6, null, null, 'jasmineooi')] })

    await waitFor(() => expect(linkLead).toHaveBeenCalledWith(6, 77))
    expect(onCreateLead).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'jasmineooi', phone: '', sourceId: 1, tagIds: [2], children: [] }),
    )
  })

  it('leaves a chat with no number and no name, or a name that is only a number', async () => {
    const { client, onCreateLead } = setup({
      conversations: [chat(6, null, null, null), chat(7, null, null, '+60 12 345 6789')],
    })

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(client.listMessages).not.toHaveBeenCalled()
    expect(onCreateLead).not.toHaveBeenCalled()
  })

  it('does not make a lead for a username chat that no rule matches', async () => {
    const { client, onCreateLead } = setup({
      text: 'How much are the classes?',
      conversations: [chat(6, null, null, 'jasmineooi')],
    })

    await waitFor(() => expect(client.listMessages).toHaveBeenCalled())
    expect(onCreateLead).not.toHaveBeenCalled()
  })

  it('leaves an old username chat alone: it is a family the school already knows', async () => {
    const old = { ...chat(6, null, null, 'jasmineooi'), last_activity_at: NOW - 30 * 24 * 60 * 60 }
    const { client, onCreateLead } = setup({ conversations: [old] })

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(client.listMessages).not.toHaveBeenCalled()
    expect(onCreateLead).not.toHaveBeenCalled()
  })

  it('ties the chat to the lead a form made a moment ago instead of making a second one', async () => {
    const { linkLead } = setup({ created: { leadId: null, error: 'This number already belongs to a lead.', existingLeadId: 12 } })

    await waitFor(() => expect(linkLead).toHaveBeenCalledWith(5, 12))
  })

  it('does not make a second lead when the chat was tied to one a moment ago', async () => {
    const { client, onCreateLead } = setup()
    client.getConversation.mockResolvedValue(chat(5, '+60123456789', { crm_lead_id: 12 }))

    await waitFor(() => expect(client.getConversation).toHaveBeenCalled())
    expect(onCreateLead).not.toHaveBeenCalled()
  })
})
