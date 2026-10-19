import { type ComponentRef, useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import type { JoinInfo } from '@/lib/classRoom'
import { Button } from '@/ui/kit'

type State = 'loading' | 'ready' | 'joining' | 'joined' | 'error'
type Size = { width: number; height: number }
type PlayerSize = Size & { sharing?: boolean }

// The lesson's Zoom inside the page. Zoom's Meeting SDK runs in an iframe
// (public/zoom/embed.html) so its React 18 never meets the app's React 19;
// the same way as EDUCINEVA's zoom-video.web.tsx. The player is given the
// whole room and scaled to fill it (up to twice its size).
export function ZoomRoom({
  getJoinInfo,
  color,
  onLeft,
}: {
  getJoinInfo: () => Promise<JoinInfo>
  color: string
  onLeft?: () => void
}) {
  const wrap = useRef<ComponentRef<typeof View> | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const [room, setRoom] = useState<Size | null>(null)
  const [player, setPlayer] = useState<PlayerSize | null>(null)
  const [state, setState] = useState<State>('loading')
  const [message, setMessage] = useState<string | null>(null)
  // The Zoom link, when the school has no in-page Zoom yet.
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)
  const onLeftRef = useRef(onLeft)
  useEffect(() => {
    onLeftRef.current = onLeft
  })

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return
      const data = event.data as { type?: string; message?: string; width?: number; height?: number; sharing?: boolean }
      if (data.type === 'size' && data.width && data.height) setPlayer({ width: data.width, height: data.height, sharing: Boolean(data.sharing) })
      if (data.type === 'ready') setState((current) => (current === 'loading' ? 'ready' : current))
      if (data.type === 'joined') setState('joined')
      if (data.type === 'left') {
        setState('ready')
        onLeftRef.current?.()
      }
      if (data.type === 'error') {
        setState('error')
        setMessage(data.message ?? 'Could not join the class video.')
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Leave Zoom when the page goes away (another tab of the app, or closed).
  useEffect(() => {
    const iframe = frame.current
    return () => iframe?.contentWindow?.postMessage({ type: 'leave' }, window.location.origin)
  }, [])

  useEffect(() => {
    const element = wrap.current as unknown as HTMLElement | null
    if (!element) return
    const measure = () => {
      const box = element.getBoundingClientRect()
      if (box.width > 50 && box.height > 50) setRoom({ width: Math.round(box.width), height: Math.round(box.height) })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    const first = setTimeout(measure, 0)
    return () => {
      observer.disconnect()
      clearTimeout(first)
    }
  }, [])

  async function join() {
    setState('joining')
    setMessage(null)
    try {
      const info = await getJoinInfo()
      if (!info.inPage) {
        setFallbackUrl(info.joinUrl)
        setState('ready')
        setMessage('Zoom inside the app is not ready for your school yet. Open the class in Zoom instead.')
        return
      }
      const { inPage: _inPage, joinUrl: _joinUrl, sdkKey: _sdkKey, ...payload } = info
      frame.current?.contentWindow?.postMessage({ type: 'join', payload }, window.location.origin)
    } catch (problem) {
      setState('error')
      setMessage(problem instanceof Error ? problem.message : 'Could not join the class video.')
    }
  }

  // Its height does not depend on its width, so the scale settles; while a
  // screen is shared only the height limits it.
  const scale = room && player ? Math.min(2, room.height / player.height, player.sharing ? Infinity : room.width / player.width) : 1

  return (
    <View ref={wrap} style={[StyleSheet.absoluteFill, { overflow: 'hidden', backgroundColor: '#141833' }]}>
      <iframe
        ref={frame}
        src="/zoom/embed.html"
        title="Class video"
        allow="camera; microphone; display-capture; autoplay; fullscreen"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: room ? Math.round(room.width / scale) : '100%',
          height: room ? Math.round(room.height / scale) : '100%',
          border: 0,
          display: 'block',
          transformOrigin: '0 0',
          transform: scale !== 1 ? `scale(${scale})` : undefined,
        }}
      />
      {state !== 'joined' && (
        <View style={styles.cover}>
          <Text style={styles.coverIcon}>🎥</Text>
          <Text style={styles.coverTitle}>{state === 'error' ? 'The class video did not start' : 'Ready for class?'}</Text>
          <Text style={styles.coverText}>
            {message ?? 'You will wait in the waiting room until your teacher lets you in. Your microphone starts muted.'}
          </Text>
          {fallbackUrl ? (
            <View style={styles.coverButton}>
              <Button label="Open the class in Zoom" color={color} onPress={() => window.open(fallbackUrl, '_blank', 'noopener')} />
            </View>
          ) : (
            <View style={styles.coverButton}>
              <Button
                label={state === 'error' ? 'Try again' : 'Join the class'}
                color={color}
                busy={state === 'joining' || state === 'loading'}
                onPress={() => void join()}
              />
            </View>
          )}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  cover: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
    backgroundColor: 'rgba(20,24,51,0.94)',
  },
  coverIcon: { fontSize: 40 },
  coverTitle: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  coverText: { color: 'rgba(255,255,255,0.82)', fontSize: 15, textAlign: 'center', maxWidth: 380 },
  coverButton: { width: '100%', maxWidth: 320, marginTop: 6 },
})
