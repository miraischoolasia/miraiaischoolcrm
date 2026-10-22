import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Eye, ListNumbers, MagnifyingGlass, Play, Plus, Robot, Stop, Timer, X } from '@phosphor-icons/react'
import { QuestionEditorModal } from './questions/QuestionEditorModal'
import { cn } from '../lib/cn'
import { emptyQuestionDraft, fetchQuestions, fitsClassroom, questionKindLabels, saveQuestion, type Question } from '../lib/questions'
import { fetchSubjects, type Subject } from '../lib/subjects'
import { fetchQuestionPlan, moveInPlan, nextPlanned, saveQuestionPlan } from '../lib/questionPlan'
import {
  answerText,
  askAiToMark,
  choiceLetter,
  closeLiveQuestion,
  fetchLessonLive,
  fetchLiveQuestionSettings,
  isOpen,
  lessonBoard,
  liveAnswerFileUrl,
  markLiveAnswer,
  openClassSession,
  pushLiveQuestion,
  revealLiveQuestion,
  secondsLeft,
  watchLesson,
  type LiveAnswer,
  type LiveKey,
  type LiveQuestion,
  type LiveQuestionSettings,
} from '../lib/liveQuestions'
import type { AgeGroup } from '../types/domain'

const timeChoices = [
  { value: 0, label: 'Time from the bank' },
  { value: 20, label: '20 seconds' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 120, label: '2 minutes' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
]

const primaryButton =
  'rounded-xl bg-[#fc0c97] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#de0a84] disabled:opacity-50'
const secondaryButton =
  'rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50'

type QuestionTab = 'now' | 'plan' | 'bank' | 'points'

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

// The questions column of the live class console, in four tabs (Now, Plan, Bank, Points): pop one from the bank (or
// write / speak a new one), see the answers come in, show the right answer,
// mark what waits for the teacher (with the AI's suggestion), and the
// lesson's points. What it loads is passed up (onLive) for the student grid.
export function LiveQuestionsPanel({
  scheduleId,
  lessonDate,
  classroom,
  studentNames,
  rosterCount,
  onLive,
}: {
  scheduleId: number
  lessonDate: string
  classroom: { subjectId?: number | null; ageGroup: AgeGroup } | null
  studentNames: Map<number, string>
  rosterCount: number
  onLive?: (live: { sessionId: number; questions: LiveQuestion[]; keys: Map<number, LiveKey>; answers: LiveAnswer[] }) => void
}) {
  const [sessionId, setSessionId] = useState<number | null>(null)
  const [questions, setQuestions] = useState<LiveQuestion[]>([])
  const [keys, setKeys] = useState<Map<number, LiveKey>>(new Map())
  const [answers, setAnswers] = useState<LiveAnswer[]>([])
  const [bank, setBank] = useState<Question[] | null>(null)
  const [settings, setSettings] = useState<LiveQuestionSettings | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aiMessage, setAiMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [search, setSearch] = useState('')
  const [onlyFits, setOnlyFits] = useState(Boolean(classroom))
  const [timeLimit, setTimeLimit] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [writing, setWriting] = useState(false)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [plan, setPlan] = useState<number[]>([])
  const [tab, setTab] = useState<QuestionTab>('now')
  const aiAsked = useRef(new Set<number>())

  const onLiveRef = useRef(onLive)
  onLiveRef.current = onLive
  useEffect(() => {
    if (sessionId) onLiveRef.current?.({ sessionId, questions, keys, answers })
  }, [answers, keys, questions, sessionId])

  const load = useCallback(async (id: number) => {
    try {
      const next = await fetchLessonLive(id)
      setQuestions(next.questions)
      setKeys(next.keys)
      setAnswers(next.answers)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the questions.')
    }
  }, [])

  // Open the lesson, then the bank and the settings.
  useEffect(() => {
    let cancelled = false
    openClassSession(scheduleId, lessonDate)
      .then((session) => {
        if (cancelled) return
        setSessionId(session.id)
        void load(session.id)
        void fetchQuestionPlan(session.id).then((ids) => !cancelled && setPlan(ids))
      })
      .catch((openError: Error) => !cancelled && setError(openError.message))
    fetchQuestions()
      .then((list) => !cancelled && setBank(list.filter((question) => !question.isArchived)))
      .catch(() => !cancelled && setBank([]))
    fetchLiveQuestionSettings().then((value) => !cancelled && setSettings(value))
    return () => {
      cancelled = true
    }
  }, [lessonDate, load, scheduleId])

  // New answers and changes arrive by themselves; a slow poll covers a dropped connection.
  useEffect(() => {
    if (!sessionId) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const stop = watchLesson(sessionId, () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void load(sessionId), 250)
    })
    const poll = setInterval(() => void load(sessionId), 15000)
    return () => {
      stop()
      clearInterval(poll)
      if (timer) clearTimeout(timer)
    }
  }, [load, sessionId])

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(tick)
  }, [])

  const current = questions.find((question) => question.id === selectedId) ?? questions[questions.length - 1] ?? null
  const currentKey = current ? keys.get(current.id) : undefined
  const currentAnswers = useMemo(
    () => (current ? answers.filter((answer) => answer.liveQuestionId === current.id) : []),
    [answers, current],
  )
  const open = current ? isOpen(current, now) : false
  const board = useMemo(() => lessonBoard(answers), [answers])

  // The AI looks at answers that wait for the teacher, once each.
  useEffect(() => {
    if (!current || !settings?.aiMarking || (current.kind !== 'short' && current.kind !== 'screenshot')) return
    const fresh = currentAnswers.filter(
      (answer) => answer.result === 'pending' && !answer.aiCheckedAt && !aiAsked.current.has(answer.id),
    )
    if (fresh.length === 0) return
    for (const answer of fresh) aiAsked.current.add(answer.id)
    const questionId = current.id
    const timer = setTimeout(() => {
      void askAiToMark(questionId).then((result) => {
        setAiMessage(result.error ? `AI: ${result.error}` : null)
        if (sessionId) void load(sessionId)
      })
    }, 1500)
    return () => clearTimeout(timer)
  }, [current, currentAnswers, load, sessionId, settings?.aiMarking])

  const bankList = useMemo(() => {
    const words = search.trim().toLowerCase()
    return (bank ?? [])
      .filter((question) => !onlyFits || !classroom || fitsClassroom(question, classroom))
      .filter((question) => !words || `${question.prompt} ${question.topic ?? ''}`.toLowerCase().includes(words))
      .slice(0, 40)
  }, [bank, classroom, onlyFits, search])

  async function run(action: Promise<string | null>) {
    setBusy(true)
    setError(null)
    const problem = await action
    setBusy(false)
    if (problem) setError(problem)
    if (sessionId) await load(sessionId)
  }

  async function pop(questionId: number) {
    if (!sessionId) return
    setSelectedId(null)
    await run(pushLiveQuestion(sessionId, questionId, timeLimit > 0 ? timeLimit : null))
  }

  async function changePlan(next: number[]) {
    if (!sessionId) return
    const before = plan
    setPlan(next)
    const problem = await saveQuestionPlan(sessionId, next)
    if (problem) {
      setPlan(before)
      setError(problem)
    }
  }

  const bankById = useMemo(() => new Map((bank ?? []).map((question) => [question.id, question])), [bank])
  const poppedIds = useMemo(() => new Set(questions.map((question) => question.questionId)), [questions])
  const nextId = nextPlanned(plan, questions)
  const nextQuestion = nextId !== null ? bankById.get(nextId) ?? null : null

  const nameOf = (studentId: number) => studentNames.get(studentId) ?? `Student ${studentId}`

  // A question that has just been popped (here, with the N key or by the assistant) brings the "Now" tab forward.
  const latestId = questions[questions.length - 1]?.id ?? null
  const seenLatest = useRef<number | null | undefined>(undefined)
  useEffect(() => {
    if (seenLatest.current !== undefined && latestId !== null && latestId !== seenLatest.current) setTab('now')
    seenLatest.current = latestId
  }, [latestId])

  const toMark = currentAnswers.filter((answer) => answer.result === 'pending').length
  const planLeft = plan.filter((id) => !poppedIds.has(id)).length
  const tabs: { key: QuestionTab; label: string; count?: number; countLabel?: string }[] = [
    { key: 'now', label: 'Now', count: toMark, countLabel: 'to mark' },
    { key: 'plan', label: 'Plan', count: planLeft, countLabel: 'left in the plan' },
    { key: 'bank', label: 'Bank' },
    { key: 'points', label: 'Points' },
  ]
  const tabRefs = useRef(new Map<QuestionTab, HTMLButtonElement>())
  function moveTab(event: { key: string; preventDefault: () => void }, from: QuestionTab) {
    const index = tabs.findIndex((entry) => entry.key === from)
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    const target = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : step ? tabs[(index + step + tabs.length) % tabs.length] : null
    if (!target) return
    event.preventDefault()
    setTab(target.key)
    tabRefs.current.get(target.key)?.focus()
  }

  const timeSelect = (className = '') => (
    <select
      value={timeLimit}
      onChange={(event) => setTimeLimit(Number(event.target.value))}
      aria-label="Time to answer"
      className={cn('min-h-10 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-sm', className)}
    >
      {timeChoices.map((choice) => (
        <option key={choice.value} value={choice.value}>
          {choice.label}
        </option>
      ))}
    </select>
  )
  const popNextButton = nextQuestion && (
    <button
      type="button"
      disabled={busy || !sessionId}
      onClick={() => void pop(nextQuestion.id)}
      aria-keyshortcuts="N"
      className={cn(primaryButton, 'flex min-h-11 w-full min-w-0 items-center justify-center gap-2')}
    >
      <Play size={16} weight="fill" aria-hidden="true" className="shrink-0" />
      <span className="truncate">
        Pop next: {nextQuestion.prompt.slice(0, 30)}
        {nextQuestion.prompt.length > 30 ? '…' : ''}
      </span>
      <kbd className="shrink-0 rounded border border-white/60 px-1 text-[10px] font-semibold leading-4">N</kbd>
    </button>
  )
  const needsAnswer = current !== null && (open || !current.revealedAt)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {writing && (
        <QuestionEditorModal
          title="New question"
          subjects={subjects}
          initial={{
            ...emptyQuestionDraft(),
            subjectId: classroom?.subjectId ?? null,
            ageGroups: classroom ? [classroom.ageGroup] : [],
          }}
          onClose={() => setWriting(false)}
          onSave={async (draft) => {
            const problem = await saveQuestion(null, draft)
            if (!problem) {
              setSearch('')
              const list = await fetchQuestions().catch(() => null)
              if (list) setBank(list.filter((question) => !question.isArchived))
            }
            return problem
          }}
        />
      )}

      <div role="tablist" aria-label="Questions" className="flex shrink-0 gap-1 border-b border-slate-200 px-3 pt-2">
        {tabs.map((entry) => (
          <button
            key={entry.key}
            ref={(node) => {
              if (node) tabRefs.current.set(entry.key, node)
              else tabRefs.current.delete(entry.key)
            }}
            type="button"
            role="tab"
            id={`questions-tab-${entry.key}`}
            aria-selected={tab === entry.key}
            aria-controls="questions-tab-panel"
            tabIndex={tab === entry.key ? 0 : -1}
            onClick={() => setTab(entry.key)}
            onKeyDown={(event) => moveTab(event, entry.key)}
            className={cn(
              'flex min-h-11 items-center gap-1.5 border-b-[3px] px-3 text-sm font-bold transition',
              tab === entry.key ? 'border-[#fc0c97] text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {entry.label}
            {entry.count ? (
              <span
                className={cn(
                  'inline-grid h-[18px] min-w-[18px] place-items-center rounded-full px-1.5 text-[11px] font-bold',
                  entry.key === 'now' ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-700',
                )}
              >
                {entry.count}
                <span className="sr-only"> {entry.countLabel}</span>
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div id="questions-tab-panel" role="tabpanel" aria-labelledby={`questions-tab-${tab}`} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {!sessionId && !error && <p className="text-sm text-slate-500">Opening the lesson…</p>}

        {tab === 'now' && (
          <>
            {current ? (
              <section aria-label="Question now" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                    Question {current.number} · {questionKindLabels[current.kind]} · {current.points} pts
                    {current.scoring === 'speed' ? ' (faster = more)' : ''}
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums',
                      open ? 'bg-emerald-100 text-emerald-800' : current.revealedAt ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-600',
                    )}
                  >
                    {open ? <Timer size={12} aria-hidden="true" /> : current.revealedAt ? <Eye size={12} aria-hidden="true" /> : <Stop size={12} aria-hidden="true" />}
                    {open ? `${clock(secondsLeft(current, now))} left` : current.revealedAt ? 'Answer shown' : 'Closed'}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-lg font-bold leading-snug text-slate-900">{current.prompt}</p>
                {current.kind === 'choice' && (
                  <ol className="space-y-1.5 text-sm">
                    {current.options.map((option, index) => {
                      const right = currentKey?.correctOptions.includes(index)
                      return (
                        <li
                          key={index}
                          className={cn(
                            'flex items-center gap-2 rounded-xl border px-2.5 py-2',
                            right ? 'border-emerald-300 bg-emerald-50 font-semibold text-emerald-800' : 'border-slate-200 text-slate-700',
                          )}
                        >
                          <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-lg text-xs font-bold', right ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600')}>
                            {choiceLetter(index)}
                          </span>
                          <span className="min-w-0 flex-1">{option}</span>
                          {right ? ' ✓' : ''}
                        </li>
                      )
                    })}
                  </ol>
                )}
                {(current.kind === 'fill' || current.kind === 'short') && currentKey && currentKey.acceptedAnswers.length > 0 && (
                  <p className="text-sm text-slate-600">Accepted: {currentKey.acceptedAnswers.join(' · ')}</p>
                )}

                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold text-slate-800">
                      {currentAnswers.length} of {rosterCount} answered
                    </span>
                    {toMark > 0 && <span className="text-xs font-semibold text-amber-700">{toMark} to mark</span>}
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-slate-900 transition-[width] motion-reduce:transition-none"
                      style={{ width: `${rosterCount > 0 ? Math.min(100, (currentAnswers.length / rosterCount) * 100) : 0}%` }}
                    />
                  </div>
                </div>
                {aiMessage && <p className="text-xs text-amber-700">{aiMessage}</p>}

                {currentAnswers.length > 0 && (
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Answers</h3>
                    <ul className="mt-1 divide-y divide-slate-100">
                      {currentAnswers.map((answer) => (
                        <AnswerRow
                          key={answer.id}
                          answer={answer}
                          question={current}
                          name={nameOf(answer.studentId)}
                          busy={busy}
                          onMark={(correct, feedback) => void run(markLiveAnswer(answer.id, correct, feedback))}
                        />
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            ) : (
              sessionId && (
                <section aria-label="Next question" className="space-y-2">
                  {nextQuestion ? (
                    <>
                      <div className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">Next in the plan</div>
                      <p className="whitespace-pre-wrap text-lg font-bold leading-snug text-slate-900">{nextQuestion.prompt}</p>
                      <p className="text-sm text-slate-500">
                        {questionKindLabels[nextQuestion.kind]} · {nextQuestion.points} pts · {nextQuestion.timeLimitSeconds}s
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-slate-600">No question yet. Line some up in the plan, or pop one from the bank.</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setTab('plan')} className={secondaryButton}>
                          Open the plan
                        </button>
                        <button type="button" onClick={() => setTab('bank')} className={secondaryButton}>
                          Open the bank
                        </button>
                      </div>
                    </>
                  )}
                </section>
              )
            )}

            {questions.length > 0 && (
              <section aria-label="This lesson">
                <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">This lesson</h3>
                <ul className="mt-1 space-y-1">
                  {[...questions].reverse().map((question) => {
                    const count = answers.filter((answer) => answer.liveQuestionId === question.id)
                    const right = count.filter((answer) => answer.result === 'correct').length
                    const waiting = count.filter((answer) => answer.result === 'pending').length
                    return (
                      <li key={question.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(question.id)}
                          aria-current={current?.id === question.id ? 'true' : undefined}
                          className={cn(
                            'w-full rounded-xl border px-3 py-2 text-left text-sm hover:bg-slate-50',
                            current?.id === question.id ? 'border-[#fc0c97] bg-[#fff0f8]' : 'border-slate-200',
                          )}
                        >
                          <span className="font-semibold text-slate-800">Q{question.number}.</span>{' '}
                          <span className="text-slate-700">{question.prompt.slice(0, 60)}</span>
                          <span className="block text-xs text-slate-500">
                            {count.length} answered · {right} right
                            {waiting > 0 ? <span className="font-semibold text-amber-700"> · {waiting} to mark</span> : ''}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )}
          </>
        )}

        {tab === 'plan' && (
          <section aria-label="Lesson plan">
            <h3 className="flex items-center gap-1.5 text-base font-semibold text-slate-900">
              <ListNumbers size={18} className="text-[#fc0c97]" aria-hidden="true" />
              Lesson plan
            </h3>
            {plan.length === 0 ? (
              <p className="mt-1 text-sm text-slate-500">Line questions up before class with "+ Plan" in the Bank tab; in class, pop the next one with one tap.</p>
            ) : (
              <ol className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {plan.map((questionId, index) => {
                  const question = bankById.get(questionId)
                  const popped = poppedIds.has(questionId)
                  return (
                    <li key={questionId} className={cn('flex items-center gap-2 px-3 py-2 text-sm', questionId === nextId && 'bg-[#fff0f8]')}>
                      <span className="w-5 shrink-0 text-xs font-semibold text-slate-500">{index + 1}.</span>
                      <span className={cn('min-w-0 flex-1 truncate', popped ? 'text-slate-400 line-through' : 'text-slate-800')}>
                        {question?.prompt ?? 'A question no longer in the bank'}
                      </span>
                      {popped && <Check size={14} className="shrink-0 text-emerald-600" aria-label="Popped" />}
                      {questionId === nextId && <span className="shrink-0 text-xs font-semibold text-[#be185d]">next</span>}
                      <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => void changePlan(moveInPlan(plan, questionId, -1))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30">
                        <ArrowUp size={14} aria-hidden="true" />
                      </button>
                      <button type="button" aria-label="Move down" disabled={index === plan.length - 1} onClick={() => void changePlan(moveInPlan(plan, questionId, 1))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30">
                        <ArrowDown size={14} aria-hidden="true" />
                      </button>
                      <button type="button" aria-label="Take out of the plan" onClick={() => void changePlan(plan.filter((id) => id !== questionId))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
                        <X size={14} aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
            <button type="button" onClick={() => setTab('bank')} className={cn(secondaryButton, 'mt-3 inline-flex items-center gap-1.5')}>
              <Plus size={14} aria-hidden="true" />
              Add from the bank
            </button>
          </section>
        )}

        {tab === 'bank' && (
          <section aria-label="Pop a question">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-slate-900">Pop a question</h3>
              <button
                type="button"
                onClick={() => {
                  setWriting(true)
                  if (subjects.length === 0) void fetchSubjects().then(setSubjects).catch(() => setSubjects([]))
                }}
                className={cn(secondaryButton, 'inline-flex items-center gap-1.5')}
              >
                <Plus size={14} aria-hidden="true" />
                New question
              </button>
            </div>
            <p className="text-sm text-slate-500">It shows at once in the student app; popping another one closes this one.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="relative min-w-[180px] flex-1">
                <MagnifyingGlass size={16} className="absolute left-2.5 top-3 text-slate-400" aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search questions"
                  aria-label="Search questions"
                  className="min-h-10 w-full rounded-xl border border-slate-200 py-1.5 pr-3 pl-9! text-sm"
                />
              </label>
              {timeSelect()}
              {classroom && (
                <label className="flex items-center gap-1.5 text-sm text-slate-600">
                  <input type="checkbox" checked={onlyFits} onChange={(event) => setOnlyFits(event.target.checked)} />
                  For this class
                </label>
              )}
            </div>
            {bank === null ? (
              <p className="mt-3 text-sm text-slate-500">Loading the question bank…</p>
            ) : bankList.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                No questions{onlyFits ? ' for this class' : ''}. Add them in the Question Bank.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {bankList.map((question) => (
                  <li key={question.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-800">{question.prompt}</div>
                      <div className="text-xs text-slate-500">
                        {questionKindLabels[question.kind]} · {question.points} pts · {question.timeLimitSeconds}s
                        {question.topic ? ` · ${question.topic}` : ''}
                      </div>
                    </div>
                    <span className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        disabled={!sessionId || plan.includes(question.id) || plan.length >= 200}
                        onClick={() => void changePlan([...plan, question.id])}
                        className={secondaryButton}
                      >
                        {plan.includes(question.id) ? 'In plan' : '+ Plan'}
                      </button>
                      <button type="button" disabled={busy || !sessionId} onClick={() => void pop(question.id)} className={primaryButton}>
                        Pop
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'points' && (
          <section aria-label="Points this lesson">
            <h3 className="text-base font-semibold text-slate-900">Points this lesson</h3>
            <p className="text-xs text-slate-500">
              {settings && settings.leaderboardTop > 0
                ? `Children see the top ${settings.leaderboardTop} after each answer is shown.`
                : 'Children do not see a leaderboard.'}
            </p>
            {board.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No points yet. They come in as the children answer.</p>
            ) : (
              <ol className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
                {board.map((row) => (
                  <li key={row.studentId} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2 text-slate-800">
                      <span
                        className={cn(
                          'grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold',
                          row.place === 1 ? 'bg-amber-400 text-amber-950' : row.place === 2 ? 'bg-slate-300 text-slate-800' : row.place === 3 ? 'bg-orange-300 text-orange-950' : 'bg-slate-100 text-slate-600',
                        )}
                      >
                        {row.place}
                      </span>
                      <span className="truncate">{nameOf(row.studentId)}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                      {row.points} <span className="text-xs font-normal text-slate-500">({row.right}/{row.answered})</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>

      {(tab === 'now' || tab === 'plan') && (tab === 'now' && current && needsAnswer ? (
        <div className="flex shrink-0 gap-2 border-t border-slate-200 bg-white p-3">
          {open && (
            <button type="button" disabled={busy} onClick={() => void run(closeLiveQuestion(current.id))} className={cn(secondaryButton, 'inline-flex min-h-11 items-center gap-1.5')}>
              <Stop size={16} aria-hidden="true" />
              Stop answers
            </button>
          )}
          {!current.revealedAt && (
            <button type="button" disabled={busy} onClick={() => void run(revealLiveQuestion(current.id))} className={cn(primaryButton, 'inline-flex min-h-11 flex-1 items-center justify-center gap-1.5')}>
              <Eye size={16} aria-hidden="true" />
              Show the answer
            </button>
          )}
        </div>
      ) : (
        popNextButton && (
          <div className="flex shrink-0 flex-col gap-2 border-t border-slate-200 bg-white p-3">
            {timeSelect('w-full')}
            {popNextButton}
          </div>
        )
      ))}
    </div>
  )
}

function AnswerRow({
  answer,
  question,
  name,
  busy,
  onMark,
}: {
  answer: LiveAnswer
  question: LiveQuestion
  name: string
  busy: boolean
  onMark: (correct: boolean, feedback: string | null) => void
}) {
  const text = answerText(answer, question)
  const isLink = question.kind === 'link' && /^https?:\/\//i.test(answer.text ?? '')
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-800">
          {name}
          <span className="ml-2 text-xs font-normal text-slate-500">
            {answer.secondsTaken}s{answer.answeredBy === 'parent' ? ' · parent\'s login' : ''}
          </span>
        </div>
        {isLink ? (
          <a href={answer.text ?? '#'} target="_blank" rel="noreferrer" className="break-all text-sm text-[#be185d] underline">
            {answer.text}
          </a>
        ) : (
          text && <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{text}</p>
        )}
        {answer.filePath && <AnswerPicture path={answer.filePath} name={name} />}
        {answer.result === 'pending' && answer.aiSuggestion && (
          <p className="mt-1 flex items-start gap-1 text-xs text-slate-600">
            <Robot size={14} className="mt-0.5 shrink-0 text-violet-500" aria-hidden="true" />
            <span>
              AI thinks <strong>{answer.aiSuggestion === 'unsure' ? 'it is unclear' : answer.aiSuggestion}</strong>
              {answer.aiNote ? ` — ${answer.aiNote}` : ''}
            </span>
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {answer.result === 'pending' ? (
          <>
            {answer.aiSuggestion && answer.aiSuggestion !== 'unsure' && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onMark(answer.aiSuggestion === 'right', answer.aiFeedback)}
                className="min-h-9 rounded-xl border border-violet-200 bg-violet-50 px-2.5 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
              >
                Accept AI
              </button>
            )}
            <MarkButtons busy={busy} onMark={(correct) => onMark(correct, null)} />
          </>
        ) : (
          <>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-semibold',
                answer.result === 'correct' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800',
              )}
            >
              {answer.result === 'correct' ? `Right +${answer.points}` : 'Wrong'}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => onMark(answer.result !== 'correct', null)}
              className="text-xs font-semibold text-slate-500 underline underline-offset-2 disabled:opacity-50"
            >
              Change
            </button>
          </>
        )}
      </div>
    </li>
  )
}

function MarkButtons({ busy, onMark }: { busy: boolean; onMark: (correct: boolean) => void }) {
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => onMark(true)}
        aria-label="Mark right"
        className="grid h-9 w-9 place-items-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
      >
        <Check size={16} weight="bold" aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onMark(false)}
        aria-label="Mark wrong"
        className="grid h-9 w-9 place-items-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
      >
        <X size={16} weight="bold" aria-hidden="true" />
      </button>
    </>
  )
}

function AnswerPicture({ path, name }: { path: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void liveAnswerFileUrl(path).then((next) => !cancelled && setUrl(next))
    return () => {
      cancelled = true
    }
  }, [path])
  if (!url) return <p className="text-xs text-slate-400">Loading the picture…</p>
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-1 block">
      <img src={url} alt={`${name}'s work`} className="max-h-48 rounded-lg border border-slate-200 object-contain" />
    </a>
  )
}
