import { useState } from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native'

import { useSession } from '@/lib/session'
import { Body, Button, Card, colors, Muted, Screen, Title } from '@/ui/kit'

// Children and parents sign in with the login name and password the school
// gave them (no email needed).
export default function SignIn() {
  const { signIn, branding } = useSession()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    const failure = await signIn(username, password)
    setBusy(false)
    if (failure) setError(failure)
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={styles.hero}>
          <View style={[styles.badge, { backgroundColor: branding.accentColor }]}>
            <Text style={styles.badgeText}>{(branding.schoolName || 'S').slice(0, 1).toUpperCase()}</Text>
          </View>
          <Title>{branding.schoolName || 'Student app'}</Title>
          <Muted>Sign in with the login the school gave you.</Muted>
        </View>
        <Card style={{ gap: 12 }}>
          <View style={{ gap: 6 }}>
            <Body>Login name</Body>
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              placeholder="e.g. ethan.lim"
              accessibilityLabel="Login name"
              style={styles.input}
            />
          </View>
          <View style={{ gap: 6 }}>
            <Body>Password</Body>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="password"
              placeholder="e.g. sunny-panda-47"
              accessibilityLabel="Password"
              onSubmitEditing={() => void submit()}
              style={styles.input}
            />
          </View>
          {error && <Text style={styles.error}>{error}</Text>}
          <Button
            label="Sign in"
            color={branding.accentColor}
            busy={busy}
            disabled={!username.trim() || !password}
            onPress={() => void submit()}
          />
        </Card>
        <Muted style={{ textAlign: 'center' }}>Forgot your password? Ask your teacher or the school for a new one.</Muted>
      </Screen>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 8, paddingTop: 32, paddingBottom: 8 },
  badge: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 30, fontWeight: '800' },
  input: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: '#fff',
  },
  error: { color: colors.bad, fontSize: 14 },
})
