import type { WhatsAppTarget } from '../components/WhatsAppLink'
import type { LeadChannel } from './leadChannels'

// Which chat "Open chat" opens for a lead (a follow-up card, the Today list): the chat the follow-up was made in,
// when it is known; else the lead's own chats (WhatsApp, Messenger, Instagram), the newest first; else its phone
// number. Null when the lead has no chat at all (then its profile opens instead). A lead made from a Messenger or
// Instagram chat has no phone: before, its "Open chat" opened the profile.
export function chatTargetForLead(
  lead: { id: number; fullName: string | null; phone: string | null } | null,
  channels: LeadChannel[],
  conversationId: number | null = null,
): WhatsAppTarget | null {
  if (!lead) {
    return null
  }
  const name = lead.fullName
  if (conversationId !== null) {
    return { phone: '', name, leadId: lead.id, chat: { conversationId, contactId: null } }
  }
  const own = channels
    .filter((channel) => channel.leadId === lead.id)
    .sort((a, b) => (b.conversationId !== null ? 1 : 0) - (a.conversationId !== null ? 1 : 0) || b.firstSeenAt.localeCompare(a.firstSeenAt))
  const newest = own[0]
  if (newest) {
    return {
      phone: '',
      name: newest.name ?? name,
      leadId: lead.id,
      chat: { conversationId: newest.conversationId, contactId: newest.contactId },
    }
  }
  const phone = lead.phone?.trim()
  if (phone) {
    return { phone, name, leadId: lead.id }
  }
  return null
}
