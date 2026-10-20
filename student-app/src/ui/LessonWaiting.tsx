import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { formatDay, formatTime } from '@/lib/format'
import type { LessonRoom } from '@/lib/classRoom'
import { Button } from '@/ui/kit'

// The class page before the teacher opens the lesson: the lesson, and a note
// that the page checks by itself and goes in when the teacher starts.
export function LessonWaiting({
  lesson,
  ended,
  checkedAt,
  problem,
  everySeconds,
  color,
  onBack,
}: {
  lesson: LessonRoom['lesson'] | null
  ended: boolean
  checkedAt: Date | null
  problem: string | null
  everySeconds: number
  color: string
  onBack: () => void
}) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.page, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.card}>
        <Text style={styles.icon}>{ended ? '🌙' : '⏳'}</Text>
        <Text style={styles.title}>{ended ? 'This class time is over' : "Your teacher hasn't started the class yet"}</Text>
        {lesson && (
          <View style={styles.lesson}>
            <Text style={styles.lessonName}>{lesson.class ?? lesson.title}</Text>
            <Text style={styles.lessonLine}>
              {formatDay(lesson.date)} · {formatTime(lesson.start)} – {formatTime(lesson.end)}
            </Text>
            {lesson.teacher && <Text style={styles.lessonLine}>Teacher: {lesson.teacher}</Text>}
          </View>
        )}
        {!ended && (
          <View style={styles.row}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.note}>
              This page checks every {everySeconds} seconds and takes you in as soon as your teacher starts.
            </Text>
          </View>
        )}
        {checkedAt && (
          <Text style={styles.small}>
            Last checked {String(checkedAt.getHours()).padStart(2, '0')}:{String(checkedAt.getMinutes()).padStart(2, '0')}:
            {String(checkedAt.getSeconds()).padStart(2, '0')}
          </Text>
        )}
        {problem && <Text style={styles.problem}>{problem}</Text>}
        <View style={styles.button}>
          <Button label="Back to Home" variant="outline" color={color} onPress={onBack} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0f1229', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  card: { width: '100%', maxWidth: 460, alignItems: 'center', gap: 14, padding: 24, borderRadius: 20, backgroundColor: '#1a1f45' },
  icon: { fontSize: 44 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  lesson: { alignItems: 'center', gap: 4 },
  lessonName: { color: '#ffd34d', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  lessonLine: { color: 'rgba(255,255,255,0.85)', fontSize: 15, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 380 },
  note: { flex: 1, color: 'rgba(255,255,255,0.82)', fontSize: 14 },
  small: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  problem: { color: '#ff9cc8', fontSize: 13, textAlign: 'center' },
  button: { width: '100%', maxWidth: 260, marginTop: 4 },
})
