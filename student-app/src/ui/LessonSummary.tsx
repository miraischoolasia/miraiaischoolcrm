import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { fetchLessonSummaries, type LessonSummary } from '@/lib/portal'
import { colors } from '@/ui/kit'

// The picked child's lesson summaries, read again whenever `reloadKey`
// changes (the home data refreshed).
export function useLessonSummaries(studentId: number | null, reloadKey: unknown) {
  const [summaries, setSummaries] = useState<LessonSummary[]>([])
  useEffect(() => {
    let cancelled = false
    if (studentId === null) return
    void fetchLessonSummaries(studentId).then((list) => !cancelled && setSummaries(list))
    return () => {
      cancelled = true
    }
  }, [studentId, reloadKey])
  return summaries
}

export function findSummary(summaries: LessonSummary[], date: string, title: string) {
  return summaries.find((summary) => summary.date === date && summary.title === title) ?? null
}

// One line of chips: time in Zoom, questions right, points.
export function LessonSummaryChips({ summary, color }: { summary: LessonSummary; color: string }) {
  const chips: { key: string; text: string }[] = []
  if (summary.zoom_minutes !== null) chips.push({ key: 'zoom', text: `🕒 ${summary.zoom_minutes} of ${summary.lesson_minutes} min in class` })
  if (summary.questions > 0) chips.push({ key: 'q', text: `✅ ${summary.right} of ${summary.questions} right` })
  if (summary.points !== null && summary.points > 0) chips.push({ key: 'p', text: `⭐ +${summary.points}` })
  if (chips.length === 0) return null
  return (
    <View style={styles.row}>
      {chips.map((chip) => (
        <Text key={chip.key} style={[styles.chip, { borderColor: color }]}>
          {chip.text}
        </Text>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    overflow: 'hidden',
  },
})
