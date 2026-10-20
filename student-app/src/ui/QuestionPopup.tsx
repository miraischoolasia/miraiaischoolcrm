import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { useLive } from '@/lib/live'
import { LiveQuestionCard } from '@/ui/LiveQuestionCard'

// The teacher's question, in the middle of the class page over a see-through
// shade (the class video stays in sight behind it). It stays while the child
// can answer; once sent it says so for a moment and steps aside; time up
// without an answer, the same; when the teacher shows the answer it comes
// back with the result for a while (or until closed); when the teacher
// closes the question it goes. While it is aside, a small button brings it back.
type Phase = 'answer' | 'sent' | 'missed' | 'revealed'

const stepAsideAfter: Record<Phase, number | null> = { answer: null, sent: 2500, missed: 3000, revealed: 10000 }

export function QuestionPopup({ color }: { color: string }) {
  const { state, secondsLeft } = useLive()
  const active = state?.active ? state : null
  const phase: Phase | null = !active
    ? null
    : active.question.revealed
      ? 'revealed'
      : active.answer
        ? 'sent'
        : active.question.open && secondsLeft > 0
          ? 'answer'
          : 'missed'
  const key = active && phase ? `${active.question.id}:${phase}` : null
  const [aside, setAside] = useState<string | null>(null)

  useEffect(() => {
    if (!key || !phase) return
    const after = stepAsideAfter[phase]
    if (after === null) return
    const timer = setTimeout(() => setAside(key), after)
    return () => clearTimeout(timer)
  }, [key, phase])

  if (!active || !key) return null
  if (aside === key) {
    return (
      <View style={styles.reopenWrap} pointerEvents="box-none">
        <Pressable accessibilityRole="button" onPress={() => setAside(null)} style={[styles.reopen, { backgroundColor: color }]}>
          <Text style={styles.reopenText}>📣 Question {active.question.number}</Text>
        </Pressable>
      </View>
    )
  }
  return (
    <View style={styles.shade} accessibilityViewIsModal>
      <View style={styles.box}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <LiveQuestionCard color={color} />
        </ScrollView>
        {phase !== 'answer' && (
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setAside(key)} style={styles.close}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  shade: {
    ...StyleSheet.absoluteFill,
    zIndex: 40,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: 'rgba(10,12,40,0.55)',
  },
  box: { width: '100%', maxWidth: 560, maxHeight: '88%' },
  scroll: { flexGrow: 0 },
  close: {
    position: 'absolute',
    top: -14,
    right: -14,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  closeText: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  reopenWrap: { position: 'absolute', right: 16, top: 64, zIndex: 30 },
  reopen: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center' },
  reopenText: { color: '#fff', fontWeight: '800', fontSize: 15 },
})
