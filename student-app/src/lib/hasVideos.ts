import { createContext, useContext } from 'react'

// Whether one of the child's classes has videos (the tabs work it out once;
// the lobby's 切换模式 uses it too, without asking the database again).
export const HasVideosContext = createContext(false)

export function useHasVideos() {
  return useContext(HasVideosContext)
}
