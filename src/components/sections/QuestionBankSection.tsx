import { useCallback, useEffect, useMemo, useState } from 'react'
import { MagnifyingGlass, Plus, UploadSimple } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import {
  copyQuestion,
  fetchQuestions,
  importQuestions,
  questionKindLabels,
  saveQuestion,
  setQuestionArchived,
  type Question,
  type QuestionDraft,
  fitsClassroom,
  shortAgeGroup,
} from '../../lib/questions'
import { useAgeGroups } from '../../lib/ageGroups'
import type { Subject } from '../../lib/subjects'
import type { AgeGroup, Classroom } from '../../types/domain'
import { ImportQuestionsModal } from '../questions/ImportQuestionsModal'
import { QuestionEditorModal } from '../questions/QuestionEditorModal'

type Tab = 'mine' | 'school' | 'archived'

// The teacher's questions, the ones shared with the school, and the archived
// ones; write, import, share, copy and archive. Questions pop up in class
// later (phase 3C).
export function QuestionBankSection({
  currentTeacherId,
  isAdmin,
  teacherNames,
  subjects,
  classrooms,
}: {
  currentTeacherId: number | null
  isAdmin: boolean
  teacherNames: Map<number, string>
  subjects: Subject[]
  // The classes this account can see, to find the questions that fit one.
  classrooms: Classroom[]
}) {
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const ageGroupOptions = useAgeGroups()
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('mine')
  const [search, setSearch] = useState('')
  const [topic, setTopic] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [ageFilter, setAgeFilter] = useState<AgeGroup | ''>('')
  const [classroomFilter, setClassroomFilter] = useState('')
  const [editing, setEditing] = useState<Question | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(() => {
    fetchQuestions()
      .then((next) => {
        setQuestions(next)
        setError(null)
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to load the questions.'))
  }, [])

  useEffect(load, [load])

  const canEdit = (question: Question) => isAdmin || question.ownerId === currentTeacherId
  const subjectName = new Map(subjects.map((subject) => [subject.id, subject.name]))
  const activeClassrooms = classrooms.filter((classroom) => classroom.status === 'active')
  const fitClassroom = activeClassrooms.find((classroom) => String(classroom.id) === classroomFilter) ?? null
  const topics = useMemo(
    () => Array.from(new Set((questions ?? []).flatMap((question) => (question.topic ? [question.topic] : [])))).sort(),
    [questions],
  )
  const shown = (questions ?? []).filter((question) => {
    if (tab === 'archived' ? !question.isArchived : question.isArchived) return false
    if (tab === 'mine' && question.ownerId !== currentTeacherId) return false
    if (tab === 'school' && !question.isShared) return false
    if (topic && question.topic !== topic) return false
    if (subjectFilter && String(question.subjectId ?? '') !== subjectFilter) return false
    if (ageFilter && !(question.ageGroups.length === 0 || question.ageGroups.includes(ageFilter))) return false
    if (fitClassroom && !fitsClassroom(question, fitClassroom)) return false
    const needle = search.trim().toLowerCase()
    return !needle || question.prompt.toLowerCase().includes(needle) || (question.topic ?? '').toLowerCase().includes(needle)
  })
  const counts = {
    mine: (questions ?? []).filter((question) => !question.isArchived && question.ownerId === currentTeacherId).length,
    school: (questions ?? []).filter((question) => !question.isArchived && question.isShared).length,
    archived: (questions ?? []).filter((question) => question.isArchived).length,
  }

  async function act(action: Promise<string | null>, done: string) {
    const failure = await action
    if (failure) {
      setError(failure)
      return failure
    }
    setError(null)
    setNotice(done)
    load()
    return null
  }

  return (
    <div className="space-y-4">
      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Question Bank</h2>
            <p className="mt-1 text-sm text-slate-500">
              Questions to pop up in class: multiple choice, fill in, short answer, a screenshot or a link to the
              student's work.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <UploadSimple size={16} aria-hidden="true" />
              Import
            </button>
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#fc0c97] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#de0a84]"
            >
              <Plus size={16} weight="bold" aria-hidden="true" />
              New question
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div role="tablist" className="flex gap-2">
            {(
              [
                ['mine', 'Mine'],
                ['school', 'Shared with school'],
                ['archived', 'Archived'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  'rounded-xl px-3 py-1.5 text-sm font-semibold transition',
                  tab === key ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-700 hover:bg-slate-50',
                )}
              >
                {label} ({counts[key]})
              </button>
            ))}
          </div>
          <label className="relative flex-1">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={search}
              aria-label="Search questions"
              placeholder="Search questions"
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm"
            />
          </label>
          {subjects.some((subject) => subject.isActive) && (
            <select
              value={subjectFilter}
              aria-label="Subject"
              onChange={(event) => setSubjectFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">All subjects</option>
              {subjects
                .filter((subject) => subject.isActive)
                .map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
            </select>
          )}
          <select
            value={ageFilter}
            aria-label="Age"
            onChange={(event) => setAgeFilter(event.target.value as AgeGroup | '')}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="">All ages</option>
            {ageGroupOptions.map((group) => (
              <option key={group} value={group}>
                {shortAgeGroup(group)}
              </option>
            ))}
          </select>
          {activeClassrooms.length > 0 && (
            <select
              value={classroomFilter}
              aria-label="Fits class"
              onChange={(event) => setClassroomFilter(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">Any class</option>
              {activeClassrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  For {classroom.name}
                </option>
              ))}
            </select>
          )}
          {topics.length > 0 && (
            <select
              value={topic}
              aria-label="Topic"
              onChange={(event) => setTopic(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">All topics</option>
              {topics.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          )}
        </div>

        {error && (
          <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {notice && !error && <div className="mt-3 text-sm font-semibold text-emerald-700">{notice}</div>}
      </section>

      {questions === null && !error && <div className="py-10 text-center text-sm text-slate-500">Loading questions…</div>}

      {questions !== null && shown.length === 0 && (
        <div className="rounded-[24px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">
          {tab === 'mine'
            ? 'No questions yet. Write one, or import a list from Excel.'
            : tab === 'school'
              ? 'Nobody has shared a question yet.'
              : 'Nothing archived.'}
        </div>
      )}

      <ul className="space-y-3">
        {shown.map((question) => (
          <li key={question.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-[#fff1f8] px-2 py-0.5 text-[#be185d]">{questionKindLabels[question.kind]}</span>
                  <span className="text-slate-500">
                    {question.points} pts · {question.timeLimitSeconds}s
                  </span>
                  {question.subjectId !== null && subjectName.has(question.subjectId) && (
                    <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-700">{subjectName.get(question.subjectId)}</span>
                  )}
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                    {question.ageGroups.length === 0 ? 'All ages' : question.ageGroups.map(shortAgeGroup).join(', ')}
                  </span>
                  {question.topic && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{question.topic}</span>}
                  {question.isShared && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">Shared</span>}
                  {question.ownerId !== currentTeacherId && (
                    <span className="text-slate-400">by {teacherNames.get(question.ownerId) ?? 'another teacher'}</span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm font-medium text-slate-900">{question.prompt}</p>
                {question.kind === 'choice' && (
                  <ul className="mt-2 flex flex-wrap gap-1.5 text-xs">
                    {question.options.map((option, index) => (
                      <li
                        key={index}
                        className={cn(
                          'rounded-lg border px-2 py-1',
                          option.correct ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600',
                        )}
                      >
                        {option.correct ? '✓ ' : ''}
                        {option.text}
                      </li>
                    ))}
                  </ul>
                )}
                {(question.kind === 'fill' || question.kind === 'short') && question.acceptedAnswers.length > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    Accepts: {question.acceptedAnswers.map((answer) => answer.text).join(' / ')}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {canEdit(question) && !question.isArchived && (
                  <button
                    type="button"
                    onClick={() => setEditing(question)}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Edit
                  </button>
                )}
                {!canEdit(question) && (
                  <button
                    type="button"
                    onClick={() => void act(copyQuestion(question.id), 'Copied to your questions.')}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Copy to mine
                  </button>
                )}
                {canEdit(question) && (
                  <button
                    type="button"
                    onClick={() =>
                      void act(
                        setQuestionArchived(question.id, !question.isArchived),
                        question.isArchived ? 'Brought back.' : 'Archived.',
                      )
                    }
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                  >
                    {question.isArchived ? 'Bring back' : 'Archive'}
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <QuestionEditorModal
          subjects={subjects}
          title={editing === 'new' ? 'New question' : 'Edit question'}
          initial={editing === 'new' ? null : toDraft(editing)}
          onClose={() => setEditing(null)}
          onSave={(draft) =>
            act(saveQuestion(editing === 'new' ? null : editing.id, draft), editing === 'new' ? 'Question saved.' : 'Question changed.')
          }
        />
      )}

      {importing && (
        <ImportQuestionsModal
          subjects={subjects}
          onClose={() => setImporting(false)}
          onImport={(drafts, share) =>
            act(importQuestions(drafts, share), `Imported ${drafts.length} ${drafts.length === 1 ? 'question' : 'questions'}.`)
          }
        />
      )}
    </div>
  )
}

function toDraft(question: Question): QuestionDraft {
  return {
    kind: question.kind,
    prompt: question.prompt,
    options: question.options.length > 0 ? question.options : [{ text: '', correct: true }, { text: '', correct: false }],
    acceptedAnswers: question.acceptedAnswers,
    caseSensitive: question.caseSensitive,
    points: question.points,
    timeLimitSeconds: question.timeLimitSeconds,
    topic: question.topic,
    explanation: question.explanation,
    isShared: question.isShared,
    subjectId: question.subjectId,
    ageGroups: question.ageGroups,
  }
}
