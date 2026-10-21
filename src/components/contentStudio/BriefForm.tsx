import { useState } from 'react'
import { FilePdf, Image as ImageIcon, Trash, UploadSimple } from '@phosphor-icons/react'
import {
  CONTENT_KINDS,
  CONTENT_SIZES,
  KIND_LABELS,
  SIZE_LABELS,
  contentErrorMessage,
  readPdf,
  removeContentFile,
  uploadContentFile,
  type Brief,
  type BriefDraft,
  type StudioAngle,
  type StudioStyle,
} from '../../lib/contentStudio'
import { cn } from '../../lib/cn'
import { Field, Notice, PrimaryButton, SecondaryButton, inputClass, smallInputClass, type NoticeValue } from './ui'

type BriefFormProps = {
  brief: Brief | null
  styles: StudioStyle[]
  angles: StudioAngle[]
  canEdit: boolean
  onSave: (draft: BriefDraft) => Promise<string | null>
  // Files are saved with the brief at once (the upload already happened).
  onFilesChanged: (draft: BriefDraft) => Promise<string | null>
  onDirtyChange: (dirty: boolean) => void
}

function draftOf(brief: Brief): BriefDraft {
  return {
    title: brief.title,
    topic: brief.topic,
    keyPoints: brief.keyPoints,
    audience: brief.audience,
    callToAction: brief.callToAction,
    pdfText: brief.pdfText,
    files: brief.files,
    styleIds: brief.styleIds,
    angleIds: brief.angleIds,
    itemCount: brief.itemCount,
    sizes: brief.sizes,
    kind: brief.kind,
    carouselPages: brief.carouselPages,
  }
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]
}

