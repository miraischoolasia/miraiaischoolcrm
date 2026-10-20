// Daily check-in, tasks and practice: what the app is sent (portal_daily and
// friends) and the plain rules on it (no database here, so it can be tested).

export type DailyTask = {
  id: number
  label: string
  kind: 'video' | 'live_right' | 'practice'
  target: number
  coins: number
  progress: number
  claimed: boolean
}

export type Daily = {
  day: string
  checkin: { enabled: boolean; coins: number; done: boolean; streak: number }
  tasks: DailyTask[]
  practice: { enabled: boolean; per_day: number; coins: number; done_today: number; right_today: number; has_questions: boolean }
}

export type PracticeQuestion = {
  id: number
  kind: 'choice' | 'fill'
  prompt: string
  options: { text: string }[]
  class: string | null
  lesson_date: string | null
}

export type PracticeNext = { question: PracticeQuestion | null; done_today: number; per_day: number }

export type PracticeResult = {
  correct: boolean
  coins: number
  right_options: number[] | null
  right_answer: string | null
  explanation: string | null
}

// Whether a task's coins can be claimed now.
export function canClaim(task: DailyTask) {
  return !task.claimed && task.progress >= task.target
}

// Something to do today: check-in not done, a task to claim, practice left.
export function dailyToDo(daily: Daily | null) {
  if (!daily) return 0
  return (
    (daily.checkin.enabled && !daily.checkin.done ? 1 : 0) +
    daily.tasks.filter(canClaim).length +
    (daily.practice.enabled && daily.practice.has_questions && daily.practice.done_today < daily.practice.per_day ? 1 : 0)
  )
}
