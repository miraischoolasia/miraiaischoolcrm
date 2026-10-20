import { type Href, useRouter } from 'expo-router'
import { StyleSheet, Text, View } from 'react-native'

import { canClaim, type useDaily } from '@/lib/daily'
import { Body, Button, Card, colors, Heading, Muted } from '@/ui/kit'

// Today on the classic home: check in, the daily tasks (claim the coins
// when done) and daily practice. Shows nothing when the school has none on.
export function TodayCard({ today, color }: { today: ReturnType<typeof useDaily>; color: string }) {
  const router = useRouter()
  const { daily, busy, error } = today
  if (!daily) return null
  const practiceLeft = Math.max(0, daily.practice.per_day - daily.practice.done_today)
  const showPractice = daily.practice.enabled && daily.practice.has_questions
  if (!daily.checkin.enabled && daily.tasks.length === 0 && !showPractice) return null

  return (
    <Card style={{ gap: 12 }}>
      <Heading>Today</Heading>
      {daily.checkin.enabled && (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '700' }}>Daily check-in</Body>
            <Muted>
              {daily.checkin.done ? `Done! ${daily.checkin.streak} day${daily.checkin.streak === 1 ? '' : 's'} in a row` : `+${daily.checkin.coins} coins`}
            </Muted>
          </View>
          {daily.checkin.done ? (
            <Text style={styles.done}>✓</Text>
          ) : (
            <View style={styles.button}>
              <Button label="Check in" color={color} busy={busy} onPress={() => void today.checkIn()} />
            </View>
          )}
        </View>
      )}
      {daily.tasks.map((task) => (
        <View key={task.id} style={styles.row}>
          <View style={{ flex: 1, gap: 4 }}>
            <Body style={{ fontWeight: '700' }}>{task.label}</Body>
            <View style={styles.track}>
              <View style={[styles.fill, { backgroundColor: color, width: `${Math.round((task.progress / task.target) * 100)}%` }]} />
            </View>
            <Muted>
              {task.progress}/{task.target} · +{task.coins} coins
            </Muted>
          </View>
          {task.claimed ? (
            <Text style={styles.done}>✓</Text>
          ) : (
            <View style={styles.button}>
              <Button label="Claim" color={color} busy={busy} disabled={!canClaim(task)} onPress={() => void today.claim(task.id)} />
            </View>
          )}
        </View>
      ))}
      {showPractice && (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: '700' }}>Daily practice</Body>
            <Muted>
              {practiceLeft > 0
                ? `${practiceLeft} question${practiceLeft === 1 ? '' : 's'} left today · +${daily.practice.coins} for each right answer`
                : `All done today · ${daily.practice.right_today} right`}
            </Muted>
          </View>
          {practiceLeft > 0 && (
            <View style={styles.button}>
              <Button label="Practise" variant="outline" color={color} onPress={() => router.push('/practice' as Href)} />
            </View>
          )}
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </Card>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  button: { width: 116 },
  done: { width: 116, textAlign: 'center', fontSize: 22, fontWeight: '800', color: colors.good },
  track: { height: 8, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  error: { color: colors.bad, fontSize: 14 },
})
