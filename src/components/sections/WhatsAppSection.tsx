import type { WhatsAppTarget } from '../WhatsAppLink'
import { ArrowSquareOut } from '@phosphor-icons/react'
import type { Sender } from '../../lib/chatwootClient'
import type { WhatsAppCrm } from '../whatsapp/crm'
import type { ChatwootConversation } from '../../lib/whatsappInbox'
import { WhatsAppInbox, type WhatsAppNumbersView } from '../whatsapp/WhatsAppInbox'

type WhatsAppSectionProps = {
  // The address of the shared WhatsApp inbox (Chatwoot), used for the fallback.
  chatwootUrl: string
  // The gateway the school's own inbox page talks to. Without it the page falls
  // back to showing Chatwoot's own screen.
  apiUrl: string | null
  currentUser: Sender | null
  staff: Sender[]
  crm: WhatsAppCrm
  // False while another page is showing (the page stays mounted).
  active?: boolean
  // A number elsewhere in the app asked for its chat.
  openRequest?: (WhatsAppTarget & { id: number }) | null
  // The school's WhatsApp numbers and who may see which.
  numbersView?: WhatsAppNumbersView
  // Every open chat (read by the menu badge), so the Inbox's unread numbers count them all.
  everyOpenChat?: ChatwootConversation[]
}

export function WhatsAppSection({
  chatwootUrl,
  apiUrl,
  currentUser,
  staff,
  crm,
  active = true,
  openRequest = null,
  numbersView,
  everyOpenChat,
}: WhatsAppSectionProps) {
  if (apiUrl && currentUser) {
    return (
      <WhatsAppInbox
        apiUrl={apiUrl}
        currentUser={currentUser}
        staff={staff}
        crm={crm}
        active={active}
        openRequest={openRequest}
        numbersView={numbersView}
        everyOpenChat={everyOpenChat}
      />
    )
  }

  const inboxUrl = `${chatwootUrl}/app/`
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>Replies go out from the school's shared WhatsApp number.</span>
        <a
          href={inboxUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <ArrowSquareOut size={16} aria-hidden="true" />
          Open in a new tab
        </a>
      </div>
      <iframe
        title="WhatsApp inbox"
        src={inboxUrl}
        allow="clipboard-write; microphone; notifications"
        className="h-[calc(100vh-190px)] min-h-[560px] w-full rounded-2xl border border-slate-200 bg-white"
      />
    </div>
  )
}
