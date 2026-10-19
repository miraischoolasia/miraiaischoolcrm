import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'

import { SessionProvider, useSession } from '@/lib/session'

SplashScreen.preventAutoHideAsync()

// Signed in: the child's screens; signed out: the sign-in screen only (the
// Expo Router authentication pattern, Stack.Protected).
export default function RootLayout() {
  return (
    <SessionProvider>
      <SplashScreenController />
      <StatusBar style="dark" />
      <RootNavigator />
    </SessionProvider>
  )
}

function SplashScreenController() {
  const { isLoading } = useSession()
  if (!isLoading) {
    SplashScreen.hide()
  }
  return null
}

function RootNavigator() {
  const { session, isLoading } = useSession()
  if (isLoading) return null
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(app)" />
        <Stack.Screen name="class/[sessionId]" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  )
}
