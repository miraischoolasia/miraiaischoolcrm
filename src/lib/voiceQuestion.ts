import { supabase } from './supabase'
import type { QuestionDraft } from './questions'

// The teacher speaks a question; the voice-question function sends back a
// draft for the question form (the teacher checks and saves it).

export type VoiceDraft = Pick<QuestionDraft, 'kind' | 'prompt' | 'options' | 'acceptedAnswers' | 'timeLimitSeconds' | 'explanation'> & {
  heard: string
}

export const MAX_RECORDING_MS = 60_000

export const canRecordVoice = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

export type VoiceRecording = { stop: () => Promise<Blob>; cancel: () => void }

// Records from the microphone, stopping by itself after a minute.
export async function startVoiceRecording(onAutoStop?: () => void): Promise<VoiceRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((candidate) => MediaRecorder.isTypeSupported(candidate))
  const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
  const chunks: Blob[] = []
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data)
  }
  const release = () => stream.getTracks().forEach((track) => track.stop())
  let timer: ReturnType<typeof setTimeout> | null = null
  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      if (timer) clearTimeout(timer)
      release()
      resolve(new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' }))
    }
  })
  recorder.start()
  timer = setTimeout(() => {
    if (recorder.state !== 'inactive') {
      recorder.stop()
      onAutoStop?.()
    }
  }, MAX_RECORDING_MS)
  return {
    stop: async () => {
      if (recorder.state !== 'inactive') recorder.stop()
      return done
    },
    cancel: () => {
      if (timer) clearTimeout(timer)
      recorder.onstop = null
      if (recorder.state !== 'inactive') recorder.stop()
      release()
    },
  }
}

async function toBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

export async function draftFromVoice(recording: Blob, ageGroup: string | null): Promise<{ draft: VoiceDraft | null; error: string | null }> {
  if (!supabase) return { draft: null, error: 'Supabase is not configured.' }
  if (recording.size === 0) return { draft: null, error: 'Nothing was recorded. Check the microphone.' }
  const { data, error } = await supabase.functions.invoke('voice-question', {
    body: { mime: recording.type || 'audio/webm', audio: await toBase64(recording), ageGroup },
  })
  if (error) {
    let reason = error.message || 'Could not turn that into a question.'
    try {
      const body = await (error as { context?: Response }).context?.json()
      if (body?.error) reason = String(body.error)
    } catch {
      // keep the plain message
    }
    return { draft: null, error: reason }
  }
  return { draft: (data?.draft as VoiceDraft | undefined) ?? null, error: data?.draft ? null : 'Could not turn that into a question.' }
}
