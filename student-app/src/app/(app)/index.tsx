import { useLobbyTheme } from '@/lib/useLobby'
import { ClassicHome } from '@/ui/ClassicHome'
import { LobbyHome } from '@/ui/LobbyHome'

// Home: the game lobby on a computer when the school turned it on, else the
// classic list (phones always, for now).
export default function Home() {
  const theme = useLobbyTheme()
  return theme ? <LobbyHome theme={theme} /> : <ClassicHome />
}
