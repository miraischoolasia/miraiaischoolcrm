import { useCallback, useEffect, useRef, useState } from 'react'

export type VoiceState = 'idle' | 'recording' | 'ready'

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') {
    return undefined
  }
  return ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((type) =>
    MediaRecorder.isTypeSupported(type),
  )
}

// The WhatsApp bridge decides audio vs video from the file name, and ".webm" counts as video.
// Chrome's opus recording is converted to a WhatsApp voice note on the server, so name it ".ogg".
function extensionFor(mimeType: string) {
  if (mimeType.includes('mp4')) {
    return 'm4a'
  }
  return 'ogg'
}

// Records a voice message in the browser. The recording waits in "ready" so the
// sender can listen to it before it goes out.
export function useVoiceRecorder() {
  const [state, setState] = useState<VoiceState>('idle')
  const [seconds, setSeconds] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // How loud the last moments were, 0 to 1, for the moving bars while recording.
  const [levels, setLevels] = useState<number[]>([])
  const levelTimerRef = useRef<number | null>(null)
  const meterContextRef = useRef<AudioContext | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const urlRef = useRef<string | null>(null)

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stopMeter = useCallback(() => {
    if (levelTimerRef.current !== null) {
      window.clearInterval(levelTimerRef.current)
      levelTimerRef.current = null
    }
    void meterContextRef.current?.close()
    meterContextRef.current = null
  }, [])

  const releaseStream = useCallback(() => {
    stopMeter()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [stopMeter])

  const startMeter = useCallback((stream: MediaStream) => {
    try {
      const AudioContextClass =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextClass) {
        return
      }
      const context = new AudioContextClass()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      context.createMediaStreamSource(stream).connect(analyser)
      const samples = new Uint8Array(analyser.fftSize)
      meterContextRef.current = context
      levelTimerRef.current = window.setInterval(() => {
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (const value of samples) {
          const centred = (value - 128) / 128
          sum += centred * centred
        }
        const loudness = Math.min(1, Math.sqrt(sum / samples.length) * 4)
        setLevels((current) => [...current.slice(-39), loudness])
      }, 100)
    } catch {
      // No live bars if the browser won't give us the sound; recording still works.
    }
  }, [])

  const reset = useCallback(() => {
    stopTimer()
    releaseStream()
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }
    chunksRef.current = []
    recorderRef.current = null
    setFile(null)
    setPreviewUrl(null)
    setSeconds(0)
    setLevels([])
    setState('idle')
  }, [releaseStream, stopTimer])

  const start = useCallback(async () => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError("This browser can't record voice messages.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = pickMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      streamRef.current = stream
      recorderRef.current = recorder
      chunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data)
        }
      }
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        const recorded = new File([blob], `voice-${Date.now()}.${extensionFor(type)}`, { type })
        urlRef.current = URL.createObjectURL(blob)
        setFile(recorded)
        setPreviewUrl(urlRef.current)
        setState('ready')
        releaseStream()
      }
      recorder.start()
      setSeconds(0)
      setLevels([])
      startMeter(stream)
      setState('recording')
      timerRef.current = window.setInterval(() => setSeconds((current) => current + 1), 1000)
    } catch {
      setError('Allow the microphone in your browser to record a voice message.')
      releaseStream()
    }
  }, [releaseStream, startMeter])

  const stop = useCallback(() => {
    stopTimer()
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }, [stopTimer])

  useEffect(() => reset, [reset])

  return { state, seconds, levels, file, previewUrl, error, start, stop, discard: reset }
}
