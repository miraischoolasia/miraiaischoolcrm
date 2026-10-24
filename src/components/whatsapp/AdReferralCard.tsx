import { useState } from 'react'
import { ArrowSquareOut, CaretDown, CaretUp, Megaphone, PlayCircle, X } from '@phosphor-icons/react'
import { adSourceLine, adThumbnailUrl, adTitle, closedAdChats as closedChats, type ChatAdReferral } from '../../lib/chatAdReferrals'
import { cn } from '../../lib/cn'

function Thumbnail({ ad, size }: { ad: ChatAdReferral; size: 'small' | 'large' }) {
  const url = adThumbnailUrl(ad.thumbnailPath)
  const box = size === 'large' ? 'h-14 w-14' : 'h-8 w-8'
  return (
    <span className={cn('relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100', box)}>
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <Megaphone size={size === 'large' ? 22 : 14} aria-hidden="true" className="text-slate-400" />
      )}
      {ad.mediaType === 'video' && (
        <PlayCircle size={size === 'large' ? 20 : 12} weight="fill" aria-hidden="true" className="absolute text-white drop-shadow" />
      )}
    </span>
  )
}

function ViewAd({ ad }: { ad: ChatAdReferral }) {
  if (!ad.viewUrl) {
    return null
  }
  return (
    <a
      href={ad.viewUrl}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#be185d] hover:underline"
    >
      View ad <ArrowSquareOut size={12} aria-hidden="true" />
    </a>
  )
}

// Above the chat: the ad the parent clicked (the newest; every click when opened), with a way to close it.
export function AdReferralBanner({ conversationId, ads }: { conversationId: number; ads: ChatAdReferral[] }) {
  const [, rerender] = useState(0)
  const [showAll, setShowAll] = useState(false)
  if (ads.length === 0) {
    return null
  }
  const latest = ads[0]
  if (closedChats.has(conversationId)) {
    return (
      <div className="flex justify-end border-b border-slate-100 bg-white px-3 py-1">
        <button
          type="button"
          onClick={() => {
            closedChats.delete(conversationId)
            rerender((count) => count + 1)
          }}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-[#be185d] min-h-0!"
        >
          <Megaphone size={12} aria-hidden="true" /> Came from an ad
        </button>
      </div>
    )
  }
  return (
    <section aria-label="Came from an ad" className="border-b border-amber-100 bg-amber-50/50 px-3 py-2">
      <div className="flex items-start gap-3">
        <Thumbnail ad={latest} size="large" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900" title={adTitle(latest)}>
            {adTitle(latest)}
          </p>
          {latest.body && <p className="line-clamp-2 text-xs text-slate-600">{latest.body}</p>}
          <p className="mt-0.5 text-[11px] text-slate-500">
            {adSourceLine(latest)}
            {ads.length > 1 && (
              <button
                type="button"
                onClick={() => setShowAll((open) => !open)}
                aria-expanded={showAll}
                className="ml-2 inline-flex items-center gap-0.5 font-medium text-[#be185d] hover:underline min-h-0!"
              >
                {showAll ? 'Hide' : `${ads.length} ad clicks`}
                {showAll ? <CaretUp size={10} aria-hidden="true" /> : <CaretDown size={10} aria-hidden="true" />}
              </button>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button
            type="button"
            onClick={() => {
              closedChats.add(conversationId)
              rerender((count) => count + 1)
            }}
            aria-label="Close the ad card"
            title="Close"
            className="rounded p-0.5 text-slate-400 hover:bg-white hover:text-slate-700 min-h-0!"
          >
            <X size={14} />
          </button>
          <ViewAd ad={latest} />
        </div>
      </div>
      {showAll && (
        <ul aria-label="Every ad click" className="mt-2 space-y-1.5 border-t border-amber-100 pt-2">
          {ads.map((ad) => (
            <li key={ad.id} className="flex items-center gap-2">
              <Thumbnail ad={ad} size="small" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-slate-800">
                  {adTitle(ad)}
                  {ad.isFirst && (
                    <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-800">First</span>
                  )}
                </span>
                <span className="block truncate text-[11px] text-slate-500">{adSourceLine(ad)}</span>
              </span>
              <ViewAd ad={ad} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// One line on the lead and the Family card: the first ad this lead clicked.
export function AdReferralLine({ ad, className }: { ad: ChatAdReferral | null; className?: string }) {
  if (!ad) {
    return null
  }
  return (
    <div aria-label="Source ad" className={cn('flex items-center gap-2 text-xs', className)}>
      <Thumbnail ad={ad} size="small" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-slate-800" title={adTitle(ad)}>
          Source ad: {adTitle(ad)}
        </span>
        <span className="block truncate text-[11px] text-slate-500">{adSourceLine(ad)}</span>
      </span>
      <ViewAd ad={ad} />
    </div>
  )
}
