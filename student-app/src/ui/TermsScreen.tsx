import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { acceptTerms, type ConsentKind, type Onboarding } from '@/lib/portal'
import { useSession } from '@/lib/session'
import { Body, Button, Card, colors, Heading, Muted, Screen, Title } from '@/ui/kit'

type Needs = Extract<Onboarding, { needs_terms: true }>

// A parent's first sign-in (or new terms): the school's terms and the consent
// questions, before the app opens. Required consents must be ticked.
export function TermsScreen({ onboarding }: { onboarding: Needs }) {
  const { branding, reloadOnboarding, refresh, signOut } = useSession()
  const [answers, setAnswers] = useState<Record<ConsentKind, boolean>>(
    () => Object.fromEntries(onboarding.consents.map((consent) => [consent.kind, false])) as Record<ConsentKind, boolean>,
  )
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const missingRequired = onboarding.consents.some((consent) => consent.required && !answers[consent.kind])

  async function submit() {
    setBusy(true)
    setError(null)
    const problem = await acceptTerms(onboarding.terms.version, answers)
    if (problem) {
      setBusy(false)
      setError(problem)
      return
    }
    await reloadOnboarding()
    await refresh()
  }

  return (
    <Screen>
      <Muted>{branding.schoolName || 'Welcome'}</Muted>
      <Title>{onboarding.terms.title}</Title>
      <Card>
        <Body>{onboarding.terms.text}</Body>
      </Card>

      {onboarding.consents.length > 0 && (
        <Card>
          <Heading>Your consent</Heading>
          <Muted>For each of your children. You can change these later under Me.</Muted>
          {onboarding.consents.map((consent) => (
            <Tick
              key={consent.kind}
              checked={answers[consent.kind]}
              color={branding.accentColor}
              label={`${consent.title}${consent.required ? ' (needed)' : ' (optional)'}`}
              text={consent.text}
              onToggle={() => setAnswers((current) => ({ ...current, [consent.kind]: !current[consent.kind] }))}
            />
          ))}
        </Card>
      )}

      <Card>
        <Tick
          checked={agreed}
          color={branding.accentColor}
          label={`I have read and agree to the ${onboarding.terms.title.toLowerCase()}.`}
          onToggle={() => setAgreed((current) => !current)}
        />
        {missingRequired && <Muted style={{ color: colors.warn }}>The school needs the items marked (needed) to use the app.</Muted>}
        {error && <Text style={{ color: colors.bad }}>{error}</Text>}
        <Button label="Agree and continue" color={branding.accentColor} busy={busy} disabled={!agreed || missingRequired} onPress={() => void submit()} />
        <Button label="Sign out" variant="outline" color={branding.accentColor} onPress={() => void signOut()} />
      </Card>
    </Screen>
  )
}

function Tick({
  checked,
  color,
  label,
  text,
  onToggle,
}: {
  checked: boolean
  color: string
  label: string
  text?: string
  onToggle: () => void
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onToggle}
      style={styles.tick}
    >
      <View style={[styles.box, checked && { backgroundColor: color, borderColor: color }]}>
        {checked && <Text style={styles.mark}>✓</Text>}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Body style={{ fontWeight: '700' }}>{label}</Body>
        {text ? <Muted>{text}</Muted> : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  tick: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 8, minHeight: 48 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  mark: { color: '#fff', fontWeight: '800' },
})
