import { useState } from 'react'
import { FilePdf, Image as ImageIcon, PencilSimpleLine, Sparkle, Trash, UploadSimple } from '@phosphor-icons/react'
import {
  analyzeMaterial,
  contentErrorMessage,
  removeContentFile,
  uploadContentFile,
  type Brief,
  type BriefDraft,
} from '../../lib/contentStudio'
import { cn } from '../../lib/cn'
import { Field, Notice, OptionCard, PrimaryButton, Section, inputClass, type NoticeValue } from './ui'

type StepMaterialProps = {
  brief: Brief
  draft: BriefDraft
  canEdit: boolean
  onChange: (draft: BriefDraft) => void
  // Saves the draft now (files and the AI need it saved); null when it worked.
  onSave: (draft: BriefDraft) => Promise<string | null>
  // Reloads the campaign after the AI filled it in.
  onReload: () => Promise<void>
}

// Step 1: what the campaign is about, typed in, or read by the AI from the school's own material.
export function StepMaterial({ brief, draft, canEdit, onChange, onSave, onReload }: StepMaterialProps) {
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<NoticeValue>(null)
  const [showAllText, setShowAllText] = useState(false)
  const disabled = !canEdit || busy !== null
  const upload = draft.sourceMode === 'upload'
  const hasDetails = Boolean(draft.topic.trim() || draft.keyPoints.trim())

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBusy('upload')
    setNotice(null)
    const added = [...draft.files]
    try {
      for (const file of Array.from(files)) {
        added.push(await uploadContentFile({ briefId: brief.id }, file))
      }
    } catch (failure) {
      setNotice({ text: contentErrorMessage(failure, failure instanceof Error ? failure.message : 'The file could not be added.'), isError: true })
    }
    const next = { ...draft, files: added }
    onChange(next)
    const problem = await onSave(next)
    setBusy(null)
    if (problem) setNotice({ text: problem, isError: true })
  }

  async function removeFile(path: string) {
    setBusy('upload')
    await removeContentFile(path).catch(() => undefined)
    const next = { ...draft, files: draft.files.filter((file) => file.path !== path) }
    onChange(next)
    const problem = await onSave(next)
    setBusy(null)
    if (problem) setNotice({ text: problem, isError: true })
  }

  async function readMaterial() {
    setBusy('read')
    setNotice(null)
    const saved = await onSave(draft)
    if (saved) {
      setBusy(null)
      setNotice({ text: saved, isError: true })
      return
    }
    const answer = await analyzeMaterial(brief.id)
    if (!answer.ok) {
      setBusy(null)
      setNotice({ text: answer.error, isError: true })
      return
    }
    await onReload()
    setBusy(null)
    setNotice({ text: 'The AI read your material. Check the details below and correct anything that is wrong.', isError: false })
  }

  const details = (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="What are we promoting?">
        <textarea className={inputClass} rows={5} maxLength={4000} value={draft.topic} disabled={disabled} onChange={(e) => onChange({ ...draft, topic: e.target.value })} placeholder="e.g. December holiday camp: coding, crafts and English games" />
      </Field>
      <Field label="Key facts" hint="Price, dates, times, ages, place. The AI only uses facts written here.">
        <textarea className={inputClass} rows={5} maxLength={4000} value={draft.keyPoints} disabled={disabled} onChange={(e) => onChange({ ...draft, keyPoints: e.target.value })} placeholder="e.g. RM380, early bird RM350; starts 8 Dec; 9am–12pm; age 7–12" />
      </Field>
      <Field label="Who is it for?">
        <input className={inputClass} maxLength={1000} value={draft.audience} disabled={disabled} onChange={(e) => onChange({ ...draft, audience: e.target.value })} placeholder="e.g. Parents of 7–12 year olds" />
      </Field>
      <Field label="What should parents do?">
        <input className={inputClass} maxLength={500} value={draft.callToAction} disabled={disabled} onChange={(e) => onChange({ ...draft, callToAction: e.target.value })} placeholder="e.g. WhatsApp us to book a free trial" />
      </Field>
    </div>
  )

  return (
    <div className="space-y-5">
      <Section title="Campaign name" description="A short name you will recognise later.">
        <input className={inputClass} maxLength={120} value={draft.title} disabled={disabled} onChange={(e) => onChange({ ...draft, title: e.target.value })} placeholder="e.g. December Holiday Camp" />
      </Section>

      <Section title="How do you want to give the details?">
        <div role="radiogroup" aria-label="How to give the details" className="grid gap-3 md:grid-cols-2">
          <OptionCard
            selected={!upload}
            title="I'll type it myself"
            description="Fill in a short form: what, key facts, who, and what parents should do."
            icon={<PencilSimpleLine size={20} />}
            disabled={disabled}
            onSelect={() => onChange({ ...draft, sourceMode: 'manual' })}
          />
          <OptionCard
            selected={upload}
            title="Upload my material, the AI reads it"
            description="Add your flyer, PDF or pictures and any text you have. The AI fills in the details for you to check."
            icon={<Sparkle size={20} />}
            disabled={disabled}
            onSelect={() => onChange({ ...draft, sourceMode: 'upload' })}
          />
        </div>
      </Section>

      {upload && (
        <Section title="Your material" description="PDF, PNG, JPG or WEBP, up to 20 MB each. Add as many as you need.">
          <div className="space-y-4">
            {draft.files.length > 0 && (
              <ul className="grid gap-2 md:grid-cols-2">
                {draft.files.map((file) => (
                  <li key={file.path} className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 px-3">
                    {file.type === 'application/pdf' ? <FilePdf size={20} className="text-red-500" /> : <ImageIcon size={20} className="text-sky-600" />}
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{file.name}</span>
                    {canEdit && (
                      <button type="button" aria-label={`Remove ${file.name}`} disabled={disabled} onClick={() => void removeFile(file.path)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600">
                        <Trash size={16} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <label className={cn('flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:border-[#fc0c97] hover:bg-[#fff1f8]', disabled && 'pointer-events-none opacity-60')}>
                <UploadSimple size={28} className="text-[#fc0c97]" />
                <span className="text-sm font-semibold text-slate-900">{busy === 'upload' ? 'Adding…' : 'Choose files to add'}</span>
                <span className="text-xs text-slate-500">Flyers, price lists, timetables, photos</span>
                <input type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { void addFiles(e.target.files); e.target.value = '' }} />
              </label>
            )}
            <Field label="Any text you already have (optional)" hint="Paste a WhatsApp message, an old post or notes.">
              <textarea className={inputClass} rows={4} maxLength={8000} value={draft.sourceText} disabled={disabled} onChange={(e) => onChange({ ...draft, sourceText: e.target.value })} />
            </Field>
            {canEdit && (
              <PrimaryButton disabled={disabled || (draft.files.length === 0 && !draft.sourceText.trim())} onClick={() => void readMaterial()}>
                <Sparkle size={16} weight="fill" /> {busy === 'read' ? 'The AI is reading… (about 20 seconds)' : hasDetails ? 'Read it again' : 'Let the AI read it'}
              </PrimaryButton>
            )}
          </div>
        </Section>
      )}

      <Notice notice={notice} />

      {(!upload || hasDetails) && (
        <Section
          title={upload ? 'What the AI found' : 'Campaign details'}
          description={upload ? 'Check these and correct anything that is wrong. The posts are written from these details.' : 'The posts are written from these details.'}
        >
          <div className="space-y-4">
            {details}
            {upload && draft.pdfText.trim() && (
              <div>
                <button type="button" className="text-sm font-semibold text-[#be185d] hover:underline" onClick={() => setShowAllText(!showAllText)}>
                  {showAllText ? 'Hide all the words found' : 'Show all the words found in your files'}
                </button>
                {showAllText && (
                  <textarea className={cn(inputClass, 'mt-2')} rows={8} maxLength={30000} value={draft.pdfText} disabled={disabled} onChange={(e) => onChange({ ...draft, pdfText: e.target.value })} />
                )}
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  )
}
