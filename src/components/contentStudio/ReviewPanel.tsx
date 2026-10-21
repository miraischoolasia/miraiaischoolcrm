import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { PlanItemCard } from './PlanItemCard'
import { Notice, SecondaryButton, Tabs, type NoticeValue } from './ui'

type ReviewPanelProps = {
  canEdit: boolean
  settings: StudioSettings
  styles: StudioStyle[]
  angles: StudioAngle[]
}

const TABS: { key: ItemStatus; label: string }[] = [
  { key: 'draft', label: 'Waiting for review' },
  { key: 'approved', label: 'In the library' },
  { key: 'rejected', label: 'Rejected' },
]

// Every campaign's posts by review state; approved ones show who claimed them.
export function ReviewPanel({ canEdit, settings, styles, angles }: ReviewPanelProps) {
  const [status, setStatus] = useState<ItemStatus>('draft')
  const [items, setItems] = useState<PlanItem[] | null>(null)
  const [briefs, setBriefs] = useState<Map<number, Brief>>(new Map())
  const [claims, setClaims] = useState<ItemClaim[]>([])
  const [notice, setNotice] = useState<NoticeValue>(null)

  const styleNames = useMemo(() => new Map(styles.map((style) => [style.id, style.name])), [styles])
  const angleNames = useMemo(() => new Map(angles.map((angle) => [angle.id, angle.name])), [angles])

  const load = useCallback(async () => {
    try {
      const [rows, briefList] = await Promise.all([fetchItems({ status }), fetchBriefs()])
      setItems(rows)
      setBriefs(new Map(briefList.map((brief) => [brief.id, brief])))
      setClaims(status === 'draft' ? [] : await fetchClaims(rows.map((row) => row.id)))
    } catch (failure) {
      setNotice({ text: contentErrorMessage(failure, 'The posts could not be loaded.'), isError: true })
    }
  }, [status])

  useEffect(() => {
    setItems(null)
    void load()
  }, [load])

  async function wrap(action: () => Promise<void>, fallback: string): Promise<string | null> {
    try {
      await action()
      await load()
      return null
    } catch (failure) {
      return contentErrorMessage(failure, failure instanceof Error && failure.message ? failure.message : fallback)
    }
  }

  return (
    <section className="space-y-4">
      <Tabs label="Review" tabs={TABS} value={status} onChange={setStatus} />
      <Notice notice={notice} />
      {status === 'draft' && canEdit && items !== null && items.length > 1 && (
        <SecondaryButton
          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
          onClick={() =>
            void wrap(() => reviewItems(items.map((item) => item.id), 'approved'), 'Could not approve.').then((failure) =>
              setNotice(failure ? { text: failure, isError: true } : { text: `${items.length} posts approved.`, isError: false }),
            )
          }
        >
          Approve all {items.length}
        </SecondaryButton>
      )}
      {items === null && <p className="py-10 text-center text-sm text-slate-500">Loading…</p>}
      {items !== null && items.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">Nothing here.</p>
      )}
      <div className="space-y-3">
        {(items ?? []).map((item) => (
          <PlanItemCard
            key={item.id}
            item={item}
            briefTitle={briefs.get(item.briefId)?.title}
            styleName={item.styleId ? (styleNames.get(item.styleId) ?? null) : null}
            angleName={item.angleId ? (angleNames.get(item.angleId) ?? null) : null}
            bannedWords={settings.bannedWords}
            canEdit={canEdit}
            claims={claims.filter((claim) => claim.itemId === item.id)}
            claimLimit={settings.claimLimit}
            onSave={(edit) => wrap(() => updateItem(item.id, edit), 'The row could not be saved.')}
            onDelete={() => wrap(() => deleteItem(item.id), 'The row could not be removed.')}
            onReview={(next) => wrap(() => reviewItems([item.id], next), 'The review could not be saved.')}
          />
        ))}
      </div>
    </section>
  )
}
