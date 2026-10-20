import { Platform, useWindowDimensions } from 'react-native'

import { showsLobby } from './lobby'
import { lobbyThemeKeys, lobbyThemes, type LobbyTheme } from './lobbyThemes'
import { useSession } from './session'

// The school's lobby picture set when this screen shows the game lobby
// (the school turned it on, the web build, a computer-wide window); null
// keeps the classic home.
export function useLobbyTheme(): LobbyTheme | null {
  const { branding } = useSession()
  const { width } = useWindowDimensions()
  return showsLobby(branding, width, Platform.OS === 'web', lobbyThemeKeys) ? lobbyThemes[branding.homeTheme] : null
}
