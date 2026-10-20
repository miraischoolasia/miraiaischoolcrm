import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'

import { lessonCheckSeconds, type ClassLiveState } from '@/lib/classRoom'
import { todayInMalaysia } from '@/lib/format'
import type { LiveState, LiveValue } from '@/lib/live'
import { lobbyThemes } from '@/lib/lobbyThemes'
import { ClassRoomView } from '@/ui/ClassRoomView'
import { GameWaiting } from '@/ui/GameWaiting'
import { LessonWaiting } from '@/ui/LessonWaiting'

// Development only (npx expo start): the class page's looks with made-up
// data, without a child's login or Zoom. ?state=
//   waiting       the teacher has not started (plain page)
//   game-waiting  the same, game style (a school with the lobby)
//   open          started; press Join
//   blocked       the meeting is on another Zoom account
//   offline       the server cannot be reached
//   question      a question in the middle
//   roll | star | cheer | teams   the teacher's moments in the middle
// The built app sends this page to Home.
const lesson = () => ({ title: 'Bahasa Melayu', class: 'Y5 BM', teacher: 'Cikgu Farah', date: todayInMalaysia(), start: '20:30', end: '21:30' })
const people = [
  { id: 1, name: 'Alya S.' },
  { id: 2, name: 'Daniel T.' },
  { id: 3, name: 'Mei Ling' },
  { id: 4, name: 'Arjun K.' },
]

function classState(kind: string): ClassLiveState {
  const now = Date.now()
  return {
    title: 'Y5 BM · Bahasa Melayu',
    timer: { endsAt: now + 4 * 60 * 1000, pausedLeft: null },
    picked: kind === 'question' ? 'Daniel T.' : null,
    cheer: kind === 'cheer' ? { id: now, studentId: 2, name: 'Daniel T.', points: 5, reason: 'Great answer!' } : null,
    roll: kind === 'roll' ? { seq: now, people, chosenId: 1 } : null,
    star: kind === 'star' ? { seq: now, id: 3, name: 'Mei Ling' } : null,
    teams:
      kind === 'teams' || kind === 'question'
        ? [
            { key: 'a', label: 'Team Tiger', color: '#f97316', text: '#fff', members: [people[0], people[1]], score: 12 },
            { key: 'b', label: 'Team Eagle', color: '#2563eb', text: '#fff', members: [people[2], people[3]], score: 9 },
          ]
        : null,
    sentAt: now,
  }
}

function question(): LiveValue {
  const now = new Date()
  const state: LiveState = {
    active: true,
    server_now: now.toISOString(),
    session: { id: 1, class: 'Y5 BM', questions: 3 },
    question: {
      id: 9,
      number: 3,
      kind: 'choice',
      prompt: 'Apakah maksud perkataan "gembira"?',
      options: [{ text: 'Sedih' }, { text: 'Seronok / happy' }, { text: 'Marah' }, { text: 'Takut' }],
      points: 5,
      time_limit_seconds: 60,
      opened_at: now.toISOString(),
      closes_at: new Date(now.getTime() + 45_000).toISOString(),
      open: true,
      revealed: false,
    },
    answer: null,
    key: null,
    leaderboard: [],
    my_points: 0,
    my_place: null,
  }
  return {
    state,
    secondsLeft: 45,
    error: null,
    submit: async () => null,
    sendPicture: async () => null,
    reload: async () => undefined,
  }
}

export default function DevClass() {
  const params = useLocalSearchParams<{ state?: string }>()
  const router = useRouter()
  const kind = params.state ?? 'waiting'
  const [moments] = useState(() => classState(kind))
  const [live] = useState(() => (kind === 'question' ? question() : undefined))
  if (!__DEV__) return <Redirect href="/" />
  const link = 'https://us02web.zoom.us/j/81234567890?pwd=example'
  if (kind === 'waiting' || kind === 'game-waiting') {
    const shown = { lesson: lesson(), ended: false, checkedAt: new Date(), problem: null, everySeconds: lessonCheckSeconds, onBack: () => router.replace('/') }
    return kind === 'game-waiting' ? <GameWaiting theme={lobbyThemes.eduhero} {...shown} /> : <LessonWaiting color="#fc0c97" {...shown} />
  }
  return (
    <ClassRoomView
      sessionId={1}
      fallbackLink={link}
      classOverride={moments}
      liveOverride={live}
      joinInfo={() =>
        kind === 'blocked'
          ? Promise.resolve({ inPage: false, joinUrl: link, reason: 'other_account' })
          : kind === 'offline'
            ? Promise.reject(new Error('Failed to send a request to the Edge Function'))
            : new Promise(() => undefined)
      }
    />
  )
}
