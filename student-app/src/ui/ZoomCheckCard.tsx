import { useEffect, useState } from 'react'
import { Linking, Platform, View } from 'react-native'

import { formatDay } from '@/lib/format'
import { fetchLastZoomCheck, needsZoomCheck, recordZoomCheck, type ZoomCheck } from '@/lib/portal'
import { Body, Button, Card, colors, Heading, Muted } from '@/ui/kit'

const TEST_URL = 'https://zoom.us/test'

const tips = [
  'Use the Zoom app if you can (it works better than a web browser).',
  'Allow Zoom to use the camera and the microphone.',
  'Turn off any VPN (for example Cloudflare WARP) during class.',
  'Use Wi-Fi or mobile data that is working well, then try again.',
]

// Before class: try Zoom's test meeting on this device, then say whether it
// worked. Shown when a class is near and there is no good check lately.
export function ZoomCheckCard({ studentId, nextClassDate, today, color }: { studentId: number; nextClassDate: string | null; today: string; color: string }) {
  const [check, setCheck] = useState<ZoomCheck | null | undefined>(undefined)
  const [opened, setOpened] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justChecked, setJustChecked] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchLastZoomCheck(studentId).then((value) => !cancelled && setCheck(value))
    return () => {
      cancelled = true
    }
  }, [studentId])

  if (check === undefined) return null
  const needed = needsZoomCheck(check, nextClassDate, today)
  if (!needed && !justChecked) return null

  function openTest() {
    setOpened(true)
    if (Platform.OS === 'web') window.open(TEST_URL, '_blank', 'noopener')
    else void Linking.openURL(TEST_URL)
  }

  async function answer(ok: boolean) {
    const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web'
    const problem = await recordZoomCheck(studentId, ok, platform)
    setError(problem)
    if (!problem) {
      setCheck({ ok, checkedAt: new Date().toISOString(), platform })
      setJustChecked(true)
    }
  }

  return (
    <Card style={{ borderColor: color, borderWidth: 1.5 }}>
      <Heading>Check Zoom before class</Heading>
      {justChecked && check?.ok ? (
        <Body>All set for class. See you there! ✅</Body>
      ) : justChecked && check && !check.ok ? (
        <View style={{ gap: 4 }}>
          <Body>The teacher will know. These usually help:</Body>
          {tips.map((tip) => (
            <Body key={tip}>• {tip}</Body>
          ))}
          <Button label="Try the test again" variant="outline" color={color} onPress={openTest} />
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          <Muted>
            {check && !check.ok
              ? `Zoom did not work on ${formatDay(check.checkedAt.slice(0, 10))}. Please try again before class.`
              : 'Open Zoom’s test meeting on this device: you should see yourself and hear the test sound.'}
          </Muted>
          <Button label="Open the Zoom test" color={color} onPress={openTest} />
          {opened && (
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Button label="It worked" color={colors.good} onPress={() => void answer(true)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Something is wrong" variant="outline" color={colors.bad} onPress={() => void answer(false)} />
              </View>
            </View>
          )}
        </View>
      )}
      {error && <Body style={{ color: colors.bad }}>{error}</Body>}
    </Card>
  )
}
