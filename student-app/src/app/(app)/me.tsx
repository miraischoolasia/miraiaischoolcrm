import { Pressable, StyleSheet, Text, View } from 'react-native'

import { formatDay } from '@/lib/format'
import { useSession } from '@/lib/session'
import { Body, Button, Card, colors, Heading, Muted, Screen, Title } from '@/ui/kit'

// Me: the package (lessons left and expiry, when shown), picking a child for
// a parent with several, and signing out.
export default function Me() {
  const { home, children, child, chooseChild, branding, signOut, session } = useSession()

  return (
    <Screen>
      <Title>Me</Title>

      {home?.package && (
        <Card>
          <Heading>{home.package.name ?? 'My classes'}</Heading>
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: branding.accentColor }]}>{home.package.lessons_left}</Text>
              <Muted>lessons left</Muted>
            </View>
            {home.package.expires && (
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.text }]}>{formatDay(home.package.expires)}</Text>
                <Muted>expires</Muted>
              </View>
            )}
          </View>
        </Card>
      )}

      {children.length > 1 && (
        <Card>
          <Heading>Children</Heading>
          {children.map((entry) => {
            const picked = entry.studentId === child?.studentId
            return (
              <Pressable
                key={entry.studentId}
                accessibilityRole="button"
                accessibilityState={{ selected: picked }}
                onPress={() => chooseChild(entry.studentId)}
                style={[styles.child, picked && { borderColor: branding.accentColor }]}
              >
                <Body style={{ fontWeight: picked ? '700' : '400' }}>{entry.name}</Body>
                {picked && <Text style={{ color: branding.accentColor }}>✓</Text>}
              </Pressable>
            )
          })}
        </Card>
      )}

      <Card>
        <Heading>Account</Heading>
        <Muted>
          Signed in as {session?.user.email?.replace(/@portal\.internal$/, '') ?? '—'}
          {home ? (home.viewer === 'parent' ? ' (parent)' : '') : ''}
        </Muted>
        <Button label="Sign out" variant="outline" color={branding.accentColor} onPress={() => void signOut()} />
      </Card>
    </Screen>
  )
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 24 },
  stat: { gap: 2 },
  statValue: { fontSize: 28, fontWeight: '800' },
  child: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
})
