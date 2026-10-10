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

const chat = (id: number, phone: string, attributes: ChatwootConversation['custom_attributes'] = null): ChatwootConversation => ({
  id,
  status: 'open',
  unread_count: 1,
  waiting_since: 0,
  timestamp: NOW,
  last_activity_at: NOW,
  custom_attributes: attributes,
  meta: { sender: { id, name: null, phone_number: phone, identifier: null } },
})

const said = (text: string): ChatwootMessage => ({
  id: 1,
  content: text,
  message_type: 0,
  created_at: NOW - 60,
  private: false,
  status: 'sent',
})

function setup(overrides: { text?: string; ready?: boolean; conversations?: ChatwootConversation[]; hasLead?: boolean } = {}) {
  const client = {
    listMessages: vi.fn(async () => [said(overrides.text ?? 'I saw the free trial coding advert')]),
    getConversation: vi.fn(async (id: number) => chat(id, '+60123456789')),
  }
  const onCreateLead = vi.fn(async () => ({ leadId: 77, error: null }))
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

  it('does not make a lead when no rule matches', async () => {
    const { client, onCreateLead } = setup({ text: 'How much are the classes?' })

    await waitFor(() => expect(client.listMessages).toHaveBeenCalled())
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

  it('does not make a second lead when the chat was tied to one a moment ago', async () => {
    const { client, onCreateLead } = setup()
    client.getConversation.mockResolvedValue(chat(5, '+60123456789', { crm_lead_id: 12 }))

    await waitFor(() => expect(client.getConversation).toHaveBeenCalled())
    expect(onCreateLead).not.toHaveBeenCalled()
  })
})
