import { useState } from 'react'
import { ArrowCounterClockwise, Check, PencilSimple, Trash, Warning, X } from '@phosphor-icons/react'
import {
  KIND_LABELS,
  SIZE_LABELS,
  bannedIn,
  type ItemClaim,
  type ItemStatus,
  type PlanItem,
  type PlanItemEdit,
} from '../../lib/contentStudio'
import { cn } from '../../lib/cn'
import type { ContentImage } from '../../lib/contentImages'
import { formatTime } from './format'
import { PicturePanel } from './PicturePanel'
import { Chip, GhostButton, PrimaryButton, SecondaryButton, inputClass } from './ui'

const STATUS: Record<ItemStatus, { label: string; tone: 'plain' | 'good' | 'bad' }> = {
  draft: { label: 'Waiting for approval', tone: 'plain' },
  approved: { label: 'In the library', tone: 'good' },
  rejected: { label: 'Not used', tone: 'bad' },
}

// How tall the poster preview is for each size (width is fixed).
const ASPECT: Record<string, string> = {
  '1:1': 'aspect-square',
  '4:5': 'aspect-[4/5]',
  '9:16': 'aspect-[9/16]',
  '3:4': 'aspect-[3/4]',
}

type PostCardProps = {
  item: PlanItem
  // ideas: change the words or remove it; approve: approve, not use, or send back.
  mode: 'ideas' | 'approve'
  styleName: string | null
  angleName: string | null
  campaignName?: string
  bannedWords: string[]
  canEdit: boolean
  claims?: ItemClaim[]
  claimLimit?: number
  onSave: (edit: PlanItemEdit) => Promise<string | null>
  onDelete: () => Promise<string | null>
  onReview: (status: ItemStatus) => Promise<string | null>
  // The pictures of this post (phase 2); without them the poster words are shown instead.
  pictures?: { images: ContentImage[]; urls: Map<string, string>; onChanged: () => Promise<void> }
}

