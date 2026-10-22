import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Archive } from '@phosphor-icons/react'
import {
  contentErrorMessage,
  fetchBriefs,
  fetchItems,
  fetchUsageToday,
  setBriefArchived,
  totalCount,
  updateBrief,
  type Brief,
  type BriefDraft,
  type PlanItem,
  type StudioAngle,
  type StudioSettings,
  type StudioStyle,
  type UsageToday,
} from '../../lib/contentStudio'
import { useConfirm } from '../../hooks/useConfirm'
import { notifyPicturesReady, useContentImages } from '../../hooks/useContentImages'
import { StepMake } from './StepMake'
import { StepMaterial } from './StepMaterial'
import { StepApprove, StepIdeas } from './StepPosts'
import { GhostButton, Notice, PrimaryButton, SecondaryButton, StepFooter, Stepper, type NoticeValue } from './ui'

const STEPS = ['Material', 'What to make', 'Post ideas', 'Approve']

function draftOf(brief: Brief): BriefDraft {
  return {
    sourceMode: brief.sourceMode,
    sourceText: brief.sourceText,
    counts: brief.counts,
    title: brief.title,
    topic: brief.topic,
    keyPoints: brief.keyPoints,
    audience: brief.audience,
    callToAction: brief.callToAction,
    pdfText: brief.pdfText,
    files: brief.files,
    styleIds: brief.styleIds,
    angleIds: brief.angleIds,
    sizes: brief.sizes,
    carouselPages: brief.carouselPages,
  }
}

type CampaignWizardProps = {
  brief: Brief
  settings: StudioSettings
  styles: StudioStyle[]
  angles: StudioAngle[]
  canEdit: boolean
  onBack: () => void
  onSaved: (brief: Brief) => void
}