// The brief: what the campaign is, its files, and what the AI should make.
export function BriefForm({ brief, styles, angles, canEdit, onSave, onFilesChanged, onDirtyChange }: BriefFormProps) {
  const [draft, setDraftState] = useState<BriefDraft>(() =>
    brief
      ? draftOf(brief)
      : {
          title: '',
          topic: '',
          keyPoints: '',
          audience: '',
          callToAction: '',
          pdfText: '',
          files: [],
          // A new brief starts with the first two styles and three angles on show picked.
          styleIds: styles.filter((style) => !style.hidden).slice(0, 2).map((style) => style.id),
          angleIds: angles.filter((angle) => !angle.hidden).slice(0, 3).map((angle) => angle.id),
          itemCount: 6,
          sizes: ['1:1'],
          kind: 'single',
          carouselPages: 5,
        },
  )
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<NoticeValue>(null)

  function setDraft(next: BriefDraft) {
    setDraftState(next)
    onDirtyChange(true)
  }

  const shownStyles = styles.filter((style) => !style.hidden || draft.styleIds.includes(style.id))
  const shownAngles = angles.filter((angle) => !angle.hidden || draft.angleIds.includes(angle.id))
  const disabled = !canEdit || busy !== null

  async function save() {
    if (!draft.title.trim()) {
      setNotice({ text: 'Give the campaign a name first.', isError: true })
      return
    }
    if (draft.styleIds.length === 0) {
      setNotice({ text: 'Pick at least one style.', isError: true })
      return
    }
    setBusy('save')
    setNotice(null)
    const problem = await onSave(draft)
    setBusy(null)
    if (problem) {
      setNotice({ text: problem, isError: true })
    } else {
      onDirtyChange(false)
      setNotice({ text: 'Brief saved.', isError: false })
    }
  }

  async function upload(files: FileList | null) {
    if (!brief || !files || files.length === 0) return
    setBusy('upload')
    setNotice(null)
    const added = [...draft.files]
    try {
      for (const file of Array.from(files)) {
        added.push(await uploadContentFile({ briefId: brief.id }, file))
      }
    } catch (problem) {
      setNotice({ text: contentErrorMessage(problem, problem instanceof Error ? problem.message : 'The file could not be added.'), isError: true })
    }
    const next = { ...draft, files: added }
    setDraftState(next)
    const problem = await onFilesChanged(next)
    setBusy(null)
    if (problem) setNotice({ text: problem, isError: true })
    else onDirtyChange(false)
  }

  async function removeFile(path: string) {
    setBusy('upload')
    setNotice(null)
    try {
      await removeContentFile(path)
    } catch {
      // The file may already be gone; it is taken off the brief anyway.
    }
    const next = { ...draft, files: draft.files.filter((file) => file.path !== path) }
    setDraftState(next)
    const problem = await onFilesChanged(next)
    setBusy(null)
    if (problem) setNotice({ text: problem, isError: true })
    else onDirtyChange(false)
  }

  async function readWords(path: string, name: string) {
    if (!brief) return
    setBusy(`pdf:${path}`)
    setNotice(null)
    const answer = await readPdf(brief.id, path)
    setBusy(null)
    if (!answer.ok) {
      setNotice({ text: answer.error, isError: true })
      return
    }
    const block = `— ${name} —\n${answer.value.trim()}`
    setDraft({ ...draft, pdfText: draft.pdfText.trim() ? `${draft.pdfText.trim()}\n\n${block}` : block })
    setNotice({ text: `The words in ${name} were added below. Check them, then save the brief.`, isError: false })
  }

  return (
    <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Campaign name">
          <input className={inputClass} value={draft.title} maxLength={120} disabled={disabled} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="e.g. December Holiday Camp" />
        </Field>
        <Field label="Who is it for">
          <input className={inputClass} value={draft.audience} maxLength={1000} disabled={disabled} onChange={(e) => setDraft({ ...draft, audience: e.target.value })} placeholder="e.g. Parents of 7–12 year olds in Klang Valley" />
        </Field>
        <Field label="What are we promoting">
          <textarea className={inputClass} rows={3} value={draft.topic} maxLength={4000} disabled={disabled} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} />
        </Field>
        <Field label="Key points" hint="Prices, dates, ages, places. The AI only uses the facts written here or in the PDF.">
          <textarea className={inputClass} rows={3} value={draft.keyPoints} maxLength={4000} disabled={disabled} onChange={(e) => setDraft({ ...draft, keyPoints: e.target.value })} />
        </Field>
        <Field label="Call to action">
          <input className={inputClass} value={draft.callToAction} maxLength={500} disabled={disabled} onChange={(e) => setDraft({ ...draft, callToAction: e.target.value })} placeholder="e.g. WhatsApp us to book a free trial" />
        </Field>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-800">Files (PDF and pictures)</p>
        {!brief ? (
          <p className="text-sm text-slate-500">Save the brief first, then add files.</p>
        ) : (
          <>
            {draft.files.length > 0 && (
              <ul className="space-y-1">
                {draft.files.map((file) => (
                  <li key={file.path} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    {file.type === 'application/pdf' ? <FilePdf size={18} /> : <ImageIcon size={18} />}
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    {file.type === 'application/pdf' && canEdit && (
                      <SecondaryButton disabled={busy !== null} onClick={() => void readWords(file.path, file.name)}>
                        {busy === `pdf:${file.path}` ? 'Reading…' : 'Read the words'}
                      </SecondaryButton>
                    )}
                    {canEdit && (
                      <button type="button" aria-label={`Remove ${file.name}`} disabled={busy !== null} onClick={() => void removeFile(file.path)} className="rounded-lg p-1 text-slate-500 hover:bg-red-50 hover:text-red-600">
                        <Trash size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <label className={cn('inline-flex cursor-pointer items-center gap-1 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50', busy !== null && 'pointer-events-none opacity-50')}>
                <UploadSimple size={16} /> {busy === 'upload' ? 'Adding…' : 'Add files'}
                <input type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { void upload(e.target.files); e.target.value = '' }} />
              </label>
            )}
          </>
        )}
        <Field label="Words from the PDF" hint="Filled by “Read the words”; you can correct it.">
          <textarea className={inputClass} rows={4} value={draft.pdfText} maxLength={30000} disabled={disabled} onChange={(e) => setDraft({ ...draft, pdfText: e.target.value })} />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800">Styles</legend>
          <div className="flex flex-wrap gap-2">
            {shownStyles.map((style) => (
              <label key={style.id} className={cn('flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-sm', draft.styleIds.includes(style.id) ? 'border-[#fc0c97] bg-[#fff1f8]' : 'border-slate-200')}>
                <input type="checkbox" checked={draft.styleIds.includes(style.id)} disabled={disabled} onChange={() => setDraft({ ...draft, styleIds: toggle(draft.styleIds, style.id) })} />
                {style.name}
              </label>
            ))}
            {shownStyles.length === 0 && <p className="text-sm text-slate-500">No styles yet: add one under Styles & angles.</p>}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800">Angles</legend>
          <div className="flex flex-wrap gap-2">
            {shownAngles.map((angle) => (
              <label key={angle.id} className={cn('flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-sm', draft.angleIds.includes(angle.id) ? 'border-[#fc0c97] bg-[#fff1f8]' : 'border-slate-200')}>
                <input type="checkbox" checked={draft.angleIds.includes(angle.id)} disabled={disabled} onChange={() => setDraft({ ...draft, angleIds: toggle(draft.angleIds, angle.id) })} />
                {angle.name}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-slate-800">Sizes</legend>
          <div className="flex flex-wrap gap-2">
            {CONTENT_SIZES.map((size) => (
              <label key={size} className={cn('flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-sm', draft.sizes.includes(size) ? 'border-[#fc0c97] bg-[#fff1f8]' : 'border-slate-200')}>
                <input
                  type="checkbox"
                  checked={draft.sizes.includes(size)}
                  disabled={disabled || (draft.sizes.length === 1 && draft.sizes.includes(size))}
                  onChange={() => setDraft({ ...draft, sizes: CONTENT_SIZES.filter((entry) => (entry === size ? !draft.sizes.includes(size) : draft.sizes.includes(entry))) })}
                />
                {SIZE_LABELS[size]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Type">
            <select className={inputClass} value={draft.kind} disabled={disabled} onChange={(e) => setDraft({ ...draft, kind: e.target.value as BriefDraft['kind'] })}>
              {CONTENT_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </Field>
          {draft.kind === 'carousel' && (
            <Field label="Pages">
              <input type="number" min={2} max={10} className={cn(smallInputClass, 'w-24')} value={draft.carouselPages} disabled={disabled} onChange={(e) => setDraft({ ...draft, carouselPages: Math.min(10, Math.max(2, Number(e.target.value) || 2)) })} />
            </Field>
          )}
          <Field label="How many posts">
            <input type="number" min={1} max={20} className={cn(smallInputClass, 'w-24')} value={draft.itemCount} disabled={disabled} onChange={(e) => setDraft({ ...draft, itemCount: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} />
          </Field>
        </div>
      </div>

      <Notice notice={notice} />
      {canEdit && (
        <PrimaryButton disabled={busy !== null} onClick={() => void save()}>
          {busy === 'save' ? 'Saving…' : brief ? 'Save brief' : 'Create brief'}
        </PrimaryButton>
      )}
    </div>
  )
}
