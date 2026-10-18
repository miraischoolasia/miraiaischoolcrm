import { useEffect, useRef, useState } from 'react'
import { Camera, Microphone, PaperPlaneRight, Robot, Stop } from '@phosphor-icons/react'
import { cn } from '../../lib/cn'
import {
  askAssistant,
  deleteLessonNote,
  fetchLessonNotes,
  readPhoto,
  saveLessonNote,
  type AiQuestion,
  type AssistantAction,
  type LessonNote,
} from '../../lib/classAssistant'
import { canRecordVoice, startVoiceRecording, type VoiceRecording } from '../../lib/voiceQuestion'
import type { RewardPreset } from '../../lib/rewards'

type Card = { key: string; action: AssistantAction; status: 'waiting' | 'working' | 'done' | 'skipped'; message: string | null }
type QuestionCard = { key: string; question: AiQuestion; status: 'waiting' | 'working' | 'done' | 'skipped'; message: string | null }

// What the console can do when the teacher confirms a suggestion.
export type AssistantRunner = {
  run: (action: AssistantAction) => Promise<string | null>
  // A question from a photo: into the bank (and the lesson plan), or popped now.
  addQuestion: (question: AiQuestion, popNow: boolean) => Promise<string | null>
}

// The console's AI assistant: say or type what to do (give points, pop a
// question, timer, pick, teams, star, a note, remind parents), or send a
// photo to make lesson notes and questions. Every suggestion waits for the
// teacher's Confirm.
export function AssistantPanel({
  sessionId,
  roster,
  presets,
  bank,
  ageGroup,
  runner,
}: {
  sessionId: number | null
  roster: { id: number; name: string }[]
  presets: RewardPreset[]
  bank: { id: number; prompt: string }[]
  ageGroup: string | null
  runner: AssistantRunner
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reply, setReply] = useState<string | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [recording, setRecording] = useState<VoiceRecording | null>(null)
  const [want, setWant] = useState<'notes' | 'questions' | 'both'>('both')
  const [note, setNote] = useState<{ title: string; body: string } | null>(null)
  const [questions, setQuestions] = useState<QuestionCard[]>([])
  const [notes, setNotes] = useState<LessonNote[]>([])
  const photoInput = useRef<HTMLInputElement>(null)
  const names = new Map(roster.map((person) => [person.id, person.name]))
  const presetById = new Map(presets.map((preset) => [preset.id, preset]))
  const bankById = new Map(bank.map((question) => [question.id, question.prompt]))

  useEffect(() => {
    if (sessionId) void fetchLessonNotes(sessionId).then(setNotes)
  }, [sessionId])

  useEffect(() => () => recording?.cancel(), [recording])

  const context = {
    roster,
    presets: presets.filter((preset) => preset.isActive).map((preset) => ({ id: preset.id, label: preset.label, points: preset.points })),
    bank,
  }

  async function ask(input: { text?: string; audio?: Blob }) {
    setBusy('Thinking…')
    setError(null)
    const result = await askAssistant(input, context, ageGroup)
    setBusy(null)
    if (result.error || !result.data) {
      setError(result.error)
      return
    }
    setReply(result.data.reply || null)
    setCards(result.data.actions.map((action, index) => ({ key: `${Date.now()}-${index}`, action, status: 'waiting', message: null })))
    if (result.data.actions.length === 0 && !result.data.reply) setReply('Nothing to do there. Try saying it another way.')
  }

  async function toggleMic() {
    if (recording) {
      setRecording(null)
      const blob = await recording.stop()
      await ask({ audio: blob })
      return
    }
    setError(null)
    try {
      const started = await startVoiceRecording(() => setRecording(null))
      setRecording(started)
    } catch {
      setError('The microphone is blocked. Allow it in the browser and try again.')
    }
  }

  async function sendPhoto(file: File) {
    setBusy('Reading the photo…')
    setError(null)
    const result = await readPhoto(file, want, ageGroup, text.trim() || null)
    setBusy(null)
    if (result.error || !result.data) {
      setError(result.error)
      return
    }
    setNote(result.data.notes)
    setQuestions(result.data.questions.map((question, index) => ({ key: `${Date.now()}-${index}`, question, status: 'waiting', message: null })))
    if (!result.data.notes && result.data.questions.length === 0) setError('Nothing could be made from that photo.')
  }

  async function confirm(card: Card) {
    setCards((list) => list.map((entry) => (entry.key === card.key ? { ...entry, status: 'working' } : entry)))
    const problem = await runner.run(card.action)
    setCards((list) => list.map((entry) => (entry.key === card.key ? { ...entry, status: problem ? 'waiting' : 'done', message: problem ?? 'Done' } : entry)))
  }

  async function confirmQuestion(card: QuestionCard, popNow: boolean) {
    setQuestions((list) => list.map((entry) => (entry.key === card.key ? { ...entry, status: 'working' } : entry)))
    const problem = await runner.addQuestion(card.question, popNow)
    setQuestions((list) =>
      list.map((entry) => (entry.key === card.key ? { ...entry, status: problem ? 'waiting' : 'done', message: problem ?? (popNow ? 'Popped' : 'Added to the bank and the plan') } : entry)),
    )
  }

  async function keepNote(publish: boolean) {
    if (!note || !sessionId) return
    setBusy('Saving…')
    const problem = await saveLessonNote({ id: null, sessionId, title: note.title, body: note.body, publish })
    setBusy(null)
    setError(problem)
    if (!problem) {
      setNote(null)
      setNotes(await fetchLessonNotes(sessionId))
    }
  }

  async function setPublished(entry: LessonNote, publish: boolean) {
    if (!sessionId) return
    const problem = await saveLessonNote({ id: entry.id, sessionId, title: entry.title, body: entry.body, publish })
    setError(problem)
    setNotes(await fetchLessonNotes(sessionId))
  }

  async function removeNote(entry: LessonNote) {
    if (!sessionId || !window.confirm(`Delete the note "${entry.title}"?`)) return
    setError(await deleteLessonNote(entry.id))
    setNotes(await fetchLessonNotes(sessionId))
  }

  function describe(action: AssistantAction) {
    const who = (ids: number[]) => ids.map((id) => names.get(id) ?? `#${id}`).join(', ')
    switch (action.type) {
      case 'give_points': {
        const preset = action.presetId !== null ? presetById.get(action.presetId) : null
        return `Give ${preset ? `${preset.emoji ?? '⭐'} ${preset.label} +${preset.points}` : `+${action.points} (${action.reason})`} to ${who(action.studentIds)}`
      }
      case 'pop_question':
        return `Pop: ${bankById.get(action.questionId) ?? `question #${action.questionId}`}`
      case 'pop_next':
        return 'Pop the next planned question'
      case 'new_question':
        return `${action.popNow ? 'Make and pop' : 'Make'} a question: ${action.question.prompt}`
      case 'start_timer':
        return `Start a ${action.minutes} minute timer`
      case 'random_pick':
        return 'Pick a child at random'
      case 'make_teams':
        return `Split the class into ${action.count} teams`
      case 'star':
        return `Star of the day: ${names.get(action.studentId) ?? ''}`
      case 'note':
        return `Note for ${names.get(action.studentId) ?? ''}: ${action.text}`
      case 'remind':
        return `Remind the parents of ${who(action.studentIds)}`
    }
  }

  return (
    <section aria-label="AI assistant" className="rounded-2xl border border-violet-200 bg-violet-50/40 p-3">
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
        <Robot size={16} className="text-violet-600" aria-hidden="true" />
        AI assistant
      </h4>
      <p className="text-xs text-slate-500">Say or type what to do, e.g. “Give Ali and Mei +5 great answer”, “3 minute timer”, “Make 4 teams”. Or send a photo.</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {canRecordVoice() && (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void toggleMic()}
            aria-label={recording ? 'Stop and send' : 'Speak'}
            className={cn('flex h-9 w-9 items-center justify-center rounded-full text-white disabled:opacity-50', recording ? 'animate-pulse bg-rose-600' : 'bg-violet-600 hover:bg-violet-700')}
          >
            {recording ? <Stop size={16} weight="fill" aria-hidden="true" /> : <Microphone size={16} aria-hidden="true" />}
          </button>
        )}
        <input
          type="text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && text.trim() && busy === null) {
              void ask({ text: text.trim() })
              setText('')
            }
          }}
          placeholder={recording ? 'Listening… tap the red button when done' : 'Type what to do (or a hint for the photo)'}
          aria-label="What to do"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm"
        />
        <button
          type="button"
          aria-label="Send"
          disabled={!text.trim() || busy !== null}
          onClick={() => {
            void ask({ text: text.trim() })
            setText('')
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-800 text-white disabled:opacity-40"
        >
          <PaperPlaneRight size={16} aria-hidden="true" />
        </button>
        <select value={want} onChange={(event) => setWant(event.target.value as typeof want)} aria-label="From the photo make" className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs">
          <option value="both">Photo → notes + questions</option>
          <option value="notes">Photo → notes</option>
          <option value="questions">Photo → questions</option>
        </select>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => photoInput.current?.click()}
          aria-label="Send a photo"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Camera size={16} aria-hidden="true" />
        </button>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void sendPhoto(file)
          }}
        />
      </div>

      {busy && <p className="mt-2 text-xs font-semibold text-violet-700" aria-live="polite">{busy}</p>}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {reply && <p className="mt-2 text-sm text-slate-700">🤖 {reply}</p>}

      {cards.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {cards.map((card) => (
            <li key={card.key} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 text-sm', card.status === 'done' ? 'border-emerald-200' : card.status === 'skipped' ? 'border-slate-200 opacity-60' : 'border-violet-200')}>
              <span className="min-w-0 flex-1 text-slate-800">{describe(card.action)}</span>
              {card.status === 'waiting' || card.status === 'working' ? (
                <span className="flex gap-1.5">
                  <button type="button" disabled={card.status === 'working'} onClick={() => void confirm(card)} className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
                    {card.status === 'working' ? '…' : 'Confirm'}
                  </button>
                  <button type="button" onClick={() => setCards((list) => list.map((entry) => (entry.key === card.key ? { ...entry, status: 'skipped' } : entry)))} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">
                    Skip
                  </button>
                </span>
              ) : (
                <span className="text-xs font-semibold text-emerald-700">{card.status === 'done' ? '✓ Done' : 'Skipped'}</span>
              )}
              {card.message && card.status === 'waiting' && <span className="w-full text-xs text-red-700">{card.message}</span>}
            </li>
          ))}
        </ul>
      )}

      {note && (
        <div className="mt-3 space-y-1.5 rounded-xl border border-sky-200 bg-white p-3">
          <p className="text-xs font-semibold text-sky-800">Lesson notes from the photo (check before they go to the app)</p>
          <input value={note.title} maxLength={120} onChange={(event) => setNote({ ...note, title: event.target.value })} aria-label="Note title" className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm font-semibold" />
          <textarea value={note.body} rows={6} maxLength={8000} onChange={(event) => setNote({ ...note, body: event.target.value })} aria-label="Note text" className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" />
          <div className="flex flex-wrap justify-end gap-1.5">
            <button type="button" onClick={() => setNote(null)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">
              Discard
            </button>
            <button type="button" disabled={!sessionId} onClick={() => void keepNote(false)} className="rounded-lg border border-sky-300 px-2.5 py-1 text-xs font-semibold text-sky-800">
              Save for later
            </button>
            <button type="button" disabled={!sessionId} onClick={() => void keepNote(true)} className="rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-700">
              Publish to the app
            </button>
          </div>
        </div>
      )}

      {questions.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {questions.map((card) => {
            const needsRight = card.question.kind === 'choice' && !card.question.options.some((option) => option.correct)
            return (
              <li key={card.key} className={cn('rounded-xl border bg-white px-3 py-2 text-sm', card.status === 'done' ? 'border-emerald-200' : 'border-violet-200')}>
                <p className="font-semibold text-slate-800">{card.question.prompt}</p>
                {card.question.kind === 'choice' && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {card.question.options.map((option, index) => (
                      <button
                        key={index}
                        type="button"
                        disabled={card.status !== 'waiting'}
                        onClick={() =>
                          setQuestions((list) =>
                            list.map((entry) =>
                              entry.key === card.key
                                ? { ...entry, question: { ...entry.question, options: entry.question.options.map((item, place) => ({ ...item, correct: place === index })) } }
                                : entry,
                            ),
                          )
                        }
                        className={cn('rounded-full border px-2 py-0.5 text-xs', option.correct ? 'border-emerald-400 bg-emerald-50 font-semibold text-emerald-800' : 'border-slate-200 text-slate-600')}
                      >
                        {option.correct ? '✓ ' : ''}
                        {option.text}
                      </button>
                    ))}
                  </div>
                )}
                {card.question.kind !== 'choice' && card.question.acceptedAnswers.length > 0 && (
                  <p className="text-xs text-slate-500">Answer: {card.question.acceptedAnswers.map((answer) => answer.text).join(' / ')}</p>
                )}
                {needsRight && card.status === 'waiting' && <p className="text-xs text-amber-700">Tap the right option first.</p>}
                <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1.5">
                  {card.message && <span className="mr-auto text-xs text-slate-600">{card.message}</span>}
                  {card.status === 'waiting' && (
                    <>
                      <button type="button" onClick={() => setQuestions((list) => list.filter((entry) => entry.key !== card.key))} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        Skip
                      </button>
                      <button type="button" disabled={needsRight} onClick={() => void confirmQuestion(card, false)} className="rounded-lg border border-violet-300 px-2.5 py-1 text-xs font-semibold text-violet-800 disabled:opacity-40">
                        Add to bank + plan
                      </button>
                      <button type="button" disabled={needsRight} onClick={() => void confirmQuestion(card, true)} className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-40">
                        Pop now
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {notes.length > 0 && (
        <div className="mt-3 border-t border-violet-100 pt-2">
          <p className="text-xs font-semibold text-slate-600">This lesson's notes</p>
          <ul className="mt-1 space-y-1">
            {notes.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-slate-800">
                  {entry.title}
                  <span className={cn('ml-2 rounded-full px-1.5 text-[11px] font-semibold', entry.publishedAt ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600')}>
                    {entry.publishedAt ? 'In the app' : 'Draft'}
                  </span>
                </span>
                <span className="flex gap-2 text-xs font-semibold">
                  <button type="button" onClick={() => void setPublished(entry, !entry.publishedAt)} className="text-sky-700 underline underline-offset-2">
                    {entry.publishedAt ? 'Hide from app' : 'Publish'}
                  </button>
                  <button type="button" onClick={() => void removeNote(entry)} className="text-slate-500 underline underline-offset-2">
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
