import { Redirect, useLocalSearchParams } from 'expo-router'
import { useState } from 'react'
import { Text } from 'react-native'

import type { Daily } from '@/lib/daily'
import { startButton } from '@/lib/lobby'
import { lobbyThemes } from '@/lib/lobbyThemes'
import type { UpcomingClass } from '@/lib/portal'
import { LobbyView } from '@/ui/LobbyView'

// Development only (npx expo start): the game lobby with made-up data, to
// look at it without a child's login. ?state=class (a class in 25 min) |
// live (on now) | free (no class); ?theme=<picture set>. The built app sends
// this page to Home.
export default function DevLobby() {
  const params = useLocalSearchParams<{ state?: string; theme?: string; daily?: string }>()
  const [note, setNote] = useState('')
  // Made-up daily check-in and tasks; ?daily=off shows them as "coming soon".
  const [daily, setDaily] = useState<Daily>(() => ({
    day: '2026-10-20',
    checkin: { enabled: true, coins: 2, done: false, streak: 3 },
    tasks: [
      { id: 1, label: 'Watch a learning video', kind: 'video', target: 1, coins: 3, progress: 1, claimed: false },
      { id: 2, label: 'Get a live question right', kind: 'live_right', target: 1, coins: 3, progress: 0, claimed: false },
      { id: 3, label: 'Do 3 practice questions', kind: 'practice', target: 3, coins: 3, progress: 3, claimed: true },
    ],
    practice: { enabled: true, per_day: 5, coins: 1, done_today: 3, right_today: 2, has_questions: true },
  }))
  if (!__DEV__) return <Redirect href="/" />

  const now = new Date()
  const malaysia = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const date = malaysia.toISOString().slice(0, 10)
  const minute = malaysia.getUTCHours() * 60 + malaysia.getUTCMinutes()
  const at = (offset: number) => {
    const total = (minute + offset + 24 * 60) % (24 * 60)
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  }
  const lesson: UpcomingClass = {
    date,
    start: params.state === 'live' ? at(-10) : at(25),
    end: params.state === 'live' ? at(50) : at(85),
    title: 'Bahasa Melayu',
    class: 'Bahasa Melayu',
    teacher: 'Cikgu Farah',
    zoom_link: null,
    session_id: params.state === 'live' ? 1 : null,
    in_app_zoom: params.state === 'live',
  }
  const start = startButton(params.state === 'free' ? [] : [lesson], now)
  const theme = lobbyThemes[params.theme ?? 'eduhero'] ?? lobbyThemes.eduhero

  return (
    <>
      <LobbyView
        theme={theme}
        active
        student={{ name: 'Alya S.', className: 'Y5 BM' }}
        level={{ level: 13, fraction: 0.56 }}
        coins={640}
        start={start}
        hasVideos
        error={null}
        onStart={() => {
          setNote(`onStart (${start.kind})`)
          return start.kind !== 'class' || Boolean(lesson.session_id)
        }}
        onGo={(place) => setNote(`onGo(${place})`)}
        daily={params.daily === 'off' ? null : daily}
        dailyBusy={false}
        dailyError={null}
        onCheckIn={() => setDaily((current) => ({ ...current, checkin: { ...current.checkin, done: true, streak: current.checkin.streak + 1 } }))}
        onClaim={(taskId) => setDaily((current) => ({ ...current, tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, claimed: true } : task)) }))}
      />
      {note ? (
        <Text style={{ position: 'absolute', right: 8, bottom: 8, zIndex: 99, backgroundColor: '#000', color: '#0f0', paddingHorizontal: 6, fontSize: 12 }} testID="dev-note">
          {note}
        </Text>
      ) : null}
    </>
  )
}
