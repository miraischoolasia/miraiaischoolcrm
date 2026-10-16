import { useState } from 'react'
import { Plus, Trash, X } from '@phosphor-icons/react'
import { ModalShell } from '../ModalShell'
import { cn } from '../../lib/cn'
import {
  checkAnswer,
  draftProblem,
  emptyQuestionDraft,
  matchRuleLabels,
  questionKindLabels,
  type MatchRule,
  type QuestionDraft,
  type QuestionKind,
  shortAgeGroup,
} from '../../lib/questions'
import { useAgeGroups } from '../../lib/ageGroups'
import type { Subject } from '../../lib/subjects'

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#fc0c97]'

const resultText = {
  correct: { label: 'Marked correct', className: 'text-emerald-700' },
  wrong: { label: 'Marked wrong', className: 'text-red-700' },
  teacher: { label: 'Goes to the teacher to decide', className: 'text-amber-700' },
}

// Write or change one question, and try an answer to see how it is marked.
export function QuestionEditorModal({
  initial,
  title,
  subjects,
  onClose,
  onSave,
}: {
  initial: QuestionDraft | null
  title: string
  // The school's subjects; hidden ones only show when the question has one.
  subjects: Subject[]
  onClose: () => void
  // Resolves to an error message, or null when saved.
  onSave: (draft: QuestionDraft) => Promise<string | null>
}) {
  const [draft, setDraft] = useState<QuestionDraft>(initial ?? emptyQuestionDraft())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [tryText, setTryText] = useState('')
  const [tryPicked, setTryPicked] = useState<number[]>([])
  const problem = draftProblem(draft)
  const ageGroupOptions = useAgeGroups()

  function set<K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  async function save() {
    setSaving(true)
    const failure = await onSave(draft)
    setSaving(false)
    if (failure) {
      setError(failure)
      return
    }
    onClose()
  }

  const tryResult =
    draft.kind === 'choice'
      ? tryPicked.length > 0
        ? checkAnswer(draft, tryPicked)
        : null
      : draft.kind === 'fill' || draft.kind === 'short'
        ? tryText.trim()
          ? checkAnswer(draft, tryText)
          : null
        : 'teacher'

  return (
    <ModalShell maxWidth="2xl" onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5 sm:px-8">
        <div>
          <div className="text-sm font-medium text-[#be185d]">Question Bank</div>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-xl border border-slate-200 p-2 text-slate-600 transition hover:bg-white"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div data-modal-body className="max-h-[70vh] space-y-5 overflow-y-auto px-6 py-6 sm:px-8">
        <div role="radiogroup" aria-label="Question type" className="flex flex-wrap gap-2">
          {(Object.keys(questionKindLabels) as QuestionKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={draft.kind === kind}
              onClick={() => set('kind', kind)}
              className={cn(
                'rounded-xl px-3 py-1.5 text-sm font-semibold transition',
                draft.kind === kind ? 'bg-[#fc0c97] text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50',
              )}
            >
              {questionKindLabels[kind]}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-sm font-semibold text-slate-900">Subject</span>
            <select
              value={draft.subjectId ?? ''}
              onChange={(event) => set('subjectId', event.target.value ? Number(event.target.value) : null)}
              className={inputClass}
            >
              <option value="">Any subject</option>
              {subjects
                .filter((subject) => subject.isActive || subject.id === draft.subjectId)
                .map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
            </select>
          </label>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-semibold text-slate-900">Ages (none ticked = every age)</legend>
            <div className="flex flex-wrap gap-1.5">
              {ageGroupOptions.map((group) => {
                const on = draft.ageGroups.includes(group)
                return (
                  <button
                    key={group}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set('ageGroups', on ? draft.ageGroups.filter((entry) => entry !== group) : [...draft.ageGroups, group])
                    }
                    className={cn(
                      'rounded-lg border px-2.5 py-1.5 text-sm font-semibold transition',
                      on ? 'border-[#fc0c97] bg-[#fff1f8] text-[#be185d]' : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    {shortAgeGroup(group)}
                  </button>
                )
              })}
            </div>
          </fieldset>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-slate-900">Question</span>
          <textarea
            rows={3}
            value={draft.prompt}
            maxLength={2000}
            onChange={(event) => set('prompt', event.target.value)}
            placeholder="What do you want to ask?"
            className={inputClass}
          />
        </label>

        {draft.kind === 'choice' && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-slate-900">Options (tick the correct ones)</legend>
            {draft.options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={option.correct}
                  aria-label={`Option ${index + 1} is correct`}
                  onChange={(event) =>
                    set('options', draft.options.map((entry, at) => (at === index ? { ...entry, correct: event.target.checked } : entry)))
                  }
                  className="h-4 w-4 accent-[#fc0c97]"
                />
                <input
                  type="text"
                  value={option.text}
                  maxLength={300}
                  aria-label={`Option ${index + 1}`}
                  placeholder={`Option ${index + 1}`}
                  onChange={(event) =>
                    set('options', draft.options.map((entry, at) => (at === index ? { ...entry, text: event.target.value } : entry)))
                  }
                  className={inputClass}
                />
                <button
                  type="button"
                  disabled={draft.options.length <= 2}
                  onClick={() => set('options', draft.options.filter((_, at) => at !== index))}
                  aria-label={`Remove option ${index + 1}`}
                  className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-30"
                >
                  <Trash size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={draft.options.length >= 8}
              onClick={() => set('options', [...draft.options, { text: '', correct: false }])}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <Plus size={14} aria-hidden="true" />
              Add an option
            </button>
          </fieldset>
        )}

        {(draft.kind === 'fill' || draft.kind === 'short') && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-slate-900">
              Accepted answers
              {draft.kind === 'short' && (
                <span className="ml-1 font-normal text-slate-500">(optional: anything else goes to you to decide)</span>
              )}
            </legend>
            {draft.acceptedAnswers.map((answer, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="text"
                  value={answer.text}
                  maxLength={300}
                  aria-label={`Accepted answer ${index + 1}`}
                  placeholder="An answer that counts"
                  onChange={(event) =>
                    set(
                      'acceptedAnswers',
                      draft.acceptedAnswers.map((entry, at) => (at === index ? { ...entry, text: event.target.value } : entry)),
                    )
                  }
                  className={inputClass}
                />
                <select
                  value={answer.match}
                  aria-label={`Accepted answer ${index + 1} match`}
                  onChange={(event) =>
                    set(
                      'acceptedAnswers',
                      draft.acceptedAnswers.map((entry, at) =>
                        at === index ? { ...entry, match: event.target.value as MatchRule } : entry,
                      ),
                    )
                  }
                  className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm"
                >
                  {(Object.keys(matchRuleLabels) as MatchRule[]).map((rule) => (
                    <option key={rule} value={rule}>
                      {matchRuleLabels[rule]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => set('acceptedAnswers', draft.acceptedAnswers.filter((_, at) => at !== index))}
                  aria-label={`Remove accepted answer ${index + 1}`}
                  className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
                >
                  <Trash size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={draft.acceptedAnswers.length >= 20}
                onClick={() => set('acceptedAnswers', [...draft.acceptedAnswers, { text: '', match: 'exact' }])}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <Plus size={14} aria-hidden="true" />
                Add an answer
              </button>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={draft.caseSensitive}
                  onChange={(event) => set('caseSensitive', event.target.checked)}
                  className="h-4 w-4 accent-[#fc0c97]"
                />
                Capital letters matter
              </label>
            </div>
          </fieldset>
        )}

        {(draft.kind === 'screenshot' || draft.kind === 'link') && (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Students send {draft.kind === 'screenshot' ? 'a picture of their work' : 'a link to their work'}; you decide
            each one.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1.5">
            <span className="text-sm font-semibold text-slate-900">Points</span>
            <input
              type="number"
              min={1}
              max={100}
              value={draft.points}
              onChange={(event) => set('points', Number(event.target.value))}
              className={inputClass}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-semibold text-slate-900">Seconds to answer</span>
            <input
              type="number"
              min={5}
              max={1800}
              value={draft.timeLimitSeconds}
              onChange={(event) => set('timeLimitSeconds', Number(event.target.value))}
              className={inputClass}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-semibold text-slate-900">Topic</span>
            <input
              type="text"
              value={draft.topic ?? ''}
              maxLength={60}
              placeholder="e.g. Loops"
              onChange={(event) => set('topic', event.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-slate-900">Explanation after answering (optional)</span>
          <textarea
            rows={2}
            value={draft.explanation ?? ''}
            maxLength={1000}
            onChange={(event) => set('explanation', event.target.value)}
            className={inputClass}
          />
        </label>

        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={draft.isShared}
            onChange={(event) => set('isShared', event.target.checked)}
            className="h-4 w-4 accent-[#fc0c97]"
          />
          Share with every teacher in the school
        </label>

        {draft.kind !== 'screenshot' && draft.kind !== 'link' && (
          <section aria-label="Try an answer" className="space-y-2 rounded-2xl border border-dashed border-slate-300 p-4">
            <div className="text-sm font-semibold text-slate-900">Try an answer</div>
            {draft.kind === 'choice' ? (
              <div className="flex flex-wrap gap-2">
                {draft.options.map((option, index) => (
                  <label key={index} className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={tryPicked.includes(index)}
                      onChange={(event) =>
                        setTryPicked(event.target.checked ? [...tryPicked, index] : tryPicked.filter((at) => at !== index))
                      }
                      className="h-4 w-4"
                    />
                    {option.text || `Option ${index + 1}`}
                  </label>
                ))}
              </div>
            ) : (
              <input
                type="text"
                value={tryText}
                aria-label="Answer to try"
                placeholder="Type what a student might answer"
                onChange={(event) => setTryText(event.target.value)}
                className={inputClass}
              />
            )}
            {tryResult && <div className={cn('text-sm font-semibold', resultText[tryResult].className)}>{resultText[tryResult].label}</div>}
          </section>
        )}

        {(error || problem) && (
          <div role={error ? 'alert' : undefined} className={cn('text-sm', error ? 'text-red-700' : 'text-slate-500')}>
            {error ?? problem}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={problem !== null || saving}
            onClick={() => void save()}
            className="rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save question'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
