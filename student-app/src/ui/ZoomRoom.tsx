import { useState } from 'react'
import { Linking, StyleSheet, Text, View } from 'react-native'

import type { JoinInfo } from '@/lib/classRoom'
import { Button } from '@/ui/kit'

// On phones the class opens in the Zoom app (the Meeting SDK runs in the web
// build only, ZoomRoom.web.tsx).
export function ZoomRoom({ getJoinInfo, color }: { getJoinInfo: () => Promise<JoinInfo>; color: string; onLeft?: () => void; fallbackLink?: string | null; autoJoin?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function open() {
    setBusy(true)
    setMessage(null)
    try {
      const info = await getJoinInfo()
      if (info.joinUrl) await Linking.openURL(info.joinUrl)
      else setMessage('The class link is not ready yet.')
    } catch (problem) {
      setMessage(problem instanceof Error ? problem.message : 'Could not open the class.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.cover}>
      <Text style={styles.title}>Class on Zoom</Text>
      {message && <Text style={styles.text}>{message}</Text>}
      <Button label="Open the class in Zoom" color={color} busy={busy} onPress={() => void open()} />
    </View>
  )
}

const styles = StyleSheet.create({
  cover: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: '#141833' },
  title: { color: '#fff', fontSize: 22, fontWeight: '800' },
  text: { color: 'rgba(255,255,255,0.82)', fontSize: 15, textAlign: 'center' },
})
