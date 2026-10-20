import type { Daily } from '@/lib/daily'
import type { StartButton } from '@/lib/lobby'
import type { LobbyTheme } from '@/lib/lobbyThemes'

// Where the lobby's working buttons go.
export type LobbyPlace = 'learn' | 'results' | 'more' | 'videos' | 'practice'

export type LobbyViewProps = {
  theme: LobbyTheme
  // False while another tab is in front: the motion stops.
  active: boolean
  student: { name: string; className: string | null } | null
  // Null when the school does not show points to this login.
  level: { level: number; fraction: number } | null
  coins: number | null
  start: StartButton
  hasVideos: boolean
  error: string | null
  // Returns false when the class cannot open yet (the teacher has not opened it).
  onStart: () => boolean
  onGo: (place: LobbyPlace) => void
  // Daily check-in, tasks and practice (null: the school has none, or not yet loaded).
  daily: Daily | null
  dailyBusy: boolean
  dailyError: string | null
  onCheckIn: () => void
  onClaim: (taskId: number) => void
}
