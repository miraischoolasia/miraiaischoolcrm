import type { LobbyViewProps } from './lobbyViewProps'

export type { LobbyPlace } from './lobbyViewProps'

// The game lobby is drawn for the web on a computer (LobbyView.web.tsx);
// phones keep the classic home, so there is nothing to draw here.
export function LobbyView(_props: LobbyViewProps) {
  return null
}
