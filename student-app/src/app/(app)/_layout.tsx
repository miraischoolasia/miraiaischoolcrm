import { TabList, Tabs, TabSlot, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui'
import { Pressable, StyleSheet, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { useSession } from '@/lib/session'
import { colors } from '@/ui/kit'

// The three tabs, as one bar at the bottom on phones and on the web.
export default function AppLayout() {
  const insets = useSafeAreaInsets()
  return (
    <Tabs>
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
