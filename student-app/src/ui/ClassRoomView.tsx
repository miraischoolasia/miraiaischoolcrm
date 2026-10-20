import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { fetchJoinInfo, useClassLive, type ClassLiveState, type JoinInfo } from '@/lib/classRoom'
import { LiveProvider, LiveTestProvider, type LiveValue } from '@/lib/live'
import { usePointsBursts } from '@/lib/pointsFeed'
import { useSession } from '@/lib/session'
import { ClassBar, ClassMoments } from '@/ui/ClassEffects'
import { Button, Card, colors, Heading, Muted } from '@/ui/kit'
import { findSessionSummary, LessonSummaryChips, useLessonSummaries } from '@/ui/LessonSummary'
import { LessonNotesList, useLessonNotes } from '@/ui/LessonNotes'
import { PointsBurstView } from '@/ui/PointsBurst'
import { QuestionPopup } from '@/ui/QuestionPopup'
import { ZoomRoom } from '@/ui/ZoomRoom'

// The lesson inside the app (the class page, /class/<session id>, and the
// waiting page /class/lesson once the teacher opens the lesson). Zoom fills
// the whole window; the teacher's questions and moments (random pick, star
// of the day, cheers, teams) pop up in the middle over it, and the timer,
// who answers and the teams sit in a small bar at the top; the lesson's notes
// open from a small button. They come live from the console. Questions are read for this lesson only, with a check every
// minute as a fallback; the teacher's published notes for this lesson too.
// When the video ends (the teacher ends the class, or the child leaves) the
// page shows the lesson's summary and notes.
export function ClassRoomView({
  sessionId,
  fallbackLink = null,
  joinInfo,
  classOverride,
  liveOverride,
}: {
  sessionId: number
  fallbackLink?: string | null
  // Only for the development page (/dev-class): made-up join details, class moments and question.
  joinInfo?: () => Promise<JoinInfo>
  classOverride?: ClassLiveState | null
  liveOverride?: LiveValue
}) {
  const valid = Number.isInteger(sessionId) && sessionId > 0
  const { child, branding, home } = useSession()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const wide = width >= 900
  const studentId = child?.studentId ?? null
  const live = useClassLive(valid && !classOverride ? sessionId : null)
  const classState = classOverride ?? live.state
  const [notesOpen, setNotesOpen] = useState(false)
  // Points the child gets pop up at once; nothing else reloads during class.
  const bursts = usePointsBursts(studentId, Boolean(home?.sees.points), () => undefined)
  // Out of the video: the summary and notes of this lesson, read again then.
  const [left, setLeft] = useState(0)
  const [showOver, setShowOver] = useState(false)
  const [minute, setMinute] = useState(0)
  useEffect(() => {
    const tick = setInterval(() => setMinute((value) => value + 1), 60_000)
    return () => clearInterval(tick)
  }, [])
  const notes = useLessonNotes(studentId, `${minute}-${left}`).filter((note) => note.session_id === sessionId)
  const summaries = useLessonSummaries(studentId, left)
  const summary = findSessionSummary(summaries, sessionId)
  const getJoinInfo = useCallback(() => {
    if (joinInfo) return joinInfo()
    if (!studentId) return Promise.reject(new Error('Pick a child first.'))
    return fetchJoinInfo(sessionId, studentId)
  }, [joinInfo, sessionId, studentId])

  function back() {
    if (router.canGoBack()) router.back()
    else router.replace('/')
  }

  if (!valid) {
    return (
      <View style={[styles.page, { paddingTop: insets.top + 16 }]}>
        <Muted>This class link is not right.</Muted>
      </View>
    )
  }

  const content = (
    <View style={styles.page}>
      {/* The class video fills the whole window. */}
      <View style={StyleSheet.absoluteFill}>
        <ZoomRoom
          getJoinInfo={getJoinInfo}
          fallbackLink={fallbackLink}
          color={branding.accentColor}
          onLeft={() => {
            setLeft((value) => value + 1)
            setShowOver(true)
          }}
        />
      </View>

      {/* Small floating bits over it: leave + title, top left; timer, who answers and teams, top middle; notes, bottom left. */}
      <View style={[styles.corner, { top: insets.top + 10 }]} pointerEvents="box-none">
        <Pressable accessibilityRole="button" onPress={back} style={styles.pill}>
          <Text style={styles.pillText}>← Leave</Text>
        </Pressable>
        <View style={[styles.pill, styles.titlePill]}>
          <View style={[styles.dot, { backgroundColor: live.connected || classOverride ? colors.good : colors.muted }]} accessibilityLabel={live.connected ? 'Live' : 'Connecting'} />
          <Text style={styles.pillText} numberOfLines={1}>
            {classState?.title || child?.name || 'Class'}
          </Text>
        </View>
      </View>
      <View style={[styles.barWrap, { top: insets.top + (wide ? 10 : 58) }]} pointerEvents="box-none">
        <View style={styles.bar}>
          <ClassBar state={classState} clockOffset={live.clockOffset} myId={studentId ?? 0} color={branding.accentColor} />
        </View>
      </View>
      {notes.length > 0 && !notesOpen && (
        <View style={[styles.notesButtonWrap, { bottom: insets.bottom + (wide ? 16 : 84) }]} pointerEvents="box-none">
          <Pressable accessibilityRole="button" onPress={() => setNotesOpen(true)} style={styles.pill}>
            <Text style={styles.pillText}>📝 Lesson notes ({notes.length})</Text>
          </Pressable>
        </View>
      )}
      {notesOpen && (
        <View style={[styles.drawer, wide ? styles.drawerWide : styles.drawerNarrow, { top: insets.top + 10, bottom: insets.bottom + 10 }]}>
          <View style={styles.drawerHead}>
            <Heading>Lesson notes</Heading>
            <Pressable accessibilityRole="button" accessibilityLabel="Close the notes" onPress={() => setNotesOpen(false)} style={styles.drawerClose}>
              <Text style={styles.drawerCloseText}>✕</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
            <LessonNotesList notes={notes} color={branding.accentColor} />
          </ScrollView>
        </View>
      )}

      {/* Everything the teacher sends pops up in the middle. */}
      <QuestionPopup color={branding.accentColor} />
      {showOver && (
        <View style={styles.over}>
          <Card style={{ gap: 10, width: '100%', maxWidth: 420 }}>
            <Heading>The class video has ended</Heading>
            <Muted>If your teacher ended the class, see you next time! If you left by mistake, join again.</Muted>
            {summary && <LessonSummaryChips summary={summary} color={branding.accentColor} />}
            <LessonNotesList notes={notes} color={branding.accentColor} />
            <Button label="Back to Home" color={branding.accentColor} onPress={back} />
            <Button label="Join again" variant="outline" color={branding.accentColor} onPress={() => setShowOver(false)} />
          </Card>
        </View>
      )}
      <ClassMoments state={classState} clockOffset={live.clockOffset} myId={studentId ?? 0} />
      {bursts.current && <PointsBurstView burst={bursts.current} color={branding.accentColor} onDone={bursts.done} />}
    </View>
  )

  return liveOverride ? <LiveTestProvider value={liveOverride}>{content}</LiveTestProvider> : <LiveProvider sessionId={sessionId}>{content}</LiveProvider>
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0f1229', overflow: 'hidden' },
  corner: { position: 'absolute', left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 8, zIndex: 20 },
  pill: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(15,18,41,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  titlePill: { flexShrink: 1, maxWidth: 360 },
  pillText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  barWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  bar: { borderRadius: 999, overflow: 'hidden', maxWidth: '94%' },
  notesButtonWrap: { position: 'absolute', left: 12, zIndex: 20 },
  drawer: { position: 'absolute', zIndex: 25, gap: 8, padding: 14, borderRadius: 18, backgroundColor: colors.card },
  drawerWide: { right: 12, width: 380 },
  drawerNarrow: { left: 12, right: 12 },
  drawerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  drawerClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  drawerCloseText: { fontSize: 18, fontWeight: '800', color: colors.text },
  over: { ...StyleSheet.absoluteFill, zIndex: 45, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(15,18,41,0.92)' },
})
