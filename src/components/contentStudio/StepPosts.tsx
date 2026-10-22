import { useEffect, useMemo, useState } from 'react'
import { Check, CircleNotch, Image as ImageIcon, Sparkle } from '@phosphor-icons/react'
import {
  CONTENT_KINDS,
  KIND_LABELS,
  contentErrorMessage,
  deleteItem,
  fetchClaims,
  generateMore,
  generatePlan,
  reviewItems,
  totalCount,
  updateItem,
  type Brief,
  type ContentKind,
  type ItemClaim,
  type ItemStatus,
  type PlanItem,
  type StudioAngle,
  type StudioSettings,
  type StudioStyle,
} from '../../lib/contentStudio'
import { queueImages } from '../../lib/contentImages'
import { askToNotify, type useContentImages } from '../../hooks/useContentImages'
import { PostCard } from './PostCard'
import { EmptyState, Notice, PrimaryButton, SecondaryButton, Tabs, smallInputClass, type NoticeValue } from './ui'

type Shared = {
  brief: Brief
  items: PlanItem[]
  settings: StudioSettings
  styles: StudioStyle[]
  angles: StudioAngle[]
  canEdit: boolean
  // Reloads the posts (and today's AI use) after a change.
  onChanged: () => Promise<void>
  // The pictures of the campaign's posts, kept up to date while any is being drawn.
  drawing: ReturnType<typeof useContentImages>
  usage: { used: number; limit: number; imagesUsed: number; imagesLimit: number } | null
}

// "Draw pictures": every post without a picture gets a draft; shows how far the drawing is.
function DrawingBar({ items, drawing, usage, canEdit }: Pick<Shared, 'items' | 'drawing' | 'usage' | 'canEdit'>) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<NoticeValue>(null)
  const drawable = items.filter((item) => item.kind !== 'caption' && item.status !== 'rejected')
  const withoutPicture = drawable.filter((item) => !drawing.images.some((image) => image.itemId === item.id && image.status !== 'failed'))
  const pagesNeeded = withoutPicture.reduce((sum, item) => sum + (item.kind === 'carousel' ? item.pages : 1), 0)
  const { waiting, done } = drawing.progress
  const left = usage ? Math.max(0, usage.imagesLimit - usage.imagesUsed) : null
  if (drawable.length === 0) return null

  async function drawAll() {
    askToNotify()
    setBusy(true)
    setNotice(null)
    try {
      const queued = await queueImages(withoutPicture.map((item) => item.id), 'draft')
      await drawing.refresh()
      setNotice({ text: `${queued} picture${queued === 1 ? ' is' : 's are'} being drawn. You can leave this page; they keep drawing.`, isError: false })
    } catch (failure) {
      setNotice({ text: contentErrorMessage(failure, failure instanceof Error && failure.message ? failure.message : 'Could not start drawing.'), isError: true })
    }
    setBusy(false)
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff1f8] text-[#be185d]">
          {waiting > 0 ? <CircleNotch size={20} className="animate-spin" /> : <ImageIcon size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">
            {waiting > 0 ? `Drawing pictures… ${done} ready, ${waiting} to go` : done > 0 ? `${done} picture${done === 1 ? '' : 's'} ready` : 'Pictures'}
          </p>
          {waiting > 0 ? (
            <div className="mt-2 h-2 w-full max-w-md overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[#fc0c97] transition-all" style={{ width: `${Math.round((done / Math.max(1, done + waiting)) * 100)}%` }} />
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Drafts first (quick). Keep the ones you like, then make them HD.
              {left !== null ? ` The AI can draw ${left} more today.` : ''}
            </p>
          )}
        </div>
        {canEdit && withoutPicture.length > 0 && (
          <PrimaryButton disabled={busy || (left !== null && left < pagesNeeded)} onClick={() => void drawAll()}>
            <Sparkle size={16} weight="fill" /> Draw {pagesNeeded} picture{pagesNeeded === 1 ? '' : 's'}
          </PrimaryButton>
        )}
      </div>
      <Notice notice={notice && (notice.isError || waiting > 0) ? notice : null} />
    </div>
  )
}

function useNames(styles: StudioStyle[], angles: StudioAngle[]) {
  return useMemo(
    () => ({
      style: new Map(styles.map((style) => [style.id, style.name])),
      angle: new Map(angles.map((angle) => [angle.id, angle.name])),
    }),
    [styles, angles],
  )
}

