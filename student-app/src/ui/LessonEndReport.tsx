import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  lateText,
  nextLessonLabel,
  pointLines,
  reportBadge,
  reportTitle,
  type LessonReport,
  type ReportWords,
} from '@/lib/lessonReportRules'
import type { UpcomingClass } from '@/lib/portal'

// The lesson report a child sees after class (design A, "game result"): a
// big card over the school's sea (or its colour), with the points, the place
// (top three only; no stars, no comparing with others), three small boxes, where the points came from,
// the teacher's words and the next lesson.
export function LessonEndReport({
  report,
  childName,
  words,
  color,
  background,
  next,
  today,
  onHome,
  onQuestions,
  onVideos,
}: {
  report: LessonReport
  childName: string
  words: ReportWords
  color: string
  background: string | null
  next: UpcomingClass | null
  today: string
  onHome: () => void
  onQuestions: (() => void) | null
  onVideos: () => void
}) {
  const insets = useSafeAreaInsets()
  const badge = reportBadge(report, words)
  const lines = pointLines(report.point_items, words)
  const nextLabel = next ? nextLessonLabel(next, today, words) : null
  const [, month, day] = report.date.split('-').map(Number)
  const dateText = `${day} ${words.months[month - 1]}`
  const className = report.class ?? report.title ?? ''

  return (
    <View style={[styles.page, { backgroundColor: color }]}>
      {background && <Image source={{ uri: background }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />}
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.top}>
          <Pressable accessibilityRole="button" accessibilityLabel={words.back} onPress={onHome} style={styles.back}>
            <Text style={styles.backText}>‹  {words.back}</Text>
          </Pressable>
          {className ? (
            <View style={styles.classPill}>
              <Text style={styles.classText} numberOfLines={1}>
                {className}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.cardWrap}>
          <View style={[styles.ribbon, { backgroundColor: '#ea580c' }]}>
            <Text style={styles.ribbonTitle}>{reportTitle(report, words)}</Text>
            <Text style={styles.ribbonSub}>
              {childName} · {dateText}
            </Text>
          </View>

          <View style={styles.card}>
            {!report.attended ? (
              <>
                <Text style={styles.missed}>{words.missedText}</Text>
                <BigButton label={`▷  ${words.watchVideo}`} color="#0ea5e9" onPress={onVideos} />
              </>
            ) : (
              <>
                {report.points !== null && (
                  <>
                    <Text style={styles.points}>+{report.points}</Text>
                    <Text style={styles.pointsLabel}>{words.pointsToday}</Text>
                  </>
                )}
                {badge && (
                  <View style={[styles.badge, styles.badgeGold]}>
                    <Text style={[styles.badgeText, styles.badgeGoldText]}>{badge.text}</Text>
                  </View>
                )}

                <View style={styles.boxes}>
                  <Box icon="✓" iconColor="#10b981" value={`${report.right}/${report.questions}`} label={words.right} />
                  <Box icon="◷" iconColor="#3b82f6" value={lateText(report, words)} label={words.arrival} />
                  <Box icon="▶" iconColor="#a855f7" value={String(report.zoom_minutes ?? report.lesson_minutes)} label={words.minutesIn} />
                </View>

                {lines.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>🎁  {words.whereFrom}</Text>
                    {lines.map((line, index) => (
                      <View key={index} style={styles.line}>
                        <Text style={styles.lineEmoji}>{line.emoji}</Text>
                        <Text style={styles.lineLabel} numberOfLines={1}>
                          {line.label}
                        </Text>
                        <Text style={styles.linePoints}>+{line.points}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            {report.teacher_words !== null && (report.teacher_words.length > 0 || !report.attendance_sent) && (
              <View style={styles.teacherRow}>
                <View style={[styles.avatar, { backgroundColor: color }]}>
                  <Text style={styles.avatarText}>{(report.teacher ?? '?').slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.bubble}>
                  {report.teacher && <Text style={styles.bubbleName}>{report.teacher}</Text>}
                  {report.attendance_sent ? (
                    report.teacher_words.map((text, index) => (
                      <Text key={index} style={styles.bubbleText}>
                        {text}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.bubbleWriting}>{words.writing} ✏️</Text>
                  )}
                </View>
              </View>
            )}

            {nextLabel && (
              <View style={styles.next}>
                <View style={styles.nextDate}>
                  <Text style={styles.nextMonth}>{nextLabel.month}</Text>
                  <Text style={styles.nextDay}>{nextLabel.day}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nextLine}>{nextLabel.line}</Text>
                  <Text style={styles.nextSub} numberOfLines={1}>
                    {nextLabel.away}
                    {className ? ` · ${className}` : ''}
                  </Text>
                </View>
              </View>
            )}

            <BigButton label={words.home} color="#ea580c" onPress={onHome} />
            {report.attended && onQuestions && (
              <Pressable accessibilityRole="button" onPress={onQuestions} style={styles.outline}>
                <Text style={styles.outlineText}>{words.seeQuestions}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

function Box({ icon, iconColor, value, label }: { icon: string; iconColor: string; value: string; label: string }) {
  return (
    <View style={styles.box}>
      <View style={[styles.boxIcon, { backgroundColor: iconColor }]}>
        <Text style={styles.boxIconText}>{icon}</Text>
      </View>
      <Text style={styles.boxValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.boxLabel}>{label}</Text>
    </View>
  )
}

function BigButton({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.big, { backgroundColor: color }, pressed && { transform: [{ translateY: 2 }] }]}>
      <Text style={styles.bigText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { paddingHorizontal: 14, alignItems: 'center' },
  top: { width: '100%', maxWidth: 460, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  back: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.25)' },
  backText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  classPill: { flexShrink: 1, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(15,23,42,0.6)' },
  classText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  cardWrap: { width: '100%', maxWidth: 460, marginTop: 26, alignItems: 'center' },
  ribbon: {
    zIndex: 2,
    width: '86%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
    borderBottomWidth: 6,
    borderBottomColor: '#9a3412',
  },
  ribbonTitle: { color: '#fff', fontSize: 24, fontWeight: '900', textAlign: 'center' },
  ribbonSub: { color: '#ffedd5', fontSize: 13, fontWeight: '800', marginTop: 2 },
  card: {
    width: '100%',
    marginTop: -22,
    paddingTop: 34,
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderRadius: 28,
    backgroundColor: '#fffcf3',
    borderBottomWidth: 6,
    borderBottomColor: '#e7dcc0',
    gap: 12,
    alignItems: 'stretch',
  },
  missed: { color: '#334155', fontSize: 16, fontWeight: '700', textAlign: 'center', lineHeight: 24, marginVertical: 8 },
  points: { fontSize: 56, fontWeight: '900', color: '#f59e0b', textAlign: 'center', textShadowColor: '#b45309', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  pointsLabel: { fontSize: 14, fontWeight: '800', color: '#475569', textAlign: 'center', marginTop: -6 },
  badge: { alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 26, borderWidth: 2 },
  badgeGold: { backgroundColor: '#fff7d6', borderColor: '#fcd34d' },
  badgeText: { fontSize: 17, fontWeight: '900' },
  badgeGoldText: { color: '#92400e' },
  boxes: { flexDirection: 'row', gap: 8 },
  box: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 18, backgroundColor: '#f1f5f9', gap: 4 },
  boxIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  boxIconText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  boxValue: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  boxLabel: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  section: { borderRadius: 18, backgroundColor: '#f8fafc', padding: 12, gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: '#0f172a' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineEmoji: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#fff', textAlign: 'center', textAlignVertical: 'center', lineHeight: 34, fontSize: 18 },
  lineLabel: { flex: 1, fontSize: 15, fontWeight: '800', color: '#1e293b' },
  linePoints: { fontSize: 17, fontWeight: '900', color: '#f59e0b' },
  teacherRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  bubble: { flex: 1, backgroundColor: '#eef2ff', borderRadius: 18, borderTopLeftRadius: 6, padding: 12, gap: 4 },
  bubbleName: { fontSize: 13, fontWeight: '900', color: '#6366f1' },
  bubbleText: { fontSize: 15, fontWeight: '800', color: '#3730a3', lineHeight: 21 },
  bubbleWriting: { fontSize: 15, fontWeight: '700', color: '#475569', lineHeight: 21 },
  next: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, backgroundColor: '#2563eb' },
  nextDate: { width: 52, height: 52, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  nextMonth: { fontSize: 11, fontWeight: '900', color: '#dc2626' },
  nextDay: { fontSize: 22, fontWeight: '900', color: '#0f172a', lineHeight: 24 },
  nextLine: { color: '#fff', fontSize: 16, fontWeight: '900' },
  nextSub: { color: '#dbeafe', fontSize: 13, fontWeight: '700' },
  big: { minHeight: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 5, borderBottomColor: 'rgba(0,0,0,0.25)' },
  bigText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  outline: { minHeight: 48, borderRadius: 16, borderWidth: 2, borderColor: '#e2e8f0', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  outlineText: { color: '#334155', fontSize: 15, fontWeight: '800' },
})
