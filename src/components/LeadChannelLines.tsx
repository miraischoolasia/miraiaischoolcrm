import type { ReactNode } from 'react'
import { InstagramLogo, MessengerLogo, WhatsappLogo } from '@phosphor-icons/react'
import { cn } from '../lib/cn'
import { getWhatsAppUrl } from '../lib/whatsapp'
import { useOpenChat } from './WhatsAppLink'
import {
  CHANNEL_LABEL,
  HIDDEN_NUMBER_LABEL,
  socialLines,
  whatsappChatLines,
  whatsappPlaces,
  type LeadChannel,
  type LeadChannelKind,
} from '../lib/leadChannels'

const ICON = {
  whatsapp: { Logo: WhatsappLogo, color: '#25D366', label: 'WhatsApp' },
  messenger: { Logo: MessengerLogo, color: '#0084FF', label: 'Messenger' },
  instagram: { Logo: InstagramLogo, color: '#E1306C', label: 'Instagram' },
} as const

// The same width for every icon (the WhatsApp button is a little wider than the plain icons), so the
// names line up.
// The tables give every button padding and a minimum height; inside the slot the button is put back to its icon.
const ICON_SLOT = 'flex h-6 w-6 shrink-0 items-center justify-center [&>*]:min-h-0! [&>*]:p-0!'

export function ChannelIcon({ kind, size = 16 }: { kind: LeadChannelKind; size?: number }) {
  const { Logo, color, label } = ICON[kind]
  return <Logo size={size} weight="fill" color={color} aria-label={label} role="img" />
}

type Props = {
  // The lead's phone number (shown first, as the WhatsApp line), or empty.
  phone: string | null
  // The chats of this lead from the database.
  channels: LeadChannel[]
  // Phone shown even when there is none: a lead of Messenger only shows no WhatsApp line at all.
  className?: string
  // Say where each chat sits (the Page / the school's number).
  showPlaces?: boolean
  // The button that opens the WhatsApp chat. It takes the place of the WhatsApp icon in front of the number,
  // so the line has one icon, and that icon is the button.
  phoneAction?: ReactNode
  // The lead these lines belong to, so a click on a Messenger / Instagram line opens that lead's chat.
  leadId?: number | null
  // Called after a chat was opened from a line (a window the line sits in closes itself).
  onOpened?: () => void
  // True where the lead has a phone number somewhere else on the screen (this one is not shown): its WhatsApp
  // chat is then found by that number, so no hidden-number line is wanted.
  hasPhoneElsewhere?: boolean
}

// "WhatsApp hidden number" beside a name that is only WhatsApp's long ID, so it reads as what it is.
export function HiddenNumberNote({ className }: { className?: string }) {
  return (
    <span className={cn('ml-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500', className)}>
      {HIDDEN_NUMBER_LABEL}
    </span>
  )
}

// What a lead writes on, one line each: the WhatsApp number first, then the Messenger names with the
// Messenger icon at the right, then Instagram. A lead of Messenger only has just the Messenger lines.
export function LeadChannelLines({ phone, channels, className, showPlaces = true, phoneAction, leadId = null, onOpened, hasPhoneElsewhere = false }: Props) {
  const openChat = useOpenChat()
  const open = (line: { name: string | null; conversationId: number | null; contactId: number }) => {
    openChat?.({
      phone: '',
      name: line.name,
      leadId,
      chat: { conversationId: line.conversationId, contactId: line.contactId },
    })
    onOpened?.()
  }
  const social = socialLines(channels)
  const numbers = showPlaces ? whatsappPlaces(channels) : []
  const hasPhone = Boolean(phone && phone.trim())
  // A lead with no phone number is found by its chat: one line for each WhatsApp chat it has.
  const hiddenChats = hasPhone || hasPhoneElsewhere ? [] : whatsappChatLines(channels)
  if (!hasPhone && social.length === 0 && hiddenChats.length === 0) {
    return null
  }
  return (
    <ul className={cn('space-y-0.5 text-sm', className)}>
      {hasPhone && (
        <li className="flex items-center gap-1.5">
          <span className={ICON_SLOT}>
            {phoneAction && getWhatsAppUrl(phone) ? phoneAction : <ChannelIcon kind="whatsapp" />}
          </span>
          <span className="min-w-0 truncate text-slate-900">
            {phone}
            {numbers.length > 0 && <span className="ml-1.5 text-xs text-slate-500">on {numbers.join(', ')}</span>}
          </span>
        </li>
      )}
      {hiddenChats.map((chat) => (
        <li key={`whatsapp-${chat.contactId}-${chat.place ?? ''}`} className="flex items-center gap-1.5">
          {openChat && chat.conversationId !== null ? (
            <span
              role="button"
              tabIndex={0}
              title="Open this WhatsApp chat in the Inbox"
              aria-label={`Open the WhatsApp chat${chat.place ? ` on ${chat.place}` : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                open(chat)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  event.stopPropagation()
                  open(chat)
                }
              }}
              className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-lg hover:bg-slate-100"
            >
              <span className={ICON_SLOT}>
                <ChannelIcon kind="whatsapp" />
              </span>
              <span className="min-w-0 truncate text-slate-900">
                {HIDDEN_NUMBER_LABEL}
                {chat.place && <span className="ml-1.5 text-xs text-slate-500">{chat.place}</span>}
                <span className="ml-1.5 text-xs font-semibold text-[#be185d]">Open chat</span>
              </span>
            </span>
          ) : (
            <>
              <span className={ICON_SLOT}>
                <ChannelIcon kind="whatsapp" />
              </span>
              <span className="min-w-0 truncate text-slate-900">
                {HIDDEN_NUMBER_LABEL}
                {chat.place && <span className="ml-1.5 text-xs text-slate-500">{chat.place}</span>}
              </span>
            </>
          )}
        </li>
      ))}
      {social.map((line) => (
        <li key={`${line.kind}-${line.name}-${line.place ?? ''}`} className="flex items-center gap-1.5">
          {openChat ? (
            // A span with a button role, not a <button>: the tables restyle every button (padding, minimum
            // height), which pushed these lines out of line with the phone number.
            <span
              role="button"
              tabIndex={0}
              title={`Open this ${CHANNEL_LABEL[line.kind]} chat in the Inbox`}
              aria-label={`${CHANNEL_LABEL[line.kind]} ${line.name}`}
              onClick={(event) => {
                event.stopPropagation()
                open(line)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  event.stopPropagation()
                  open(line)
                }
              }}
              className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-lg hover:bg-slate-100"
            >
              <span className={ICON_SLOT}>
                <ChannelIcon kind={line.kind} />
              </span>
              <span className="min-w-0 truncate text-slate-900">
                {line.name}
                {line.place && <span className="ml-1.5 text-xs text-slate-500">{line.place}</span>}
              </span>
            </span>
          ) : (
            <>
              <span className={ICON_SLOT}>
                <ChannelIcon kind={line.kind} />
              </span>
              <span className="min-w-0 truncate text-slate-900">
                {line.name}
                {line.place && <span className="ml-1.5 text-xs text-slate-500">{line.place}</span>}
              </span>
            </>
          )}
        </li>
      ))}
    </ul>
  )
}
