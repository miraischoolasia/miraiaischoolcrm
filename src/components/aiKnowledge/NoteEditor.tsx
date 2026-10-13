import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ClockCounterClockwise, Trash } from '@phosphor-icons/react'
import { FlowSwitch } from '../automations/FlowSwitch'
import { useConfirm } from '../../hooks/useConfirm'
import { MAX_BODY, MAX_TITLE, type KnowledgeNote, type NoteDraft, type NoteVersion } from '../../lib/aiKnowledge'
import { cn } from '../../lib/cn'

type NoteEditorProps = {
  // null is a note not saved yet.
  note: KnowledgeNote | null
  canEdit: boolean
  onSave: (id: number | null, draft: NoteDraft) => Promise<{ error: string | null; note: KnowledgeNote | null }>
  onDelete: (id: number) => Promise<string | null>
  onLoadVersions: (id: number) => Promise<{ versions: NoteVersion[]; error: string | null }>
  onSaved: (note: KnowledgeNote) => void
  onDeleted: () => void
  onBack: () => void
  onDirtyChange: (dirty: boolean) => void
  // Text put into the box from a reminder or an example. It is not saved until the admin presses Save,
  // so the note counts as changed from the start.
  prefill?: { title?: string; body?: string }
  // What the text came from, shown above the box.
  banner?: string
}

export function formatNoteTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function firstLine(text: string) {
  const line = text.split('\n').find((entry) => entry.trim() !== '') ?? ''
  return line.length > 90 ? `${line.slice(0, 90)}…` : line
}

// One note: its title, its text, whether the AI reads it, and the older wordings it had.
export function NoteEditor({
  note,
  canEdit,
  onSave,
  onDelete,
  onLoadVersions,
  onSaved,
  onDeleted,
  onBack,
  onDirtyChange,
  prefill,
  banner,
}: NoteEditorProps) {
  const original: NoteDraft = {
    title: note?.title ?? '',
    body: note?.body ?? '',
    enabled: note?.enabled ?? true,
  }
  const [draft, setDraft] = useState<NoteDraft>(() => ({
    ...original,
    title: prefill?.title ?? original.title,
    body: prefill?.body ?? original.body,
  }))
  const [baseline, setBaseline] = useState(() => JSON.stringify(original))
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(null)
  const [isWorking, setIsWorking] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [versions, setVersions] = useState<NoteVersion[] | null>(null)
  const [versionsError, setVersionsError] = useState<string | null>(null)
  const { confirm, dialog } = useConfirm()

  const dirty = useMemo(() => JSON.stringify(draft) !== baseline, [draft, baseline])
  const noteId = note?.id ?? null

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  async function toggleHistory() {
    const next = !historyOpen
    setHistoryOpen(next)
    if (next && noteId !== null) {
      setVersions(null)
      setVersionsError(null)
      const result = await onLoadVersions(noteId)
      setVersions(result.versions)
      setVersionsError(result.error)
    }
  }

  async function save() {
    setIsWorking(true)
    setNotice(null)
    const result = await onSave(noteId, draft)
    setIsWorking(false)
    if (result.error || !result.note) {
      setNotice({ text: result.error ?? "Couldn't save the note.", isError: true })
      return
    }
    const saved = result.note
    setBaseline(JSON.stringify({ title: saved.title, body: saved.body, enabled: saved.enabled }))
    setDraft({ title: saved.title, body: saved.body, enabled: saved.enabled })
    setVersions(null)
    setHistoryOpen(false)
    setNotice({
      text: draft.enabled
        ? 'Saved. The AI reads it from the next draft; drafts already made keep their wording until you press Suggest again.'
        : 'Saved. This note is off, so the AI does not read it.',
      isError: false,
    })
    onSaved(saved)
  }

  async function remove() {
    if (noteId === null) {
      return
    }
    const sure = await confirm(`Delete the note "${note?.title}"? Its older versions are deleted with it.`, {
      confirmLabel: 'Delete',
    })
    if (!sure) {
      return
    }
    setIsWorking(true)
    const problem = await onDelete(noteId)
    setIsWorking(false)
    if (problem) {
      setNotice({ text: problem, isError: true })
      return
    }
    onDeleted()
  }

  const tooLong = draft.body.length > MAX_BODY
  const readOnly = !canEdit

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          AI Knowledge
        </button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-slate-600">{draft.enabled ? 'The AI reads this' : 'Off'}</span>
          <FlowSwitch
            checked={draft.enabled}
            disabled={readOnly}
            label="The AI reads this note"
            onChange={() => setDraft((current) => ({ ...current, enabled: !current.enabled }))}
          />
        </div>
      </div>

      {readOnly && (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-700">Only an admin can change the notes.</p>
      )}
      {banner && <p className="whitespace-pre-wrap rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{banner}</p>}

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Title</span>
          <input
            type="text"
            value={draft.title}
            readOnly={readOnly}
            maxLength={MAX_TITLE}
            placeholder="For example: HOA, Payment, Refund"
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-base text-slate-900 focus:border-[#fc0c97] focus:outline-none read-only:bg-slate-50"
          />
        </label>
        <label className="block">
          <span className="flex items-baseline justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
            Text the AI reads
            <span className={cn('normal-case tracking-normal', tooLong ? 'font-semibold text-red-700' : 'font-normal')}>
              {draft.body.length.toLocaleString('en-US')} / {MAX_BODY.toLocaleString('en-US')}
            </span>
          </span>
          <textarea
            value={draft.body}
            readOnly={readOnly}
            placeholder="Write plain facts, one per line. Anything not written here, the AI will not say."
            onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
            className="mt-1 h-[55vh] min-h-[320px] w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-base leading-relaxed text-slate-900 focus:border-[#fc0c97] focus:outline-none read-only:bg-slate-50"
          />
        </label>

        {notice && (
          <p
            role={notice.isError ? 'alert' : 'status'}
            className={cn(
              'rounded-xl px-4 py-3 text-sm',
              notice.isError ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800',
            )}
          >
            {notice.text}
          </p>
        )}

        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!dirty || isWorking}
              onClick={() => void save()}
              className="rounded-xl bg-[#fc0c97] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-50"
            >
              {isWorking ? 'Saving…' : noteId === null ? 'Add note' : 'Save'}
            </button>
            {dirty && <span className="text-xs text-slate-500">Not saved yet</span>}
            {noteId !== null && (
              <button
                type="button"
                disabled={isWorking}
                onClick={() => void remove()}
                className="ml-auto flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash size={14} aria-hidden="true" />
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      {noteId !== null && canEdit && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <button
            type="button"
            aria-expanded={historyOpen}
            onClick={() => void toggleHistory()}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-slate-700"
          >
            <ClockCounterClockwise size={16} aria-hidden="true" />
            Older versions
          </button>
          {historyOpen && (
            <div className="border-t border-slate-200 px-4 py-3">
              {versionsError ? (
                <p role="alert" className="text-sm text-red-700">
                  {versionsError}
                </p>
              ) : versions === null ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : versions.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No older versions yet. The old wording is kept each time you save a change.
                </p>
              ) : (
                <ul className="space-y-2">
                  {versions.map((version) => (
                    <li key={version.id} className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-500">{formatNoteTime(version.writtenAt)}</p>
                        <p className="truncate text-sm text-slate-800">{version.title}</p>
                        <p className="truncate text-xs text-slate-500">{firstLine(version.body)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDraft((current) => ({ ...current, title: version.title, body: version.body }))
                          setNotice({
                            text: 'The old wording is in the box. Press Save to use it.',
                            isError: false,
                          })
                        }}
                        className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Put back
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
      {dialog}
    </div>
  )
}
