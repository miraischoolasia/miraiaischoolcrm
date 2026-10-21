import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Plus, Sparkle } from '@phosphor-icons/react'
import {
  contentErrorMessage,
  createBrief,
  deleteItem,
  fetchBriefs,
  fetchItems,
  fetchUsageToday,
  generateMore,
  generatePlan,
  reviewItems,
  setBriefArchived,
  updateBrief,
  updateItem,
  type Brief,
  type BriefDraft,
  type PlanItem,
  type StudioAngle,
  type StudioSettings,
  type StudioStyle,
} from '../../lib/contentStudio'
import { useConfirm } from '../../hooks/useConfirm'
import { BriefForm } from './BriefForm'
import { PlanItemCard } from './PlanItemCard'
import { Chip, Notice, PrimaryButton, SecondaryButton, smallInputClass, type NoticeValue } from './ui'
import { formatTime } from './format'

type BriefsPanelProps = {
  canEdit: boolean
  settings: StudioSettings
  styles: StudioStyle[]
  angles: StudioAngle[]
}

// The campaigns: a list, and one open campaign with its brief and its plan.
export function BriefsPanel({ canEdit, settings, styles, angles }: BriefsPanelProps) {
  const [briefs, setBriefs] = useState<Brief[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [open, setOpen] = useState<number | 'new' | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const [dirty, setDirty] = useState(false)
  const { confirm, dialog } = useConfirm()

  const load = useCallback(async () => {
    try {
      setBriefs(await fetchBriefs())
      setProblem(null)
    } catch (failure) {
      setProblem(contentErrorMessage(failure, 'The briefs could not be loaded.'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function leave() {
    if (dirty && !(await confirm('This brief has changes you have not saved. Leave without saving?', { confirmLabel: 'Leave' }))) {
      return
    }
    setDirty(false)
    setOpen(null)
    void load()
  }

  const openBrief = typeof open === 'number' ? (briefs?.find((brief) => brief.id === open) ?? null) : null

  if (open === 'new' || openBrief) {
    return (
      <section className="space-y-4">
        <SecondaryButton onClick={() => void leave()}>
          <ArrowLeft size={16} /> All campaigns
        </SecondaryButton>
        <BriefWorkspace
          key={open === 'new' ? 'new' : openBrief!.id}
          brief={openBrief}
          canEdit={canEdit}
          settings={settings}
          styles={styles}
          angles={angles}
          onDirtyChange={setDirty}
          onSaved={(saved) => {
            setBriefs((current) => {
              const list = current ?? []
              return list.some((brief) => brief.id === saved.id)
                ? list.map((brief) => (brief.id === saved.id ? saved : brief))
                : [saved, ...list]
            })
            setOpen(saved.id)
          }}
          onArchived={() => {
            setOpen(null)
            void load()
          }}
        />
        {dialog}
      </section>
    )
  }

  const shown = (briefs ?? []).filter((brief) => showArchived || !brief.archived)
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-600">
          Write a brief for each campaign. The AI turns it into a plan of posts (headline, poster words, caption); you
          change what you like, then approve the posts staff may share.
        </p>
        {canEdit && (
          <PrimaryButton onClick={() => setOpen('new')}>
            <Plus size={16} weight="bold" /> New brief
          </PrimaryButton>
        )}
      </div>
      {problem && <Notice notice={{ text: problem, isError: true }} />}
      {briefs === null && !problem && <p className="py-10 text-center text-sm text-slate-500">Loading…</p>}
      {briefs !== null && shown.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-14 text-center">
          <p className="font-semibold text-slate-900">No campaigns yet</p>
          <p className="mt-1 text-sm text-slate-500">Start with “New brief”.</p>
        </div>
      )}
      <ul className="space-y-2">
        {shown.map((brief) => (
          <li key={brief.id}>
            <button
              type="button"
              onClick={() => setOpen(brief.id)}
              className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-[#fc0c97]"
            >
              <span className="min-w-0 flex-1 font-semibold text-slate-900">{brief.title}</span>
              {brief.archived && <Chip>Archived</Chip>}
              <span className="text-xs text-slate-500">{formatTime(brief.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
      {(briefs ?? []).some((brief) => brief.archived) && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
        </label>
      )}
    </section>
  )
}

type BriefWorkspaceProps = {
  brief: Brief | null
  canEdit: boolean
  settings: StudioSettings
  styles: StudioStyle[]
  angles: StudioAngle[]
  onDirtyChange: (dirty: boolean) => void
  onSaved: (brief: Brief) => void
  onArchived: () => void
}

function BriefWorkspace({ brief, canEdit, settings, styles, angles, onDirtyChange, onSaved, onArchived }: BriefWorkspaceProps) {
  const [items, setItems] = useState<PlanItem[] | null>(null)
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null)
  const [notice, setNotice] = useState<NoticeValue>(null)
  const [working, setWorking] = useState(false)
  const [moreCount, setMoreCount] = useState(3)
  const [formDirty, setFormDirty] = useState(false)
  const briefId = brief?.id ?? null

  const styleNames = useMemo(() => new Map(styles.map((style) => [style.id, style.name])), [styles])
  const angleNames = useMemo(() => new Map(angles.map((angle) => [angle.id, angle.name])), [angles])

  const loadItems = useCallback(async () => {
    if (briefId === null) return
    try {
      const [rows, today] = await Promise.all([fetchItems({ briefId }), fetchUsageToday().catch(() => null)])
      setItems(rows)
      setUsage(today)
    } catch (failure) {
      setNotice({ text: contentErrorMessage(failure, 'The plan could not be loaded.'), isError: true })
    }
  }, [briefId])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  function markDirty(value: boolean) {
    setFormDirty(value)
    onDirtyChange(value)
  }

  async function saveBrief(draft: BriefDraft): Promise<string | null> {
    try {
      const saved = brief ? await updateBrief(brief.id, draft) : await createBrief(draft)
      onSaved(saved)
      return null
    } catch (failure) {
      return contentErrorMessage(failure, 'The brief could not be saved.')
    }
  }

  async function ask(action: () => ReturnType<typeof generatePlan>) {
    setWorking(true)
    setNotice(null)
    const answer = await action()
    setWorking(false)
    if (!answer.ok) {
      setNotice({ text: answer.error, isError: true })
    } else {
      setNotice({
        text: answer.value.warning || `${answer.value.added} new row${answer.value.added === 1 ? '' : 's'} added. Change anything you like, then approve.`,
        isError: Boolean(answer.value.warning),
      })
    }
    await loadItems()
  }

  async function wrap(action: () => Promise<void>, fallback: string): Promise<string | null> {
    try {
      await action()
      await loadItems()
      return null
    } catch (failure) {
      return contentErrorMessage(failure, failure instanceof Error && failure.message ? failure.message : fallback)
    }
  }

  const drafts = (items ?? []).filter((item) => item.status === 'draft')
  const limitLeft = usage ? Math.max(0, usage.limit - usage.used) : null

  return (
    <div className="space-y-5">
      <BriefForm
        brief={brief}
        styles={styles}
        angles={angles}
        canEdit={canEdit}
        onSave={saveBrief}
        onFilesChanged={saveBrief}
        onDirtyChange={markDirty}
      />

      {brief && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Plan</h2>
              {usage && (
                <p className="text-xs text-slate-500">
                  AI today: {usage.used} of {usage.limit} rows used
                </p>
              )}
            </div>
            {canEdit && items !== null && (
              <div className="flex flex-wrap items-center gap-2">
                {items.length === 0 ? (
                  <PrimaryButton
                    disabled={working || formDirty || (limitLeft !== null && limitLeft < brief.itemCount)}
                    title={formDirty ? 'Save the brief first' : undefined}
                    onClick={() => void ask(() => generatePlan(brief.id))}
                  >
                    <Sparkle size={16} weight="fill" /> {working ? 'Writing the plan…' : `Make the plan (${brief.itemCount} posts)`}
                  </PrimaryButton>
                ) : (
                  <>
                    <select aria-label="How many more" className={`${smallInputClass} w-20`} value={moreCount} onChange={(e) => setMoreCount(Number(e.target.value))}>
                      {[1, 2, 3, 4, 5, 6].map((count) => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </select>
                    <SecondaryButton
                      disabled={working || formDirty || (limitLeft !== null && limitLeft < moreCount)}
                      title={formDirty ? 'Save the brief first' : undefined}
                      onClick={() => void ask(() => generateMore(brief.id, moreCount))}
                    >
                      <Sparkle size={16} /> {working ? 'Thinking…' : 'A few more'}
                    </SecondaryButton>
                    {drafts.length > 1 && (
                      <SecondaryButton
                        disabled={working}
                        className="border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                        onClick={() =>
                          void wrap(() => reviewItems(drafts.map((item) => item.id), 'approved'), 'Could not approve.').then((failure) =>
                            setNotice(failure ? { text: failure, isError: true } : { text: `${drafts.length} posts approved.`, isError: false }),
                          )
                        }
                      >
                        Approve all {drafts.length} waiting
                      </SecondaryButton>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          {formDirty && canEdit && <p className="text-sm text-amber-700">Save the brief before asking the AI, so it reads your latest words.</p>}
          {limitLeft !== null && limitLeft === 0 && <p className="text-sm text-amber-700">Today’s AI limit is used up. It starts again at midnight.</p>}
          <Notice notice={notice} />
          {working && <p className="text-sm text-slate-500">The AI is writing; this takes about 10–40 seconds.</p>}
          {items !== null && items.length === 0 && !working && (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
              No plan yet.
            </p>
          )}
          <div className="space-y-3">
            {(items ?? []).map((item) => (
              <PlanItemCard
                key={item.id}
                item={item}
                styleName={item.styleId ? (styleNames.get(item.styleId) ?? null) : null}
                angleName={item.angleId ? (angleNames.get(item.angleId) ?? null) : null}
                bannedWords={settings.bannedWords}
                canEdit={canEdit}
                onSave={(edit) => wrap(() => updateItem(item.id, edit), 'The row could not be saved.')}
                onDelete={() => wrap(() => deleteItem(item.id), 'The row could not be removed.')}
                onReview={(status) => wrap(() => reviewItems([item.id], status), 'The review could not be saved.')}
              />
            ))}
          </div>
          {canEdit && (
            <SecondaryButton
              onClick={() =>
                void setBriefArchived(brief.id, !brief.archived)
                  .then(onArchived)
                  .catch((failure) => setNotice({ text: contentErrorMessage(failure, 'Could not archive.'), isError: true }))
              }
            >
              {brief.archived ? 'Bring back this campaign' : 'Archive this campaign'}
            </SecondaryButton>
          )}
        </section>
      )}
    </div>
  )
}
