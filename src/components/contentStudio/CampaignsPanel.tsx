import { useCallback, useEffect, useState } from 'react'
import { CaretRight, PencilSimpleLine, Plus, Sparkle } from '@phosphor-icons/react'
import {
  EMPTY_BRIEF,
  contentErrorMessage,
  createBrief,
  fetchBriefs,
  fetchCampaignCounts,
  totalCount,
  type Brief,
  type CampaignCounts,
  type SourceMode,
  type StudioAngle,
  type StudioSettings,
  type StudioStyle,
} from '../../lib/contentStudio'
import { CampaignWizard } from './CampaignWizard'
import { formatTime } from './format'
import { Chip, EmptyState, Field, Notice, OptionCard, PrimaryButton, Section, SecondaryButton, inputClass } from './ui'

type CampaignsPanelProps = {
  canEdit: boolean
  settings: StudioSettings
  styles: StudioStyle[]
  angles: StudioAngle[]
}

// The campaigns: a list with how far each one is, and one open campaign in its four steps.
export function CampaignsPanel({ canEdit, settings, styles, angles }: CampaignsPanelProps) {
  const [briefs, setBriefs] = useState<Brief[] | null>(null)
  const [counts, setCounts] = useState<Map<number, CampaignCounts>>(new Map())
  const [problem, setProblem] = useState<string | null>(null)
  const [open, setOpen] = useState<Brief | null>(null)
  const [starting, setStarting] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const load = useCallback(async () => {
    try {
      const [list, perCampaign] = await Promise.all([fetchBriefs(), fetchCampaignCounts()])
      setBriefs(list)
      setCounts(perCampaign)
      setProblem(null)
    } catch (failure) {
      setBriefs([])
      setProblem(contentErrorMessage(failure, 'The campaigns could not be loaded.'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (open) {
    return (
      <CampaignWizard
        key={open.id}
        brief={open}
        settings={settings}
        styles={styles}
        angles={angles}
        canEdit={canEdit}
        onSaved={(saved) => setBriefs((list) => (list ?? []).map((entry) => (entry.id === saved.id ? saved : entry)))}
        onBack={() => {
          setOpen(null)
          void load()
        }}
      />
    )
  }

  const shown = (briefs ?? []).filter((brief) => showArchived || !brief.archived)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-600">
          Each campaign goes through four steps: <b>1</b> give the material, <b>2</b> choose what to make, <b>3</b> the AI writes
          post ideas, <b>4</b> approve the ones staff may share.
        </p>
        {canEdit && !starting && (
          <PrimaryButton onClick={() => setStarting(true)}>
            <Plus size={16} weight="bold" /> New campaign
          </PrimaryButton>
        )}
      </div>

      {starting && (
        <NewCampaign
          styles={styles}
          angles={angles}
          onCancel={() => setStarting(false)}
          onCreated={(brief) => {
            setStarting(false)
            setBriefs((list) => [brief, ...(list ?? [])])
            setOpen(brief)
          }}
        />
      )}

      {problem && <Notice notice={{ text: problem, isError: true }} />}
      {briefs === null && <p className="py-10 text-center text-sm text-slate-500">Loading…</p>}
      {briefs !== null && shown.length === 0 && !starting && (
        <EmptyState title="No campaigns yet" text="Start one with “New campaign”. It takes about two minutes to get your first post ideas." />
      )}

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((brief) => {
          const posts = counts.get(brief.id) ?? { draft: 0, approved: 0, rejected: 0 }
          const written = posts.draft + posts.approved + posts.rejected
          const nextStep = written === 0 ? (brief.topic || brief.keyPoints ? 'Next: write post ideas' : 'Next: add the material') : posts.draft > 0 ? `${posts.draft} waiting for approval` : 'All posts checked'
          return (
            <li key={brief.id}>
              <button
                type="button"
                onClick={() => setOpen(brief)}
                className="flex h-full w-full flex-col rounded-2xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-[#fc0c97]"
              >
                <div className="flex w-full items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-base font-semibold text-slate-900">{brief.title}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {brief.sourceMode === 'upload' ? 'From uploaded material' : 'Typed in'} · {formatTime(brief.createdAt)}
                    </span>
                  </span>
                  <CaretRight size={18} className="mt-1 shrink-0 text-slate-400" />
                </div>
                <div className="mt-4 grid w-full grid-cols-3 gap-2 text-center">
                  <span className="rounded-xl bg-slate-50 py-2">
                    <span className="block text-lg font-bold text-slate-900">{written || totalCount(brief.counts)}</span>
                    <span className="block text-xs text-slate-500">{written ? 'ideas' : 'planned'}</span>
                  </span>
                  <span className="rounded-xl bg-amber-50 py-2">
                    <span className="block text-lg font-bold text-amber-800">{posts.draft}</span>
                    <span className="block text-xs text-amber-800">waiting</span>
                  </span>
                  <span className="rounded-xl bg-emerald-50 py-2">
                    <span className="block text-lg font-bold text-emerald-700">{posts.approved}</span>
                    <span className="block text-xs text-emerald-700">in library</span>
                  </span>
                </div>
                <span className="mt-3 flex items-center gap-2 text-sm font-medium text-[#be185d]">
                  {brief.archived ? <Chip>Archived</Chip> : nextStep}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {(briefs ?? []).some((brief) => brief.archived) && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="h-4 w-4" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived campaigns
        </label>
      )}
    </div>
  )
}

// Starting a campaign: its name and how the details will be given.
function NewCampaign({
  styles,
  angles,
  onCreated,
  onCancel,
}: {
  styles: StudioStyle[]
  angles: StudioAngle[]
  onCreated: (brief: Brief) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<SourceMode>('upload')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function start() {
    if (!title.trim()) {
      setProblem('Give the campaign a name.')
      return
    }
    setBusy(true)
    setProblem(null)
    try {
      const brief = await createBrief({
        ...EMPTY_BRIEF,
        title: title.trim(),
        sourceMode: mode,
        // The first styles and angles on show, so step 2 starts with a sensible choice.
        styleIds: styles.filter((style) => !style.hidden).slice(0, 2).map((style) => style.id),
        angleIds: angles.filter((angle) => !angle.hidden).slice(0, 3).map((angle) => angle.id),
      })
      onCreated(brief)
    } catch (failure) {
      setProblem(contentErrorMessage(failure, 'The campaign could not be started.'))
      setBusy(false)
    }
  }

  return (
    <Section title="Start a new campaign">
      <div className="space-y-4">
        <Field label="Campaign name">
          <input autoFocus className={inputClass} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. December Holiday Camp" />
        </Field>
        <div role="radiogroup" aria-label="How to give the details" className="grid gap-3 md:grid-cols-2">
          <OptionCard selected={mode === 'upload'} title="Upload my material, the AI reads it" description="Fastest: add a flyer, PDF or pictures and the AI fills in the details." icon={<Sparkle size={20} />} onSelect={() => setMode('upload')} />
          <OptionCard selected={mode === 'manual'} title="I'll type it myself" description="Fill in a short form about the campaign." icon={<PencilSimpleLine size={20} />} onSelect={() => setMode('manual')} />
        </div>
        {problem && <Notice notice={{ text: problem, isError: true }} />}
        <div className="flex flex-wrap gap-2">
          <PrimaryButton disabled={busy} onClick={() => void start()}>
            {busy ? 'Starting…' : 'Start'}
          </PrimaryButton>
          <SecondaryButton disabled={busy} onClick={onCancel}>
            Cancel
          </SecondaryButton>
        </div>
      </div>
    </Section>
  )
}
