import { Linking, Platform, StyleSheet, View } from 'react-native'

import { formatDay } from '@/lib/format'
import type { Home, TeacherReport } from '@/lib/portal'
import { useSession } from '@/lib/session'
import { Body, Button, Card, colors, Empty, Heading, Loading, Muted, Pill, Screen, Title } from '@/ui/kit'

// Progress: each lesson so far, whether the child was there, and (when the
// school shows it) the teacher's rating on each criterion. Never the remarks.
export default function Progress() {
  const { home, homeError, branding, isRefreshing, refresh } = useSession()

  if (!home) {
    return <Screen>{homeError ? <Empty>{homeError}</Empty> : <Loading />}</Screen>
  }

  const attended = home.lessons.filter((lesson) => lesson.attended).length

  return (
    <Screen refreshing={isRefreshing} onRefresh={() => void refresh()}>
      <Title>Progress</Title>
      <Muted>
        {home.lessons.length === 0
          ? 'No lessons yet.'
          : `${attended} of the last ${home.lessons.length} lessons attended.`}
      </Muted>

      {home.report && <TeacherReportCard report={home.report} viewer={home.viewer} color={branding.accentColor} />}

      {home.lessons.map((lesson) => (
        <Card key={`${lesson.date}-${lesson.title}`}>
          <View style={styles.header}>
            <Heading>{formatDay(lesson.date)}</Heading>
            <Pill color={lesson.attended ? colors.good : colors.muted} background={lesson.attended ? colors.goodBg : '#f1f5f9'}>
              {lesson.status}
            </Pill>
          </View>
          <Muted>{lesson.title}</Muted>
          {home.sees.scores &&
            lesson.scores.map((entry) => (
              <View key={entry.criterion} style={styles.scoreRow}>
                <Body style={styles.criterion}>{entry.criterion}</Body>
                <View style={styles.track}>
                  <View
                    style={[styles.fill, { backgroundColor: branding.accentColor, width: `${(entry.score / entry.max) * 100}%` }]}
                  />
                </View>
                <Body style={styles.score}>
                  {entry.score}/{entry.max}
                </Body>
              </View>
            ))}
          {lesson.recording?.url && (
            <View style={{ gap: 4 }}>
              <Button label="Watch the recording" variant="outline" color={branding.accentColor} onPress={() => openLink(lesson.recording!.url)} />
              {lesson.recording.passcode && <Muted>Passcode: {lesson.recording.passcode}</Muted>}
            </View>
          )}
        </Card>
      ))}
    </Screen>
  )
}

function openLink(url: string) {
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener')
  else void Linking.openURL(url)
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  criterion: { flex: 1.4, fontSize: 14 },
  track: { flex: 1, height: 8, borderRadius: 999, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  score: { width: 36, textAlign: 'right', fontSize: 14, fontWeight: '700' },
})

// The report a teacher shared: for a parent the message, then what is going
// well and what comes next.
function TeacherReportCard({ report, viewer, color }: { report: TeacherReport; viewer: Home['viewer']; color: string }) {
  const { summary, message, strengths = [], next_steps: nextSteps = [] } = report.report
  return (
    <Card style={{ borderColor: color, borderWidth: 1.5 }}>
      <Heading>{"Teacher's report"}</Heading>
      <Muted>{formatDay(report.shared_at.slice(0, 10))}</Muted>
      {viewer === 'parent' && message ? <Body>{message}</Body> : summary ? <Body>{summary}</Body> : null}
      {strengths.length > 0 && (
        <View style={{ gap: 2 }}>
          <Body style={{ fontWeight: '700' }}>Going well</Body>
          {strengths.map((item, index) => (
            <Body key={index}>• {item}</Body>
          ))}
        </View>
      )}
      {nextSteps.length > 0 && (
        <View style={{ gap: 2 }}>
          <Body style={{ fontWeight: '700' }}>Next</Body>
          {nextSteps.map((item, index) => (
            <Body key={index}>• {item}</Body>
          ))}
        </View>
      )}
    </Card>
  )
}
