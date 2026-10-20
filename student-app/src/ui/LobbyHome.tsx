import { type Href, useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Linking, Platform } from 'react-native'

import { useHasVideos } from '@/lib/hasVideos'
import { classEntry, earnedPoints, levelFrom, startButton } from '@/lib/lobby'
import type { LobbyTheme } from '@/lib/lobbyThemes'
import { useSession } from '@/lib/session'
import { LobbyView, type LobbyPlace } from '@/ui/LobbyView'

// The game-lobby home (a computer, when the school turned it on): the child's
// name, class, Lv and coins from portal_home, and the big button — "Enter
// class" when a class is near or on, else "Start learning".
export function LobbyHome({ theme }: { theme: LobbyTheme }) {
  const { home, homeError, child, branding } = useSession()
  const router = useRouter()
  const hasVideos = useHasVideos()
  const [now, setNow] = useState(() => new Date())
  const [focused, setFocused] = useState(true)

  // Motion and the clock stop while another tab is open.
  useFocusEffect(
    useCallback(() => {
      setFocused(true)
      setNow(new Date())
      return () => setFocused(false)
    }, []),
  )
  // The minutes to the class, every 30 s (only while this page is in front).
  useEffect(() => {
    if (!focused) return
    const timer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') setNow(new Date())
    }, 30_000)
    return () => clearInterval(timer)
  }, [focused])

  const start = startButton(home?.sees.schedule ? home.schedule : [], now)
  const points = home?.points
  const level = points ? levelFrom(earnedPoints(points), branding.levelPoints) : null

  function go(place: LobbyPlace) {
    const to: Record<LobbyPlace, Href> = { learn: '/learn', results: '/progress', more: '/me', videos: '/videos' }
    router.navigate(to[place])
  }

  // Opens the class; false when it cannot open yet (the teacher has not opened it).
  function enterClass() {
    if (start.kind !== 'class') {
      go('learn')
      return true
    }
    const entry = classEntry(start.item, Platform.OS === 'web')
    if (entry.to === 'page') {
      router.push(`/class/${entry.sessionId}` as Href)
      return true
    }
    if (entry.to === 'zoom') {
      if (Platform.OS === 'web') window.open(entry.link, '_blank', 'noopener')
      else void Linking.openURL(entry.link)
      return true
    }
    return false
  }

  return (
    <LobbyView
      theme={theme}
      active={focused}
      student={home ? { name: child?.name ?? home.student.name, className: home.student.class } : null}
      level={level}
      coins={points ? points.total : null}
      start={start}
      hasVideos={hasVideos}
      error={home ? null : homeError}
      onStart={enterClass}
      onGo={go}
    />
  )
}
