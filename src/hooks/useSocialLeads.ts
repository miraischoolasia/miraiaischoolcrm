import { useEffect, useRef, useState } from 'react'
import { ensureLeadChannels, type ChatForChannel, type LeadChannel } from '../lib/leadChannels'
import {
  getLinkedLeadId,
  isGroupChat,
  socialKindOf,
  type ChatwootConversation,
} from '../lib/whatsappInbox'

type Args = {
  enabled: boolean
  // Whoever may change leads; the database refuses anyone else.
  canEdit: boolean
  conversations: ChatwootConversation[]
  // The chats each lead already has, from the database.
  channels: LeadChannel[]
  inboxNameOf: (inboxId: number) => string | null
  // Ties the chat to its lead on the chat itself (crm_lead_id), so the panel and the list find it.
  linkLead: (conversationId: number, leadId: number) => Promise<boolean>
  leadExists: (leadId: number) => boolean
  // Read the channels again after the database was told something.
  onChanged: () => void
}

const BATCH = 40

function chatOf(conversation: ChatwootConversation, inboxNameOf: Args['inboxNameOf']): ChatForChannel {
  const sender = conversation.meta.sender
  const kind = socialKindOf(conversation.meta.channel, sender) ?? 'whatsapp'
  const last = conversation.last_non_activity_message
  const page = sender.additional_attributes?.ghl_page_name
  return {
    channel: kind,
    contactId: sender.id,
    conversationId: conversation.id,
    inboxId: conversation.inbox_id ?? 0,
    inboxName: conversation.inbox_id === undefined ? null : inboxNameOf(conversation.inbox_id),
    name: sender.name,
    phone: sender.phone_number,
    pageName: typeof page === 'string' ? page : null,
    at: new Date(conversation.last_activity_at * 1000).toISOString(),
    // What the person wrote last: enough to match an advert's keyword for the source.
    text: last && last.message_type === 0 ? (last.content ?? null) : null,
  }
}

// Keeps the chats and the leads in step from the inbox of whoever has it open:
//  * a Messenger / Instagram chat that no lead has yet gets one (this is also the backfill of the chats
//    that were there before leads were made from them), and every chat is listed on its lead;
//  * a Messenger / Instagram chat is tied to its lead on the chat itself, so the side panel finds it.
// The chat-activity webhook does the same for new messages; this covers the older ones and any it missed.
export function useSocialLeads({
  enabled,
  canEdit,
  conversations,
  channels,
  inboxNameOf,
  linkLead,
  leadExists,
  onChanged,
}: Args) {
  const asked = useRef(new Set<string>())
  const stamped = useRef(new Map<number, number>())
  const busy = useRef(false)
  // Bumped when a batch is done, so the next batch of unknown chats is taken.
  const [round, setRound] = useState(0)

  // Chats the database does not know yet.
  useEffect(() => {
    if (!enabled || !canEdit || busy.current) {
      return
    }
    const known = new Set(channels.map((row) => `${row.contactId}:${row.inboxId}`))
    const pending: ChatForChannel[] = []
    for (const conversation of conversations) {
      const sender = conversation.meta.sender
      if (isGroupChat(sender) || typeof sender.id !== 'number') {
        continue
      }
      const key = `${sender.id}:${conversation.inbox_id ?? 0}`
      if (known.has(key) || asked.current.has(key)) {
        continue
      }
      pending.push(chatOf(conversation, inboxNameOf))
      if (pending.length >= BATCH) {
        break
      }
    }
    if (pending.length === 0) {
      return
    }
    pending.forEach((chat) => asked.current.add(`${chat.contactId}:${chat.inboxId}`))
    busy.current = true
    void ensureLeadChannels(pending)
      .then((found) => {
        if (found.size > 0) {
          onChanged()
        }
      })
      .catch(() => {
        // The database may not be set up for this yet; the chats stay as they were.
      })
      .finally(() => {
        busy.current = false
        setRound((value) => value + 1)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, canEdit, conversations, channels, round])

  // Tie each Messenger / Instagram chat to the lead the database says it belongs to.
  useEffect(() => {
    if (!enabled || !canEdit) {
      return
    }
    const leadOfContact = new Map<number, number>()
    for (const row of channels) {
      if (!leadOfContact.has(row.contactId)) {
        leadOfContact.set(row.contactId, row.leadId)
      }
    }
    for (const conversation of conversations) {
      const sender = conversation.meta.sender
      const leadId = leadOfContact.get(sender.id)
      if (leadId === undefined || stamped.current.get(conversation.id) === leadId) {
        continue
      }
      const linked = getLinkedLeadId(conversation)
      if (linked === leadId) {
        stamped.current.set(conversation.id, leadId)
        continue
      }
      // A WhatsApp chat the team tied to a lead by hand is left alone, unless that lead is gone (joined into another).
      const social = socialKindOf(conversation.meta.channel, sender) !== null
      if (!social && linked !== null && leadExists(linked)) {
        continue
      }
      stamped.current.set(conversation.id, leadId)
      void linkLead(conversation.id, leadId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, canEdit, conversations, channels])
}
