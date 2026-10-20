import { Redirect, useLocalSearchParams, useRouter } from 'expo-router'
import { useRef, useState } from 'react'

import type { Daily, PracticeNext, useDaily } from '@/lib/daily'
import { Screen } from '@/ui/kit'
import { PracticeView, type PracticeApi } from '@/ui/PracticeView'
import { TodayCard } from '@/ui/TodayCard'

// Development only (npx expo start): daily practice with two made-up
// questions (a choice and a fill-in), no login or database. The built app
// sends this page to Home. ?view=today shows the classic home's Today card.
const questions: NonNullable<PracticeNext['question']>[] = [
  {
    id: 1,
    kind: 'choice',
    prompt: 'Apakah maksud perkataan "gembira"?',
    options: [{ text: 'Sedih' }, { text: 'Seronok / happy' }, { text: 'Marah' }, { text: 'Takut' }],
    class: 'Y5 BM',
    lesson_date: '2026-10-13',
  },
  { id: 2, kind: 'fill', prompt: 'Red in Malay is ___', options: [], class: 'Y5 BM', lesson_date: '2026-10-13' },
]

const sample: Daily = {
  day: '2026-10-20',
  checkin: { enabled: true, coins: 2, done: false, streak: 3 },
  tasks: [
    { id: 1, label: 'Watch a learning video', kind: 'video', target: 1, coins: 3, progress: 1, claimed: false },
    { id: 2, label: 'Get a live question right', kind: 'live_right', target: 1, coins: 3, progress: 0, claimed: false },
    { id: 3, label: 'Do 3 practice questions', kind: 'practice', target: 3, coins: 3, progress: 3, claimed: true },
  ],
  practice: { enabled: true, per_day: 5, coins: 1, done_today: 3, right_today: 2, has_questions: true },
}

export default function DevPractice() {
  const router = useRouter()
  const params = useLocalSearchParams<{ view?: string }>()
  const [daily, setDaily] = useState(sample)
  const done = useRef(0)
  const [api] = useState<PracticeApi>(() => ({
    next: async () => ({ question: questions[done.current] ?? null, done_today: done.current, per_day: questions.length }),
    answer: async (_student, id, answer) => {
      done.current += 1
      if (id === 1) {
        const right = 'choices' in answer && answer.choices.length === 1 && answer.choices[0] === 1
        return { correct: right, coins: right ? 1 : 0, right_options: [1], right_answer: null, explanation: '"Gembira" means happy.' }
      }
      const right = 'text' in answer && answer.text.trim().toLowerCase() === 'merah'
      return { correct: right, coins: right ? 1 : 0, right_options: null, right_answer: 'merah', explanation: null }
    },
  }))
  if (!__DEV__) return <Redirect href="/" />
  if (params.view === 'today') {
    const today: ReturnType<typeof useDaily> = {
      daily,
      error: null,
      busy: false,
      reload: async () => undefined,
      checkIn: async () => setDaily((current) => ({ ...current, checkin: { ...current.checkin, done: true, streak: current.checkin.streak + 1 } })),
      claim: async (taskId) => setDaily((current) => ({ ...current, tasks: current.tasks.map((task) => (task.id === taskId ? { ...task, claimed: true } : task)) })),
    }
    return (
      <Screen>
        <TodayCard today={today} color="#fc0c97" />
      </Screen>
    )
  }
  return <PracticeView studentId={1} color="#fc0c97" onCoins={() => undefined} onBack={() => router.replace('/')} api={api} />
}
