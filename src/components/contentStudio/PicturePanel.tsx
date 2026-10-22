import { useState } from 'react'
import { ArrowsClockwise, ChatCircleText, CircleNotch, Image as ImageIcon, Sparkle, ThumbsUp, WarningCircle } from '@phosphor-icons/react'
import {
  chooseImage,
  currentImage,
  editImage,
  failedImage,
  likeImage,
  pendingImage,
  queueImages,
  versionsOf,
  type ContentImage,
} from '../../lib/contentImages'
import { contentErrorMessage, type PlanItem } from '../../lib/contentStudio'
import { cn } from '../../lib/cn'
import { askToNotify } from '../../hooks/useContentImages'
import { GhostButton, SecondaryButton, smallInputClass } from './ui'

const ASPECT: Record<string, string> = {
  '1:1': 'aspect-square',
  '4:5': 'aspect-[4/5]',
  '9:16': 'aspect-[9/16]',
  '3:4': 'aspect-[3/4]',
}

type PicturePanelProps = {
  item: PlanItem
  images: ContentImage[]
  urls: Map<string, string>
  canEdit: boolean
  onChanged: () => Promise<void>
}

// The picture of a post (each page of a carousel), and what can be done with it.
export function PicturePanel({ item, images, urls, canEdit, onChanged }: PicturePanelProps) {
  const [page, setPage] = useState(1)
  const [asking, setAsking] = useState(false)
  const [request, setRequest] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const pages = item.kind === 'carousel' ? item.pages : 1
  const current = currentImage(images, item.id, page)
  const pending = pendingImage(images, item.id, page)
  const failed = failedImage(images, item.id, page)
  const versions = versionsOf(images, item.id, page)
  const anyPicture = images.some((image) => image.itemId === item.id && image.status === 'done')
  const url = current?.path ? urls.get(current.path) : undefined

  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true)
    setProblem(null)
    try {
      await action()
      await onChanged()
    } catch (failure) {
      setProblem(contentErrorMessage(failure, failure instanceof Error && failure.message ? failure.message : fallback))
    }
    setBusy(false)
  }

  return (
    <div className="w-full max-w-[220px] space-y-2">
      <div className={cn('relative w-full overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200', ASPECT[item.size] ?? 'aspect-square')}>
        {url ? (
          <img src={url} alt={`${item.headline}${pages > 1 ? `, page ${page}` : ''}`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-[#fff1f8] to-white p-3">
            <div>
              <p className="text-base font-bold leading-snug text-slate-900">{item.headline}</p>
              {item.subheadline && <p className="mt-1 text-xs text-slate-600">{item.subheadline}</p>}
            </div>
            <p className="flex items-center gap-1 text-xs text-slate-400">
              <ImageIcon size={14} /> No picture yet
            </p>
          </div>
        )}
        {pending && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/80 text-sm font-semibold text-slate-700">
            <CircleNotch size={24} className="animate-spin text-[#fc0c97]" />
            {pending.status === 'working' ? 'Drawing…' : 'Waiting to draw…'}
          </div>
        )}
        {current?.quality === 'hd' && <span className="absolute left-2 top-2 rounded-full bg-slate-900/80 px-2 py-0.5 text-[11px] font-bold text-white">HD</span>}
      </div>

      {pages > 1 && (
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Pages">
          {Array.from({ length: pages }, (_, index) => index + 1).map((number) => {
            const pagePicture = currentImage(images, item.id, number)
            const pageUrl = pagePicture?.path ? urls.get(pagePicture.path) : undefined
            const pageWaiting = pendingImage(images, item.id, number)
            return (
              <button
                key={number}
                type="button"
                role="tab"
                aria-selected={page === number}
                aria-label={`Page ${number}`}
                onClick={() => setPage(number)}
                className={cn(
                  'relative h-10 w-10 overflow-hidden rounded-lg border-2 text-xs font-bold text-slate-600',
                  page === number ? 'border-[#fc0c97]' : 'border-slate-200',
                )}
              >
                {pageUrl ? <img src={pageUrl} alt="" className="h-full w-full object-cover" /> : number}
                {pageWaiting && <span className="absolute inset-0 flex items-center justify-center bg-white/70"><CircleNotch size={14} className="animate-spin text-[#fc0c97]" /></span>}
              </button>
            )
          })}
        </div>
      )}

      {failed && !pending && (
        <p className="flex items-start gap-1 rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-700">
          <WarningCircle size={14} className="mt-0.5 shrink-0" /> {failed.error || 'The picture could not be drawn.'}
        </p>
      )}
      {problem && <p className="rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-700">{problem}</p>}

      {canEdit && !pending && (
        <div className="space-y-2">
          {!anyPicture ? (
            <SecondaryButton
              className="w-full"
              disabled={busy}
              onClick={() => {
                askToNotify()
                void run(() => queueImages([item.id], 'draft'), 'Could not start drawing.')
              }}
            >
              <Sparkle size={16} /> Draw {pages > 1 ? `${pages} pages` : 'picture'}
            </SecondaryButton>
          ) : current ? (
            <div className="grid grid-cols-2 gap-1">
              <GhostButton className="justify-start whitespace-nowrap px-2 text-xs" disabled={busy} onClick={() => void run(() => queueImages([item.id], 'draft'), 'Could not start drawing.')}>
                <ArrowsClockwise size={14} /> Draw again
              </GhostButton>
              <GhostButton className="justify-start whitespace-nowrap px-2 text-xs" disabled={busy} onClick={() => setAsking(!asking)}>
                <ChatCircleText size={14} /> Change it
              </GhostButton>
              {current.quality === 'draft' && (
                <GhostButton className="justify-start whitespace-nowrap px-2 text-xs" disabled={busy} onClick={() => void run(() => queueImages([item.id], 'hd'), 'Could not start drawing.')}>
                  <Sparkle size={14} /> Make HD
                </GhostButton>
              )}
              <GhostButton
                className={cn('justify-start whitespace-nowrap px-2 text-xs', current.liked && 'text-[#be185d]')}
                aria-pressed={current.liked}
                disabled={busy}
                title="Liked pictures become samples of this style"
                onClick={() => void run(() => likeImage(current.id, !current.liked), 'Could not save.')}
              >
                <ThumbsUp size={14} weight={current.liked ? 'fill' : 'regular'} /> {current.liked ? 'Liked' : 'Like'}
              </GhostButton>
            </div>
          ) : (
            <SecondaryButton className="w-full" disabled={busy} onClick={() => void run(() => queueImages([item.id], 'draft'), 'Could not start drawing.')}>
              <ArrowsClockwise size={16} /> Draw this page again
            </SecondaryButton>
          )}

          {asking && current && (
            <form
              className="space-y-1"
              onSubmit={(event) => {
                event.preventDefault()
                if (!request.trim()) return
                void run(() => editImage(current.id, request.trim()), 'Could not send.').then(() => {
                  setRequest('')
                  setAsking(false)
                })
              }}
            >
              <input
                autoFocus
                aria-label="What to change"
                className={cn(smallInputClass, 'w-full text-xs')}
                maxLength={500}
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                placeholder="e.g. Make the title bigger, use blue"
              />
              <SecondaryButton type="submit" className="w-full text-xs" disabled={busy || !request.trim()}>
                Send
              </SecondaryButton>
            </form>
          )}

          {versions.length > 1 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{versions.length} versions · tap to use</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {versions.map((version) => {
                  const versionUrl = version.path ? urls.get(version.path) : undefined
                  const used = current?.id === version.id
                  return (
                    <button
                      key={version.id}
                      type="button"
                      aria-label={`Use version ${version.id}${version.instruction ? `: ${version.instruction}` : ''}`}
                      title={version.instruction || (version.quality === 'hd' ? 'High quality' : 'Draft')}
                      disabled={busy || used}
                      onClick={() => void run(() => chooseImage(version.id), 'Could not choose.')}
                      className={cn('h-10 w-10 overflow-hidden rounded-lg border-2', used ? 'border-[#fc0c97]' : 'border-slate-200 hover:border-slate-400')}
                    >
                      {versionUrl && <img src={versionUrl} alt="" className="h-full w-full object-cover" />}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
