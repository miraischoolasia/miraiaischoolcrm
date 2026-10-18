import { createContext, useContext } from 'react'
import { WhatsappLogo } from '@phosphor-icons/react'
import { getWhatsAppUrl } from '../lib/whatsapp'

// Who to open the chat with. The lead id is there when the button sits on a lead, so a
// chat that was tied to the lead by hand is found even when WhatsApp hides its number.
export type WhatsAppTarget = {
  phone: string
  name: string | null
  leadId: number | null
  // A Messenger / Instagram chat has no number: it is asked for by its chat (or, failing that, its contact).
  chat?: { conversationId: number | null; contactId: number | null }
  // Written in the chat's message box for the team to read and send (e.g. a new app login).
  message?: string
}

// Set by the app when the school's own WhatsApp page is available; without it the
// button falls back to opening the chat on wa.me.
const OpenChatContext = createContext<((target: WhatsAppTarget) => void) | null>(null)
export const WhatsAppOpenProvider = OpenChatContext.Provider

// The way to open a chat on the school's own inbox page; null when this page has none to open.
export function useOpenChat() {
  return useContext(OpenChatContext)
}

type WhatsAppLinkProps = {
  phone: string | null
  name?: string | null
  leadId?: number | null
  // Called after the chat was asked for, e.g. to close the window the button is in.
  onOpened?: () => void
}

const buttonClass = 'inline-flex items-center rounded-lg p-1 text-emerald-600 transition hover:bg-emerald-50'

// A small WhatsApp button next to a phone number. Nothing is shown when the
// number is empty or too short to be a phone number.
export function WhatsAppLink({ phone, name, leadId = null, onOpened }: WhatsAppLinkProps) {
  const openChat = useContext(OpenChatContext)
  const url = getWhatsAppUrl(phone)
  if (!url || !phone) {
    return null
  }
  const label = `WhatsApp ${name || phone}`

  if (openChat) {
    return (
      <button
        type="button"
        title="Open this chat in the WhatsApp page"
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation()
          openChat({ phone, name: name ?? null, leadId })
          onOpened?.()
        }}
        className={buttonClass}
      >
        <WhatsappLogo size={18} weight="fill" aria-hidden="true" />
      </button>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="Chat on WhatsApp"
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
      className={buttonClass}
    >
      <WhatsappLogo size={18} weight="fill" aria-hidden="true" />
    </a>
  )
}
