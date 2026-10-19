import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'

import { formatDay } from '@/lib/format'
import { fetchLastZoomCheck, needsZoomCheck, recordZoomCheck, type ZoomCheck } from '@/lib/portal'
import { Body, Button, Card, colors, Heading, Muted } from '@/ui/kit'

// Before class, on the web: the class runs inside this page, so the check
// runs here too, in the same browser: the camera (the child sees themself),
// the microphone (a bar moves when they talk) and the way to Zoom (its player
// loads quickly, which also fails behind a VPN). The answer is saved like the
// phone check (student_zoom_checks), so the teacher's console shows it.
// Phones use ZoomCheckCard.tsx (Zoom's own test meeting in the Zoom app).

const ZOOM_PROBE = 'https://source.zoom.us/6.5.0/lib/vendor/react.min.js'

const tips = [
  'Allow the camera and the microphone for this page (tap the 🔒 or the camera sign next to the web address).',
  'Close other apps that use the camera (Zoom, Teams, WhatsApp calls).',
  'Turn off any VPN (for example Cloudflare WARP) during class.',
  'Use Chrome, Edge or Safari, on Wi-Fi or mobile data that is working well.',
]

type Net = 'checking' | 'good' | 'slow' | 'blocked'

function deviceProblem(error: unknown) {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError') return 'The camera or microphone is not allowed for this page.'
  if (name === 'NotFoundError') return 'No camera or microphone was found on this device.'
  if (name === 'NotReadableError') return 'Another app is using the camera or microphone.'
  return 'The camera or microphone could not start.'
}

export function ZoomCheckCard({ studentId, nextClassDate, today, color }: { studentId: number; nextClassDate: string | null; today: string; color: string }) {
  const [check, setCheck] = useState<ZoomCheck | null | undefined>(undefined)
  const [testing, setTesting] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [level, setLevel] = useState(0)
  const [net, setNet] = useState<Net>('checking')
  const [justChecked, setJustChecked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const video = useRef<HTMLVideoElement | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const stopMeter = useRef<(() => void) | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchLastZoomCheck(studentId).then((value) => !cancelled && setCheck(value))
    return () => {
      cancelled = true
    }
  }, [studentId])

  function stop() {
    stopMeter.current?.()
    stopMeter.current = null
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
  }
  useEffect(() => stop, [])

  async function save(ok: boolean) {
    stop()
    setTesting(false)
    const failure = await recordZoomCheck(studentId, ok, 'web')
    setError(failure)
    if (!failure) {
      setCheck({ ok, checkedAt: new Date().toISOString(), platform: 'web' })
      setJustChecked(true)
    }
  }

  async function start() {
    setProblem(null)
    setError(null)
    setJustChecked(false)
    setTesting(true)
    setNet('checking')
    // The way to Zoom: its player file, timed.
    const begun = performance.now()
    fetch(ZOOM_PROBE, { cache: 'no-store', mode: 'cors' })
      .then((answer) => setNet(answer.ok ? (performance.now() - begun < 2500 ? 'good' : 'slow') : 'blocked'))
      .catch(() => setNet('blocked'))
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      stream.current = media
      if (video.current) {
        video.current.srcObject = media
        void video.current.play().catch(() => undefined)
      }
      const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (AudioContextClass) {
        const audio = new AudioContextClass()
        const analyser = audio.createAnalyser()
        analyser.fftSize = 512
        audio.createMediaStreamSource(media).connect(analyser)
        const data = new Uint8Array(analyser.fftSize)
        const timer = setInterval(() => {
          analyser.getByteTimeDomainData(data)
          let peak = 0
          for (const value of data) peak = Math.max(peak, Math.abs(value - 128))
          setLevel(Math.min(1, peak / 64))
        }, 120)
        stopMeter.current = () => {
          clearInterval(timer)
          void audio.close()
        }
      }
    } catch (problem) {
      setProblem(deviceProblem(problem))
      await save(false)
    }
  }

  if (check === undefined) return null
  if (!needsZoomCheck(check, nextClassDate, today) && !justChecked && !testing) return null

  return (
    <Card style={{ borderColor: color, borderWidth: 1.5 }}>
      <Heading>Check your camera and microphone</Heading>
      {justChecked && check?.ok ? (
        <Body>All set for class. See you there! ✅</Body>
      ) : justChecked && check && !check.ok ? (
        <View style={{ gap: 4 }}>
          {problem && <Body style={{ color: colors.bad }}>{problem}</Body>}
          <Body>The teacher will know. These usually help:</Body>
          {tips.map((tip) => (
            <Body key={tip}>• {tip}</Body>
          ))}
          <Button label="Check again" variant="outline" color={color} onPress={() => void start()} />
        </View>
      ) : testing ? (
        <View style={{ gap: 8 }}>
          <video ref={video} muted playsInline autoPlay style={{ width: '100%', maxHeight: 220, borderRadius: 12, background: '#0f172a', objectFit: 'cover' }} />
          <Muted>Say something: the bar should move.</Muted>
          <View style={{ height: 10, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${Math.round(level * 100)}%`, backgroundColor: colors.good }} />
          </View>
          <Muted>
            {net === 'checking'
              ? 'Checking the way to Zoom…'
              : net === 'good'
                ? 'Internet to Zoom: good'
                : net === 'slow'
                  ? 'Internet to Zoom: slow. Class may stutter.'
                  : 'Zoom cannot be reached. Turn off any VPN and try again.'}
          </Muted>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label="It works" color={colors.good} disabled={net === 'blocked'} onPress={() => void save(true)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Something is wrong" variant="outline" color={colors.bad} onPress={() => void save(false)} />
            </View>
          </View>
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          <Muted>
            {check && !check.ok
              ? `The check did not work on ${formatDay(check.checkedAt.slice(0, 10))}. Please try again before class.`
              : 'Class happens in this page. Check once that you can see and hear yourself here.'}
          </Muted>
          <Button label="Start the check" color={color} onPress={() => void start()} />
        </View>
      )}
      {error && <Body style={{ color: colors.bad }}>{error}</Body>}
    </Card>
  )
}
