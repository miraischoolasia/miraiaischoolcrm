import type { LessonRoom } from '@/lib/classRoom'
import type { LobbyTheme } from '@/lib/lobbyThemes'

export type GameWaitingProps = {
  theme: LobbyTheme
  lesson: LessonRoom['lesson'] | null
  ended: boolean
  checkedAt: Date | null
  problem: string | null
  everySeconds: number
  onBack: () => void
}
