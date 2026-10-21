import { useEffect, useState } from 'react'
import { Eye, EyeSlash, Plus, Trash, UploadSimple } from '@phosphor-icons/react'
import {
  contentErrorMessage,
  removeContentFile,
  saveAngle,
  saveStyle,
  signedUrls,
  uploadContentFile,
  type AngleDraft,
  type StudioAngle,
  type StudioStyle,
  type StyleDraft,
} from '../../lib/contentStudio'
import { cn } from '../../lib/cn'
import { Chip, Field, Notice, PrimaryButton, SecondaryButton, inputClass, type NoticeValue } from './ui'

type StylesAnglesPanelProps = {
  canEdit: boolean
  styles: StudioStyle[]
  angles: StudioAngle[]
  onChanged: () => Promise<void>
}

// The school's own styles (with reference pictures) and angles. Hidden, never deleted.
export function StylesAnglesPanel({ canEdit, styles, angles, onChanged }: StylesAnglesPanelProps) {
  const [editing, setEditing] = useState<{ kind: 'style' | 'angle'; id: number | null } | null>(null)
  const [notice, setNotice] = useState<NoticeValue>(null)

  async function run(action: () => Promise<void>, done: string): Promise<boolean> {
    setNotice(null)
    try {
      await action()
      await onChanged()
      setNotice({ text: done, isError: false })
      return true
    } catch (failure) {
      setNotice({ text: contentErrorMessage(failure, failure instanceof Error && failure.message ? failure.message : 'Could not save.'), isError: true })
      return false
    }
  }

  return (
    <section className="space-y-6">
      <Notice notice={notice} />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Styles</h2>
            <p className="text-sm text-slate-500">How the posts look. Reference pictures help the picture AI (phase 2) copy the look.</p>
          </div>
          {canEdit && (
            <SecondaryButton onClick={() => setEditing({ kind: 'style', id: null })}>
              <Plus size={16} /> New style
            </SecondaryButton>
          )}
        </div>
        {editing?.kind === 'style' && editing.id === null && (
          <StyleEditor
            style={null}
            onCancel={() => setEditing(null)}
            onSave={(draft) => run(() => saveStyle(null, draft), 'Style added.').then((ok) => ok && setEditing(null))}
          />
        )}
        <ul className="space-y-2">
          {styles.map((style) =>
            editing?.kind === 'style' && editing.id === style.id ? (
              <li key={style.id}>
                <StyleEditor
                  style={style}
                  onCancel={() => setEditing(null)}
                  onSave={(draft) => run(() => saveStyle(style.id, draft), 'Style saved.').then((ok) => ok && setEditing(null))}
                />
              </li>
            ) : (
              <li key={style.id} className={cn('flex flex-wrap items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3', style.hidden && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {style.name} {style.hidden && <Chip>Hidden</Chip>}
                  </p>
                  <p className="text-sm text-slate-600">{style.description}</p>
                  <p className="mt-1 text-xs text-slate-500">{style.referencePaths.length} reference picture(s)</p>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <SecondaryButton onClick={() => setEditing({ kind: 'style', id: style.id })}>Edit</SecondaryButton>
                    <SecondaryButton
                      aria-label={style.hidden ? `Show ${style.name}` : `Hide ${style.name}`}
                      onClick={() => void run(() => saveStyle(style.id, { ...style, hidden: !style.hidden }), style.hidden ? 'Style shown.' : 'Style hidden.')}
                    >
                      {style.hidden ? <Eye size={16} /> : <EyeSlash size={16} />} {style.hidden ? 'Show' : 'Hide'}
                    </SecondaryButton>
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Angles</h2>
            <p className="text-sm text-slate-500">What a post argues, with one or two example headlines.</p>
          </div>
          {canEdit && (
            <SecondaryButton onClick={() => setEditing({ kind: 'angle', id: null })}>
              <Plus size={16} /> New angle
            </SecondaryButton>
          )}
        </div>
        {editing?.kind === 'angle' && editing.id === null && (
          <AngleEditor
            angle={null}
            onCancel={() => setEditing(null)}
            onSave={(draft) => run(() => saveAngle(null, draft), 'Angle added.').then((ok) => ok && setEditing(null))}
          />
        )}
        <ul className="space-y-2">
          {angles.map((angle) =>
            editing?.kind === 'angle' && editing.id === angle.id ? (
              <li key={angle.id}>
                <AngleEditor
                  angle={angle}
                  onCancel={() => setEditing(null)}
                  onSave={(draft) => run(() => saveAngle(angle.id, draft), 'Angle saved.').then((ok) => ok && setEditing(null))}
                />
              </li>
            ) : (
              <li key={angle.id} className={cn('flex flex-wrap items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3', angle.hidden && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">
                    {angle.name} {angle.hidden && <Chip>Hidden</Chip>}
                  </p>
                  <p className="text-sm text-slate-600">{angle.description}</p>
                  {angle.examples.length > 0 && <p className="mt-1 text-xs text-slate-500">e.g. {angle.examples.join(' / ')}</p>}
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <SecondaryButton onClick={() => setEditing({ kind: 'angle', id: angle.id })}>Edit</SecondaryButton>
                    <SecondaryButton
                      aria-label={angle.hidden ? `Show ${angle.name}` : `Hide ${angle.name}`}
                      onClick={() => void run(() => saveAngle(angle.id, { ...angle, hidden: !angle.hidden }), angle.hidden ? 'Angle shown.' : 'Angle hidden.')}
                    >
                      {angle.hidden ? <Eye size={16} /> : <EyeSlash size={16} />} {angle.hidden ? 'Show' : 'Hide'}
                    </SecondaryButton>
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      </div>
    </section>
  )
}

function StyleEditor({ style, onSave, onCancel }: { style: StudioStyle | null; onSave: (draft: StyleDraft) => Promise<unknown>; onCancel: () => void }) {
  const [draft, setDraft] = useState<StyleDraft>({
    name: style?.name ?? '',
    description: style?.description ?? '',
    referencePaths: style?.referencePaths ?? [],
    hidden: style?.hidden ?? false,
  })
  const [urls, setUrls] = useState<Map<string, string>>(new Map())
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    signedUrls(draft.referencePaths)
      .then((map) => {
        if (!cancelled) setUrls(map)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [draft.referencePaths])

  async function add(files: FileList | null) {
    if (!files) return
    setBusy(true)
    setProblem(null)
    const paths = [...draft.referencePaths]
    try {
      for (const file of Array.from(files)) {
        if (paths.length >= 12) throw new Error('A style can have up to 12 pictures.')
        if (!file.type.startsWith('image/')) throw new Error('Only pictures (PNG, JPG, WEBP) can be reference pictures.')
        paths.push((await uploadContentFile('styles', file)).path)
      }
    } catch (failure) {
      setProblem(contentErrorMessage(failure, failure instanceof Error ? failure.message : 'The picture could not be added.'))
    }
    setDraft({ ...draft, referencePaths: paths })
    setBusy(false)
  }

  async function remove(path: string) {
    setDraft({ ...draft, referencePaths: draft.referencePaths.filter((entry) => entry !== path) })
    // Only a picture that was never saved with the style is deleted at once; a saved one may still be used
    // until the style is saved without it.
    if (!style?.referencePaths.includes(path)) {
      await removeContentFile(path).catch(() => undefined)
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[#fc0c97] bg-white p-4">
      <Field label="Name">
        <input className={inputClass} value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </Field>
      <Field label="What it looks like" hint="Colours, layout, kind of picture, mood.">
        <textarea className={inputClass} rows={3} value={draft.description} maxLength={2000} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
      </Field>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-800">Reference pictures</p>
        <div className="flex flex-wrap gap-2">
          {draft.referencePaths.map((path) => (
            <div key={path} className="relative h-24 w-24 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {urls.get(path) && <img src={urls.get(path)} alt="Reference" className="h-full w-full object-cover" />}
              <button type="button" aria-label="Remove picture" onClick={() => void remove(path)} className="absolute right-1 top-1 rounded-lg bg-white/90 p-1 text-red-600">
                <Trash size={14} />
              </button>
            </div>
          ))}
          <label className={cn('flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 text-xs text-slate-600 hover:bg-slate-50', busy && 'pointer-events-none opacity-50')}>
            <UploadSimple size={18} />
            {busy ? 'Adding…' : 'Add'}
            <input type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { void add(e.target.files); e.target.value = '' }} />
          </label>
        </div>
      </div>
      {problem && <Notice notice={{ text: problem, isError: true }} />}
      <div className="flex gap-2">
        <PrimaryButton disabled={busy || !draft.name.trim()} onClick={() => void onSave(draft)}>
          Save style
        </PrimaryButton>
        <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
      </div>
    </div>
  )
}

function AngleEditor({ angle, onSave, onCancel }: { angle: StudioAngle | null; onSave: (draft: AngleDraft) => Promise<unknown>; onCancel: () => void }) {
  const [draft, setDraft] = useState<AngleDraft>({
    name: angle?.name ?? '',
    description: angle?.description ?? '',
    examples: [angle?.examples[0] ?? '', angle?.examples[1] ?? ''],
    hidden: angle?.hidden ?? false,
  })
  return (
    <div className="space-y-3 rounded-2xl border border-[#fc0c97] bg-white p-4">
      <Field label="Name">
        <input className={inputClass} value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      </Field>
      <Field label="What it says">
        <textarea className={inputClass} rows={2} value={draft.description} maxLength={1000} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
      </Field>
      {[0, 1].map((index) => (
        <Field key={index} label={`Example headline ${index + 1}`}>
          <input
            className={inputClass}
            value={draft.examples[index] ?? ''}
            maxLength={200}
            onChange={(e) => {
              const examples = [...draft.examples]
              examples[index] = e.target.value
              setDraft({ ...draft, examples })
            }}
          />
        </Field>
      ))}
      <div className="flex gap-2">
        <PrimaryButton disabled={!draft.name.trim()} onClick={() => void onSave(draft)}>
          Save angle
        </PrimaryButton>
        <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
      </div>
    </div>
  )
}
