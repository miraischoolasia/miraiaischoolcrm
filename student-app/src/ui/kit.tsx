import type { PropsWithChildren, ReactNode } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// The few building blocks every screen uses, so the app looks the same on
// the web and on phones. Colours come from here and the school's accent.
export const colors = {
  background: '#f7f7fb',
  card: '#ffffff',
  text: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  good: '#047857',
  goodBg: '#ecfdf5',
  warn: '#b45309',
  warnBg: '#fffbeb',
  bad: '#b91c1c',
}

export function Screen({
  children,
  refreshing,
  onRefresh,
}: PropsWithChildren<{ refreshing?: boolean; onRefresh?: () => void }>) {
  const insets = useSafeAreaInsets()
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.screenContent, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 96 }]}
      refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} /> : undefined}
    >
      <View style={styles.column}>{children}</View>
    </ScrollView>
  )
}

export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>
}

export function Title({ children, style }: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <Text style={[styles.title, style]}>{children}</Text>
}

export function Heading({ children }: PropsWithChildren) {
  return <Text style={styles.heading}>{children}</Text>
}

export function Body({ children, style }: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <Text style={[styles.body, style]}>{children}</Text>
}

export function Muted({ children, style }: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <Text style={[styles.muted, style]}>{children}</Text>
}

export function Button({
  label,
  onPress,
  color,
  disabled,
  busy,
  variant = 'solid',
}: {
  label: string
  onPress: () => void
  color: string
  disabled?: boolean
  busy?: boolean
  variant?: 'solid' | 'outline'
}) {
  const solid = variant === 'solid'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        solid ? { backgroundColor: color } : { borderColor: color, borderWidth: 1.5, backgroundColor: colors.card },
        (disabled || busy) && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={solid ? '#fff' : color} />
      ) : (
        <Text style={[styles.buttonText, { color: solid ? '#fff' : color }]}>{label}</Text>
      )}
    </Pressable>
  )
}

export function Pill({ children, color, background }: PropsWithChildren<{ color: string; background: string }>) {
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <Text style={[styles.pillText, { color }]}>{children}</Text>
    </View>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <Text style={[styles.muted, styles.empty]}>{children}</Text>
}

export function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { paddingHorizontal: 16 },
  column: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: 14 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 8,
  },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  heading: { fontSize: 17, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  muted: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  button: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 12, fontWeight: '700' },
  empty: { textAlign: 'center', paddingVertical: 12 },
  loading: { paddingVertical: 40, alignItems: 'center' },
})
