import { usePathname, useRouter } from 'expo-router'
import { TabList, Tabs, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { LiveProvider } from '@/lib/live'
import { useSession } from '@/lib/session'
import { colors, Loading, Screen } from '@/ui/kit'
import { LiveQuestionBanner } from '@/ui/LiveQuestionCard'
import { TermsScreen } from '@/ui/TermsScreen'

// The three tabs, as one bar at the bottom on phones and on the web. A
// question the teacher pops shows on Home; the other tabs get a bar for it.
export default function AppLayout() {
  const insets = useSafeAreaInsets()
  const pathname = usePathname()
  const router = useRouter()
  const { branding, onboarding } = useSession()
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
    <LiveProvider>
      <Tabs>
        {pathname !== '/' && (
          <View style={{ paddingTop: insets.top }}>
            <LiveQuestionBanner color={branding.accentColor} onOpen={() => router.navigate('/')} />
          </View>
        )}
        <TabSlot style={{ flex: 1 }} />
      <TabList style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TabTrigger name="home" href="/" asChild>
          <TabButton label="Home" icon="🏠" />
        </TabTrigger>
        <TabTrigger name="progress" href="/progress" asChild>
          <TabButton label="Progress" icon="📈" />
        </TabTrigger>
        <TabTrigger name="me" href="/me" asChild>
          <TabButton label="Me" icon="🙂" />
        </TabTrigger>
      </TabList>
      </Tabs>
    </LiveProvider>
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
  tab: { flex: 1, alignItems: 'center', gap: 2, minHeight: 48, justifyContent: 'center' },
  icon: { fontSize: 20 },
  label: { fontSize: 12, fontWeight: '700' },
})