// One post: a preview of the poster words, the caption, and what can be done with it.
export function PostCard({
  item,
  mode,
  styleName,
  angleName,
  campaignName,
  bannedWords,
  canEdit,
  claims,
  claimLimit,
  onSave,
  onDelete,
  onReview,
  pictures,
}: PostCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    headline: item.headline,
    subheadline: item.subheadline,
    posterText: item.posterText,
    caption: item.caption,
    visual: item.visual,
  })
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const banned = bannedIn(editing ? draft : item, bannedWords)
  const status = STATUS[item.status]
  const taken = claims?.length ?? 0

  async function run(action: () => Promise<string | null>, after?: () => void) {
    setBusy(true)
    setProblem(null)
    const failure = await action()
    setBusy(false)
    if (failure) setProblem(failure)
    else after?.()
  }

  function startEditing() {
    setDraft({ headline: item.headline, subheadline: item.subheadline, posterText: item.posterText, caption: item.caption, visual: item.visual })
    setEditing(true)
  }

  const field = (key: keyof typeof draft, label: string, rows: number) => (
    <label className="block space-y-1.5">
      <span className="block text-sm font-semibold text-slate-800">{label}</span>
      {rows === 1 ? (
        <input className={inputClass} value={draft[key]} disabled={busy} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
      ) : (
        <textarea className={inputClass} rows={rows} value={draft[key]} disabled={busy} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
      )}
    </label>
  )

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" data-testid={`post-${item.id}`}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Chip tone={status.tone}>{status.label}</Chip>
        <Chip tone="brand">
          {KIND_LABELS[item.kind]}
          {item.kind === 'carousel' ? ` · ${item.pages} pages` : ''}
        </Chip>
        {item.kind !== 'caption' && <Chip>{SIZE_LABELS[item.size]}</Chip>}
        {campaignName && <Chip>{campaignName}</Chip>}
        {item.status === 'approved' && claimLimit !== undefined && (
          <span className="ml-auto">
            <Chip tone={taken >= claimLimit ? 'bad' : 'plain'}>
              {Math.min(taken, claimLimit)}/{claimLimit} taken
            </Chip>
          </span>
        )}
      </div>

      {editing ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            {field('headline', 'Big title', 1)}
            {field('subheadline', 'Small title', 1)}
            {item.kind !== 'caption' && field('posterText', item.kind === 'carousel' ? 'Words on each page (one line per page)' : 'Other words on the poster', 4)}
            {item.kind !== 'caption' && field('visual', 'What the picture shows', 3)}
          </div>
          {field('caption', 'Caption (the post text)', 14)}
        </div>
      ) : (
        <div className={cn('grid gap-5', item.kind !== 'caption' && (pictures ? 'md:grid-cols-[220px_1fr]' : 'md:grid-cols-[180px_1fr]'))}>
          {item.kind !== 'caption' && pictures && (
            <PicturePanel item={item} images={pictures.images} urls={pictures.urls} canEdit={canEdit} onChanged={pictures.onChanged} />
          )}
          {item.kind !== 'caption' && !pictures && (
            <div
              className={cn(
                'flex w-full max-w-[180px] flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-br from-[#fff1f8] to-white p-4 ring-1 ring-slate-200',
                ASPECT[item.size] ?? 'aspect-square',
              )}
              aria-label="Poster words"
            >
              <div>
                <p className="text-lg font-bold leading-snug text-slate-900">{item.headline}</p>
                {item.subheadline && <p className="mt-1 text-sm text-slate-600">{item.subheadline}</p>}
              </div>
              {item.posterText && (
                <p className="mt-3 line-clamp-6 whitespace-pre-line text-xs leading-relaxed text-[#be185d]">{item.posterText}</p>
              )}
            </div>
          )}
          <div className="min-w-0 space-y-3">
            {(item.kind === 'caption' || pictures) && <p className="text-lg font-bold text-slate-900">{item.headline}</p>}
            {pictures && item.kind !== 'caption' && item.posterText && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.kind === 'carousel' ? 'Words on each page' : 'Words on the poster'}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-[#be185d]">{item.posterText}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Caption</p>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-800">{item.caption}</p>
            </div>
            <p className="text-xs text-slate-500">
              {[styleName && `Style: ${styleName}`, angleName && `Angle: ${angleName}`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      )}

      {banned.length > 0 && (
        <p role="alert" className="mt-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <Warning size={16} weight="fill" /> Has words the school does not use: {banned.join(', ')}
        </p>
      )}
      {claims && claims.length > 0 && (
        <p className="mt-3 text-sm text-slate-600">
          Taken by {claims.map((claim) => `${claim.teacherName} (${formatTime(claim.claimedAt)})`).join(', ')}
        </p>
      )}
      {problem && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {problem}
        </p>
      )}

      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          {editing ? (
            <>
              <PrimaryButton disabled={busy} onClick={() => void run(() => onSave(draft), () => setEditing(false))}>
                {busy ? 'Saving…' : 'Save'}
              </PrimaryButton>
              <SecondaryButton disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </SecondaryButton>
            </>
          ) : mode === 'approve' ? (
            <>
              {item.status !== 'approved' && (
                <PrimaryButton disabled={busy} onClick={() => void run(() => onReview('approved'))}>
                  <Check size={16} weight="bold" /> Approve
                </PrimaryButton>
              )}
              {item.status !== 'rejected' && (
                <SecondaryButton disabled={busy} onClick={() => void run(() => onReview('rejected'))}>
                  <X size={16} weight="bold" /> {item.status === 'approved' ? 'Take out of library' : 'Don’t use'}
                </SecondaryButton>
              )}
              {item.status === 'rejected' && (
                <SecondaryButton disabled={busy} onClick={() => void run(() => onReview('draft'))}>
                  <ArrowCounterClockwise size={16} /> Look at it again
                </SecondaryButton>
              )}
              <GhostButton className="ml-auto" disabled={busy} onClick={startEditing}>
                <PencilSimple size={16} /> Edit words
              </GhostButton>
            </>
          ) : (
            <>
              <SecondaryButton disabled={busy} onClick={startEditing}>
                <PencilSimple size={16} /> Edit words
              </SecondaryButton>
              {item.status !== 'approved' && taken === 0 && (
                <GhostButton className="ml-auto text-red-600 hover:bg-red-50" disabled={busy} onClick={() => void run(onDelete)}>
                  <Trash size={16} /> Remove
                </GhostButton>
              )}
            </>
          )}
        </div>
      )}
    </article>
  )
}
