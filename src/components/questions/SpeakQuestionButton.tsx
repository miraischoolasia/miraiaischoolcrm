import { useEffect, useRef, useState } from 'react'
import { Microphone, Stop } from '@phosphor-icons/react'
import { canRecordVoice, draftFromVoice, MAX_RECORDING_MS, startVoiceRecording, type VoiceDraft, type VoiceRecording } from '../../lib/voiceQuestion'

// "Speak the question": record up to a minute, and the form is filled in with
// a draft the teacher then checks (nothing is saved or sent by itself).
export function SpeakQuestionButton({ ageGroup, onDraft }: { ageGroup: string | null; onDraft: (draft: VoiceDraft) => void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'working'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [heard, setHeard] = useState<string | null>(null)
  const recording = useRef<VoiceRecording | null>(null)

  useEffect(() => () => recording.current?.cancel(), [])

  useEffect(() => {
    if (state !== 'recording') return
    const started = Date.now()
    const tick = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 500)
    return () => clearInterval(tick)
  }, [state])

  if (!canRecordVoice()) return null

  async function finish() {
    const current = recording.current
    recording.current = null
    if (!current) return
    setState('working')
    const blob = await current.stop()
    const result = await draftFromVoice(blob, ageGroup)
    setState('idle')
    setError(result.error)
    if (result.draft) {
      setHeard(result.draft.heard || null)
      onDraft(result.draft)
    }
  }

  async function start() {
    setError(null)
    setHeard(null)
    setSeconds(0)
    try {
      recording.current = await startVoiceRecording(() => void finish())
      setState('recording')
    } catch {
      setError('The microphone is blocked. Allow it in the browser and try again.')
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {state === 'recording' ? (
          <>
            <button
              type="button"
              onClick={() => void finish()}
              className="flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700"
            >
              <Stop size={16} weight="fill" aria-hidden="true" />
              Done
            </button>
            <span className="text-sm text-rose-700" aria-live="polite">
              Listening… {seconds}s / {MAX_RECORDING_MS / 1000}s
            </span>
            <button
              type="button"
              onClick={() => {
                recording.current?.cancel()
                recording.current = null
                setState('idle')
              }}
              className="text-xs font-semibold text-slate-500 underline underline-offset-2"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={state === 'working'}
            onClick={() => void start()}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Microphone size={16} aria-hidden="true" />
            {state === 'working' ? 'Writing the question…' : 'Speak the question'}
          </button>
        )}
      </div>
      {heard && <p className="text-xs text-slate-500">Heard: "{heard}". Check the question below before saving.</p>}
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
