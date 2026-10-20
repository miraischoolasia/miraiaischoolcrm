import { usePathname, useRouter } from 'expo-router'
import { TabList, Tabs, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { HasVideosContext } from '@/lib/hasVideos'
import { LiveProvider } from '@/lib/live'
import { useSession } from '@/lib/session'
import { useLobbyTheme } from '@/lib/useLobby'
import { fetchClassVideos } from '@/lib/videos'
import { useEffect, useState } from 'react'
import { colors, Loading, Screen } from '@/ui/kit'
import { LiveQuestionBanner } from '@/ui/LiveQuestionCard'
import { usePointsBursts } from '@/lib/pointsFeed'
import { PointsBurstView } from '@/ui/PointsBurst'
import { TermsScreen } from '@/ui/TermsScreen'

// The tabs, as one bar at the bottom on phones and on the web. A question
// the teacher pops shows on Home; the other tabs get a bar for it. Videos
// shows only when one of the child's classes has videos. On a computer with
// the school's game lobby, Home is the lobby: it has its own buttons, so the
// bar hides there, and the teacher's question shows over it (answered in
// Learning mode, /learn, which is the classic home's list).
export default function AppLayout() {
  const insets = useSafeAreaInsets()
  const pathname = usePathname()
  const router = useRouter()
  const { branding, onboarding, child, home, refresh } = useSession()
  const [hasVideos, setHasVideos] = useState(false)
  const studentId = child?.studentId ?? null
  const lobby = useLobbyTheme() !== null
  const onLobby = lobby && pathname === '/'
  // Points the teacher gives pop up at once (when the school shows points).
  const bursts = usePointsBursts(studentId, Boolean(home?.sees.points), () => void refresh())
  useEffect(() => {
    setHasVideos(false)
    if (studentId === null) return
    fetchClassVideos(studentId)
      .then((classes) => setHasVideos(classes.some((entry) => entry.videos.length > 0 || entry.closed_months.length > 0)))
      .catch(() => setHasVideos(false))
  }, [studentId])
  // A parent agrees to the school's terms before the app opens.
  if (onboarding === null) {
    return (
      <Screen>
        <Loading />
      </Screen>
    )
  }
  if (onboarding.needs_terms) return <TermsScreen onboarding={onboarding} />
  return (
    <HasVideosContext.Provider value={hasVideos}>
    <LiveProvider>
      <Tabs>
        {(pathname !== '/' || lobby) && pathname !== '/learn' && (
          <View style={onLobby ? styles.overLobby : { paddingTop: insets.top }}>
            <LiveQuestionBanner color={branding.accentColor} onOpen={() => router.navigate(lobby ? '/learn' : '/')} />
          </View>
        )}
        <TabSlot style={{ flex: 1 }} />
      <TabList style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }, onLobby && styles.hidden]}>
        <TabTrigger name="home" href="/" asChild>
          <TabButton label="Home" icon="🏠" />
        </TabTrigger>
        {hasVideos && (
          <TabTrigger name="videos" href="/videos" asChild>
            <TabButton label="Videos" icon="🎬" />
          </TabTrigger>
        )}
        <TabTrigger name="progress" href="/progress" asChild>
          <TabButton label="Progress" icon="📈" />
        </TabTrigger>
        <TabTrigger name="me" href="/me" asChild>
          <TabButton label="Me" icon="🙂" />
        </TabTrigger>
        <TabTrigger name="learn" href="/learn" style={styles.hidden} />
      </TabList>
      {bursts.current && <PointsBurstView burst={bursts.current} color={branding.accentColor} onDone={bursts.done} />}
      </Tabs>
    </LiveProvider>
    </HasVideosContext.Provider>
  )
}

// The trigger's ref is typed for a View; a Pressable needs none to work, so
// it is left off.
function TabButton({ label, icon, isFocused, ref: _ref, ...props }: TabTriggerSlotProps & { label: string; icon: string }) {
  const { branding } = useSession()
  return (
    <Pressable {...props} accessibilityRole="tab" accessibilityLabel={label} style={styles.tab}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[styles.label, { color: isFocused ? branding.accentColor : colors.muted }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    paddingTop: 8,
  },
  hidden: { display: 'none' },
  overLobby: { position: 'absolute', top: 12, left: 0, right: 0, zIndex: 10, alignItems: 'center' },
  tab: { flex: 1, alignItems: 'center', gap: 2, minHeight: 48, justifyContent: 'center' },
  icon: { fontSize: 20 },
  label: { fontSize: 12, fontWeight: '700' },
})
