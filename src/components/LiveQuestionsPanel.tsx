import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Lightning, MagnifyingGlass, Robot, X } from '@phosphor-icons/react'
import { ModalShell } from './ModalShell'
import { LessonZoomCard } from './LessonZoomCard'
import { cn } from '../lib/cn'
import { fetchQuestions, fitsClassroom, questionKindLabels, type Question } from '../lib/questions'
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

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

// The teacher runs a lesson's questions from here: pop one from the bank, see
// the answers come in, show the right answer, mark what waits for them (with
// the AI's suggestion), and the lesson's points.
export function LiveQuestionsPanel({
  scheduleId,
  lessonDate,
  title,
  classroom,
  studentNames,
  rosterCount,
  onClose,
}: {
  scheduleId: number
  lessonDate: string
  title: string
  classroom: { subjectId?: number | null; ageGroup: AgeGroup } | null
  studentNames: Map<number, string>
  rosterCount: number
  onClose: () => void
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
  const aiAsked = useRef(new Set<number>())

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

  const nameOf = (studentId: number) => studentNames.get(studentId) ?? `Student ${studentId}`

  return (
    <ModalShell placement="right" onClose={onClose}>
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Lightning size={18} weight="fill" className="text-[#fc0c97]" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-slate-900">Live questions</h2>
          </div>
          <p className="truncate text-sm text-slate-500">
            {title} · {lessonDate}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {!sessionId && !error && <p className="text-sm text-slate-500">Opening the lesson…</p>}

        {sessionId && <LessonZoomCard scheduleId={scheduleId} lessonDate={lessonDate} rosterCount={rosterCount} />}

        {current && (
          <section aria-label="Question now" className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
                Question {current.number} · {questionKindLabels[current.kind]} · {current.points} pts
                {current.scoring === 'speed' ? ' (faster = more)' : ''}
              </div>
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  open ? 'bg-emerald-100 text-emerald-800' : current.revealedAt ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-600',
                )}
              >
                {open ? `${clock(secondsLeft(current, now))} left` : current.revealedAt ? 'Answer shown' : 'Closed'}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-base font-semibold text-slate-900">{current.prompt}</p>
            {current.kind === 'choice' && (
              <ol className="mt-2 space-y-1 text-sm">
                {current.options.map((option, index) => (
                  <li
                    key={index}
                    className={cn(
                      'rounded-lg px-2 py-1',
                      currentKey?.correctOptions.includes(index) ? 'bg-emerald-50 font-semibold text-emerald-800' : 'text-slate-700',
                    )}
                  >
                    {choiceLetter(index)}. {option}
                    {currentKey?.correctOptions.includes(index) ? ' ✓' : ''}
                  </li>
                ))}
              </ol>
            )}
            {(current.kind === 'fill' || current.kind === 'short') && currentKey && currentKey.acceptedAnswers.length > 0 && (
              <p className="mt-2 text-sm text-slate-600">Accepted: {currentKey.acceptedAnswers.join(' · ')}</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600">
                {currentAnswers.length} of {rosterCount} answered
              </span>
              <span className="flex-1" />
              {open && (
                <button type="button" disabled={busy} onClick={() => void run(closeLiveQuestion(current.id))} className={secondaryButton}>
                  Stop answers
                </button>
              )}
              {!current.revealedAt && (
                <button type="button" disabled={busy} onClick={() => void run(revealLiveQuestion(current.id))} className={primaryButton}>
                  Show the answer
                </button>
              )}
            </div>
            {aiMessage && <p className="mt-2 text-xs text-amber-700">{aiMessage}</p>}

            {currentAnswers.length > 0 && (
              <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
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
            )}
          </section>
        )}

        <section aria-label="Pop a question" className="rounded-2xl border border-slate-200 p-4">
          <h3 className="text-base font-semibold text-slate-900">Pop a question</h3>
          <p className="text-sm text-slate-500">It shows at once in the student app; popping another one closes this one.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="relative min-w-[180px] flex-1">
              <MagnifyingGlass size={16} className="absolute left-2.5 top-2.5 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search questions"
                aria-label="Search questions"
                className="w-full rounded-xl border border-slate-200 py-1.5 pl-8 pr-3 text-sm"
              />
            </label>
            <select
              value={timeLimit}
              onChange={(event) => setTimeLimit(Number(event.target.value))}
              aria-label="Time to answer"
              className="rounded-xl border border-slate-200 px-2 py-1.5 text-sm"
            >
              {timeChoices.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
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
            <ul className="mt-3 max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-100">
              {bankList.map((question) => (
                <li key={question.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800">{question.prompt}</div>
                    <div className="text-xs text-slate-500">
                      {questionKindLabels[question.kind]} · {question.points} pts · {question.timeLimitSeconds}s
                      {question.topic ? ` · ${question.topic}` : ''}
                    </div>
                  </div>
                  <button type="button" disabled={busy || !sessionId} onClick={() => void pop(question.id)} className={primaryButton}>
                    Pop
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {questions.length > 0 && (
          <section aria-label="This lesson" className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 p-4">
              <h3 className="text-base font-semibold text-slate-900">This lesson</h3>
              <ul className="mt-2 space-y-1">
                {[...questions].reverse().map((question) => {
                  const count = answers.filter((answer) => answer.liveQuestionId === question.id)
                  const right = count.filter((answer) => answer.result === 'correct').length
                  const waiting = count.filter((answer) => answer.result === 'pending').length
                  return (
                    <li key={question.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(question.id)}
                        className={cn(
                          'w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-slate-50',
                          current?.id === question.id && 'bg-[#fff0f8]',
                        )}
                      >
                        <span className="font-semibold text-slate-800">Q{question.number}.</span>{' '}
                        <span className="text-slate-700">{question.prompt.slice(0, 60)}</span>
                        <span className="block text-xs text-slate-500">
                          {count.length} answered · {right} right{waiting > 0 ? ` · ${waiting} to mark` : ''}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 p-4">
              <h3 className="text-base font-semibold text-slate-900">Points this lesson</h3>
              <p className="text-xs text-slate-500">
                {settings && settings.leaderboardTop > 0
                  ? `Children see the top ${settings.leaderboardTop} after each answer is shown.`
                  : 'Children do not see a leaderboard.'}
              </p>
              <ol className="mt-2 space-y-1 text-sm">
                {board.map((row) => (
                  <li key={row.studentId} className="flex justify-between gap-2">
                    <span className="truncate text-slate-800">
                      {row.place}. {nameOf(row.studentId)}
                    </span>
                    <span className="shrink-0 font-semibold text-slate-900">
                      {row.points} <span className="text-xs font-normal text-slate-500">({row.right}/{row.answered})</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}
      </div>
    </ModalShell>
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
                className="rounded-xl border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-100 disabled:opacity-50"
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
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
      >
        <Check size={14} weight="bold" aria-hidden="true" />
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onMark(false)}
        aria-label="Mark wrong"
        className="rounded-xl border border-rose-200 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100 disabled:opacity-50"
      >
        <X size={14} weight="bold" aria-hidden="true" />
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
