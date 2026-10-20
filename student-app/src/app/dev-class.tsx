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
//   waiting-ended the lesson time is over and it never opened
//   open          started; press Join
//   sign-error    Zoom refused the join (for example "Signature is invalid")
//   blocked       the meeting is on another Zoom account
//   offline       the server cannot be reached
//   question      a question in the middle (answering)
//   question-sent | question-missed | question-revealed   after sending, time up, the answer shown
//   question-aside  the question stepped aside: the small button to open it again
//   roll | star | cheer | teams   the teacher's moments in the middle
//   bar           the top bar: timer, who answers, teams
//   notes | notes-open   the lesson notes button, the notes open
//   ended         the class video has ended
//   sample | sample-question | sample-folded   the class menu (right) and our own toolbar (a sample), with a question too
// The built app sends this page to Home.
const lesson = () => ({ title: 'Bahasa Melayu', class: 'Y5 BM', teacher: 'Cikgu Farah', date: todayInMalaysia(), start: '20:30', end: '21:30' })
const people = [
  { id: 1, name: 'Alya S.' },
  { id: 2, name: 'Daniel T.' },
  { id: 3, name: 'Mei Ling' },
  { id: 4, name: 'Arjun K.' },
]

const notes = [
  {
    id: 1,
    session_id: 1,
    date: todayInMalaysia(),
    class: 'Y5 BM',
    title: 'Kata sifat (adjectives)',
    body: 'gembira = happy\nsedih = sad\nmarah = angry',
    published_at: new Date().toISOString(),
  },
  {
    id: 2,
    session_id: 1,
    date: todayInMalaysia(),
    class: 'Y5 BM',
    title: 'Homework',
    body: 'Write 5 sentences with kata sifat.',
    published_at: new Date().toISOString(),
  },
]

function classState(kind: string): ClassLiveState {
  const now = Date.now()
  return {
    title: 'Y5 BM · Bahasa Melayu',
    timer: { endsAt: now + 4 * 60 * 1000, pausedLeft: null },
    picked: kind === 'question' || kind === 'bar' ? 'Daniel T.' : null,
    cheer: kind === 'cheer' ? { id: now, studentId: 2, name: 'Daniel T.', points: 5, reason: 'Great answer!' } : null,
    roll: kind === 'roll' ? { seq: now, people, chosenId: 1 } : null,
    star: kind === 'star' ? { seq: now, id: 3, name: 'Mei Ling' } : null,
    teams:
      kind === 'teams' || kind === 'question' || kind === 'bar'
        ? [
            { key: 'a', label: 'Team Tiger', color: '#f97316', text: '#fff', members: [people[0], people[1]], score: 12 },
            { key: 'b', label: 'Team Eagle', color: '#2563eb', text: '#fff', members: [people[2], people[3]], score: 9 },
          ]
        : null,
    sentAt: now,
  }
}

function question(kind: string): LiveValue {
  const now = new Date()
  const over = kind === 'question-missed' || kind === 'question-revealed'
  const sent = kind === 'question-sent' || kind === 'question-aside' || kind === 'question-revealed'
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
      opened_at: new Date(now.getTime() - (over ? 70_000 : 15_000)).toISOString(),
      closes_at: new Date(now.getTime() + (over ? -10_000 : 45_000)).toISOString(),
      open: !over,
      revealed: kind === 'question-revealed',
    },
    answer: sent
      ? {
          text: null,
          choices: [1],
          has_file: false,
          submitted_at: now.toISOString(),
          result: kind === 'question-revealed' ? 'correct' : 'pending',
          points: kind === 'question-revealed' ? 5 : null,
          feedback: null,
        }
      : null,
    key: kind === 'question-revealed' ? { correct_options: [1], answers: [], explanation: '"Gembira" means happy.' } : null,
    leaderboard:
      kind === 'question-revealed'
        ? [
            { place: 1, name: 'Mei Ling', points: 25, me: false },
            { place: 2, name: 'TEST', points: 20, me: true },
            { place: 3, name: 'Arjun K.', points: 15, me: false },
          ]
        : [],
    my_points: kind === 'question-revealed' ? 20 : 0,
    my_place: kind === 'question-revealed' ? 2 : null,
  }
  return { state, secondsLeft: over ? 0 : 45, error: null, submit: async () => null, sendPicture: async () => null, reload: async () => undefined }
}

export default function DevClass() {
  const params = useLocalSearchParams<{ state?: string }>()
  const router = useRouter()
  const kind = params.state ?? 'waiting'
  const [moments] = useState(() => classState(kind))
  const [live] = useState(() => (kind.startsWith('question') ? question(kind) : kind === 'sample-question' ? question('question-aside') : undefined))
  if (!__DEV__) return <Redirect href="/" />
  const link = 'https://us02web.zoom.us/j/81234567890?pwd=example'
  if (kind === 'waiting' || kind === 'game-waiting' || kind === 'waiting-ended') {
    const shown = {
      lesson: lesson(),
      ended: kind === 'waiting-ended',
      checkedAt: new Date(),
      problem: null,
      everySeconds: lessonCheckSeconds,
      onBack: () => router.replace('/'),
    }
    return kind === 'game-waiting' ? <GameWaiting theme={lobbyThemes.eduhero} {...shown} /> : <LessonWaiting color="#fc0c97" {...shown} />
  }
  return (
    <ClassRoomView
      sessionId={1}
      fallbackLink={link}
      classOverride={moments}
      liveOverride={live}
      devShow={{
        notes: kind === 'notes' || kind === 'notes-open' || kind === 'ended' || kind.startsWith('sample') ? notes : undefined,
        sample: kind.startsWith('sample'),
        sampleFolded: kind === 'sample-folded',
        notesOpen: kind === 'notes-open',
        ended: kind === 'ended',
        autoJoin: kind === 'blocked' || kind === 'offline' || kind === 'sign-error',
      }}
      joinInfo={() =>
        kind === 'blocked'
          ? Promise.resolve({ inPage: false, joinUrl: link, reason: 'other_account' })
          : kind === 'offline'
            ? Promise.reject(new Error('Failed to send a request to the Edge Function'))
            : kind === 'sign-error'
              ? Promise.reject(new Error('Signature is invalid.'))
              : new Promise(() => undefined)
      }
    />
  )
}
