import { WhatsappLogo } from '@phosphor-icons/react'
import { getWhatsAppUrl } from '../lib/whatsapp'

// A small WhatsApp button next to a phone number. Nothing is shown when the
// number is empty or too short to be a phone number.
export function WhatsAppLink({ phone, name }: { phone: string | null; name?: string | null }) {
  const url = getWhatsAppUrl(phone)
  if (!url) {
    return null
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="Chat on WhatsApp"
      aria-label={`WhatsApp ${name || phone}`}
      onClick={(event) => event.stopPropagation()}
      className="inline-flex items-center rounded-lg p-1 text-emerald-600 transition hover:bg-emerald-50"
    >
      <WhatsappLogo size={18} weight="fill" aria-hidden="true" />
    </a>
  )
}
