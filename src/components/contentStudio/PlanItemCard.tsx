import { useState } from 'react'
import { Check, Trash, X, ArrowCounterClockwise } from '@phosphor-icons/react'
import {
  KIND_LABELS,
  SIZE_LABELS,
  bannedIn,
  type ItemClaim,
  type ItemStatus,
  type PlanItem,
  type PlanItemEdit,
} from '../../lib/contentStudio'
import { Chip, PrimaryButton, SecondaryButton, inputClass } from './ui'
import { formatTime } from './format'

const STATUS_CHIP: Record<ItemStatus, { label: string; tone: 'plain' | 'good' | 'bad' }> = {
  draft: { label: 'Waiting for review', tone: 'plain' },
  approved: { label: 'In the library', tone: 'good' },
  rejected: { label: 'Rejected', tone: 'bad' },
}

type PlanItemCardProps = {
  item: PlanItem
  styleName: string | null
  angleName: string | null
  briefTitle?: string
  bannedWords: string[]
  canEdit: boolean
  claims?: ItemClaim[]
  claimLimit?: number
  onSave: (edit: PlanItemEdit) => Promise<string | null>
  onDelete: () => Promise<string | null>
  onReview: (status: ItemStatus) => Promise<string | null>
}

// One post of the plan: its style, angle and size, every line of words (editable), and the review buttons.
export function PlanItemCard({
  item,
  styleName,
  angleName,
  briefTitle,
  bannedWords,
  canEdit,
  claims,
  claimLimit,
  onSave,
  onDelete,
  onReview,
}: PlanItemCardProps) {
  const [draft, setDraft] = useState({
    headline: item.headline,
    subheadline: item.subheadline,
    posterText: item.posterText,
    caption: item.caption,
    visual: item.visual,
  })
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const changed =
    draft.headline !== item.headline ||
    draft.subheadline !== item.subheadline ||
    draft.posterText !== item.posterText ||
    draft.caption !== item.caption ||
    draft.visual !== item.visual
  const banned = bannedIn(draft, bannedWords)
  const status = STATUS_CHIP[item.status]

  async function run(action: () => Promise<string | null>) {
    setBusy(true)
    setProblem(null)
    const failure = await action()
    setBusy(false)
    if (failure) setProblem(failure)
  }

  const field = (key: keyof typeof draft, label: string, rows: number) => (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {rows === 1 ? (
        <input
          className={inputClass}
          value={draft[key]}
          disabled={!canEdit || busy}
          onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
        />
      ) : (
        <textarea
          className={inputClass}
          rows={rows}
          value={draft[key]}
          disabled={!canEdit || busy}
          onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
        />
      )}
    </label>
  )

  return (
    <article className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4" data-testid={`plan-item-${item.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={status.tone}>{status.label}</Chip>
        {briefTitle && <Chip tone="brand">{briefTitle}</Chip>}
        {styleName && <Chip>Style: {styleName}</Chip>}
        {angleName && <Chip>Angle: {angleName}</Chip>}
        <Chip>{SIZE_LABELS[item.size]}</Chip>
        <Chip>
          {KIND_LABELS[item.kind]}
          {item.kind === 'carousel' ? ` · ${item.pages} pages` : ''}
        </Chip>
        {item.status === 'approved' && claimLimit !== undefined && (
          <Chip tone="brand">
            {Math.min(claims?.length ?? 0, claimLimit)}/{claimLimit} claimed
          </Chip>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-3">
          {field('headline', 'Headline', 1)}
          {field('subheadline', 'Subheadline', 1)}
          {item.kind !== 'caption' && field('posterText', 'Other words on the poster', 4)}
          {item.kind !== 'caption' && field('visual', 'Picture description (for phase 2)', 3)}
        </div>
        <div>{field('caption', 'Caption', 12)}</div>
      </div>

      {banned.length > 0 && (
        <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Has banned words: {banned.join(', ')}
        </p>
      )}
      {item.status === 'rejected' && item.reviewNote && <p className="text-sm text-slate-600">Why rejected: {item.reviewNote}</p>}
      {claims && claims.length > 0 && (
        <p className="text-sm text-slate-600">
          Claimed by {claims.map((claim) => `${claim.teacherName} (${formatTime(claim.claimedAt)})`).join(', ')}
        </p>
      )}
      {problem && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {problem}
        </p>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          {changed && (
            <>
              <PrimaryButton disabled={busy} onClick={() => void run(() => onSave(draft))}>
                Save changes
              </PrimaryButton>
              <SecondaryButton
                disabled={busy}
                onClick={() =>
                  setDraft({
                    headline: item.headline,
                    subheadline: item.subheadline,
                    posterText: item.posterText,
                    caption: item.caption,
                    visual: item.visual,
                  })
                }
              >
                Undo
              </SecondaryButton>
            </>
          )}
          {item.status !== 'approved' && (
            <SecondaryButton
              disabled={busy || changed}
              title={changed ? 'Save or undo the changes first' : undefined}
              onClick={() => void run(() => onReview('approved'))}
              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
            >
              <Check size={16} weight="bold" /> Approve
            </SecondaryButton>
          )}
          {item.status !== 'rejected' && (
            <SecondaryButton disabled={busy || changed} onClick={() => void run(() => onReview('rejected'))}>
              <X size={16} weight="bold" /> Reject
            </SecondaryButton>
          )}
          {item.status !== 'draft' && (
            <SecondaryButton disabled={busy || changed} onClick={() => void run(() => onReview('draft'))}>
              <ArrowCounterClockwise size={16} /> Back to review
            </SecondaryButton>
          )}
          {item.status !== 'approved' && (!claims || claims.length === 0) && (
            <SecondaryButton disabled={busy} onClick={() => void run(onDelete)} className="ml-auto text-red-600 hover:bg-red-50">
              <Trash size={16} /> Remove
            </SecondaryButton>
          )}
        </div>
      )}
    </article>
  )
}
