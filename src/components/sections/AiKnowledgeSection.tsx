import { useCallback, useMemo, useState } from 'react'
import { CaretDown, CaretUp, Plus } from '@phosphor-icons/react'
import { NoteEditor, formatNoteTime } from '../aiKnowledge/NoteEditor'
import {
  ExamplesPanel,
  GapsPanel,
  ReportPanel,
  type LoadThread,
  type TeachRequest,
} from '../aiKnowledge/LearningPanels'
import { FlowSwitch } from '../automations/FlowSwitch'
import { useAiKnowledge } from '../../hooks/useAiKnowledge'
import { useAiLearning, type AiLearning } from '../../hooks/useAiLearning'
import { useConfirm } from '../../hooks/useConfirm'
import { MAX_NOTES, knowledgeText, summarizeKnowledge } from '../../lib/aiKnowledge'
import { countLabel } from '../../lib/aiLearning'
import { cn } from '../../lib/cn'

type AiKnowledgeSectionProps = {
  // Only an admin can add, change, reorder or remove a note; others can read them.
  canEdit: boolean
  // Reads the chat before an example reply (from Chatwoot); only where the inbox is connected.
  loadThread?: LoadThread
}

// The school facts the AI reply drafts may use, as separate notes: the school, the way we talk, the
// conversation steps, each course, the answers we have confirmed. Every note that is on is read by
// the AI each time it writes a draft, so a saved change works from the next draft.
export function AiKnowledgeSection({ canEdit, loadThread }: AiKnowledgeSectionProps) {
  const knowledge = useAiKnowledge({ enabled: true })
  // What the AI still lacks and how its drafts are doing; only an admin can act on it.
  const learning = useAiLearning({ enabled: canEdit })
  return (
    <AiKnowledgeView
      canEdit={canEdit}
      knowledge={knowledge}
      learning={canEdit ? learning : undefined}
      loadThread={loadThread}
    />
  )
}

type Tab = 'notes' | 'gaps' | 'examples' | 'report'