async function attempt(action: () => Promise<void>, fallback: string): Promise<string | null> {
  try {
    await action()
    return null
  } catch (failure) {
    return contentErrorMessage(failure, failure instanceof Error && failure.message ? failure.message : fallback)
  }
}

// Step 3: the AI writes the post ideas; the team reads them, changes words, removes some, asks for more.
export function StepIdeas({ brief, items, settings, styles, angles, canEdit, onChanged, usage, drawing }: Shared) {
  const names = useNames(styles, angles)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState<NoticeValue>(null)
  const [kindFilter, setKindFilter] = useState<'all' | ContentKind>('all')
  const [moreCount, setMoreCount] = useState(3)
  const [moreKind, setMoreKind] = useState<ContentKind>(brief.counts.single > 0 ? 'single' : brief.counts.carousel > 0 ? 'carousel' : 'caption')
  const total = totalCount(brief.counts)
  const left = usage ? Math.max(0, usage.limit - usage.used) : null

  async function ask(action: () => ReturnType<typeof generatePlan>) {
    setWorking(true)
    setNotice(null)
    const answer = await action()
    setWorking(false)
    if (!answer.ok) setNotice({ text: answer.error, isError: true })
    else
      setNotice({
        text: answer.value.warning || `${answer.value.added} post idea${answer.value.added === 1 ? '' : 's'} written. Read them, change any words, then go to step 4 to approve.`,
        isError: Boolean(answer.value.warning),
      })
    await onChanged()
  }

  const counted = CONTENT_KINDS.map((kind) => ({ kind, count: items.filter((item) => item.kind === kind).length }))
  const shown = kindFilter === 'all' ? items : items.filter((item) => item.kind === kindFilter)

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <Notice notice={notice} />
        <EmptyState
          title={working ? 'The AI is writing your post ideas…' : `Ready to write ${total} post idea${total === 1 ? '' : 's'}`}
          text={
            working
              ? 'This takes about 10–60 seconds. You can stay on this page.'
              : `${brief.counts.single} single posters, ${brief.counts.carousel} carousels and ${brief.counts.caption} captions only, in the styles and angles you picked.`
          }
        >
          {canEdit && !working && (
            <PrimaryButton disabled={total === 0 || (left !== null && left < total)} onClick={() => void ask(() => generatePlan(brief.id))}>
              <Sparkle size={16} weight="fill" /> Write {total} post ideas
            </PrimaryButton>
          )}
        </EmptyState>
        {left !== null && left < total && <p className="text-center text-sm text-amber-700">The AI can only write {left} more today. Lower the numbers in step 2.</p>}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <Tabs
          label="Type"
          value={kindFilter}
          onChange={setKindFilter}
          tabs={[
            { key: 'all' as const, label: `All · ${items.length}` },
            ...counted.filter((entry) => entry.count > 0).map((entry) => ({ key: entry.kind, label: `${KIND_LABELS[entry.kind]} · ${entry.count}` })),
          ]}
        />
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-600">Add</span>
            <select aria-label="How many more" className={`${smallInputClass} w-20`} value={moreCount} onChange={(e) => setMoreCount(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 8, 10].map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
            <select aria-label="Type of the new ideas" className={`${smallInputClass} w-48`} value={moreKind} onChange={(e) => setMoreKind(e.target.value as ContentKind)}>
              {CONTENT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
            <SecondaryButton disabled={working || (left !== null && left < moreCount)} onClick={() => void ask(() => generateMore(brief.id, moreCount, moreKind))}>
              <Sparkle size={16} /> {working ? 'Writing…' : 'More ideas'}
            </SecondaryButton>
          </div>
        )}
      </div>
      <Notice notice={notice} />
      <DrawingBar items={items} drawing={drawing} usage={usage} canEdit={canEdit} />
      <div className="space-y-4">
        {shown.map((item) => (
          <PostCard
            key={`${item.id}:${item.status}`}
            item={item}
            mode="ideas"
            styleName={item.styleId ? (names.style.get(item.styleId) ?? null) : null}
            angleName={item.angleId ? (names.angle.get(item.angleId) ?? null) : null}
            bannedWords={settings.bannedWords}
            canEdit={canEdit}
            pictures={{ images: drawing.images, urls: drawing.urls, onChanged: drawing.refresh }}
            onSave={(edit) => attempt(() => updateItem(item.id, edit), 'The words could not be saved.').then(async (problem) => (problem ?? (await onChanged(), null)))}
            onDelete={() => attempt(() => deleteItem(item.id), 'The idea could not be removed.').then(async (problem) => (problem ?? (await onChanged(), null)))}
            onReview={(status) => attempt(() => reviewItems([item.id], status), 'Could not save.').then(async (problem) => (problem ?? (await onChanged(), null)))}
          />
        ))}
      </div>
    </div>
  )
}

