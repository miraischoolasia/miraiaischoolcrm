import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { formatDay } from '@/lib/format'
import { setConsent, type Consent } from '@/lib/portal'
import { useSession } from '@/lib/session'
import { Body, Button, Card, colors, Heading, Muted, Screen, Title } from '@/ui/kit'

// Me: the package (lessons left and expiry, when shown), picking a child for
// a parent with several, and signing out.
export default function Me() {
  const { home, children, child, chooseChild, branding, signOut, session, refresh } = useSession()

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

      {home?.consents && home.consents.length > 0 && (
        <Card>
          <Heading>Your consent</Heading>
          <Muted>You can change these at any time.</Muted>
          {home.consents.map((consent) => (
            <ConsentRow
              key={consent.kind}
              consent={consent}
              color={branding.accentColor}
              onAnswer={async (granted) => {
                const problem = await setConsent(home.student.id, consent.kind, granted)
                if (!problem) await refresh()
                return problem
              }}
            />
          ))}
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

function ConsentRow({
  consent,
  color,
  onAnswer,
}: {
  consent: Consent
  color: string
  onAnswer: (granted: boolean) => Promise<string | null>
}) {
  const [busy, setBusy] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function answer(granted: boolean) {
    setBusy(granted)
    setError(null)
    const problem = await onAnswer(granted)
    setBusy(null)
    if (problem) setError(problem)
  }

  return (
    <View style={styles.consent}>
      <Body style={{ fontWeight: '700' }}>
        {consent.title}
        {consent.required ? ' (needed)' : ''}
      </Body>
      <Muted>{consent.text}</Muted>
      <Muted style={{ color: consent.granted === null ? colors.muted : consent.granted ? colors.good : colors.bad }}>
        {consent.granted === null
          ? 'Not answered yet'
          : `${consent.granted ? 'You agreed' : 'You said no'}${consent.at ? ` · ${formatDay(consent.at.slice(0, 10))}` : ''}`}
      </Muted>
      <View style={styles.consentButtons}>
        <View style={{ flex: 1 }}>
          <Button
            label="I agree"
            color={color}
            busy={busy === true}
            disabled={busy !== null || consent.granted === true}
            onPress={() => void answer(true)}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Button
            label="No"
            variant="outline"
            color={color}
            busy={busy === false}
            disabled={busy !== null || consent.granted === false}
            onPress={() => void answer(false)}
          />
        </View>
      </View>
      {error && <Text style={{ color: colors.bad }}>{error}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  consent: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  consentButtons: { flexDirection: 'row', gap: 10 },
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
