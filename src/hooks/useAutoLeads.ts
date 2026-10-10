import { useEffect, useRef, useState } from 'react'
import { autoLeadFor, AUTO_LEADS_FROM } from '../lib/autoLead'
import type { ChatwootClient } from '../lib/chatwootClient'
import { canonicalPhone } from '../lib/chatLink'
import type { SourceRule } from '../lib/sourceRules'
import { getLinkedLeadId, getRealPhone, type ChatwootConversation, type ChatwootMessage } from '../lib/whatsappInbox'
import type { LeadFormValues, WhatsAppCrm } from '../components/whatsapp/crm'

type Args = {
  enabled: boolean
  client: Pick<ChatwootClient, 'listMessages' | 'getConversation'>
  conversations: ChatwootConversation[]
  crm: Pick<WhatsAppCrm, 'leads' | 'students' | 'leadOptions' | 'canEditLeads' | 'onCreateLead'>
  rules: SourceRule[]
  // The leads, the students and the rules have all been loaded, so "not a lead yet" can be trusted.
  ready: boolean
  hasLead: (conversation: ChatwootConversation) => boolean
  hasStudents: (conversation: ChatwootConversation) => boolean
  linkLead: (conversationId: number, leadId: number) => Promise<boolean>
}

const PAGE = 20
const MAX_PAGES = 6

// Every message of a chat, oldest first, or null when the chat is longer than is worth reading.
async function readWholeChat(client: Args['client'], conversationId: number): Promise<ChatwootMessage[] | null> {
  const all = new Map<number, ChatwootMessage>()
  let before: number | undefined
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await client.listMessages(conversationId, before)
    rows.forEach((row) => all.set(row.id, row))
    if (rows.length < PAGE) {
      return [...all.values()].sort((a, b) => a.created_at - b.created_at)
    }
    before = Math.min(...rows.map((row) => row.id))
  }
  return null
}

// Turns a new chat into a lead as soon as its first message matches a source rule, so nobody has to
// press "Save lead". It runs for whoever has the inbox open, one chat at a time, and each chat once.
export function useAutoLeads({ enabled, client, conversations, crm, rules, ready, hasLead, hasStudents, linkLead }: Args) {
  const seen = useRef(new Set<number>())
  const busy = useRef(false)
  const [round, setRound] = useState(0)
  const latest = useRef({ crm, rules })
  useEffect(() => {
    latest.current = { crm, rules }
  })

  useEffect(() => {
    if (!enabled || !ready || busy.current || !crm.canEditLeads) {
      return
    }
    const next = conversations.find((conversation) => {
      if (seen.current.has(conversation.id) || conversation.status === 'resolved') {
        return false
      }
      if (conversation.last_activity_at < AUTO_LEADS_FROM || !getRealPhone(conversation.meta.sender.phone_number)) {
        return false
      }
      return getLinkedLeadId(conversation) === null && !hasLead(conversation) && !hasStudents(conversation)
    })
    if (!next) {
      return
    }
    seen.current.add(next.id)
    busy.current = true
    void (async () => {
      try {
        const messages = await readWholeChat(client, next.id)
        const found = messages ? autoLeadFor(messages, latest.current.crm.leadOptions, latest.current.rules) : null
        const phone = canonicalPhone(next.meta.sender.phone_number)
        if (!found || !phone) {
          return
        }
        // Another computer may have done it a moment ago.
        const fresh = await client.getConversation(next.id)
        if (getLinkedLeadId(fresh) !== null) {
          return
        }
        const other = latest.current.crm.leadOptions.find((option) => option.kind === 'source' && option.legacyKey === 'other')
        const values: LeadFormValues = {
          fullName: '',
          phone: `+${phone}`,
          state: '',
          sourceId: (found.guess.source ?? other)?.id ?? null,
          picId: null,
          tagIds: found.guess.tags.map((tag) => tag.id),
          status: 'new',
          children: [],
          notes: `Added by itself from the first WhatsApp message (source keyword: "${found.rule}").`,
        }
        const created = await latest.current.crm.onCreateLead(values)
        if (created.leadId !== null) {
          await linkLead(next.id, created.leadId)
        }
      } catch {
        // Nothing was lost: the chat still shows the normal "Add as a new lead" form.
      } finally {
        busy.current = false
        setRound((value) => value + 1)
      }
    })()
    // `round` runs this again for the next chat once this one is done.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ready, conversations, crm.canEditLeads, round])
}