const STATUS_TABS: { key: ItemStatus; label: string }[] = [
  { key: 'draft', label: 'Waiting' },
  { key: 'approved', label: 'In the library' },
  { key: 'rejected', label: 'Not used' },
]

// Step 4: approve the posts staff may use; approved ones show who has taken them.
export function StepApprove({ brief, items, settings, styles, angles, canEdit, onChanged, drawing, usage }: Shared) {
  const names = useNames(styles, angles)
  const [status, setStatus] = useState<ItemStatus>('draft')
  const [claims, setClaims] = useState<ItemClaim[]>([])
  const [notice, setNotice] = useState<NoticeValue>(null)
  const counts = { draft: 0, approved: 0, rejected: 0 }
  for (const item of items) counts[item.status] += 1
  const shown = items.filter((item) => item.status === status)
  const approvedIds = items.filter((item) => item.status === 'approved').map((item) => item.id).join(',')

  useEffect(() => {
    let cancelled = false
    const ids = approvedIds ? approvedIds.split(',').map(Number) : []
    fetchClaims(ids)
      .then((rows) => {
        if (!cancelled) setClaims(rows)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [approvedIds])

  const waiting = items.filter((item) => item.status === 'draft')
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            aria-pressed={status === tab.key}
            onClick={() => setStatus(tab.key)}
            className={`rounded-2xl border-2 p-4 text-left transition-colors ${status === tab.key ? 'border-[#fc0c97] bg-[#fff1f8]' : 'border-slate-200 bg-white hover:border-slate-300'}`}
          >
            <p className="text-2xl font-bold text-slate-900">{counts[tab.key]}</p>
            <p className="text-sm font-medium text-slate-600">{tab.label}</p>
          </button>
        ))}
      </div>
      {status === 'draft' && canEdit && waiting.length > 1 && (
        <PrimaryButton
          onClick={() =>
            void attempt(() => reviewItems(waiting.map((item) => item.id), 'approved'), 'Could not approve.').then(async (problem) => {
              setNotice(problem ? { text: problem, isError: true } : { text: `${waiting.length} posts approved. Staff can now use them in the Content Library.`, isError: false })
              await onChanged()
            })
          }
        >
          <Check size={16} weight="bold" /> Approve all {waiting.length} waiting
        </PrimaryButton>
      )}
      <Notice notice={notice} />
      <DrawingBar items={items} drawing={drawing} usage={usage} canEdit={canEdit} />
      {shown.length === 0 ? (
        <EmptyState
          title={status === 'draft' ? 'Nothing is waiting' : status === 'approved' ? 'No post is in the library yet' : 'No post was left out'}
          text={status === 'draft' && items.length === 0 ? 'Write the post ideas in step 3 first.' : undefined}
        />
      ) : (
        <div className="space-y-4">
          {shown.map((item) => (
            <PostCard
              key={`${item.id}:${item.status}`}
              item={item}
              mode="approve"
              styleName={item.styleId ? (names.style.get(item.styleId) ?? null) : null}
              angleName={item.angleId ? (names.angle.get(item.angleId) ?? null) : null}
              bannedWords={settings.bannedWords}
              canEdit={canEdit}
              pictures={{ images: drawing.images, urls: drawing.urls, onChanged: drawing.refresh }}
              claims={claims.filter((claim) => claim.itemId === item.id)}
              claimLimit={settings.claimLimit}
              onSave={(edit) => attempt(() => updateItem(item.id, edit), 'The words could not be saved.').then(async (problem) => (problem ?? (await onChanged(), null)))}
              onDelete={() => attempt(() => deleteItem(item.id), 'Could not remove.').then(async (problem) => (problem ?? (await onChanged(), null)))}
              onReview={(next) => attempt(() => reviewItems([item.id], next), 'Could not save.').then(async (problem) => (problem ?? (await onChanged(), null)))}
            />
          ))}
        </div>
      )}
      <p className="text-sm text-slate-500">Approved posts appear in Marketing › Content Library, where staff take them to share. Campaign: {brief.title}</p>
    </div>
  )
}
