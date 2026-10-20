import { useEffect, useState } from 'react'
import { InstagramLogo, MessengerLogo, WhatsappLogo } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'

export type ChannelKind = 'whatsapp' | 'messenger' | 'instagram'

// What the list shows for the channel a chat came through: its kind, the Page or number it is, and a picture
// of the Page when there is one.
// `color` (a short name's colour, channel_labels) rings the badge, so two numbers or Pages are told apart.
export type ChannelInfo = { kind: ChannelKind; name: string | null; avatar: string | null; color?: string | null }

const KIND_LABEL: Record<ChannelKind, string> = { whatsapp: 'WhatsApp', messenger: 'Messenger', instagram: 'Instagram' }

const KIND_STYLE: Record<ChannelKind, string> = {
  whatsapp: 'bg-[#25d366] text-white',
  messenger: 'bg-[#0084ff] text-white',
  instagram: 'bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] text-white',
}

export function channelTitle(info: ChannelInfo) {
  return info.name ? `${KIND_LABEL[info.kind]}: ${info.name}` : KIND_LABEL[info.kind]
}

// A small round badge: the Page's picture, or the channel's own logo when the Page has none (or it cannot load).
export function ChannelBadge({ info, size = 18, className }: { info: ChannelInfo; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [info.avatar])
  const picture = info.kind !== 'whatsapp' && info.avatar && !broken ? info.avatar : null
  const Logo = info.kind === 'messenger' ? MessengerLogo : info.kind === 'instagram' ? InstagramLogo : WhatsappLogo

  return (
    <span
      role="img"
      aria-label={channelTitle(info)}
      title={channelTitle(info)}
      style={{ width: size, height: size, ...(info.color ? { boxShadow: `0 0 0 2px #ffffff, 0 0 0 4px ${info.color}` } : {}) }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-white',
        picture ? 'bg-slate-100' : KIND_STYLE[info.kind],
        className,
      )}
    >
      {picture ? (
        <img
          src={picture}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <Logo size={Math.round(size * 0.66)} weight="fill" aria-hidden="true" />
      )}
    </span>
  )
}
