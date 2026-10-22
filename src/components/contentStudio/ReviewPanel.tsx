import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check } from '@phosphor-icons/react'
import {
  contentErrorMessage,
  deleteItem,
  fetchBriefs,
  fetchClaims,
  fetchItems,
  reviewItems,
  updateItem,
  type Brief,
  type ItemClaim,
  type ItemStatus,
  type PlanItem,
  type StudioAngle,
  type StudioSettings,
  type StudioStyle,
} from '../../lib/contentStudio'
import { useContentImages } from '../../hooks/useContentImages'
import { PostCard } from './PostCard'
import { EmptyState, Notice, PrimaryButton, type NoticeValue } from './ui'

type ReviewPanelProps = {
  canEdit: boolean
  settings: StudioSettings
  styles: StudioStyle[]
  angles: StudioAngle[]
}

const STATUSES: { key: ItemStatus; label: string }[] = [
  { key: 'draft', label: 'Waiting' },
  { key: 'approved', label: 'In the library' },
  { key: 'rejected', label: 'Not used' },
]

// Every campaign's posts by state, to approve in one place.
export function ReviewPanel({ canEdit, settings, styles, angles }: ReviewPanelProps) {
  const [status, setStatus] = useState<ItemStatus>('draft')
  const [items, setItems] = useState<PlanItem[] | null>(null)
  const [briefs, setBriefs] = useState<Map<number, Brief>>(new Map())
  const [claims, setClaims] = useState<ItemClaim[]>([])
  const [notice, setNotice] = useState<NoticeValue>(null)
  const styleNames = useMemo(() => new Map(styles.map((style) => [style.id, style.name])), [styles])
  const angleNames = useMemo(() => new Map(angles.map((angle) => [angle.id, angle.name])), [angles])
  const drawing = useContentImages((items ?? []).filter((item) => item.kind !== 'caption').map((item) => item.id))

  const load = useCallback(async () => {
    try {
      const [rows, briefList] = await Promise.all([fetchItems({ status }), fetchBriefs()])
      setItems(rows)
      setBriefs(new Map(briefList.map((brief) => [brief.id, brief])))
      setClaims(status === 'approved' ? await fetchClaims(rows.map((row) => row.id)) : [])
    } catch (failure) {
      setItems([])
      setNotice({ text: contentErrorMessage(failure, 'The posts could not be loaded.'), isError: true })
    }
  }, [status])

  useEffect(() => {
    setItems(null)
    void load()
  }, [load])

  async function attempt(action: () => Promise<void>, fallback: string): Promise<string | null> {
    try {
      await action()
      await load()
      return null
    } catch (failure) {
      return contentErrorMessage(failure, failure instanceof Error && failure.message ? failure.message : fallback)
    }
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Post state" className="grid gap-3 sm:grid-cols-3">
        {STATUSES.map((entry) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            aria-selected={status === entry.key}
            onClick={() => setStatus(entry.key)}
            className={`min-h-14 rounded-2xl border-2 px-4 text-left text-sm font-semibold transition-colors ${status === entry.key ? 'border-[#fc0c97] bg-[#fff1f8] text-[#be185d]' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
          >
            {entry.label}
            {status === entry.key && items ? ` · ${items.length}` : ''}
          </button>
        ))}
      </div>
      {status === 'draft' && canEdit && items !== null && items.length > 1 && (
        <PrimaryButton
          onClick={() =>
            void attempt(() => reviewItems(items.map((item) => item.id), 'approved'), 'Could not approve.').then((problem) =>
              setNotice(problem ? { text: problem, isError: true } : { text: `${items.length} posts approved.`, isError: false }),
            )
          }
        >
          <Check size={16} weight="bold" /> Approve all {items.length}
        </PrimaryButton>
      )}
      <Notice notice={notice} />
      {items === null && <p className="py-10 text-center text-sm text-slate-500">Loading…</p>}
      {items !== null && items.length === 0 && <EmptyState title={status === 'draft' ? 'Nothing is waiting for approval' : 'Nothing here'} />}
      <div className="space-y-4">
        {(items ?? []).map((item) => (
          <PostCard
            key={`${item.id}:${item.status}`}
            item={item}
            mode="approve"
            campaignName={briefs.get(item.briefId)?.title}
            styleName={item.styleId ? (styleNames.get(item.styleId) ?? null) : null}
            angleName={item.angleId ? (angleNames.get(item.angleId) ?? null) : null}
            bannedWords={settings.bannedWords}
            canEdit={canEdit}
            pictures={{ images: drawing.images, urls: drawing.urls, onChanged: drawing.refresh }}
            claims={claims.filter((claim) => claim.itemId === item.id)}
            claimLimit={settings.claimLimit}
            onSave={(edit) => attempt(() => updateItem(item.id, edit), 'The words could not be saved.')}
            onDelete={() => attempt(() => deleteItem(item.id), 'Could not remove.')}
            onReview={(next) => attempt(() => reviewItems([item.id], next), 'Could not save.')}
          />
        ))}
      </div>
    </div>
  )
}
