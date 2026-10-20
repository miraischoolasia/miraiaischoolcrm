import { useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { fetchJoinInfo, useClassLive, type ClassLiveState, type JoinInfo } from '@/lib/classRoom'
import { LiveProvider, LiveTestProvider, useLive, type LiveValue } from '@/lib/live'
import { usePointsBursts } from '@/lib/pointsFeed'
import type { LessonNote } from '@/lib/portal'
import { useSession } from '@/lib/session'
import { ClassBar, ClassMoments } from '@/ui/ClassEffects'
import { ClassSideMenu } from '@/ui/ClassSideMenu'
import { ClassToolbar } from '@/ui/ClassToolbar'
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
  devShow,
}: {
  sessionId: number
  fallbackLink?: string | null
  // Only for the development page (/dev-class): made-up join details, class moments and question.
  joinInfo?: () => Promise<JoinInfo>
  classOverride?: ClassLiveState | null
  liveOverride?: LiveValue
  // Only for the development page: made-up notes, the notes or the ended page open, Join pressed.
  devShow?: { notes?: LessonNote[]; notesOpen?: boolean; ended?: boolean; autoJoin?: boolean; sample?: boolean; sampleFolded?: boolean }
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
  const [notesOpen, setNotesOpen] = useState(Boolean(devShow?.notesOpen))
  // The class menu and our own toolbar: a sample on the development page only, for now.
  const sample = Boolean(devShow?.sample)
  const [questionSignal, setQuestionSignal] = useState(0)
  // Full screen, like a video site (Esc leaves it): the browser's own full screen of the whole class page.
  const canFullscreen = Platform.OS === 'web' && typeof document !== 'undefined' && Boolean(document.fullscreenEnabled)
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    if (!canFullscreen) return
    const changed = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [canFullscreen])
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void document.documentElement.requestFullscreen().catch(() => undefined)
  }
  // Points the child gets pop up at once; nothing else reloads during class.
  const bursts = usePointsBursts(studentId, Boolean(home?.sees.points), () => undefined)
  // Out of the video: the summary and notes of this lesson, read again then.
  const [left, setLeft] = useState(0)
  const [showOver, setShowOver] = useState(Boolean(devShow?.ended))
  const [minute, setMinute] = useState(0)
  useEffect(() => {
    const tick = setInterval(() => setMinute((value) => value + 1), 60_000)
    return () => clearInterval(tick)
  }, [])
  const readNotes = useLessonNotes(studentId, `${minute}-${left}`).filter((note) => note.session_id === sessionId)
  const notes = devShow?.notes ?? readNotes
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
          autoJoin={devShow?.autoJoin}
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
          <View
            style={[styles.dot, { backgroundColor: live.connected || classOverride ? colors.good : colors.muted }]}
            accessibilityLabel={live.connected ? 'Live' : 'Connecting'}
          />
          <Text style={styles.pillText} numberOfLines={1}>
            {classState?.title || child?.name || 'Class'}
          </Text>
        </View>
        {canFullscreen && (
          <Pressable accessibilityRole="button" onPress={toggleFullscreen} style={styles.pill}>
            <Text style={styles.pillText}>{fullscreen ? '✕ Exit full screen (Esc)' : '⛶ Full screen'}</Text>
          </Pressable>
        )}
      </View>
      <View style={[styles.barWrap, { top: insets.top + (wide ? 10 : 58) }]} pointerEvents="box-none">
        <View style={styles.bar}>
          <ClassBar state={classState} clockOffset={live.clockOffset} myId={studentId ?? 0} color={branding.accentColor} />
        </View>
      </View>
      {notes.length > 0 && !notesOpen && !sample && (
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
      <QuestionPopup color={branding.accentColor} reopenSignal={questionSignal} hideReopen={sample} />
      {sample && (
        <SampleControls
          color={branding.accentColor}
          notesCount={notes.length}
          onNotes={() => setNotesOpen((open) => !open)}
          onQuestion={() => setQuestionSignal((value) => value + 1)}
          folded={devShow?.sampleFolded}
        />
      )}
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

// The sample of the class menu (right edge) and our own toolbar (mic, camera,
// chat). The toolbar's buttons only change their own look here; they are wired
// to Zoom after seeing the real player.
function SampleControls({
  color,
  notesCount,
  onNotes,
  onQuestion,
  folded,
}: {
  color: string
  notesCount: number
  onNotes: () => void
  onQuestion: () => void
  folded?: boolean
}) {
  const { state } = useLive()
  const [mic, setMic] = useState(false)
  const [camera, setCamera] = useState(true)
  const [chat, setChat] = useState(false)
  const question = state?.active ? state.question : null
  return (
    <>
      <ClassSideMenu
        color={color}
        startOpen={!folded}
        items={[
          {
            key: 'question',
            icon: '📣',
            label: question ? `Question ${question.number}` : 'Question',
            badge: question ? '!' : null,
            onPress: question ? onQuestion : undefined,
            idle: 'None',
          },
          { key: 'history', icon: '📜', label: 'History' },
          { key: 'notes', icon: '📝', label: 'Notes', badge: notesCount ? String(notesCount) : null, onPress: notesCount ? onNotes : undefined, idle: 'None' },
        ]}
      />
      <ClassToolbar
        color={color}
        startFolded={folded}
        buttons={[
          { key: 'mic', icon: mic ? '🎤' : '🔇', label: mic ? 'Mic on' : 'Mic off', on: mic, onPress: () => setMic((value) => !value) },
          { key: 'camera', icon: camera ? '📷' : '🚫', label: camera ? 'Camera' : 'Camera off', on: camera, onPress: () => setCamera((value) => !value) },
          { key: 'chat', icon: '💬', label: chat ? 'Close chat' : 'Chat', onPress: () => setChat((value) => !value) },
        ]}
      />
    </>
  )
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