// The page itself, given the notes; kept apart from loading them so it can be shown without a database.
export function AiKnowledgeView({
  canEdit,
  knowledge,
  learning,
  loadThread,
}: AiKnowledgeSectionProps & {
  knowledge: ReturnType<typeof useAiKnowledge>
  learning?: AiLearning
}) {
  const { confirm, dialog } = useConfirm()
  // null shows the list.
  const [open, setOpen] = useState<number | 'new' | null>(null)
  const [tab, setTab] = useState<Tab>('notes')
  // Set when the note was opened from a reminder or an example: what to put in it and what to do once saved.
  const [teaching, setTeaching] = useState<TeachRequest | null>(null)
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState<{
    text: string
    isError: boolean
  } | null>(null)
  const [showText, setShowText] = useState(false)

  const { notes } = knowledge
  const openNote = typeof open === 'number' ? (notes.find((note) => note.id === open) ?? null) : null
  const summary = useMemo(() => summarizeKnowledge(notes), [notes])
  const handleDirty = useCallback((value: boolean) => setDirty(value), [])

  async function leave() {
    if (
      dirty &&
      !(await confirm('This note has changes you have not saved. Leave without saving?', { confirmLabel: 'Leave' }))
    ) {
      return
    }
    setDirty(false)
    setTeaching(null)
    setOpen(null)
  }

  function teach(request: TeachRequest) {
    setNotice(null)
    setTeaching(request)
    setOpen(request.noteId ?? 'new')
  }

  // A note saved from a reminder or an example goes back to the list it came from, and that reminder or
  // example is done. A note saved the ordinary way stays open.
  async function afterSaved(savedId: number) {
    const pending = teaching
    if (!pending) {
      setOpen(savedId)
      return
    }
    setTeaching(null)
    setDirty(false)
    setOpen(null)
    const problem = await pending.afterSave()
    setNotice(
      problem
        ? { text: `The note is saved, but ${problem}`, isError: true }
        : { text: 'Saved. The AI reads it from the next draft.', isError: false },
    )
  }

  async function toggle(id: number, title: string, enabled: boolean) {
    setNotice(null)
    const problem = await knowledge.toggle(id, enabled)
    setNotice(
      problem
        ? { text: problem, isError: true }
        : {
            text: enabled ? `"${title}" is on: the AI reads it.` : `"${title}" is off: the AI does not read it.`,
            isError: false,
          },
    )
  }

  async function move(id: number, step: -1 | 1) {
    setNotice(null)
    const problem = await knowledge.move(id, step)
    if (problem) {
      setNotice({ text: problem, isError: true })
    }
  }

  if (open !== null && (open === 'new' || openNote)) {
    return (
      <section>
        <NoteEditor
          key={`${open === 'new' ? 'new' : openNote?.id}:${teaching ? 'teach' : 'plain'}`}
          note={open === 'new' ? null : openNote}
          prefill={teaching?.prefill}
          banner={teaching?.banner}
          canEdit={canEdit}
          onSave={knowledge.save}
          onDelete={knowledge.remove}
          onLoadVersions={knowledge.loadVersions}
          onSaved={(saved) => void afterSaved(saved.id)}
          onDeleted={() => {
            setDirty(false)
            setTeaching(null)
            setOpen(null)
            setNotice({ text: 'Note deleted.', isError: false })
          }}
          onBack={() => void leave()}
          onDirtyChange={handleDirty}
        />
        {dialog}
      </section>
    )
  }

  const text = knowledgeText(notes)
  const tabs: { key: Tab; label: string }[] = learning
    ? [
        { key: 'notes', label: 'Notes' },
        { key: 'gaps', label: `To fill in${countLabel(learning.gaps.length)}` },
        {
          key: 'examples',
          label: `Replies to learn from${countLabel(learning.examples.length)}`,
        },
        { key: 'report', label: 'Report' },
      ]
    : []

  async function closeWithNotice(action: () => Promise<string | null>) {
    const problem = await action()
    if (problem) {
      setNotice({ text: problem, isError: true })
    }
    return problem
  }

  return (
    <section className="space-y-4">
      {learning && (
        <div role="tablist" aria-label="AI knowledge" className="flex flex-wrap gap-2">
          {tabs.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={tab === entry.key}
              onClick={() => setTab(entry.key)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-semibold',
                tab === entry.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}
      {learning && tab !== 'notes' && (
        <>
          {learning.error && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {learning.error}
            </p>
          )}
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
          {learning.isLoading ? (
            <p className="py-10 text-center text-sm text-slate-500">Loading…</p>
          ) : tab === 'gaps' ? (
            <GapsPanel
              gaps={learning.gaps}
              notes={notes}
              onTeach={teach}
              onClose={(note) => closeWithNotice(() => learning.closeGap(note))}
            />
          ) : tab === 'examples' ? (
            <ExamplesPanel
              examples={learning.examples}
              notes={notes}
              onTeach={teach}
              onClose={(id) => closeWithNotice(() => learning.closeExample(id))}
              loadThread={loadThread}
            />
          ) : (
            <ReportPanel report={learning.report} />
          )}
          {dialog}
        </>
      )}
      {(!learning || tab === 'notes') && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm text-slate-600">
              Every note that is on is read by the AI before it writes a reply draft in WhatsApp. A saved change works
              from the next draft; nothing needs to be deployed.
            </p>
            {canEdit && (
              <button
                type="button"
                disabled={notes.length >= MAX_NOTES}
                onClick={() => setOpen('new')}
                className="flex items-center gap-1 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84] disabled:opacity-50"
              >
                <Plus size={14} weight="bold" aria-hidden="true" />
                New note
              </button>
            )}
          </div>

          {knowledge.error && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {knowledge.error}
            </p>
          )}
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

          {knowledge.isLoading ? (
            <p className="py-10 text-center text-sm text-slate-500">Loading…</p>
          ) : notes.length === 0 && !knowledge.error ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-14 text-center">
              <p className="font-semibold text-slate-900">No notes yet</p>
              <p className="mt-1 text-sm text-slate-500">
                The AI uses the text built into it until the first note is added.
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{summary.on}</span> of {summary.total} notes on ·{' '}
                {summary.characters.toLocaleString('en-US')} characters sent with every draft
              </p>
              {summary.on === 0 && notes.length > 0 && (
                <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Every note is off, so the AI knows nothing about the school and will ask the team to fill in each
                  detail.
                </p>
              )}
              {summary.tooLong && !summary.cutOff && (
                <p role="alert" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  The notes are getting long. Every draft pays for all of them, so turn off what is not needed.
                </p>
              )}
              {summary.cutOff && (
                <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  The notes that are on are too long: the AI only reads the first 60,000 characters.
                </p>
              )}

              <ul className="space-y-2">
                {notes.map((note, index) => (
                  <li
                    key={note.id}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3',
                      !note.enabled && 'bg-slate-50',
                    )}
                  >
                    {canEdit && (
                      <div className="flex shrink-0 flex-col">
                        <button
                          type="button"
                          aria-label={`Move ${note.title} up`}
                          disabled={index === 0}
                          onClick={() => void move(note.id, -1)}
                          className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                        >
                          <CaretUp size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${note.title} down`}
                          disabled={index === notes.length - 1}
                          onClick={() => void move(note.id, 1)}
                          className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                        >
                          <CaretDown size={14} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                    <button type="button" onClick={() => setOpen(note.id)} className="min-w-0 flex-1 py-1 text-left">
                      <span
                        className={cn(
                          'block truncate text-sm font-semibold',
                          note.enabled ? 'text-slate-900' : 'text-slate-500',
                        )}
                      >
                        {note.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {note.body.length.toLocaleString('en-US')} characters · changed {formatNoteTime(note.updatedAt)}
                      </span>
                    </button>
                    <FlowSwitch
                      checked={note.enabled}
                      disabled={!canEdit}
                      label={`${note.title} on or off`}
                      onChange={() => void toggle(note.id, note.title, !note.enabled)}
                    />
                  </li>
                ))}
              </ul>

              <div className="rounded-xl border border-slate-200 bg-white">
                <button
                  type="button"
                  aria-expanded={showText}
                  onClick={() => setShowText((value) => !value)}
                  className="flex w-full items-center px-4 py-3 text-left text-sm font-semibold text-slate-700"
                >
                  What the AI reads, all together
                </button>
                {showText && (
                  <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap border-t border-slate-200 px-4 py-3 font-sans text-sm leading-relaxed text-slate-700">
                    {text || 'Nothing: every note is off.'}
                  </pre>
                )}
              </div>
            </>
          )}
          {dialog}
        </>
      )}
    </section>
  )
}
