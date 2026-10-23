import { useState } from 'react'
import { cn } from '../../lib/cn'

// A person's circle: their WhatsApp picture when there is one (see contactPicture.ts), else their initials.
export function Avatar({
  initials,
  tone,
  size = 'md',
  className,
  src = null,
}: {
  initials: string
  tone: string
  size?: 'sm' | 'md'
  className?: string
  src?: string | null
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'sm' ? 'h-7 w-7 text-[11px]' : 'h-9 w-9 text-xs',
        tone,
        className,
      )}
    >
      <PictureOrText src={src} text={initials} />
    </span>
  )
}

// Inside any round box: the picture fills it; if it does not load (taken down, no network) the text shows again.
export function PictureOrText({ src, text }: { src: string | null | undefined; text: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (!src || failed === src) {
    return <>{text}</>
  }
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(src)}
      className="h-full w-full rounded-full object-cover"
    />
  )
}
