import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChartBar,
  CheckCircle,
  Circle,
  ClockCountdown,
  HeartStraight,
  ListChecks,
  PaperPlaneTilt,
  Printer,
  Star,
  UploadSimple,
  UsersThree,
  VideoCamera,
  X,
} from '@phosphor-icons/react'
import { cn } from '../lib/cn'
import {
  careList,
  careReasonText,
  fetchLessonRecords,
  hardestQuestion,
  lessonSummary,
  lessonTotals,
  minutesBetween,
  participationCurve,
  participationTone,
  questionDiagnosis,
  sendCareNotes,
  type CareEntry,
  type LessonRecord,
  type QuestionDiagnosis,
} from '../lib/classEndReport'
import { fetchLessonLive, type LiveAnswer, type LiveQuestion } from '../lib/liveQuestions'
import { fetchLessonRecordings, recordingAction, recordingStatusLabels, type LessonRecording } from '../lib/recordings'

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-MY', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kuala_Lumpur' })

const toneColor = { red: '#e11d48', amber: '#f59e0b', teal: '#0d9488', none: '#cbd5e1' } as const

type Tab = 'class' | 'quiz' | 'care' | 'next'

// The lesson report the teacher sees right after End class (design A): one
// panel with four tabs. Class Report: the lesson in a sentence, four numbers,
// who was in Zoom over time and every child. Quiz Report: each question
// (right / answered) and its most chosen wrong answer. Care: who needs the
// teacher and why, sent on to their Handled by. Next Step: what to do now.
export function LessonReportModal({
  sessionId,
  title,
  questions: questionsAtOpen,
  answers: answersAtOpen,
  onClose,
}: {
  sessionId: number
  scheduleId?: number
  lessonDate?: string
  title: string
  questions: LiveQuestion[]
  answers: LiveAnswer[]
  onClose: () => void
}) {
  const [records, setRecords] = useState<LessonRecord[] | null>(null)
  const [live, setLive] = useState<{ questions: LiveQuestion[]; answers: LiveAnswer[]; keys: Map<number, number[]> }>({
    questions: questionsAtOpen,
    answers: answersAtOpen,
    keys: new Map(),
  })
  const [recordings, setRecordings] = useState<LessonRecording[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('class')

  const load = useCallback(async () => {
    try {
      const [nextRecords, nextLive] = await Promise.all([fetchLessonRecords(sessionId), fetchLessonLive(sessionId)])
      setRecords(nextRecords)
      setLive({
        questions: nextLive.questions,
        answers: nextLive.answers,
        keys: new Map([...nextLive.keys].map(([id, key]) => [id, key.correctOptions])),
      })
      setError(null)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'Could not read the lesson.')
    }
    fetchLessonRecordings(sessionId)
      .then(setRecordings)
      .catch(() => setRecordings([]))
  }, [sessionId])

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(first)
  }, [load])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const diagnosis = useMemo(() => questionDiagnosis(live.questions, live.answers, live.keys), [live])
  const totals = useMemo(() => (records ? lessonTotals(records, diagnosis) : null), [records, diagnosis])
  const hardest = useMemo(() => hardestQuestion(diagnosis), [diagnosis])
  const care = useMemo(() => (records ? careList(records) : []), [records])
  const curve = useMemo(() => (records ? participationCurve(records) : { points: [], drops: [] }), [records])
  const first = records?.[0] ?? null
  const top = useMemo(() => (records ? [...records].filter((record) => record.points > 0).sort((a, b) => b.points - a.points).slice(0, 3) : []), [records])

  return (
    <div role="dialog" aria-modal="true" aria-label="Lesson report" className="fixed inset-0 z-[60] flex flex-col bg-slate-100">
      <header className="flex items-center justify-between gap-3 bg-slate-950 px-4 py-3 text-white sm:px-6 print:bg-white print:text-slate-900">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">Lesson report · {title}</h2>
          {first && (
            <p className="truncate text-sm text-slate-300 print:text-slate-600">
              {new Date(first.lessonFrom).toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' })} ·{' '}
              {timeOf(first.lessonFrom)} – {timeOf(first.lessonTo)}
              {first.status !== 'ended' && ' · still running'}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/25 px-3 text-sm font-semibold hover:bg-white/10"
          >
            <Printer size={18} aria-hidden="true" /> <span className="max-sm:hidden">Print</span>
          </button>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/25 hover:bg-white/10">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1320px] space-y-4 px-3 py-4 sm:px-6">
          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </p>
          )}
          {!records || !totals ? (
            !error && <p className="py-10 text-center text-sm text-slate-500">Loading the lesson…</p>
          ) : (
            <>
              <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 print:hidden" aria-label="Report parts" role="tablist">
                {(
                  [
                    ['class', 'Class Report'],
                    ['quiz', 'Quiz Report'],
                    ['care', `Care${care.length ? ` (${care.length})` : ''}`],
                    ['next', 'Next Step'],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    onClick={() => setTab(key)}
                    aria-selected={tab === key}
                    className={cn('h-11 min-w-[7.5rem] flex-1 rounded-xl px-3 text-sm font-semibold whitespace-nowrap', tab === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50')}
                  >
                    {label}
                  </button>
                ))}
              </nav>

              {tab === 'class' && (
                <>
                  <Summary totals={totals} hardest={hardest} top={top} toMarkQuestion={diagnosis.find((question) => question.toMark > 0) ?? null} curve={curve} />
                  <Everyone records={records} />
                </>
              )}
              {tab === 'quiz' && <HowItWent diagnosis={diagnosis} />}
              {tab === 'care' && <NeedsYou sessionId={sessionId} care={care} />}
              {tab === 'next' && (
                <NextSteps
                  records={records}
                  diagnosis={diagnosis}
                  hardest={hardest}
                  careCount={care.length}
                  recordings={recordings}
                  ended={first?.status === 'ended'}
                  onRecordings={() => void fetchLessonRecordings(sessionId).then(setRecordings)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Card({ title, icon, badge, children }: { title: string; icon: React.ReactNode; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-slate-700" aria-hidden="true">
          {icon}
        </span>
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {badge && <span className="ml-auto">{badge}</span>}
      </div>
      {children}
    </section>
  )
}

function Summary({
  totals,
  hardest,
  top,
  toMarkQuestion,
  curve,
}: {
  totals: ReturnType<typeof lessonTotals>
  hardest: QuestionDiagnosis | null
  top: LessonRecord[]
  toMarkQuestion: QuestionDiagnosis | null
  curve: ReturnType<typeof participationCurve>
}) {
  const sentence = lessonSummary(totals, hardest)
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-lg font-semibold text-slate-900 sm:text-xl">
        {sentence.lead}
        {sentence.hard && <span className="text-rose-700">{sentence.hard}</span>}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={<VideoCamera size={18} />}
          value={`${totals.came}/${totals.roster}`}
          label="came to Zoom"
          note={[totals.absent && `${totals.absent} absent`, totals.late && `${totals.late} late`, totals.leftEarly && `${totals.leftEarly} left early`].filter(Boolean).join(' · ')}
          tone="text-emerald-700"
        />
        <Stat
          icon={<CheckCircle size={18} />}
          value={totals.rightPercent === null ? '—' : `${totals.rightPercent}%`}
          label="answers right"
          note={`${totals.marked} of ${totals.answers} marked`}
          tone="text-emerald-700"
        />
        <Stat
          icon={<Circle size={18} />}
          value={String(totals.toMark)}
          label="to mark"
          note={toMarkQuestion ? `Question ${toMarkQuestion.number}` : 'All marked'}
          tone={totals.toMark > 0 ? 'text-amber-700' : 'text-slate-700'}
        />
        <Stat
          icon={<Star size={18} />}
          value={String(totals.points)}
          label="points given"
          note={top.length > 0 ? `top: ${top[0].studentName} ${top[0].points}` : 'none yet'}
          tone="text-orange-800"
        />
      </div>
      <Curve curve={curve} roster={totals.roster} />
    </section>
  )
}

function Stat({ icon, value, label, note, tone }: { icon: React.ReactNode; value: string; label: string; note: string; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3">
      <p className={cn('text-3xl font-bold leading-none', tone)}>{value}</p>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-700">
        <span aria-hidden="true">{icon}</span>
        {label}
      </p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  )
}

// Children in Zoom every 5 minutes, with the moments most of them left.
function Curve({ curve, roster }: { curve: ReturnType<typeof participationCurve>; roster: number }) {
  if (curve.points.length < 2) return null
  const width = 600
  const height = 70
  const max = Math.max(roster, ...curve.points.map((point) => point.online), 1)
  const x = (index: number) => (index / (curve.points.length - 1)) * width
  const y = (online: number) => height - 6 - (online / max) * (height - 16)
  const path = curve.points.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point.online).toFixed(1)}`).join(' ')
  return (
    <figure className="mt-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-slate-800">In Zoom, every 5 minutes</span>
        <span className="text-xs text-slate-500">
          {curve.drops.length === 0
            ? 'Nobody left in a group'
            : curve.drops.map((drop) => `${timeOf(drop.at)} · ${drop.lost} left`).join('  ·  ')}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-1 h-[70px] w-full" preserveAspectRatio="none" role="img" aria-label="Children in Zoom over the lesson">
        <path d={`${path} L${width},${height} L0,${height} Z`} fill="#ccfbf1" />
        <path d={path} fill="none" stroke="#0d9488" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        {curve.drops.map((drop) => {
          const index = curve.points.findIndex((point) => point.at === drop.at)
          return <circle key={drop.at} cx={x(index)} cy={y(curve.points[index].online)} r="5" fill="#e11d48" stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        })}
      </svg>
      <div className="flex justify-between text-[11px] text-slate-500">
        <span>{timeOf(curve.points[0].at)}</span>
        <span>{timeOf(curve.points[curve.points.length - 1].at)}</span>
      </div>
    </figure>
  )
}

function HowItWent({ diagnosis }: { diagnosis: QuestionDiagnosis[] }) {
  return (
    <Card
      title="Quiz Report"
      icon={<ChartBar size={20} />}
      badge={<span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{diagnosis.length} questions</span>}
    >
      {diagnosis.length === 0 && <p className="text-sm text-slate-500">No questions in this lesson.</p>}
      <ol className="space-y-4">
        {diagnosis.map((question) => {
          const hard = question.rightPercent !== null && question.rightPercent < 60
          return (
            <li key={question.id} className="flex gap-3">
              <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold', hard ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700')}>
                {question.number}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-sm font-medium text-slate-900">{question.prompt}</p>
                  <span className={cn('shrink-0 text-base font-bold', hard ? 'text-rose-700' : 'text-slate-900')} title="Right / answered">
                    {question.right}/{question.answered}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {question.right} right of {question.answered} answered · avg {question.averageSeconds === null ? '—' : `${question.averageSeconds}s`}
                  {question.toMark > 0 && <span className="font-semibold text-amber-700"> · {question.toMark} to mark</span>}
                </p>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={cn('h-full rounded-full', hard ? 'bg-rose-500' : 'bg-emerald-600')} style={{ width: `${question.answered ? (question.right / question.answered) * 100 : 0}%` }} />
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  Most chosen wrong answer:{' '}
                  {question.commonWrong ? (
                    <span className="font-semibold text-rose-700">
                      {String.fromCharCode(65 + question.commonWrong.option)} “{question.commonWrong.label}” · {question.commonWrong.count}
                    </span>
                  ) : (
                    '—'
                  )}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

function Ring({ percent }: { percent: number | null }) {
  const tone = participationTone(percent)
  const radius = 16
  const length = 2 * Math.PI * radius
  return (
    <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center" title="Time in the lesson">
      <svg viewBox="0 0 40 40" className="h-11 w-11 -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="4" />
        <circle cx="20" cy="20" r={radius} fill="none" stroke={toneColor[tone]} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${((percent ?? 0) / 100) * length} ${length}`} />
      </svg>
      <span className="absolute text-[11px] font-bold text-slate-800">{percent === null ? '—' : `${percent}%`}</span>
    </span>
  )
}

function NeedsYou({ sessionId, care }: { sessionId: number; care: CareEntry[] }) {
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(care.map((entry) => entry.studentId)))
  const [notes, setNotes] = useState<Map<number, string>>(new Map())
  const [noteOpen, setNoteOpen] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function send() {
    const items = care
      .filter((entry) => chosen.has(entry.studentId))
      .map((entry) => ({
        studentId: entry.studentId,
        note: [notes.get(entry.studentId)?.trim(), entry.reasons.map((reason) => careReasonText(reason, timeOf)).join(', ')].filter(Boolean).join(' — '),
      }))
    if (items.length === 0) return
    setBusy(true)
    setResult(null)
    try {
      const sent = await sendCareNotes(sessionId, items)
      const names = care.filter((entry) => sent.noHandler.includes(entry.studentId)).map((entry) => entry.name)
      setResult(`Sent ${sent.sent} to their Handled by.${names.length ? ` No Handled by: ${names.join(', ')}.` : ''}`)
    } catch (problem) {
      setResult(problem instanceof Error ? problem.message : 'Could not send.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title="Care"
      icon={<HeartStraight size={20} />}
      badge={care.length > 0 && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">{care.length}</span>}
    >
      {care.length === 0 && <p className="text-sm text-slate-500">Everyone came, stayed and joined in.</p>}
      <ul className="divide-y divide-slate-100">
        {care.map((entry) => (
          <li key={entry.studentId} className="py-3">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-3 h-4 w-4 shrink-0 accent-[#fc0c97]"
                checked={chosen.has(entry.studentId)}
                aria-label={`Send ${entry.name} to their Handled by`}
                onChange={(event) =>
                  setChosen((current) => {
                    const next = new Set(current)
                    if (event.target.checked) next.add(entry.studentId)
                    else next.delete(entry.studentId)
                    return next
                  })
                }
              />
              <Ring percent={entry.percent} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {entry.code ? `${entry.code} · ` : ''}
                  {entry.name}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {entry.reasons.map((reason, index) => (
                    <span
                      key={index}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                        reason.kind === 'absent' || reason.kind === 'few_right'
                          ? 'border-rose-200 bg-rose-50 text-rose-800'
                          : reason.kind === 'silent'
                            ? 'border-violet-200 bg-violet-50 text-violet-800'
                            : 'border-amber-200 bg-amber-50 text-amber-800',
                      )}
                    >
                      {careReasonText(reason, timeOf)}
                    </span>
                  ))}
                </div>
                {noteOpen === entry.studentId && (
                  <textarea
                    value={notes.get(entry.studentId) ?? ''}
                    onChange={(event) => setNotes((current) => new Map(current).set(entry.studentId, event.target.value))}
                    rows={2}
                    maxLength={600}
                    placeholder="A note for the Handled by"
                    className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => setNoteOpen(noteOpen === entry.studentId ? null : entry.studentId)}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Note
              </button>
            </div>
          </li>
        ))}
      </ul>
      {care.length > 0 && (
        <div className="mt-3 space-y-2 print:hidden">
          <button
            type="button"
            disabled={busy || chosen.size === 0}
            onClick={() => void send()}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white disabled:opacity-40"
          >
            <PaperPlaneTilt size={18} aria-hidden="true" /> Send {chosen.size} to their Handled by
          </button>
          {result && (
            <p role="status" className="text-xs text-slate-600">
              {result}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

function NextSteps({
  records,
  diagnosis,
  hardest,
  careCount,
  recordings,
  ended,
  onRecordings,
}: {
  records: LessonRecord[]
  diagnosis: QuestionDiagnosis[]
  hardest: QuestionDiagnosis | null
  careCount: number
  recordings: LessonRecording[] | null
  ended: boolean
  onRecordings: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [uploadNote, setUploadNote] = useState<string | null>(null)
  const toMark = diagnosis.reduce((sum, question) => sum + question.toMark, 0)
  const attendanceSent = records.some((record) => record.attendanceStatus !== null)
  const waiting = (recordings ?? []).filter((recording) => recording.bunnyStatus === null || recording.bunnyStatus === 'failed')
  const recordingDone = (recordings ?? []).length > 0 && waiting.length === 0

  async function upload() {
    setUploading(true)
    setUploadNote(null)
    const problems: string[] = []
    for (const recording of waiting) {
      const problem = await recordingAction(recording.id, 'send')
      if (problem) problems.push(problem)
    }
    setUploading(false)
    setUploadNote(problems.length ? problems.join(' ') : 'Sent. The video shows in Class Videos once Bunny has made it.')
    onRecordings()
  }

  return (
    <Card title="Next Step" icon={<ListChecks size={20} />}>
      <ul className="space-y-2">
        <Step done={toMark === 0} title={toMark === 0 ? 'All answers marked' : `Mark ${toMark} answer${toMark === 1 ? '' : 's'}`} note="In the console's questions, or with AI marking" />
        <Step done={attendanceSent} title="Send the attendance" note={attendanceSent ? 'Sent' : 'Attendance on the console · the remarks go to the children'} />
        <Step
          done={recordingDone}
          title="Upload the recording"
          note={
            recordings === null
              ? 'Checking…'
              : recordings.length === 0
                ? ended
                  ? 'Zoom is still making the recording (often 10–30 min after class)'
                  : 'After the class ends'
                : recordings.map((recording) => recordingStatusLabels[recording.bunnyStatus ?? 'none']).join(', ')
          }
        >
          {waiting.length > 0 && (
            <button
              type="button"
              disabled={uploading}
              onClick={() => void upload()}
              className="mt-2 inline-flex h-10 items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white disabled:opacity-50 print:hidden"
            >
              <UploadSimple size={18} aria-hidden="true" /> {uploading ? 'Uploading…' : 'Upload recording'}
            </button>
          )}
          {uploadNote && <p className="mt-1 text-xs text-slate-600">{uploadNote}</p>}
        </Step>
        {careCount > 0 && <Step done={false} title={`Send ${careCount} child${careCount === 1 ? '' : 'ren'} to their Handled by`} note="Who needs you · the note goes to their bell" />}
        {hardest && hardest.rightPercent !== null && hardest.rightPercent < 60 && (
          <Step done={false} title={`Go over question ${hardest.number} next lesson`} note={`Only ${hardest.rightPercent}% right · “${hardest.prompt.slice(0, 60)}”`} />
        )}
      </ul>
    </Card>
  )
}

function Step({ done, title, note, children }: { done: boolean; title: string; note: string; children?: React.ReactNode }) {
  return (
    <li className={cn('rounded-xl border px-3 py-3', done ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200')}>
      <div className="flex gap-3">
        {done ? <CheckCircle size={22} weight="fill" className="shrink-0 text-emerald-600" aria-label="Done" /> : <Circle size={22} className="shrink-0 text-slate-300" aria-label="To do" />}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{note}</p>
          {children}
        </div>
      </div>
    </li>
  )
}

function Everyone({ records }: { records: LessonRecord[] }) {
  return (
    <Card title="Every child" icon={<UsersThree size={20} />} badge={<span className="text-xs text-slate-500">{records.length} children</span>}>
      <ul className="divide-y divide-slate-100">
        {records.map((record) => {
          const away = record.leftPeriods.filter((period) => period.kind !== 'late')
          return (
            <li key={record.studentId} className="flex flex-wrap items-center gap-3 py-2.5">
              <Ring percent={record.participationPercent} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {record.studentCode ? `${record.studentCode} · ` : ''}
                  {record.studentName}
                </p>
                <p className="text-xs text-slate-500">
                  {record.hasZoom ? `${record.zoomMinutes ?? 0} of ${record.lessonMinutes} min` : 'No Zoom'}
                  {(record.lateMinutes ?? 0) >= 1 && ` · late ${record.lateMinutes} min`}
                  {away.length > 0 && ` · out ${away.map((period) => `${timeOf(period.from)}–${timeOf(period.to)} (${minutesBetween(period.from, period.to)} min)`).join(', ')}`}
                </p>
              </div>
              <span className="flex items-center gap-1 text-xs text-slate-600">
                <ClockCountdown size={14} aria-hidden="true" />
                {record.correct}/{record.questionsTotal} right
              </span>
              <span className="w-16 text-right text-sm font-semibold text-slate-900">{record.points} pts</span>
              <span
                className={cn(
                  'w-20 rounded-full px-2 py-0.5 text-center text-xs font-semibold',
                  record.attendanceStatus === 'present'
                    ? 'bg-emerald-50 text-emerald-700'
                    : record.attendanceStatus === 'absent'
                      ? 'bg-rose-50 text-rose-700'
                      : record.attendanceStatus === 'leave'
                        ? 'bg-sky-50 text-sky-700'
                        : 'bg-slate-100 text-slate-500',
                )}
              >
                {record.attendanceStatus ?? 'not sent'}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
