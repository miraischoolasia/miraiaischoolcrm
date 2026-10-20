import type { LobbyTheme } from '@/lib/lobbyThemes'

export type GameSignInProps = {
  theme: LobbyTheme
  schoolName: string
  // The school's WhatsApp (digits) for "Forgot password?" and "Contact the school"; empty hides them.
  supportWhatsapp: string
  // Signs in; the error to show, or null.
  onSignIn: (username: string, password: string, remember: boolean) => Promise<string | null>
}
