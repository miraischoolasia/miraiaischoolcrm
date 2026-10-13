import { useState } from 'react'
import { formatNoteTime } from './NoteEditor'
import type { AiLearning } from '../../hooks/useAiLearning'
import type { KnowledgeNote } from '../../lib/aiKnowledge'
import {
  ALWAYS_PERSON,
  CATEGORY_LABELS,
  LEARNING_WINDOW,
  MIN_ANSWERED_FOR_AUTO,
  MIN_SHARE_FOR_AUTO,
  autoCandidate,
  exampleBlock,
  percent,
  type CategoryReport,
  type Example,
  type Gap,
} from '../../lib/aiLearning'
import { cn } from '../../lib/cn'

// What the teaching buttons ask the page to open in the note editor.
export type TeachRequest = {
  // null starts a new note.
  noteId: number | null
  prefill?: { title?: string; body?: string }
  banner: string
  // Called once the note has been saved.
  afterSave: () => Promise<string | null>
}

const NEW_NOTE = 'new'

// The note an example most likely belongs to: a Q&A note when there is one.
function defaultTarget(notes: KnowledgeNote[]): string {
  const qa = notes.find((note) => /问答|FAQ|Q&A|常见/i.test(note.title))
  return qa ? String(qa.id) : notes[0] ? String(notes[0].id) : NEW_NOTE
}

function TargetSelect({
  notes,
  value,
  onChange,
  label,
}: {
  notes: KnowledgeNote[]
  value: string
  onChange: (value: string) => void
  label: string
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-600">
      <span className="shrink-0">Add to</span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
      >
        <option value={NEW_NOTE}>A new note</option>
        {notes.map((note) => (
          <option key={note.id} value={note.id}>
            {note.title}
          </option>
        ))}
      </select>
    </label>
  )
}

function appendTo(note: KnowledgeNote | undefined, addition: string): string {
  const body = note ? note.body.trimEnd() : ''
  return body === '' ? addition : `${body}\n\n${addition}`
}

// The AI could not answer because the school knowledge did not have it: each reminder, how often it
// came up, and a button to write the answer into a note.
export function GapsPanel({
  gaps,
  notes,
  onTeach,
  onClose,
}: {
  gaps: Gap[]
  notes: KnowledgeNote[]
  onTeach: (request: TeachRequest) => void
  onClose: (note: string) => Promise<string | null>
}) {
  if (gaps.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-14 text-center">
        <p className="font-semibold text-slate-900">Nothing is missing right now</p>
        <p className="mt-1 text-sm text-slate-500">
          When the AI cannot answer because a fact is not in the notes, it is listed here with how often it came up.
        </p>
      </div>
    )
  }
  return (
    <ul className="space-y-3">
      {gaps.map((gap) => (
        <GapRow key={gap.note} gap={gap} notes={notes} onTeach={onTeach} onClose={onClose} />
      ))}
    </ul>
  )
}

function GapRow({
  gap,
  notes,
  onTeach,
  onClose,
}: {
  gap: Gap
  notes: KnowledgeNote[]
  onTeach: (request: TeachRequest) => void
  onClose: (note: string) => Promise<string | null>
}) {
  const [target, setTarget] = useState(NEW_NOTE)
  const [problem, setProblem] = useState<string | null>(null)

  function write() {
    const note = notes.find((entry) => String(entry.id) === target)
    onTeach({
      noteId: note?.id ?? null,
      prefill: note ? { body: appendTo(note, '') } : undefined,
      banner: `The AI asked for this: ${gap.note}${gap.example ? `\nA parent wrote: ${gap.example}` : ''}\nWrite the answer in the note and press Save.`,
      afterSave: () => onClose(gap.note),
    })
  }

  return (
    <li className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">{gap.note}</p>
      <p className="text-xs text-slate-500">
        Came up {gap.count} {gap.count === 1 ? 'time' : 'times'} · last {formatNoteTime(gap.lastAt)}
      </p>
      {gap.example && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">A parent wrote: {gap.example}</p>
      )}
      {problem && (
        <p role="alert" className="text-sm text-red-700">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <TargetSelect notes={notes} value={target} onChange={setTarget} label={`Where to write: ${gap.note}`} />
        <button
          type="button"
          onClick={write}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84]"
        >
          Write the answer
        </button>
        <button
          type="button"
          onClick={() => void onClose(gap.note).then(setProblem)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Not needed
        </button>
      </div>
    </li>
  )
}

// Replies the team changed or wrote themselves, next to what the AI drafted: the admin decides which are
// worth teaching.
export function ExamplesPanel({
  examples,
  notes,
  onTeach,
  onClose,
}: {
  examples: Example[]
  notes: KnowledgeNote[]
  onTeach: (request: TeachRequest) => void
  onClose: (id: number) => Promise<string | null>
}) {
  if (examples.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-14 text-center">
        <p className="font-semibold text-slate-900">No replies to look at</p>
        <p className="mt-1 text-sm text-slate-500">
          When the team changes an AI draft, or writes their own reply instead, it shows here beside the draft.
        </p>
      </div>
    )
  }
  return (
    <ul className="space-y-3">
      {examples.map((example) => (
        <ExampleRow key={example.id} example={example} notes={notes} onTeach={onTeach} onClose={onClose} />
      ))}
    </ul>
  )
}

