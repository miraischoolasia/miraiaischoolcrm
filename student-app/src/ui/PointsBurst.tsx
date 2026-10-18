import { useEffect, useRef, useState } from 'react'
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native'

import type { PointsBurst } from '@/lib/pointsFeed'

const STARS = ['⭐', '🌟', '✨', '🎉', '⭐', '✨']

function chime() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const audio = new AudioContextClass()
    for (const [index, note] of [784, 988, 1175].entries()) {
      const tone = audio.createOscillator()
      const volume = audio.createGain()
      tone.frequency.value = note
      volume.gain.value = 0.08
      tone.connect(volume).connect(audio.destination)
      tone.start(audio.currentTime + index * 0.12)
      tone.stop(audio.currentTime + index * 0.12 + 0.18)
    }
    setTimeout(() => void audio.close(), 1200)
  } catch {
    // no sound is fine
  }
}

// "+5 Great answer" over the app, with stars flying out, for a moment.
export function PointsBurstView({ burst, color, onDone }: { burst: PointsBurst; color: string; onDone: () => void }) {
  const [pop] = useState(() => new Animated.Value(0))
  const [fly] = useState(() => new Animated.Value(0))
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  }, [onDone])

  useEffect(() => {
    pop.setValue(0)
    fly.setValue(0)
    chime()
    const native = Platform.OS !== 'web'
    Animated.sequence([
      Animated.parallel([
        Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: native }),
        Animated.timing(fly, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: native }),
      ]),
      Animated.delay(1400),
      Animated.timing(pop, { toValue: 0, duration: 250, useNativeDriver: native }),
    ]).start(() => onDoneRef.current())
  }, [burst.id, fly, pop])

  return (
    <View pointerEvents="none" style={styles.layer} accessibilityLiveRegion="polite">
      {STARS.map((star, index) => {
        const angle = (index / STARS.length) * Math.PI * 2
        return (
          <Animated.Text
            key={index}
            style={[
              styles.star,
              {
                opacity: fly.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
                transform: [
                  { translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * 130] }) },
                  { translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * 110] }) },
                ],
              },
            ]}
          >
            {star}
          </Animated.Text>
        )
      })}
      <Animated.View style={[styles.card, { borderColor: color, opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}>
        <Text style={[styles.points, { color }]}>+{burst.points} ⭐</Text>
        {burst.reason ? <Text style={styles.reason}>{burst.reason}</Text> : null}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  points: { fontSize: 44, fontWeight: '800' },
  reason: { fontSize: 18, fontWeight: '700', color: '#334155' },
  star: { position: 'absolute', fontSize: 30 },
})
