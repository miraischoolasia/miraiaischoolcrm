import { Redirect, useLocalSearchParams } from 'expo-router'

import { lobbyThemes } from '@/lib/lobbyThemes'
import { GameSignIn } from '@/ui/GameSignIn'

// Development only (npx expo start): the game sign-in page with a made-up
// school, to look at it without the school's settings. Signing in here never
// reaches the database: it waits a moment and shows the usual wrong-login
// message. ?whatsapp=0 hides the "Contact the school" parts. The built app
// sends this page to Home.
export default function DevLogin() {
  const params = useLocalSearchParams<{ whatsapp?: string }>()
  if (!__DEV__) return <Redirect href="/" />
  return (
    <GameSignIn
      theme={lobbyThemes.eduhero}
      schoolName="EduHero"
      supportWhatsapp={params.whatsapp === '0' ? '' : '60123456789'}
      onSignIn={() => new Promise((resolve) => setTimeout(() => resolve('That login name or password is not right.'), 400))}
    />
  )
}