function ExampleRow({
  example,
  notes,
  onTeach,
  onClose,
}: {
  example: Example
  notes: KnowledgeNote[]
  onTeach: (request: TeachRequest) => void
  onClose: (id: number) => Promise<string | null>
}) {
  const [target, setTarget] = useState(() => defaultTarget(notes))
  const [problem, setProblem] = useState<string | null>(null)

  function teach() {
    const note = notes.find((entry) => String(entry.id) === target)
    onTeach({
      noteId: note?.id ?? null,
      prefill: { body: appendTo(note, exampleBlock(example)) },
      banner:
        'This is the reply the team sent. Take out names and anything that is only true for this one child before you save.',
      afterSave: () => onClose(example.id),
    })
  }

  return (
    <li className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">
        {CATEGORY_LABELS[example.category]} · {formatNoteTime(example.createdAt)} ·{' '}
        {example.outcome === 'edited' ? 'The team changed the draft' : 'The team wrote their own reply'}
      </p>
      {example.parentText && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <span className="font-semibold">Parent:</span> {example.parentText}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI drafted</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{example.draft}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Team sent</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-900">{example.sentText}</p>
        </div>
      </div>
      {problem && (
        <p role="alert" className="text-sm text-red-700">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <TargetSelect notes={notes} value={target} onChange={setTarget} label="Where to add this example" />
        <button
          type="button"
          onClick={teach}
          className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white hover:bg-[#de0a84]"
        >
          Teach the AI this
        </button>
        <button
          type="button"
          onClick={() => void onClose(example.id).then(setProblem)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Skip
        </button>
      </div>
    </li>
  )
}

function verdictOf(entry: CategoryReport): {
  text: string
  tone: 'good' | 'neutral' | 'person'
} {
  if (ALWAYS_PERSON.includes(entry.category)) {
    return { text: 'Always a person', tone: 'person' }
  }
  if (autoCandidate(entry)) {
    return { text: 'Could be sent without a person', tone: 'good' }
  }
  if (entry.total < MIN_ANSWERED_FOR_AUTO) {
    return {
      text: `Needs ${MIN_ANSWERED_FOR_AUTO - entry.total} more answered drafts`,
      tone: 'neutral',
    }
  }
  return { text: 'Not yet: the team still changes these', tone: 'neutral' }
}

// How the drafts are doing, in total and for each kind of question, and which kinds the AI could one day
// answer without a person. Nothing is ever sent from here.
export function ReportPanel({ report }: { report: AiLearning['report'] }) {
  if (report.drafts === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 px-4 py-14 text-center">
        <p className="font-semibold text-slate-900">No drafts yet</p>
        <p className="mt-1 text-sm text-slate-500">The report fills in as the AI writes drafts and the team replies.</p>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Drafts written', value: String(report.drafts) },
          {
            label: 'Sent as written',
            value: percent(report.asIs, report.answered),
          },
          {
            label: 'Changed a little',
            value: percent(report.edited, report.answered),
          },
          {
            label: 'Replaced',
            value: percent(report.replaced, report.answered),
          },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-2xl font-bold text-slate-900">{card.value}</p>
            <p className="text-xs text-slate-500">{card.label}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-slate-600">
        {report.answered} of the {report.drafts} drafts have a reply from the team to compare with (the last{' '}
        {LEARNING_WINDOW} drafts).
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2">Kind of question</th>
              <th className="px-3 py-2">Answered</th>
              <th className="px-3 py-2">As written</th>
              <th className="px-3 py-2">Changed</th>
              <th className="px-3 py-2">Replaced</th>
              <th className="px-3 py-2">Without a person?</th>
            </tr>
          </thead>
          <tbody>
            {report.byCategory.map((entry) => {
              const verdict = verdictOf(entry)
              return (
                <tr key={entry.category} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2 font-medium text-slate-900">{CATEGORY_LABELS[entry.category]}</td>
                  <td className="px-3 py-2">{entry.total}</td>
                  <td className="px-3 py-2">{percent(entry.asIs, entry.total)}</td>
                  <td className="px-3 py-2">{percent(entry.edited, entry.total)}</td>
                  <td className="px-3 py-2">{percent(entry.replaced, entry.total)}</td>
                  <td
                    className={cn(
                      'px-3 py-2 text-xs font-semibold',
                      verdict.tone === 'good' && 'text-emerald-700',
                      verdict.tone === 'person' && 'text-red-700',
                      verdict.tone === 'neutral' && 'text-slate-500',
                    )}
                  >
                    {verdict.text}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        A kind of question is a candidate once it has at least {MIN_ANSWERED_FOR_AUTO} answered drafts and the team sent{' '}
        {Math.round(MIN_SHARE_FOR_AUTO * 100)}% of them as written. Price, complaint, refund and health questions are
        always answered by a person. Nothing is sent without a person today.
      </p>
    </div>
  )
}