// One campaign, in four steps: 1 its material, 2 what to make, 3 the AI's post ideas, 4 approving them.
export function CampaignWizard({ brief: initial, settings, styles, angles, canEdit, onBack, onSaved }: CampaignWizardProps) {
  const [brief, setBrief] = useState(initial)
  const [draft, setDraft] = useState<BriefDraft>(() => draftOf(initial))
  const [items, setItems] = useState<PlanItem[] | null>(null)
  const [usage, setUsage] = useState<UsageToday | null>(null)
  const [step, setStep] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<NoticeValue>(null)
  const { confirm, dialog } = useConfirm()
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(brief))
  const drawing = useContentImages(
    (items ?? []).filter((item) => item.kind !== 'caption').map((item) => item.id),
    ({ done, failed }) => {
      const text = `${done} picture${done === 1 ? ' is' : 's are'} ready${failed > 0 ? `, ${failed} could not be drawn` : ''}.`
      setNotice({ text: `${text} Check them in steps 3 and 4.`, isError: failed > 0 })
      notifyPicturesReady(`${brief.title}: ${text}`)
      void fetchUsageToday().then(setUsage).catch(() => undefined)
    },
  )

  const loadPosts = useCallback(async () => {
    try {
      const [rows, today] = await Promise.all([fetchItems({ briefId: brief.id }), fetchUsageToday().catch(() => null)])
      setItems(rows)
      setUsage(today)
      // A campaign that already has posts opens on them; a new one on its material.
      setStep((current) => current ?? (rows.length > 0 ? (rows.some((row) => row.status === 'draft') ? 2 : 3) : 0))
    } catch (failure) {
      setNotice({ text: contentErrorMessage(failure, 'The posts could not be loaded.'), isError: true })
      setStep((current) => current ?? 0)
    }
  }, [brief.id])

  useEffect(() => {
    void loadPosts()
  }, [loadPosts])

  async function save(next: BriefDraft): Promise<string | null> {
    try {
      const saved = await updateBrief(brief.id, next)
      setBrief(saved)
      onSaved(saved)
      return null
    } catch (failure) {
      return contentErrorMessage(failure, 'The campaign could not be saved.')
    }
  }

  // After the AI filled the details in, take them from the database (it saved them there).
  async function reload() {
    const fresh = (await fetchBriefs()).find((entry) => entry.id === brief.id)
    if (fresh) {
      setBrief(fresh)
      setDraft(draftOf(fresh))
      onSaved(fresh)
    }
  }

  function problemWith(index: number): string | null {
    if (index === 0) {
      if (!draft.title.trim()) return 'Give the campaign a name.'
      if (!draft.topic.trim() && !draft.keyPoints.trim()) {
        return draft.sourceMode === 'upload' ? 'Let the AI read your material first, or fill in the details.' : 'Say what you are promoting.'
      }
    }
    if (index === 1) {
      if (totalCount(draft.counts) === 0) return 'Ask for at least one post.'
      if (draft.styleIds.length === 0) return 'Pick at least one style.'
    }
    return null
  }

  async function go(next: number) {
    setNotice(null)
    if (step !== null && next > step) {
      const problem = problemWith(step)
      if (problem) {
        setNotice({ text: problem, isError: true })
        return
      }
    }
    if (dirty && canEdit) {
      setSaving(true)
      const problem = await save(draft)
      setSaving(false)
      if (problem) {
        setNotice({ text: problem, isError: true })
        return
      }
    }
    setStep(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function leave() {
    if (dirty && canEdit && !(await confirm('This campaign has changes that are not saved yet. Save them before leaving?', { confirmLabel: 'Save and leave', cancelLabel: 'Stay' }))) {
      return
    }
    if (dirty && canEdit) {
      const problem = await save(draft)
      if (problem) {
        setNotice({ text: problem, isError: true })
        return
      }
    }
    onBack()
  }

  const current = step ?? 0
  const done = (index: number) =>
    index === 0 ? Boolean(brief.title && (brief.topic || brief.keyPoints)) : index === 1 ? (items?.length ?? 0) > 0 : index === 2 ? (items?.length ?? 0) > 0 : (items ?? []).some((item) => item.status === 'approved')
  const shared = { brief, items: items ?? [], settings, styles, angles, canEdit, onChanged: loadPosts, drawing, usage }
  const nextLabel = ['Next: what to make', 'Next: post ideas', 'Next: approve'][current]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SecondaryButton onClick={() => void leave()}>
          <ArrowLeft size={16} /> All campaigns
        </SecondaryButton>
        <h2 className="min-w-0 flex-1 truncate text-xl font-semibold text-slate-900">{draft.title || 'New campaign'}</h2>
        {canEdit && (
          <GhostButton
            onClick={() =>
              void setBriefArchived(brief.id, !brief.archived)
                .then(onBack)
                .catch((failure) => setNotice({ text: contentErrorMessage(failure, 'Could not archive.'), isError: true }))
            }
          >
            <Archive size={16} /> {brief.archived ? 'Bring back' : 'Archive'}
          </GhostButton>
        )}
      </div>

      <Stepper steps={STEPS} current={current} done={done} onPick={(index) => void go(index)} />

      {step === null || items === null ? (
        <p className="py-10 text-center text-sm text-slate-500">Loading…</p>
      ) : current === 0 ? (
        <StepMaterial brief={brief} draft={draft} canEdit={canEdit} onChange={setDraft} onSave={save} onReload={reload} />
      ) : current === 1 ? (
        <StepMake draft={draft} styles={styles} angles={angles} canEdit={canEdit} usage={usage} onChange={setDraft} />
      ) : current === 2 ? (
        <StepIdeas {...shared} />
      ) : (
        <StepApprove {...shared} />
      )}

      <Notice notice={notice} />
      <StepFooter>
        {current > 0 ? (
          <SecondaryButton onClick={() => void go(current - 1)}>
            <ArrowLeft size={16} /> Back
          </SecondaryButton>
        ) : (
          <span />
        )}
        {current < STEPS.length - 1 && (
          <PrimaryButton disabled={saving} onClick={() => void go(current + 1)}>
            {saving ? 'Saving…' : nextLabel} <ArrowRight size={16} />
          </PrimaryButton>
        )}
      </StepFooter>
      {dialog}
    </div>
  )
}
