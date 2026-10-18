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

// Browsers record WebM or MP4, which the AI may not read: the recording is
// turned into 16 kHz mono WAV (about 1.9 MB a minute). The recording itself
// comes back when the browser cannot decode it.
export async function toWav(recording: Blob): Promise<Blob> {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass || typeof OfflineAudioContext === 'undefined') return recording
    const context = new AudioContextClass()
    const decoded = await context.decodeAudioData(await recording.arrayBuffer())
    void context.close()
    const rate = 16000
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    const samples = (await offline.startRendering()).getChannelData(0)
    const buffer = new ArrayBuffer(44 + samples.length * 2)
    const view = new DataView(buffer)
    const text = (at: number, value: string) => [...value].forEach((char, index) => view.setUint8(at + index, char.charCodeAt(0)))
    text(0, 'RIFF')
    view.setUint32(4, 36 + samples.length * 2, true)
    text(8, 'WAVE')
    text(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, rate, true)
    view.setUint32(28, rate * 2, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    text(36, 'data')
    view.setUint32(40, samples.length * 2, true)
    samples.forEach((sample, index) => view.setInt16(44 + index * 2, Math.max(-1, Math.min(1, sample)) * 0x7fff, true))
    return new Blob([buffer], { type: 'audio/wav' })
  } catch {
    return recording
  }
}

export async function toBase64(blob: Blob) {
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
  const audio = await toWav(recording)
  const { data, error } = await supabase.functions.invoke('voice-question', {
    body: { mime: audio.type || 'audio/webm', audio: await toBase64(audio), ageGroup },
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
